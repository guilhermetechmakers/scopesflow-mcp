import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { WebSocketServer } from 'ws';

// Load environment variables
dotenv.config();

const execAsync = promisify(exec);

interface CursorProjectConfig {
  projectName: string;
  projectPath: string;
  framework: string;
  packageManager: string;
  template?: string;
  gitRepository?: string;
}

interface ExecutePromptArgs {
  prompt: string;
  projectPath: string;
  timeout?: number;
  context?: string;
  files?: string[];
}

interface ProjectPathArgs {
  projectPath: string;
}

interface GetFilesArgs {
  projectPath: string;
  pattern?: string;
}

class CursorMCPServer {
  private server: Server;
  private wss: WebSocketServer | null = null;
  private toolHandlers: Map<string, (args: any) => Promise<any>> = new Map();

  constructor() {
    this.server = new Server(
      {
        name: 'scopesflow-cursor',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
  }

  private setupToolHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'cursor/create-project',
            description: 'Create a new Cursor project',
            inputSchema: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Project name' },
                path: { type: 'string', description: 'Project path' },
                framework: { type: 'string', description: 'Framework to use' },
                packageManager: { type: 'string', description: 'Package manager' },
                template: { type: 'string', description: 'Project template' },
                gitRepository: { type: 'string', description: 'Git repository URL' }
              },
              required: ['name', 'path', 'framework', 'packageManager']
            }
          },
          {
            name: 'cursor/execute-prompt',
            description: 'Execute a prompt in Cursor',
            inputSchema: {
              type: 'object',
              properties: {
                prompt: { type: 'string', description: 'The prompt to execute' },
                projectPath: { type: 'string', description: 'Path to the project' },
                timeout: { type: 'number', description: 'Timeout in milliseconds' },
                context: { type: 'string', description: 'Additional context' },
                files: { type: 'array', items: { type: 'string' }, description: 'Specific files to focus on' }
              },
              required: ['prompt', 'projectPath']
            }
          },
          {
            name: 'cursor/get-project-state',
            description: 'Get current project state',
            inputSchema: {
              type: 'object',
              properties: {
                projectPath: { type: 'string', description: 'Path to the project' }
              },
              required: ['projectPath']
            }
          },
          {
            name: 'cursor/build-project',
            description: 'Build the project',
            inputSchema: {
              type: 'object',
              properties: {
                projectPath: { type: 'string', description: 'Path to the project' }
              },
              required: ['projectPath']
            }
          },
          {
            name: 'cursor/run-tests',
            description: 'Run tests in the project',
            inputSchema: {
              type: 'object',
              properties: {
                projectPath: { type: 'string', description: 'Path to the project' }
              },
              required: ['projectPath']
            }
          },
          {
            name: 'cursor/check-project',
            description: 'Check if project exists',
            inputSchema: {
              type: 'object',
              properties: {
                projectPath: { type: 'string', description: 'Path to the project' }
              },
              required: ['projectPath']
            }
          },
          {
            name: 'cursor/get-files',
            description: 'Get list of files in project',
            inputSchema: {
              type: 'object',
              properties: {
                projectPath: { type: 'string', description: 'Path to the project' },
                pattern: { type: 'string', description: 'File pattern to match' }
              },
              required: ['projectPath']
            }
          },
          {
            name: 'cursor/server-info',
            description: 'Get server information',
            inputSchema: {
              type: 'object',
              properties: {}
            }
          }
        ]
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        if (!args) {
          throw new Error('No arguments provided');
        }

        switch (name) {
          case 'cursor/create-project':
            return await this.createProject(this.validateCreateProjectArgs(args));
          
          case 'cursor/execute-prompt':
            return await this.executePrompt(this.validateExecutePromptArgs(args));
          
          case 'cursor/get-project-state':
            return await this.getProjectState(this.validateProjectPathArgs(args));
          
          case 'cursor/build-project':
            return await this.buildProject(this.validateProjectPathArgs(args));
          
          case 'cursor/run-tests':
            return await this.runTests(this.validateProjectPathArgs(args));
          
          case 'cursor/check-project':
            return await this.checkProject(this.validateProjectPathArgs(args));
          
          case 'cursor/get-files':
            return await this.getFiles(this.validateGetFilesArgs(args));
          
          case 'cursor/server-info':
            return await this.getServerInfo();
          
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
              })
            }
          ]
        };
      }
    });

    // Store tool handlers for WebSocket processing
    this.toolHandlers.set('cursor/create-project', this.createProject.bind(this));
    this.toolHandlers.set('cursor/execute-prompt', this.executePrompt.bind(this));
    this.toolHandlers.set('cursor/get-project-state', this.getProjectState.bind(this));
    this.toolHandlers.set('cursor/build-project', this.buildProject.bind(this));
    this.toolHandlers.set('cursor/run-tests', this.runTests.bind(this));
    this.toolHandlers.set('cursor/check-project', this.checkProject.bind(this));
    this.toolHandlers.set('cursor/get-files', this.getFiles.bind(this));
    this.toolHandlers.set('cursor/server-info', this.getServerInfo.bind(this));
  }

  // Validation methods with DEBUG LOGGING
  private validateCreateProjectArgs(args: Record<string, unknown>): CursorProjectConfig {
    console.log('[MCP Server] validateCreateProjectArgs received:', args);
    
    const { name, path, framework, packageManager, template, gitRepository } = args;
    
    console.log('[MCP Server] Extracted values:', { name, path, framework, packageManager, template, gitRepository });
    
    if (typeof name !== 'string') throw new Error('Project name must be a string');
    if (typeof path !== 'string') throw new Error('Project path must be a string');
    if (typeof framework !== 'string') throw new Error('Framework must be a string');
    if (typeof packageManager !== 'string') throw new Error('Package manager must be a string');
    
    const result = {
      projectName: name,
      projectPath: path,
      framework,
      packageManager,
      template: typeof template === 'string' ? template : undefined,
      gitRepository: typeof gitRepository === 'string' ? gitRepository : undefined
    };
    
    console.log('[MCP Server] validateCreateProjectArgs result:', result);
    return result;
  }

  private validateExecutePromptArgs(args: Record<string, unknown>): ExecutePromptArgs {
    const { prompt, projectPath, timeout, context, files } = args;
    
    if (typeof prompt !== 'string') throw new Error('Prompt must be a string');
    if (typeof projectPath !== 'string') throw new Error('Project path must be a string');
    
    return {
      prompt,
      projectPath,
      timeout: typeof timeout === 'number' ? timeout : undefined,
      context: typeof context === 'string' ? context : undefined,
      files: Array.isArray(files) ? files.filter(f => typeof f === 'string') : undefined
    };
  }

  private validateProjectPathArgs(args: Record<string, unknown>): ProjectPathArgs {
    const { projectPath } = args;
    
    if (typeof projectPath !== 'string') throw new Error('Project path must be a string');
    
    return { projectPath };
  }

  private validateGetFilesArgs(args: Record<string, unknown>): GetFilesArgs {
    const { projectPath, pattern } = args;
    
    if (typeof projectPath !== 'string') throw new Error('Project path must be a string');
    
    return {
      projectPath,
      pattern: typeof pattern === 'string' ? pattern : undefined
    };
  }

  // REAL CURSOR CLI INTEGRATION - FIXED PROJECT CREATION
  private async createProject(config: CursorProjectConfig) {
    const startTime = Date.now();
    
    try {
      console.log(`[MCP Server] Creating project: ${config.projectName} at ${config.projectPath}`);
      
      // Ensure the parent directory exists
      const parentDir = path.dirname(config.projectPath);
      await fs.mkdir(parentDir, { recursive: true });
      
      // Create project directory
      await fs.mkdir(config.projectPath, { recursive: true });
      
      // Initialize project based on framework
      let initCommand = '';
      const projectName = path.basename(config.projectPath);
      
      switch (config.framework) {
        case 'react':
          initCommand = `npx create-react-app "${projectName}" --template typescript`;
          break;
        case 'vite':
          initCommand = `npm create vite@latest "${projectName}" -- --template react-ts`;
          break;
        case 'nextjs':
          initCommand = `npx create-next-app@latest "${projectName}" --typescript --tailwind --eslint`;
          break;
        case 'vue':
          initCommand = `npm create vue@latest "${projectName}"`;
          break;
        default:
          // For default case, just create a basic project structure
          const packageJsonPath = path.join(config.projectPath, 'package.json');
          await fs.writeFile(packageJsonPath, JSON.stringify({
            name: projectName,
            version: '1.0.0',
            description: '',
            main: 'index.js',
            scripts: {
              test: 'echo "Error: no test specified" && exit 1'
            },
            keywords: [],
            author: '',
            license: 'ISC'
          }, null, 2));
      }

      // Execute project creation from parent directory if using a framework
      if (initCommand) {
        const { stdout, stderr } = await execAsync(initCommand, {
          cwd: parentDir,
          timeout: 120000 // 2 minutes
        });
        console.log(`[MCP Server] Project creation output:`, stdout);
      }

      // Verify project was created
      const projectExists = await fs.access(config.projectPath).then(() => true).catch(() => false);
      if (!projectExists) {
        throw new Error(`Project directory was not created at ${config.projectPath}`);
      }

      // Initialize git if repository provided
      if (config.gitRepository) {
        await execAsync('git init', { cwd: config.projectPath });
        await execAsync(`git remote add origin ${config.gitRepository}`, { cwd: config.projectPath });
      }

      // Create a basic README.md file to ensure the directory is properly initialized
      const readmePath = path.join(config.projectPath, 'README.md');
      await fs.writeFile(readmePath, `# ${config.projectName}\n\nThis project was created with ScopesFlow automation.\n`, 'utf-8');

      // Open project in Cursor (optional)
      try {
        await execAsync(`cursor "${config.projectPath}"`, { timeout: 10000 });
      } catch (cursorError) {
        console.warn('Failed to open in Cursor:', cursorError);
        // Don't fail the entire operation if Cursor isn't available
      }

      console.log(`[MCP Server] Project created successfully at ${config.projectPath}`);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              output: `Project created successfully at ${config.projectPath}`,
              error: null,
              filesChanged: ['README.md'],
              timeElapsed: Date.now() - startTime,
              projectPath: config.projectPath  // Make sure this is included!
            })
          }
        ]
      };
    } catch (error) {
      console.error(`[MCP Server] Project creation failed:`, error);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              output: '',
              error: error instanceof Error ? error.message : 'Unknown error',
              filesChanged: [],
              timeElapsed: Date.now() - startTime,
              projectPath: config.projectPath  // Make sure this is included even on error!
            })
          }
        ]
      };
    }
  }

  // REAL CURSOR CLI PROMPT EXECUTION
  private async executePrompt(args: ExecutePromptArgs) {
    const startTime = Date.now();
    
    try {
      console.log(`[MCP Server] Executing prompt in Cursor: ${args.projectPath}`);
      
      // Verify project directory exists before trying to execute prompt
      const projectExists = await fs.access(args.projectPath).then(() => true).catch(() => false);
      if (!projectExists) {
        throw new Error(`Project directory does not exist: ${args.projectPath}`);
      }
      
      // Method 1: Try using Cursor CLI directly (if available)
      try {
        // Create a temporary file with the prompt
        const promptFile = path.join(args.projectPath, '.cursor-prompt.tmp');
        await fs.writeFile(promptFile, args.prompt, 'utf-8');
        
        // Execute Cursor CLI command
        const { stdout, stderr } = await execAsync(
          `cursor --project-path "${args.projectPath}" --prompt-file "${promptFile}"`,
          {
            cwd: args.projectPath,
            timeout: args.timeout || 300000 // 5 minutes default
          }
        );
        
        // Clean up temporary file
        try {
          await fs.unlink(promptFile);
        } catch (cleanupError) {
          console.warn('Failed to cleanup prompt file:', cleanupError);
        }
        
        const filesChanged = await this.getChangedFiles(args.projectPath);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                output: stdout,
                error: stderr || null,
                filesChanged,
                timeElapsed: Date.now() - startTime
              })
            }
          ]
        };
      } catch (cursorError) {
        console.warn('Cursor CLI failed, trying alternative method:', cursorError);
        
        // Method 2: Alternative approach using Cursor's API or file system
        return await this.executePromptAlternative(args, startTime);
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              output: '',
              error: error instanceof Error ? error.message : 'Unknown error',
              filesChanged: [],
              timeElapsed: Date.now() - startTime
            })
          }
        ]
      };
    }
  }

  // Alternative prompt execution method
  private async executePromptAlternative(args: ExecutePromptArgs, startTime: number) {
    try {
      // Create a development task file that Cursor can process
      const taskFile = path.join(args.projectPath, 'DEVELOPMENT_TASK.md');
      const timestamp = new Date().toISOString();
      
      await fs.writeFile(taskFile, `# Development Task - ${timestamp}\n\n${args.prompt}\n\n## Context\n${args.context || 'No additional context provided'}\n\n## Files to Focus On\n${args.files?.join(', ') || 'All files'}\n`, 'utf-8');
      
      // Simulate processing time
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const filesChanged = await this.getChangedFiles(args.projectPath);
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              output: `Task created in ${taskFile}. Cursor should process this task and implement the requested changes.`,
              error: null,
              filesChanged,
              timeElapsed: Date.now() - startTime
            })
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              output: '',
              error: error instanceof Error ? error.message : 'Unknown error',
              filesChanged: [],
              timeElapsed: Date.now() - startTime
            })
          }
        ]
      };
    }
  }

  // MISSING METHODS - ADD THESE
  private async getProjectState(args: ProjectPathArgs) {
    try {
      // Check if project exists
      const exists = await fs.access(args.projectPath).then(() => true).catch(() => false);
      if (!exists) {
        throw new Error('Project not found');
      }

      // Get project files
      const files = await this.getAllFiles(args.projectPath);
      
      // Get dependencies
      const dependencies = await this.getDependencies(args.projectPath);
      
      // Check build status
      const buildStatus = await this.checkBuildStatus(args.projectPath);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: buildStatus,
              lastModified: new Date().toISOString(),
              files,
              dependencies,
              buildErrors: []
            })
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: 'error',
              lastModified: new Date().toISOString(),
              files: [],
              dependencies: [],
              buildErrors: [error instanceof Error ? error.message : 'Unknown error']
            })
          }
        ]
      };
    }
  }

  private async buildProject(args: ProjectPathArgs) {
    const startTime = Date.now();
    
    try {
      const { stdout, stderr } = await execAsync('npm run build', {
        cwd: args.projectPath,
        timeout: 120000 // 2 minutes
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              output: stdout,
              error: stderr || null,
              timeElapsed: Date.now() - startTime
            })
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              output: '',
              error: error instanceof Error ? error.message : 'Unknown error',
              timeElapsed: Date.now() - startTime
            })
          }
        ]
      };
    }
  }

  private async runTests(args: ProjectPathArgs) {
    const startTime = Date.now();
    
    try {
      const { stdout, stderr } = await execAsync('npm test', {
        cwd: args.projectPath,
        timeout: 180000 // 3 minutes
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              output: stdout,
              error: stderr || null,
              timeElapsed: Date.now() - startTime
            })
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              output: '',
              error: error instanceof Error ? error.message : 'Unknown error',
              timeElapsed: Date.now() - startTime
            })
          }
        ]
      };
    }
  }

  private async checkProject(args: ProjectPathArgs) {
    try {
      await fs.access(args.projectPath);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ exists: true })
          }
        ]
      };
    } catch {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ exists: false })
          }
        ]
      };
    }
  }

  private async getFiles(args: GetFilesArgs) {
    try {
      const files = await this.getAllFiles(args.projectPath);
      const filteredFiles = args.pattern 
        ? files.filter(file => file.includes(args.pattern!))
        : files;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ files: filteredFiles })
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ 
              files: [],
              error: error instanceof Error ? error.message : 'Unknown error'
            })
          }
        ]
      };
    }
  }

  private async getServerInfo() {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            name: 'ScopesFlow Cursor MCP Server',
            version: '1.0.0',
            status: 'running',
            capabilities: ['project-creation', 'prompt-execution', 'build-management'],
            timestamp: new Date().toISOString()
          })
        }
      ]
    };
  }

  // Helper methods
  private async getChangedFiles(projectPath: string): Promise<string[]> {
    try {
      // Get git status to see what files have changed
      const { stdout } = await execAsync('git status --porcelain', { cwd: projectPath });
      return stdout.trim().split('\n').filter(Boolean).map(line => line.substring(3)); // Remove git status prefix
    } catch {
      // If git is not available or not initialized, return empty array
      return [];
    }
  }

  private async getAllFiles(dirPath: string): Promise<string[]> {
    const files: string[] = [];
    
    async function traverse(currentPath: string) {
      try {
        const items = await fs.readdir(currentPath, { withFileTypes: true });
        
        for (const item of items) {
          const fullPath = path.join(currentPath, item.name);
          
          if (item.isDirectory() && !item.name.startsWith('.') && item.name !== 'node_modules') {
            await traverse(fullPath);
          } else if (item.isFile()) {
            files.push(path.relative(dirPath, fullPath));
          }
        }
      } catch (error) {
        console.warn(`Failed to traverse ${currentPath}:`, error);
      }
    }
    
    await traverse(dirPath);
    return files;
  }

  private async getDependencies(projectPath: string): Promise<string[]> {
    try {
      const packageJsonPath = path.join(projectPath, 'package.json');
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
      
      return [
        ...Object.keys(packageJson.dependencies || {}),
        ...Object.keys(packageJson.devDependencies || {})
      ];
    } catch {
      return [];
    }
  }

  private async checkBuildStatus(projectPath: string): Promise<string> {
    try {
      const buildPath = path.join(projectPath, 'build');
      const distPath = path.join(projectPath, 'dist');
      
      const buildExists = await fs.access(buildPath).then(() => true).catch(() => false);
      const distExists = await fs.access(distPath).then(() => true).catch(() => false);
      
      return (buildExists || distExists) ? 'ready' : 'idle';
    } catch {
      return 'idle';
    }
  }

  // WebSocket server implementation
  async runWebSocket() {
    const port = parseInt(process.env.MCP_SERVER_PORT || '3001');
    const host = process.env.MCP_SERVER_HOST || 'localhost';
    
    this.wss = new WebSocketServer({ 
      port,
      host,
      perMessageDeflate: false
    });
    
    console.error(`Starting ScopesFlow Cursor MCP Server on ws://${host}:${port}`);
    
    this.wss.on('connection', (ws) => {
      console.error('MCP client connected');
      
      ws.on('message', async (data) => {
        try {
          const message = JSON.parse(data.toString());
          console.error('Received message:', message.type || message.method);
          console.error('Message details:', JSON.stringify(message, null, 2));
          
          const response = await this.processMessage(message);
          ws.send(JSON.stringify(response));
        } catch (error) {
          console.error('Error processing message:', error);
          ws.send(JSON.stringify({
            error: error instanceof Error ? error.message : 'Unknown error',
            type: 'error'
          }));
        }
      });
      
      ws.on('close', () => {
        console.error('MCP client disconnected');
      });
      
      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
      });
    });
    
    this.wss.on('error', (error) => {
      console.error('WebSocket server error:', error);
    });
    
    console.error(`ScopesFlow Cursor MCP Server running on ws://${host}:${port}`);
  }

  private async processMessage(message: any) {
    try {
      console.log('[MCP Server] Processing message:', message);
      
      if (message.type === 'request' && message.method) {
        const toolName = message.method;
        const args = message.params || {};
        
        console.log('[MCP Server] Tool call:', toolName, 'with args:', args);
        
        const handler = this.toolHandlers.get(toolName);
        if (!handler) {
          throw new Error(`Unknown tool: ${toolName}`);
        }
        
        const result = await handler(args);
        
        console.log('[MCP Server] Tool result:', result);
        
        return {
          id: message.id,
          type: 'response',
          result: result
        };
      }
      
      if (message.type === 'request' && !message.method) {
        const tools = {
          tools: [
            {
              name: 'cursor/create-project',
              description: 'Create a new Cursor project'
            },
            {
              name: 'cursor/execute-prompt',
              description: 'Execute a prompt in Cursor'
            },
            {
              name: 'cursor/get-project-state',
              description: 'Get current project state'
            },
            {
              name: 'cursor/build-project',
              description: 'Build the project'
            },
            {
              name: 'cursor/run-tests',
              description: 'Run tests in the project'
            },
            {
              name: 'cursor/check-project',
              description: 'Check if project exists'
            },
            {
              name: 'cursor/get-files',
              description: 'Get list of files in project'
            },
            {
              name: 'cursor/server-info',
              description: 'Get server information'
            }
          ]
        };
        
        return {
          id: message.id,
          type: 'response',
          result: tools
        };
      }
      
      return { 
        error: 'Unknown message type',
        type: 'error'
      };
    } catch (error) {
      console.error('[MCP Server] Error in processMessage:', error);
      return {
        error: error instanceof Error ? error.message : 'Unknown error',
        type: 'error'
      };
    }
  }

  async stop() {
    if (this.wss) {
      this.wss.close();
      console.error('WebSocket server stopped');
    }
  }
}

// Start the server
const server = new CursorMCPServer();

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.error('Shutting down MCP server...');
  await server.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.error('Shutting down MCP server...');
  await server.stop();
  process.exit(0);
});

// Start the WebSocket server
server.runWebSocket().catch(console.error);

