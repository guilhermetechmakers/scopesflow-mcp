/**
 * Build Automation Service
 * Orchestrates the entire automated build pipeline using MCP Cursor integration
 */

import { supabase } from '@/integrations/supabase/client';
import { getMCPCursorService, CursorProjectConfig, CursorExecutionResult } from './mcpCursorService';
import { getGitHubAutomationService, AutoRepositoryConfig, RepositoryInfo, AnalysisResult } from './githubAutomationService';
import { getGitHubUserData, GitHubUserData } from './githubUserService';
import { FlowchartItem, PromptSequence } from '@/types/flowchart';

export interface BuildSequenceConfig {
  projectId: string;
  sequenceId: string; // Keep for database tracking, but use projectId for loading prompts
  projectName: string;
  projectDescription: string;
  autoCreateRepo: boolean;
  repositoryConfig?: {
    isPrivate: boolean;
    template?: string;
    license?: string;
  };
  cursorConfig: {
    framework: 'react' | 'vue' | 'nextjs' | 'vite' | 'node' | 'react-expo';
    packageManager: 'npm' | 'yarn' | 'pnpm';
    template?: string;
  };
  automationSettings: {
    maxIterations: number;
    timeoutPerStep: number;
    autoCommit: boolean;
    runTests: boolean;
    qualityChecks: boolean;
  };
}

export interface BuildStep {
  id: string;
  stepNumber: number;
  promptContent: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  result?: CursorExecutionResult;
  githubCommit?: string;
  analysisResult?: AnalysisResult;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  retryCount: number;
  maxRetries: number;
  mcpLogs?: import('@/types/mcp').CursorAgentLog[];  // Detailed MCP logs for this step
}

export interface BuildProgress {
  buildId: string;
  projectId?: string;  // ScopesFlow project ID for linking to Supabase project
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  currentStep: number;
  totalSteps: number;
  projectPath: string;
  repositoryUrl?: string;
  steps: BuildStep[];
  promptQueue: FlowchartItem[];
  startedAt: Date;
  completedAt?: Date;
  elapsedTime: number;
  estimatedTimeRemaining?: number;
  logs: BuildLog[];
  errors: BuildError[];
  migrations: any[];  // Database migrations detected during build
  mcpLogs?: import('@/types/mcp').CursorAgentLog[];  // Aggregated MCP logs from all steps
  mcpLogsSummary?: import('@/types/mcp').LogsSummary;  // Summary of all MCP logs
}

export interface BuildHistoryItem {
  buildId: string;
  projectId: string;
  sequenceId?: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  currentStep: number;
  totalSteps: number;
  startedAt: Date;
  completedAt?: Date;
  duration: number;
  errorCount: number;
  canResume: boolean;
  projectPath?: string;
  repositoryUrl?: string;
  configuration?: BuildSequenceConfig;
}

export interface BuildLog {
  id: string;
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  source: 'cursor' | 'github' | 'automation' | 'analysis';
  data?: any;
}

export interface BuildError {
  id: string;
  timestamp: Date;
  step: number;
  error: string;
  source: 'cursor' | 'github' | 'automation';
  recoverable: boolean;
  recovery?: {
    strategy: string;
    attempted: boolean;
    successful?: boolean;
  };
}

class BuildAutomationService {
  private mcpService = getMCPCursorService();
  private githubService = getGitHubAutomationService();
  private activeBuilds = new Map<string, BuildProgress>();
  private buildListeners = new Map<string, ((progress: BuildProgress) => void)[]>();

  /**
   * Start automated build sequence
   */
  async startAutomatedBuild(config: BuildSequenceConfig): Promise<string> {
    console.log('[Build Automation] Starting automated build:', config.projectName);

    try {
      // Fetch GitHub user data - required for build automation
      console.log('[Build Automation] Fetching GitHub user credentials...');
      let githubUserData: GitHubUserData;
      try {
        githubUserData = await getGitHubUserData();
        console.log('[Build Automation] GitHub credentials retrieved for user:', githubUserData.username);
      } catch (githubError) {
        console.error('[Build Automation] GitHub connection required for build automation:', githubError);
        throw new Error('GitHub connection required for build automation. Please connect your GitHub account in the settings.');
      }

      // Generate unique build ID (use crypto.randomUUID for proper UUID)
      const buildId = crypto.randomUUID();
      
      // Initialize build progress
      const buildProgress: BuildProgress = {
        buildId,
        projectId: config.projectId, // Store ScopesFlow project ID for Supabase linking
        status: 'pending',
        currentStep: 0,
        totalSteps: 0,
        projectPath: '',
        steps: [],
        promptQueue: [],
        startedAt: new Date(),
        elapsedTime: 0,
        logs: [],
        errors: [],
        migrations: []
      };

      this.activeBuilds.set(buildId, buildProgress);
      this.addLog(buildId, 'info', 'Build automation started', 'automation');

      // Store build in database
      await this.storeBuildInDatabase(buildId, config, buildProgress);

      // Start the build process asynchronously
      this.executeBuildSequence(buildId, config, githubUserData).catch(error => {
        console.error('[Build Automation] Build failed:', error);
        this.handleBuildError(buildId, error);
      });

      return buildId;
    } catch (error) {
      console.error('[Build Automation] Failed to start build:', error);
      throw error;
    }
  }

  /**
   * Execute the complete build sequence
   */
  private async executeBuildSequence(buildId: string, config: BuildSequenceConfig, githubUserData: GitHubUserData): Promise<void> {
    const progress = this.activeBuilds.get(buildId);
    if (!progress) throw new Error('Build not found');

    try {
      // Step 1: Initialize MCP connection
      await this.initializeMCPConnection(buildId);

      // Step 2: Load prompt sequence
      const promptItems = await this.loadPromptSequence(buildId, config.projectId);
      progress.totalSteps = promptItems.length + 1; // +1 for project creation (MCP will handle repo creation)
      this.updateProgress(buildId);

      // Step 3: Create Cursor project (MCP will create GitHub repository if needed)
      const projectPath = await this.createCursorProject(buildId, config, githubUserData);
      progress.projectPath = projectPath;

      // Step 4: Execute build steps with continuous loop
      progress.status = 'running';
      progress.promptQueue = [...promptItems]; // Initialize queue with initial prompts
      
      this.addLog(buildId, 'info', `Starting build execution with ${progress.promptQueue.length} prompts`, 'automation');
      console.log('[Build Automation] Prompt queue initialized with', progress.promptQueue.length, 'items');
      
      // Log the first prompt for debugging
      if (progress.promptQueue.length > 0) {
        const firstPrompt = progress.promptQueue[0];
        const content = (firstPrompt as any).prompt_content || (firstPrompt as any).prompt || 'NO CONTENT';
        console.log('[Build Automation] First prompt preview:', content.substring(0, 200));
        this.addLog(buildId, 'debug', `First prompt: ${content.substring(0, 100)}...`, 'automation');
      }
      
      this.updateProgress(buildId);

      // Debug: Check initial build completion status
      const isComplete = await this.isBuildComplete(buildId);
      this.addLog(buildId, 'debug', `Initial build complete check: ${isComplete}`, 'automation');
      console.log('[Build Automation] Initial build complete check:', isComplete);

      while (!(await this.isBuildComplete(buildId))) {
        // Check if build was stopped
        const currentProgress = this.activeBuilds.get(buildId);
        if (!currentProgress || currentProgress.status === 'failed' || currentProgress.status === 'cancelled') {
          this.addLog(buildId, 'info', 'Build stopped by user', 'automation');
          return;
        }

        // Check if we have prompts to execute
        this.addLog(buildId, 'debug', `Queue length: ${progress.promptQueue.length}`, 'automation');
        if (progress.promptQueue.length === 0) {
          this.addLog(buildId, 'info', 'No more prompts to execute', 'automation');
          break;
        }

        // Get the next prompt from the queue
        const promptItem = progress.promptQueue.shift()!; // Remove and get first item
        const promptContent = (promptItem as any).prompt_content || promptItem.prompt || '';
        
        console.log('[Build Automation] Dequeued prompt:', promptContent?.substring(0, 100));
        this.addLog(buildId, 'info', `Processing prompt ${progress.steps.length + 1}: ${promptContent?.substring(0, 50)}...`, 'automation');

        const buildStep: BuildStep = {
          id: promptItem.id,
          stepNumber: progress.steps.length + 1,
          promptContent: promptContent,
          status: 'pending',
          retryCount: 0,
          maxRetries: 3
        };

        progress.steps.push(buildStep);
        progress.currentStep = progress.steps.length;
        this.updateProgress(buildId);

        console.log('[Build Automation] Executing step', buildStep.stepNumber, 'with project path:', progress.projectPath);
        await this.executeBuildStep(buildId, buildStep, config, githubUserData);

        // Generate next prompt after every completed step
        const nextPrompt = await this.generateNextPrompt(buildId, config);
        if (nextPrompt) {
          progress.promptQueue.push(nextPrompt);
          progress.totalSteps++;
          
          this.addLog(buildId, 'info', `Added prompt to queue: ${nextPrompt.title}`, 'automation');
          
          // Create connection from current prompt to next prompt
          const { error: connectionError } = await supabase
            .from('flowchart_connections')
            .insert([{
              project_id: config.projectId,
              source_id: buildStep.id,
              target_id: nextPrompt.id,
              label: 'Next prompt'
            }]);
          
          if (connectionError) {
            this.addLog(buildId, 'warning', `Failed to create connection: ${connectionError.message}`, 'automation');
          }
        } else {
          this.addLog(buildId, 'info', 'No more prompts to generate - approaching completion', 'automation');
        }
      }

      // Mark build as completed
      progress.status = 'completed';
      progress.completedAt = new Date();
      this.addLog(buildId, 'info', 'Build completed successfully', 'automation');
      this.updateProgress(buildId);

    } catch (error) {
      console.error('[Build Automation] Build sequence failed:', error);
      this.handleBuildError(buildId, error);
    }
  }

  /**
   * Initialize MCP connection to Cursor
   */
  private async initializeMCPConnection(buildId: string): Promise<void> {
    this.addLog(buildId, 'info', 'Connecting to Cursor via MCP...', 'cursor');
    
    try {
      // TODO: Temporarily skip MCP connection for testing
      // Uncomment when MCP server is set up
      
      if (!this.mcpService.isConnectionActive()) {
        await this.mcpService.connect();
      }
      
      
      this.addLog(buildId, 'info', 'MCP connection established successfully', 'cursor');
    } catch (error) {
      this.addLog(buildId, 'error', `Failed to connect to Cursor: ${error}`, 'cursor');
      throw error;
    }
  }

  /**
   * Load prompt sequence from database
   * Note: Using project_id instead of sequence_id because prompts are stored per-project,
   * not per-sequence in the current database schema
   */
  private async loadPromptSequence(buildId: string, projectId: string): Promise<FlowchartItem[]> {
    this.addLog(buildId, 'info', 'Loading prompt sequence...', 'automation');
    console.log('[Build Automation] Loading prompts for projectId:', projectId);
    
    try {
      const { data, error } = await supabase
        .from('flowchart_items')
        .select('*')
        .eq('project_id', projectId)
        .eq('type', 'prompt')
        .order('sequence_order');

      if (error) {
        console.error('[Build Automation] Failed to query prompts:', error);
        throw error;
      }
      
      console.log('[Build Automation] Query returned', data?.length || 0, 'prompts');
      
      // Check if no prompts found
      if (!data || data.length === 0) {
        const errorMsg = 'No prompts found in sequence. Please generate the prompt sequence first using the "Generate Prompt Sequence" button.';
        this.addLog(buildId, 'error', errorMsg, 'automation');
        console.error('[Build Automation]', errorMsg);
        throw new Error(errorMsg);
      }
      
      this.addLog(buildId, 'info', `Loaded ${data.length} prompts`, 'automation');
      
      // Debug: Log the first prompt content
      if (data.length > 0) {
        const firstPrompt = data[0] as any;
        const promptContent = firstPrompt.prompt_content || firstPrompt.prompt;
        this.addLog(buildId, 'debug', `First prompt content: ${promptContent?.substring(0, 100) || 'NO PROMPT CONTENT'}`, 'automation');
        this.addLog(buildId, 'debug', `First prompt fields: prompt_content=${!!firstPrompt.prompt_content}, prompt=${!!firstPrompt.prompt}`, 'automation');
      }
      
      return data;
    } catch (error) {
      this.addLog(buildId, 'error', `Failed to load prompts: ${error}`, 'automation');
      throw error;
    }
  }

  /**
   * Create Cursor project (MCP will also create GitHub repository)
   */
  private async createCursorProject(buildId: string, config: BuildSequenceConfig, githubUserData?: GitHubUserData): Promise<string> {
    this.addLog(buildId, 'info', 'Creating Cursor project...', 'cursor');
    
    try {
      // Fetch connected Supabase project credentials
      let supabaseUrl: string | undefined;
      let supabaseServiceRoleKey: string | undefined;
      
      const { data: supabaseConnection } = await supabase
        .from('project_supabase_connections')
        .select('*')
        .eq('project_id', config.projectId)
        .maybeSingle();
      
      if (supabaseConnection) {
        this.addLog(buildId, 'info', `Found connected Supabase project: ${supabaseConnection.supabase_project_name}`, 'automation');
        
        // Construct Supabase URL from project ref - DO THIS FIRST, outside try block
        supabaseUrl = `https://${supabaseConnection.supabase_project_ref}.supabase.co`;
        this.addLog(buildId, 'info', `Supabase URL: ${supabaseUrl}`, 'automation');
        
        // Fetch API keys from Supabase Management API
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            this.addLog(buildId, 'debug', `Fetching API keys for project ref: ${supabaseConnection.supabase_project_ref}`, 'automation');
            
            const { data: keysData, error: keysError } = await supabase.functions.invoke(
              'supabase-operations?operation=get-project-keys',
              {
                method: 'POST',
                body: { projectRef: supabaseConnection.supabase_project_ref },
                headers: {
                  'Authorization': `Bearer ${session.access_token}`,
                },
              }
            );
            
            // Log the actual error if present
            if (keysError) {
              this.addLog(buildId, 'error', `Supabase API error: ${JSON.stringify(keysError)}`, 'automation');
              console.error('[Build Automation] Supabase keys error:', keysError);
            }
            
            // Log the response data for debugging
            this.addLog(buildId, 'debug', `API keys response: ${JSON.stringify(keysData)}`, 'automation');
            console.log('[Build Automation] Keys response:', keysData);
            
            if (!keysError && keysData?.keys) {
              // Handle array response format: keys is an array of {name, api_key} objects
              if (Array.isArray(keysData.keys)) {
                const serviceRoleKey = keysData.keys.find((k: any) => k.name === 'service_role');
                if (serviceRoleKey?.api_key) {
                  supabaseServiceRoleKey = serviceRoleKey.api_key;
                  this.addLog(buildId, 'info', 'Retrieved Supabase service role key for project configuration', 'automation');
                } else {
                  this.addLog(buildId, 'warn', `service_role key not found in array. Available keys: ${keysData.keys.map((k: any) => k.name).join(', ')}`, 'automation');
                }
              } 
              // Handle object response format: keys is {service_role: "...", anon: "..."}
              else if (keysData.keys.service_role) {
                supabaseServiceRoleKey = keysData.keys.service_role;
                this.addLog(buildId, 'info', 'Retrieved Supabase service role key for project configuration', 'automation');
              } else {
                this.addLog(buildId, 'warn', `API keys response in unexpected format. Type: ${typeof keysData.keys}`, 'automation');
              }
            } else {
              this.addLog(buildId, 'warn', `Could not retrieve Supabase API keys. Error: ${keysError ? 'Yes' : 'No'}, Data: ${keysData ? 'Yes' : 'No'}`, 'automation');
            }
          } else {
            this.addLog(buildId, 'warn', 'No user session available for API key fetch - cannot retrieve service role key', 'automation');
          }
        } catch (error) {
          this.addLog(buildId, 'error', `Exception fetching Supabase keys: ${error instanceof Error ? error.message : String(error)}`, 'automation');
          console.error('[Build Automation] Supabase keys fetch exception:', error);
        }
      } else {
        this.addLog(buildId, 'info', 'No Supabase project connected - project will be created without Supabase configuration', 'automation');
      }
      
      // Fetch UI style description for the project
      let designPattern: string | undefined;

      const { data: projectData } = await supabase
        .from('projects')
        .select('ui_style_description')
        .eq('id', config.projectId)
        .maybeSingle();

      if (projectData?.ui_style_description) {
        designPattern = projectData.ui_style_description;
        this.addLog(buildId, 'info', 'Found UI style description for project', 'automation');
      } else {
        this.addLog(buildId, 'info', 'No UI style description found - project will use default styling', 'automation');
      }
      
      const projectPath = `./cursor-projects/${config.projectName.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;
      
      // Store design pattern in MCP server if available
      let designPatternId: string | undefined;
      if (designPattern) {
        this.addLog(buildId, 'info', 'Storing design pattern in MCP server...', 'automation');
        const storeResult = await this.mcpService.storeDesignPattern(config.projectId, designPattern);
        
        if (storeResult.success) {
          designPatternId = config.projectId; // Use projectId as the design pattern reference
          this.addLog(buildId, 'info', 'Design pattern stored successfully', 'automation');
        } else {
          this.addLog(buildId, 'warn', `Failed to store design pattern: ${storeResult.error}`, 'automation');
        }
      }
      
      // Map template to framework if needed
      let framework = config.cursorConfig.framework;
      if (config.cursorConfig.template?.includes('vite')) {
        framework = 'vite';
      } else if (config.cursorConfig.template?.includes('next')) {
        framework = 'nextjs';
      } else if (config.cursorConfig.template?.includes('vue')) {
        framework = 'vue';
      } else if (config.cursorConfig.template?.includes('expo')) {
        framework = 'react-expo';
      }

      const cursorConfig: CursorProjectConfig = {
        projectName: config.projectName,
        projectPath,
        framework,
        packageManager: config.cursorConfig.packageManager,
        template: config.cursorConfig.template,
        // Don't pass gitRepository - MCP will create it
        gitHubToken: githubUserData?.token,      // Pass credentials so MCP can create repo
        gitUserName: githubUserData?.username,   // Pass credentials so MCP can create repo
        gitUserEmail: githubUserData?.email,     // Pass credentials so MCP can create repo
        supabaseUrl,                              // Pass Supabase URL if connected
        supabaseServiceRoleKey,                   // Pass Supabase service role key if connected
        designPatternId                          // Pass design pattern reference
      };

      // Log the config being sent to MCP for verification
      this.addLog(buildId, 'debug', `Sending to MCP - supabaseUrl: ${supabaseUrl ? 'SET' : 'UNDEFINED'}, serviceKey: ${supabaseServiceRoleKey ? 'SET' : 'UNDEFINED'}, designPatternId: ${designPatternId ? 'SET' : 'UNDEFINED'}`, 'automation');
      console.log('[Build Automation] CursorConfig being sent to MCP:', {
        ...cursorConfig,
        supabaseServiceRoleKey: supabaseServiceRoleKey ? `${supabaseServiceRoleKey.substring(0, 20)}...` : undefined,
        gitHubToken: cursorConfig.gitHubToken ? `${cursorConfig.gitHubToken.substring(0, 10)}...` : undefined,
        designPatternId: designPatternId
      });

      // Call real MCP service to create project (and GitHub repository)
      const result = await this.mcpService.createProject(cursorConfig);
      
      console.log('[Build Automation] MCP createProject result:', result);
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to create Cursor project');
      }

      // Extract GitHub repository URL from MCP response
      const progress = this.activeBuilds.get(buildId);
      if (progress && result.gitRepository) {
        progress.repositoryUrl = result.gitRepository;
        this.addLog(buildId, 'info', `GitHub repository created at: ${result.gitRepository}`, 'github');
        
        // Connect the project to this repository in the database
        await this.connectProjectToRepository(buildId, config.projectId, result.gitRepository);
      }

      this.addLog(buildId, 'info', `Cursor project created at: ${result.projectPath}`, 'cursor');
      return result.projectPath || projectPath;
    } catch (error) {
      this.addLog(buildId, 'error', `Failed to create Cursor project: ${error}`, 'cursor');
      throw error;
    }
  }

  /**
   * Connect project to GitHub repository in database
   */
  private async connectProjectToRepository(
    buildId: string, 
    projectId: string, 
    repositoryUrl: string
  ): Promise<void> {
    try {
      this.addLog(buildId, 'info', `Connecting project to repository: ${repositoryUrl}`, 'github');
      
      // Parse repository URL to extract owner and repo name
      // Format: https://github.com/owner/repo-name or https://github.com/owner/repo-name.git
      const repoPath = repositoryUrl.replace('https://github.com/', '').replace('.git', '');
      const [owner, repoName] = repoPath.split('/');
      
      if (!owner || !repoName) {
        throw new Error(`Invalid repository URL format: ${repositoryUrl}`);
      }
      
      // Use the RPC function to store repository connection
      const { error } = await supabase.rpc('upsert_project_repository', {
        p_project_id: projectId,
        p_repo_full_name: repoPath,
        p_repo_owner: owner,
        p_repo_name: repoName,
        p_default_branch: 'main'
      });
      
      if (error) {
        throw error;
      }
      
      this.addLog(buildId, 'info', 'Project successfully connected to repository', 'github');
    } catch (error) {
      this.addLog(buildId, 'error', `Failed to connect repository: ${error}`, 'github');
      throw error;
    }
  }

  /**
   * Create GitHub repository
   */
  private async createGitHubRepository(buildId: string, config: BuildSequenceConfig): Promise<RepositoryInfo> {
    this.addLog(buildId, 'info', 'Creating GitHub repository...', 'github');
    
    try {
      const repoConfig: AutoRepositoryConfig = {
        projectId: config.projectId,
        projectName: config.projectName,
        description: config.projectDescription,
        isPrivate: config.repositoryConfig?.isPrivate || false,
        autoCommit: config.automationSettings.autoCommit,
        template: config.repositoryConfig?.template,
        license: config.repositoryConfig?.license
      };

      const repositoryInfo = await this.githubService.createRepository(repoConfig);
      
      this.addLog(buildId, 'info', `GitHub repository created: ${repositoryInfo.htmlUrl}`, 'github');
      return repositoryInfo;
    } catch (error) {
      this.addLog(buildId, 'error', `Failed to create GitHub repository: ${error}`, 'github');
      throw error;
    }
  }

  /**
   * Execute a single build step
   */
  private async executeBuildStep(buildId: string, step: BuildStep, config: BuildSequenceConfig, githubUserData: GitHubUserData): Promise<void> {
    const progress = this.activeBuilds.get(buildId);
    if (!progress) throw new Error('Build not found');

    this.addLog(buildId, 'info', `Executing step ${step.stepNumber}: ${step.promptContent.substring(0, 100)}...`, 'cursor');
    console.log('[Build Automation] Step', step.stepNumber, '- Prompt content length:', step.promptContent.length);
    
    step.status = 'running';
    step.startedAt = new Date();
    this.updateProgress(buildId);

    try {
      console.log('[Build Automation] Calling MCP executePrompt for step', step.stepNumber);
      console.log('[Build Automation] Project path:', progress.projectPath);
      
      const result = await this.mcpService.executePrompt(
        step.promptContent,
        progress.projectPath,
        {
          context: `Step ${step.stepNumber} of automated build`,
          isFirstPrompt: step.stepNumber === 1,
          githubCredentials: {
            token: githubUserData.token,
            username: githubUserData.username,
            email: githubUserData.email
          }
        }
      );
      
      console.log('[Build Automation] MCP executePrompt result:', result);

      step.result = result;
      
      // Store MCP logs for this step
      if (result.logs && result.logs.length > 0) {
        step.mcpLogs = result.logs;
        
        // Aggregate MCP logs into build progress
        if (!progress.mcpLogs) {
          progress.mcpLogs = [];
        }
        progress.mcpLogs.push(...result.logs);
        
        // Persist MCP logs to database immediately
        this.persistMCPLogsToDatabase(buildId, result.logs, step.stepNumber).catch(error => {
          console.error('[Build Automation] Failed to persist MCP logs to database:', error);
        });
        
        // Update MCP logs summary
        if (result.logsSummary) {
          if (!progress.mcpLogsSummary) {
            progress.mcpLogsSummary = { total: 0, byType: {} };
          }
          progress.mcpLogsSummary.total += result.logsSummary.total;
          
          // Merge byType counts
          Object.entries(result.logsSummary.byType).forEach(([type, count]) => {
            progress.mcpLogsSummary!.byType[type] = (progress.mcpLogsSummary!.byType[type] || 0) + count;
          });
        }
        
        // Map critical MCP logs to BuildLog format for backward compatibility
        result.logs.forEach(log => {
          if (log.type === 'agent_error' || log.type === 'error') {
            this.addLog(buildId, 'error', log.message, 'cursor', log.data);
          } else if (log.type === 'agent_file') {
            this.addLog(buildId, 'info', log.message, 'cursor', log.data);
          } else if (log.type === 'agent_completion' || log.type === 'success') {
            this.addLog(buildId, 'info', log.message, 'cursor', log.data);
          }
        });
      }
      
      if (result.success) {
        step.status = 'completed';
        this.addLog(buildId, 'info', `Step ${step.stepNumber} completed successfully`, 'cursor');
        
        // Check for database migrations
        if (result.hasMigrations && result.migrations && result.migrations.length > 0) {
          this.addLog(buildId, 'info', `Detected ${result.migrations.length} database migration(s)`, 'cursor');
          progress.migrations.push(...result.migrations);
          this.updateProgress(buildId);
        }
        
        // Mark prompt as implemented in database
        await this.markPromptAsImplemented(buildId, step.id);
        
        // Commit is now handled by MCP
        // if (config.automationSettings.autoCommit && progress.repositoryUrl) {
        //   await this.commitStepChanges(buildId, step, progress.repositoryUrl);
        // }
      } else {
        throw new Error(result.error || 'Cursor execution failed');
      }
    } catch (error) {
      step.status = 'failed';
      step.error = error instanceof Error ? error.message : 'Unknown error';
      
      this.addLog(buildId, 'error', `Step ${step.stepNumber} failed: ${step.error}`, 'cursor');
      this.addError(buildId, step.stepNumber, step.error, 'cursor');
      
      // Attempt retry if within limits
      if (step.retryCount < step.maxRetries) {
        step.retryCount++;
        this.addLog(buildId, 'info', `Retrying step ${step.stepNumber} (attempt ${step.retryCount + 1})`, 'automation');
        await this.executeBuildStep(buildId, step, config, githubUserData);
        return;
      }
      
      throw error;
    } finally {
      step.completedAt = new Date();
      this.updateProgress(buildId);
    }
  }

  /**
   * Mark prompt as implemented in database
   */
  private async markPromptAsImplemented(buildId: string, promptNodeId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('flowchart_items')
        .update({
          is_implemented: true,
          implementation_timestamp: new Date().toISOString()
        })
        .eq('id', promptNodeId);
      
      if (error) {
        this.addLog(buildId, 'warn', `Failed to mark prompt as implemented: ${error}`, 'automation');
      } else {
        this.addLog(buildId, 'info', `Prompt ${promptNodeId} marked as implemented`, 'automation');
      }
    } catch (error) {
      this.addLog(buildId, 'warn', `Error marking prompt as implemented: ${error}`, 'automation');
    }
  }

  /**
   * Commit step changes to GitHub
   * NOTE: Disabled - MCP now handles commits
   */
  // private async commitStepChanges(buildId: string, step: BuildStep, repositoryUrl: string): Promise<void> {
  //   try {
  //     const repoFullName = repositoryUrl.replace('https://github.com/', '');
  //     const progress = this.activeBuilds.get(buildId);
  //     if (!progress) return;

  //     const commitMessage = `Step ${step.stepNumber}: ${step.promptContent.substring(0, 50)}...`;
  //     
  //     const commitInfo = await this.githubService.commitChanges(
  //       repoFullName,
  //       progress.projectPath,
  //       commitMessage,
  //       step.result?.filesChanged
  //     );

  //     step.githubCommit = commitInfo.sha;
  //     this.addLog(buildId, 'info', `Changes committed: ${commitInfo.sha}`, 'github');
  //   } catch (error) {
  //     this.addLog(buildId, 'warn', `Failed to commit changes: ${error}`, 'github');
  //   }
  // }

  /**
   * Generate all remaining prompts based on project scope after first prompt is implemented
   */
  private async generateNextPrompt(buildId: string, config: BuildSequenceConfig): Promise<FlowchartItem | null> {
    try {
      this.addLog(buildId, 'info', 'Generating next prompt...', 'automation');
      
      const { data, error } = await supabase.functions.invoke('generate-next-prompt', {
        body: { projectId: config.projectId }
      });
      
      if (error) {
        this.addLog(buildId, 'error', `Failed to generate next prompt: ${error.message}`, 'automation');
        return null;
      }
      
      if (!data.prompt) {
        this.addLog(buildId, 'info', 'No more prompts to generate', 'automation');
        return null;
      }
      
      // Insert the prompt
      const { data: promptNode, error: promptError } = await supabase
        .from('flowchart_items')
        .insert([{
          project_id: config.projectId,
          type: 'prompt',
          title: data.prompt.title,
          description: data.prompt.description,
          prompt_content: data.prompt.promptContent,
          prompt_context: data.prompt.promptContext,
          sequence_order: data.prompt.sequenceOrder,
          position_x: 100 + ((data.prompt.sequenceOrder - 1) * 300),
          position_y: 100,
          is_implemented: false,
          elements: {
            scopeItemId: data.prompt.scopeItemId  // ✅ ADD THIS: Store scope item ID
          }
        }])
        .select()
        .single();
      
      if (promptError) {
        this.addLog(buildId, 'error', `Failed to create prompt node: ${promptError.message}`, 'automation');
        return null;
      }
      
      this.addLog(buildId, 'info', `Generated prompt for: ${data.prompt.title}`, 'automation');
      
      return promptNode;
    } catch (error) {
      this.addLog(buildId, 'error', `Failed to generate next prompt: ${error}`, 'automation');
      return null;
    }
  }

  /**
   * Add a dynamically generated prompt to the build sequence
   */
  private async addDynamicPrompt(buildId: string, promptContent: string, config: BuildSequenceConfig): Promise<void> {
    const progress = this.activeBuilds.get(buildId);
    if (!progress) return;

    try {
      // Calculate next sequence order
      const { data: existingPrompts } = await supabase
        .from('flowchart_items')
        .select('sequence_order')
        .eq('project_id', config.projectId)
        .eq('type', 'prompt')
        .order('sequence_order', { ascending: false })
        .limit(1);

      const nextSequenceOrder = (existingPrompts?.[0]?.sequence_order || 0) + 1;
      const positionX = 100 + ((nextSequenceOrder - 1) * 500);

      // Insert new prompt node into database
      const { data: newPrompt, error } = await supabase
        .from('flowchart_items')
        .insert({
          project_id: config.projectId,
          type: 'prompt',
          title: 'AI-Generated Prompt',
          description: promptContent.substring(0, 100),
          prompt_content: promptContent,
          sequence_order: nextSequenceOrder,
          position_x: positionX,
          position_y: 100,
          is_implemented: false
        })
        .select()
        .single();

      if (error) throw error;

      // Add to queue
      progress.promptQueue.push(newPrompt);
      progress.totalSteps++;
      
      this.addLog(buildId, 'info', `Added new prompt to sequence (order ${nextSequenceOrder})`, 'automation');
    } catch (error) {
      this.addLog(buildId, 'error', `Failed to add dynamic prompt: ${error}`, 'automation');
      throw error;
    }
  }

  /**
   * Check if build is complete
   */
  private async isBuildComplete(buildId: string): Promise<boolean> {
    const progress = this.activeBuilds.get(buildId);
    if (!progress) return false;

    // Check if queue is empty (no more prompts to execute)
    if (progress.promptQueue.length === 0) {
      // Check completion percentage from latest analysis
      const latestAnalysis = progress.steps[progress.steps.length - 1]?.analysisResult;
      const completionPercentage = latestAnalysis?.productCompleteness || 0;
      
      // Stop if we've reached 90% or higher
      if (completionPercentage >= 90) {
        this.addLog(buildId, 'info', `Build complete: ${completionPercentage}% completion reached`, 'automation');
        return true;
      }
      
      // If queue is empty but we haven't reached 90%, something went wrong
      this.addLog(buildId, 'warn', `Queue empty but completion at ${completionPercentage}%. Build incomplete.`, 'automation');
      return true;
    }

    return false;
  }

  /**
   * Pause build execution
   */
  async pauseBuild(buildId: string): Promise<void> {
    const progress = this.activeBuilds.get(buildId);
    if (progress && progress.status === 'running') {
      progress.status = 'cancelled';
      this.addLog(buildId, 'info', 'Build paused by user', 'automation');
      this.updateProgress(buildId);
    }
  }

  /**
   * Resume build execution
   */
  async resumeBuild(buildId: string): Promise<void> {
    const progress = this.activeBuilds.get(buildId);
    if (progress && progress.status === 'cancelled') {
      progress.status = 'running';
      this.addLog(buildId, 'info', 'Build resumed', 'automation');
      this.updateProgress(buildId);
      
      // Continue execution from where we left off
      // This would require storing the current state and resuming properly
    }
  }

  /**
   * Stop build execution
   */
  async stopBuild(buildId: string): Promise<void> {
    const progress = this.activeBuilds.get(buildId);
    if (progress) {
      progress.status = 'failed';
      progress.completedAt = new Date();
      this.addLog(buildId, 'info', 'Build stopped by user', 'automation');
      this.updateProgress(buildId);
    }
  }

  /**
   * Get build progress
   */
  getBuildProgress(buildId: string): BuildProgress | null {
    return this.activeBuilds.get(buildId) || null;
  }

  /**
   * Subscribe to build progress updates
   */
  subscribeToBuildProgress(buildId: string, callback: (progress: BuildProgress) => void): () => void {
    if (!this.buildListeners.has(buildId)) {
      this.buildListeners.set(buildId, []);
    }
    
    this.buildListeners.get(buildId)!.push(callback);
    
    // Return unsubscribe function
    return () => {
      const listeners = this.buildListeners.get(buildId);
      if (listeners) {
        const index = listeners.indexOf(callback);
        if (index > -1) {
          listeners.splice(index, 1);
        }
      }
    };
  }

  /**
   * Handle build errors
   */
  private handleBuildError(buildId: string, error: any): void {
    const progress = this.activeBuilds.get(buildId);
    if (progress) {
      progress.status = 'failed';
      progress.completedAt = new Date();
      this.addError(buildId, progress.currentStep, error instanceof Error ? error.message : 'Unknown error', 'automation');
      this.updateProgress(buildId);
    }
  }

  /**
   * Add log entry
   */
  private addLog(buildId: string, level: 'info' | 'warn' | 'error' | 'debug', message: string, source: 'cursor' | 'github' | 'automation' | 'analysis', data?: any): void {
    const progress = this.activeBuilds.get(buildId);
    if (progress) {
      const logEntry = {
        id: crypto.randomUUID(),
        timestamp: new Date(),
        level,
        message,
        source,
        data
      };
      
      progress.logs.push(logEntry);
      
      // Keep only last 1000 logs
      if (progress.logs.length > 1000) {
        progress.logs = progress.logs.slice(-1000);
      }

      // Persist to database immediately
      this.persistLogToDatabase(buildId, logEntry).catch(error => {
        console.error('[Build Automation] Failed to persist log to database:', error);
      });
    }
  }

  /**
   * Add error entry
   */
  private addError(buildId: string, step: number, error: string, source: 'cursor' | 'github' | 'automation'): void {
    const progress = this.activeBuilds.get(buildId);
    if (progress) {
      progress.errors.push({
        id: crypto.randomUUID(),
        timestamp: new Date(),
        step,
        error,
        source,
        recoverable: true // Could be determined based on error type
      });
    }
  }

  /**
   * Update progress and notify listeners
   */
  private updateProgress(buildId: string): void {
    const progress = this.activeBuilds.get(buildId);
    if (progress) {
      progress.elapsedTime = Date.now() - progress.startedAt.getTime();
      
      // Calculate estimated time remaining
      if (progress.currentStep > 0) {
        const avgTimePerStep = progress.elapsedTime / progress.currentStep;
        const remainingSteps = progress.totalSteps - progress.currentStep;
        progress.estimatedTimeRemaining = avgTimePerStep * remainingSteps;
      }

      // Notify listeners
      const listeners = this.buildListeners.get(buildId);
      if (listeners) {
        listeners.forEach(callback => {
          try {
            callback(progress);
          } catch (error) {
            console.error('[Build Automation] Listener error:', error);
          }
        });
      }

      // Update database
      this.updateBuildInDatabase(buildId, progress).catch(error => {
        console.error('[Build Automation] Failed to update database:', error);
      });
    }
  }

  /**
   * Store build in database
   */
  private async storeBuildInDatabase(buildId: string, config: BuildSequenceConfig, progress: BuildProgress): Promise<void> {
    try {
      const { error } = await supabase
        .from('automated_builds')
        .insert({
          id: buildId,
          project_id: config.projectId,
          sequence_id: config.sequenceId,
          status: progress.status,
          current_step: progress.currentStep,
          total_steps: progress.totalSteps,
          started_at: progress.startedAt.toISOString(),
          cursor_project_path: progress.projectPath,
          github_repository_url: progress.repositoryUrl,
          configuration: config,
          progress: {
            logs: progress.logs,
            errors: progress.errors,
            migrations: progress.migrations
          }
        });

      if (error) {
        console.error('[Build Automation] Failed to store build:', error);
      }
    } catch (error) {
      console.error('[Build Automation] Database error:', error);
    }
  }

  /**
   * Update build in database
   */
  private async updateBuildInDatabase(buildId: string, progress: BuildProgress): Promise<void> {
    try {
      const { error } = await supabase
        .from('automated_builds')
        .update({
          status: progress.status,
          current_step: progress.currentStep,
          total_steps: progress.totalSteps,
          completed_at: progress.completedAt?.toISOString(),
          cursor_project_path: progress.projectPath,
          github_repository_url: progress.repositoryUrl,
          progress: {
            logs: progress.logs,
            errors: progress.errors,
            migrations: progress.migrations
          }
        })
        .eq('id', buildId);

      if (error) {
        console.error('[Build Automation] Failed to update build:', error);
      }
    } catch (error) {
      console.error('[Build Automation] Database error:', error);
    }
  }

  /**
   * Persist a single BuildLog to database
   */
  private async persistLogToDatabase(buildId: string, logEntry: BuildLog): Promise<void> {
    try {
      const { error } = await supabase
        .from('build_logs')
        .insert({
          build_id: buildId,
          timestamp: logEntry.timestamp.toISOString(),
          log_type: 'build_log',
          level: logEntry.level,
          source: logEntry.source,
          message: logEntry.message,
          data: logEntry.data
        });

      if (error) {
        console.error('[Build Automation] Failed to persist log:', error);
      }
    } catch (error) {
      console.error('[Build Automation] Database error persisting log:', error);
    }
  }

  /**
   * Persist MCP logs to database
   */
  private async persistMCPLogsToDatabase(buildId: string, mcpLogs: import('@/types/mcp').CursorAgentLog[], stepNumber?: number): Promise<void> {
    try {
      const logEntries = mcpLogs.map(log => ({
        build_id: buildId,
        step_number: stepNumber,
        timestamp: log.timestamp,
        log_type: 'mcp_log' as const,
        mcp_type: log.type,
        message: log.message,
        data: log.data
      }));

      const { error } = await supabase
        .from('build_logs')
        .insert(logEntries);

      if (error) {
        console.error('[Build Automation] Failed to persist MCP logs:', error);
      }
    } catch (error) {
      console.error('[Build Automation] Database error persisting MCP logs:', error);
    }
  }

  /**
   * Load logs from database for a build
   */
  private async loadLogsFromDatabase(buildId: string): Promise<{ buildLogs: BuildLog[], mcpLogs: import('@/types/mcp').CursorAgentLog[] }> {
    try {
      const { data, error } = await supabase
        .from('build_logs')
        .select('*')
        .eq('build_id', buildId)
        .order('timestamp', { ascending: true });

      if (error) {
        console.error('[Build Automation] Failed to load logs:', error);
        return { buildLogs: [], mcpLogs: [] };
      }

      const buildLogs: BuildLog[] = [];
      const mcpLogs: import('@/types/mcp').CursorAgentLog[] = [];

      data?.forEach(entry => {
        if (entry.log_type === 'build_log') {
          buildLogs.push({
            id: entry.id,
            timestamp: new Date(entry.timestamp),
            level: entry.level as any,
            message: entry.message,
            source: entry.source as any,
            data: entry.data
          });
        } else if (entry.log_type === 'mcp_log') {
          mcpLogs.push({
            timestamp: entry.timestamp,
            type: entry.mcp_type as any,
            message: entry.message,
            data: entry.data
          });
        }
      });

      return { buildLogs, mcpLogs };
    } catch (error) {
      console.error('[Build Automation] Error loading logs from database:', error);
      return { buildLogs: [], mcpLogs: [] };
    }
  }

  /**
   * Get build history for a project
   */
  async getBuildHistory(projectId: string): Promise<BuildHistoryItem[]> {
    try {
      const { data, error } = await supabase
        .from('automated_builds')
        .select('*')
        .eq('project_id', projectId)
        .order('started_at', { ascending: false });

      if (error) {
        console.error('[Build Automation] Failed to fetch build history:', error);
        // Return empty array instead of throwing - table might not exist yet or other issues
        return [];
      }

      return (data || []).map(build => {
        const startedAt = new Date(build.started_at);
        const completedAt = build.completed_at ? new Date(build.completed_at) : undefined;
        const duration = completedAt 
          ? completedAt.getTime() - startedAt.getTime()
          : Date.now() - startedAt.getTime();

        // Count errors from progress data
        const progressData = build.progress as any;
        const errorCount = progressData?.errors?.length || 0;

        // Can resume if not completed and not currently running
        const canResume = 
          build.status !== 'completed' && 
          build.status !== 'running' &&
          build.current_step < build.total_steps;

        return {
          buildId: build.id,
          projectId: build.project_id,
          sequenceId: build.sequence_id,
          status: build.status,
          currentStep: build.current_step,
          totalSteps: build.total_steps,
          startedAt,
          completedAt,
          duration,
          errorCount,
          canResume,
          projectPath: build.cursor_project_path,
          repositoryUrl: build.github_repository_url,
          configuration: build.configuration
        };
      });
    } catch (error) {
      console.error('[Build Automation] Error fetching build history:', error);
      return [];
    }
  }

  /**
   * Get detailed build information
   */
  async getBuildDetails(buildId: string): Promise<BuildProgress | null> {
    try {
      const { data, error } = await supabase
        .from('automated_builds')
        .select('*')
        .eq('id', buildId)
        .single();

      if (error || !data) {
        console.error('[Build Automation] Failed to fetch build details:', error);
        return null;
      }

      const progressData = data.progress as any;
      
      // Load logs from database
      const { buildLogs, mcpLogs } = await this.loadLogsFromDatabase(buildId);
      
      return {
        buildId: data.id,
        projectId: data.project_id, // Load project ID from database
        status: data.status,
        currentStep: data.current_step,
        totalSteps: data.total_steps,
        projectPath: data.cursor_project_path || '',
        repositoryUrl: data.github_repository_url,
        steps: [],
        promptQueue: [],
        startedAt: new Date(data.started_at),
        completedAt: data.completed_at ? new Date(data.completed_at) : undefined,
        elapsedTime: data.completed_at 
          ? new Date(data.completed_at).getTime() - new Date(data.started_at).getTime()
          : Date.now() - new Date(data.started_at).getTime(),
        logs: buildLogs.length > 0 ? buildLogs : (progressData?.logs || []),
        errors: progressData?.errors || [],
        migrations: progressData?.migrations || [],
        mcpLogs: mcpLogs.length > 0 ? mcpLogs : undefined
      };
    } catch (error) {
      console.error('[Build Automation] Error fetching build details:', error);
      return null;
    }
  }

  /**
   * Resume build from last completed prompt
   */
  async resumeFromLastPrompt(buildId: string): Promise<string> {
    console.log('[Build Automation] Resuming build:', buildId);

    try {
      // Fetch existing build data
      const { data: buildData, error: fetchError } = await supabase
        .from('automated_builds')
        .select('*')
        .eq('id', buildId)
        .single();

      if (fetchError || !buildData) {
        throw new Error('Build not found');
      }

      // Check if build can be resumed
      if (buildData.status === 'completed') {
        throw new Error('Build already completed');
      }

      if (buildData.status === 'running') {
        throw new Error('Build is currently running');
      }

      const config = buildData.configuration as BuildSequenceConfig;
      if (!config) {
        throw new Error('Build configuration not found');
      }

      // Fetch GitHub user data
      const githubUserData = await getGitHubUserData();

      // Update build status to running
      await supabase
        .from('automated_builds')
        .update({ status: 'running' })
        .eq('id', buildId);

      // Initialize build progress from stored data
      const buildProgress: BuildProgress = {
        buildId: buildData.id,
        status: 'running',
        currentStep: buildData.current_step,
        totalSteps: buildData.total_steps,
        projectPath: buildData.cursor_project_path || '',
        repositoryUrl: buildData.github_repository_url,
        steps: [],
        promptQueue: [],
        startedAt: new Date(buildData.started_at),
        elapsedTime: 0,
        logs: [],
        errors: [],
        migrations: []
      };

      // Load historical logs from database
      const { buildLogs, mcpLogs } = await this.loadLogsFromDatabase(buildId);
      buildProgress.logs = buildLogs;
      if (mcpLogs.length > 0) {
        buildProgress.mcpLogs = mcpLogs;
      }

      // Set active build
      this.activeBuilds.set(buildId, buildProgress);
      this.addLog(buildId, 'info', `Resuming build from step ${buildData.current_step}`, 'automation');

      // Continue the build sequence
      this.executeBuildSequence(buildId, config, githubUserData).catch(error => {
        console.error('[Build Automation] Build failed:', error);
        this.handleBuildError(buildId, error);
      });

      return buildId;
    } catch (error) {
      console.error('[Build Automation] Failed to resume build:', error);
      throw error;
    }
  }
}

// Singleton instance
let buildAutomationServiceInstance: BuildAutomationService | null = null;

export const getBuildAutomationService = (): BuildAutomationService => {
  if (!buildAutomationServiceInstance) {
    buildAutomationServiceInstance = new BuildAutomationService();
  }
  return buildAutomationServiceInstance;
};

export default BuildAutomationService;


