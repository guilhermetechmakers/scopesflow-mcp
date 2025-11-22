import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { exec, spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { WebSocketServer } from 'ws';
import { Client } from 'ssh2';

// Load environment variables (optional now, not required for Cursor CLI)
dotenv.config();

const execAsync = promisify(exec);

interface CursorProjectConfig {
  projectName: string;
  projectPath: string;
  framework: string;
  packageManager: string;
  template?: string;
  gitRepository?: string;
  gitHubToken?: string;      // NEW
  gitUserName?: string;      // NEW
  gitUserEmail?: string;     // NEW
  supabaseUrl?: string;      // NEW - Supabase project URL
  supabaseServiceRoleKey?: string; // NEW - Supabase service role key
  designPattern?: string;    // NEW - Design pattern/style for the project (DEPRECATED)
  designPatternSummary?: string;  // NEW - Short design pattern summary (DEPRECATED)
  designPatternDetails?: string;  // NEW - Detailed design pattern description (DEPRECATED)
  designColorPalette?: string;    // NEW - Color palette section
  designTypographyLayout?: string; // NEW - Typography and layout section
  designKeyElements?: string;      // NEW - Key design elements section
  designPhilosophy?: string;      // NEW - Design philosophy section
  designReference?: string;        // NEW - Complete design reference document
  designPatternId?: string;        // NEW - Reference ID for server-side design pattern lookup
  designPatternStore?: string;     // NEW - Design pattern data to store temporarily
}

interface ExecutePromptArgs {
  prompt: string;
  projectPath: string;
  timeout?: number;
  context?: string;
  files?: string[];
  gitHubToken?: string;      // NEW
  gitUserName?: string;      // NEW
  gitUserEmail?: string;     // NEW
  gitRepository?: string;    // NEW
  isFirstPrompt?: boolean;   // NEW: Flag for first-time setup vs subsequent prompts
  retryCount?: number;       // NEW: Track retry attempts for timeout fallback
  isRetry?: boolean;         // NEW: Flag to indicate if this is a retry attempt
}
interface ProjectPathArgs {
  projectPath: string;
}

interface GetFilesArgs {
  projectPath: string;
  pattern?: string;
}

interface ProjectGitConfig {
  gitRepository?: string;
  gitHubToken?: string;
  gitUserName?: string;
  gitUserEmail?: string;
}

interface VPSConfig {
  host: string;
  user: string;
  password: string;
  port: number;
  projectBasePath?: string;
}

export class CursorMCPServer {
  private server: Server;
  private wss: WebSocketServer | null = null;
  private toolHandlers: Map<string, (args: any) => Promise<any>> = new Map();
  private cursorAgentAvailable: boolean = false;
  private gitMutex: Promise<void> = Promise.resolve();
  private designPatternStorage: Map<string, string> = new Map();
  private temporaryDesignPatternStorage: Map<string, string> = new Map();
  private vpsConfig: VPSConfig | null = null;
  
  // Build validation and auto-fix configuration
  private readonly MAX_BUILD_FIX_RETRIES = 10;
  private readonly BUILD_TIMEOUT = 120000; // 2 minutes
  private readonly DEV_SERVER_CHECK_TIMEOUT = 30000; // 30 seconds

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
    this.loadVPSConfig();
    this.checkCursorAgent();
    this.initializeDefaultDesignPatterns();
  }

  // Design Pattern Storage Methods
  private initializeDefaultDesignPatterns() {
    // Store some default design patterns
    this.designPatternStorage.set('modern-dark-dashboard', `## Color Palette

- Primary background: Deep charcoal #18191C
- Secondary background/panels: Slightly lighter charcoal #222326
- Card backgrounds: Dark gray #232427
- Borders and separators: Subtle gray #2D2E31
- Primary accent: Electric blue #3B82F6 (used for selected/active states and icons)
- Secondary accent: Soft green #22D3EE (used for project tags)
- Text primary: High-contrast white #F9FAFB
- Text secondary: Muted gray #A1A1AA
- Icon and button accents: Light gray #D1D5DB
- Graph/chart accents: Red #F87171 and white #F9FAFB
- Hover/focus: Slight gradient or soft highlight using #2D2E31

## Typography & Layout

- Font family: Sans-serif (e.g., Inter, Helvetica Neue, or similar)
- Font weights: Regular for body, bold for headings and navigation
- Headings: Large, left-aligned, clear hierarchy (H1 > H2 > H3)
- Body text: Medium size, high readability, generous letter-spacing
- Spacing: Consistent 16px–24px paddings and margins, with tight vertical rhythm
- Layout: Grid-based, modular, clear separation of sidebar, main content, and secondary panels
- Alignment: Left-aligned text; centralized cards and charts

## Key Design Elements

### Card Design:
- Background: Solid dark gray (#232427)
- Borders: Thin, subtle (#2D2E31), with slightly rounded corners (6px–8px radius)
- Shadows: Minimal or none, flat with slight elevation via border contrast
- Hover state: Slight lift or outline highlight (#3B82F6)
- Visual hierarchy: Title bold and prominent, description subdued, actions at the bottom

### Navigation:
- Sidebar: Vertical, fixed, with grouped sections (Essentials, Projects, Support)
- Active state: Blue highlight (#3B82F6), bold text, pill-shaped background
- Collapsible sections for projects/support
- Search and filter above main navigation, using rounded input fields

### Data Visualization:
- Chart backgrounds: Transparent or match panel (#18191C)
- Lines and points: Bright accent colors (Red #F87171, White #F9FAFB)
- Axis/grid lines: Subtle, low-opacity gray (#2D2E31)
- Pie charts: Flat, bold color blocks; minimal legends; clean separation

### Interactive Elements:
- Buttons: Flat style, rounded corners, high-contrast text, accent border or background on hover (#3B82F6)
- Form fields: Rounded, dark backgrounds, subtle inner shadows, placeholder text in muted gray
- Micro-interactions: Soft color transitions, subtle scaling or highlighting for hover/focus states

## Design Philosophy

This interface embodies:
- A modern, sleek, and professional aesthetic with a focus on clarity and minimalism
- Design principles: High contrast for readability, generous spacing, modularity, and clear visual hierarchy
- User experience goals: Reduce cognitive load, promote intuitive navigation, deliver a premium and trustworthy feel, and support rapid task completion with minimal distractions
- Visual strategy: Emphasizes functional elegance, accessibility, and a workspace-like environment tailored for high-productivity teams`);

    console.log('[MCP Server] ✅ Initialized default design patterns');
  }

  private storeDesignPattern(id: string, pattern: string): void {
    this.designPatternStorage.set(id, pattern);
    console.log(`[MCP Server] ✅ Stored design pattern: ${id} (${pattern.length} chars)`);
  }

  private getDesignPattern(id: string): string | undefined {
    const pattern = this.designPatternStorage.get(id);
    if (pattern) {
      console.log(`[MCP Server] ✅ Retrieved design pattern: ${id} (${pattern.length} chars)`);
    } else {
      console.log(`[MCP Server] ❌ Design pattern not found: ${id}`);
    }
    return pattern;
  }

  // Temporary Design Pattern Storage Methods
  private storeTemporaryDesignPattern(projectId: string, pattern: string): void {
    this.temporaryDesignPatternStorage.set(projectId, pattern);
    console.log(`[MCP Server] ✅ Stored temporary design pattern for project: ${projectId} (${pattern.length} chars)`);
  }

  private getTemporaryDesignPattern(projectId: string): string | undefined {
    const pattern = this.temporaryDesignPatternStorage.get(projectId);
    if (pattern) {
      console.log(`[MCP Server] ✅ Retrieved temporary design pattern for project: ${projectId} (${pattern.length} chars)`);
    } else {
      console.log(`[MCP Server] ❌ Temporary design pattern not found for project: ${projectId}`);
    }
    return pattern;
  }

  private cleanupTemporaryDesignPattern(projectId: string): void {
    const deleted = this.temporaryDesignPatternStorage.delete(projectId);
    if (deleted) {
      console.log(`[MCP Server] ✅ Cleaned up temporary design pattern for project: ${projectId}`);
    }
  }

  // Store Design Pattern Method (for two-step process)
  private async storeDesignPatternForProject(args: { projectId: string; designPattern: string }) {
    try {
      console.log(`[MCP Server] Storing design pattern for project: ${args.projectId}`);
      console.log(`[MCP Server] Design pattern length: ${args.designPattern.length} characters`);
      
      // Store the design pattern with the provided project ID
      this.storeTemporaryDesignPattern(args.projectId, args.designPattern);
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: `Design pattern stored successfully for project: ${args.projectId}`,
              projectId: args.projectId,
              patternLength: args.designPattern.length
            })
          }
        ]
      };
    } catch (error) {
      console.error('[MCP Server] Error storing design pattern:', error);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: `Failed to store design pattern: ${error instanceof Error ? error.message : 'Unknown error'}`,
              projectId: args.projectId
            })
          }
        ]
      };
    }
  }

  // VPS Configuration Methods
  private loadVPSConfig(): void {
    const host = process.env.VPS_HOST;
    const user = process.env.VPS_USER;
    const password = process.env.VPS_PASSWORD;
    const port = process.env.VPS_PORT ? parseInt(process.env.VPS_PORT, 10) : 22;
    const projectBasePath = process.env.VPS_PROJECT_BASE_PATH;

    if (host && user && password) {
      this.vpsConfig = {
        host,
        user,
        password,
        port,
        projectBasePath
      };
      console.log(`[MCP Server] ✓ VPS configuration loaded: ${user}@${host}:${port}`);
    } else {
      console.log('[MCP Server] No VPS configuration found, using local/WSL execution');
    }
  }

  private getVPSConfig(): VPSConfig | null {
    return this.vpsConfig;
  }

  private async executeSSHCommand(vpsConfig: VPSConfig, command: string): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const conn = new Client();
      let stdout = '';
      let stderr = '';

      conn.on('ready', () => {
          conn.exec(command, (err: Error | undefined, stream: any) => {
          if (err) {
            conn.end();
            reject(err);
            return;
          }

          stream.on('close', (code: number, signal: string) => {
            conn.end();
            if (code === 0) {
              resolve({ stdout, stderr });
            } else {
              reject(new Error(`Command exited with code ${code}: ${stderr || stdout}`));
            }
          });

          stream.on('data', (data: Buffer) => {
            stdout += data.toString();
          });

          stream.stderr.on('data', (data: Buffer) => {
            stderr += data.toString();
          });
        });
      });

      conn.on('error', (err) => {
        reject(err);
      });

      conn.connect({
        host: vpsConfig.host,
        port: vpsConfig.port,
        username: vpsConfig.user,
        password: vpsConfig.password,
        readyTimeout: 10000
      });
    });
  }

  private async testVPSConnection(vpsConfig: VPSConfig): Promise<boolean> {
    try {
      const result = await this.executeSSHCommand(vpsConfig, 'echo "Connection test"');
      return result.stdout.trim() === 'Connection test';
    } catch (error) {
      console.warn(`[MCP Server] VPS connection test failed:`, error);
      return false;
    }
  }

  private async transferFileToVPS(localPath: string, remotePath: string, vpsConfig: VPSConfig): Promise<void> {
    return new Promise((resolve, reject) => {
      const conn = new Client();
      
      conn.on('ready', () => {
        conn.sftp((err: Error | undefined, sftp: any) => {
          if (err) {
            conn.end();
            reject(err);
            return;
          }

          sftp.fastPut(localPath, remotePath, (err: Error | undefined) => {
            conn.end();
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
        });
      });

      conn.on('error', (err) => {
        reject(err);
      });

      conn.connect({
        host: vpsConfig.host,
        port: vpsConfig.port,
        username: vpsConfig.user,
        password: vpsConfig.password,
        readyTimeout: 10000
      });
    });
  }

  private convertToVPSPath(localPath: string, vpsConfig: VPSConfig): string {
    // If projectBasePath is configured, assume projects are under that path
    if (vpsConfig.projectBasePath) {
      const projectName = path.basename(localPath);
      return path.join(vpsConfig.projectBasePath, projectName).replace(/\\/g, '/');
    }
    
    // Otherwise, assume the path structure matches (absolute paths on VPS)
    // Convert Windows paths to Unix paths
    return localPath.replace(/\\/g, '/').replace(/^([A-Z]):/i, (match, drive) => `/mnt/${drive.toLowerCase()}`);
  }

  private async checkCursorAgent() {
    try {
      // First check if VPS config is available
      const vpsConfig = this.getVPSConfig();
      
      if (vpsConfig) {
        console.log('[MCP Server] Checking cursor-agent on VPS...');
        try {
          const result = await this.executeSSHCommand(vpsConfig, '~/.local/bin/cursor-agent --version');
          if (result.stdout && result.stdout.trim()) {
            this.cursorAgentAvailable = true;
            console.log(`[MCP Server] ✓ Cursor Agent CLI detected on VPS (version: ${result.stdout.trim()})`);
            return;
          } else {
            console.warn(`[MCP Server] ⚠ SSH command succeeded but no output: ${result.stderr || 'no stderr'}`);
          }
        } catch (error: any) {
          console.error(`[MCP Server] SSH command failed:`, error.message);
          if (error.stderr) {
            console.error(`[MCP Server] stderr: ${error.stderr}`);
          }
          if (error.stdout) {
            console.error(`[MCP Server] stdout: ${error.stdout}`);
          }
          throw error;
        }
      }
      
      // Fallback to local/WSL check
      const isWindows = process.platform === 'win32';
      const command = isWindows 
        ? 'wsl -d Ubuntu bash -c "~/.local/bin/cursor-agent --version"'
        : 'cursor-agent --version';
      
      const { stdout } = await execAsync(command);
      this.cursorAgentAvailable = true;
      console.log(`[MCP Server] ✓ Cursor Agent CLI detected and available locally (version: ${stdout.trim()})`);
    } catch (error) {
      this.cursorAgentAvailable = false;
      console.warn('[MCP Server] ⚠ Cursor Agent CLI not found.');
      
      const vpsConfig = this.getVPSConfig();
      if (vpsConfig) {
        console.warn('[MCP Server] Install cursor-agent on VPS with: curl https://cursor.com/install -fsS | bash');
      } else {
        if (process.platform === 'win32') {
          console.warn('[MCP Server] Install with: wsl -d Ubuntu bash -c "curl https://cursor.com/install -fsS | bash"');
        } else {
          console.warn('[MCP Server] Install with: curl https://cursor.com/install -fsS | bash');
        }
      }
      console.warn('[MCP Server] Code generation will use fallback mode.');
    }
  }

  private async readBoilerplateFile(filename: string): Promise<string> {
    try {
      const filePath = path.join(process.cwd(), filename);
      const content = await fs.readFile(filePath, 'utf-8');
      return content;
    } catch (error) {
      console.warn(`[MCP Server] Could not read ${filename}, using fallback`);
      return '';
    }
  }

  private async generateCursorRules(designPattern?: string, projectPath?: string): Promise<string> {
    try {
      // Read BUILD_GUIDE.md content
      const buildGuideContent = await this.readBoilerplateFile('BUILD_GUIDE.md');
      
      if (!buildGuideContent) {
        console.warn('[MCP Server] BUILD_GUIDE.md not found, using minimal rules');
        return await this.getMinimalCursorRules(designPattern, projectPath);
      }

      // Always include the master design reference content
      const masterDesignReference = await this.readBoilerplateFile('DESIGN_REFERENCE.md');
      const designReferenceContent = masterDesignReference || '### Design Guidelines\n\n- Use modern, bold designs with unique layouts\n- Implement smooth animations and transitions\n- Ensure mobile-first responsive design\n- Add hover states and micro-interactions to all interactive elements\n- Use gradients and depth (shadows) for visual hierarchy\n- Maintain consistent spacing scale: 4px, 8px, 16px, 24px, 32px, 48px, 64px\n- Ensure accessibility (keyboard navigation, ARIA labels, color contrast)';

      // Generate projectrules.mdc content with YAML frontmatter
      let rulesContent = `---
alwaysApply: true
---

# Project Cursor Rules

This file contains project-specific development rules and guidelines.
These rules will be automatically applied when working in this project with Cursor.

`;

      // Add design pattern context if specified
      if (designPattern) {
        rulesContent += `## Design Pattern: ${designPattern}

This project follows the "${designPattern}" design pattern.
Ensure all implementations align with this pattern's best practices.

`;
      }

      // Add core rules from BUILD_GUIDE.md
      rulesContent += `## Tech Stack Requirements

- **Framework:** React 18 with TypeScript
- **Build Tool:** Vite with SWC plugin
- **Styling:** Tailwind CSS v3 with CSS custom properties
- **UI Components:** Shadcn/ui with Radix UI primitives
- **Animations:** Motion library (NOT framer-motion)
- **Icons:** Lucide React
- **State Management:** TanStack React Query
- **Forms:** React Hook Form with Zod validation
- **HTTP Client:** Axios
- **Notifications:** Sonner

## Critical Setup Rules

1. **ALWAYS run \`npm install\` before any build commands**
2. Use Motion library for animations, NOT framer-motion
3. Import Inter font in index.css
4. Use Tailwind v3 with tailwind.config.js (not CSS-based config)
5. Use \`@/\` path aliases for imports
6. Use Shadcn components instead of custom UI components

## Code Style

- Write concise, technical TypeScript code
- Use functional and declarative patterns (avoid classes)
- Favor iteration and modularization over duplication
- Use descriptive variable names with auxiliary verbs (isLoading, hasError)
- Structure: exported components, subcomponents, helpers, types
- Minimize \`useEffect\` and \`useState\`; favor React Server Components where possible

## API Layer Pattern

- Centralize API calls in \`src/api/\` directory
- Use Axios with interceptors for auth and error handling
- Create React Query hooks in \`src/hooks/\`
- Implement proper error handling with toast notifications
- Use TypeScript types for all API responses

## Design System

${designPattern ? this.getDesignPatternGuidelines(designPattern) : ''}

---

## Design Reference (Complete Guidelines)

**This section contains the complete design guidelines for this project:**

${designReferenceContent}

---

### Quick Design Checklist

- [ ] Applied project color palette and typography from Design Reference above
- [ ] Implemented responsive breakpoints
- [ ] Added hover states and micro-interactions
- [ ] Used consistent spacing scale
- [ ] Ensured accessibility (keyboard nav, ARIA, contrast)

## Component Patterns

- Wrap all pages with animation components
- Use \`cn()\` utility for conditional classes
- Implement loading skeletons (not spinners)
- Create helpful empty states with illustrations
- Add error boundaries for robust error handling

## Performance & Best Practices

- Optimize images: WebP format, lazy loading
- Implement code splitting with dynamic imports
- Use proper memoization to minimize re-renders
- Debounce search inputs
- Virtualize long lists
- Respect prefers-reduced-motion

## Testing

- Write unit tests for components
- Mock API interactions in tests
- Test error scenarios and edge cases

---

For complete reference, see BUILD_GUIDE.md in the project root.
`;

      return rulesContent;
    } catch (error) {
      console.error('[MCP Server] Error generating cursor rules:', error);
      return await this.getMinimalCursorRules(designPattern, projectPath);
    }
  }

  private getDesignPatternGuidelines(pattern: string): string {
    const patternLower = pattern.toLowerCase();
    
    if (patternLower.includes('dashboard')) {
      return `### Dashboard-Specific Guidelines

- Use collapsible sidebar navigation
- Implement data tables with sorting, filtering, and pagination
- Create metric cards with trend indicators
- Use charts (Recharts) for data visualization
- Ensure responsive layout (sidebar → drawer on mobile)
- Add loading skeletons for data fetching states
`;
    } else if (patternLower.includes('landing') || patternLower.includes('marketing')) {
      return `### Landing Page-Specific Guidelines

- Create engaging hero sections with animated gradients or interactive backgrounds
- Use bento grids or masonry layouts for feature sections
- Implement scroll animations (fade-in, slide-up, parallax)
- Design prominent CTAs with hover effects and animations
- Add social proof sections
- Ensure fast loading and optimal performance
`;
    } else if (patternLower.includes('saas')) {
      return `### SaaS App-Specific Guidelines

- Implement clear authentication flows
- Create intuitive onboarding experience
- Design settings pages with clear sections
- Use progressive disclosure for complex features
- Add helpful tooltips and documentation links
- Implement billing/subscription management UI
`;
    }
    
    return '';
  }

  private async getMinimalCursorRules(designPattern?: string, projectPath?: string): Promise<string> {
    // Always include the master design reference content
    const masterDesignReference = await this.readBoilerplateFile('DESIGN_REFERENCE.md');
    const designReferenceContent = masterDesignReference || '### Design Guidelines\n\n- Use modern, bold designs with unique layouts\n- Implement smooth animations and transitions\n- Ensure mobile-first responsive design\n- Add hover states and micro-interactions to all interactive elements\n- Use gradients and depth (shadows) for visual hierarchy\n- Maintain consistent spacing scale: 4px, 8px, 16px, 24px, 32px, 48px, 64px\n- Ensure accessibility (keyboard navigation, ARIA labels, color contrast)';

    return `---
alwaysApply: true
---

# Project Cursor Rules

${designPattern ? `## Design Pattern: ${designPattern}\n\n` : ''}

## Tech Stack
- React 18 + TypeScript
- Vite + SWC
- Tailwind CSS v3
- Shadcn/ui + Motion
- React Query + Axios

## Critical Rules
1. Always run \`npm install\` before build commands
2. Use Motion library for animations
3. Import Inter font in CSS
4. Use \`@/\` path aliases
5. Follow mobile-first responsive design

---

## Design Reference (Complete Guidelines)

**This section contains the complete design guidelines for this project:**

${designReferenceContent}

---

See BUILD_GUIDE.md for complete guidelines.
`;
  }

  private async generateDesignRules(designPattern?: string): Promise<string> {
    try {
      // Read DESIGN_RULES.md master file
      const designRulesContent = await this.readBoilerplateFile('DESIGN_RULES.md');
      
      if (!designRulesContent) {
        console.warn('[MCP Server] DESIGN_RULES.md not found, using minimal design rules');
        return this.getMinimalDesignRules(designPattern);
      }

      // Generate project-specific design_rules.md
      let rulesContent = `# Design Rules for This Project\n\n`;

      if (designPattern) {
        rulesContent += `## Project Design Pattern: ${designPattern}\n\n`;
        rulesContent += `This project follows the "${designPattern}" design pattern.\n`;
        rulesContent += `All design decisions should align with this pattern's best practices.\n\n`;
      }


      // Extract pattern-specific content
      if (designPattern) {
        const patternSection = this.extractPatternSection(designRulesContent, designPattern);
        if (patternSection) {
          rulesContent += patternSection + '\n\n---\n\n';
        }
      }

      // Add general design principles
      rulesContent += `## General Design Principles\n\n`;
      rulesContent += this.extractGeneralPrinciples(designRulesContent);

      return rulesContent;
    } catch (error) {
      console.error('[MCP Server] Error generating design rules:', error);
      return this.getMinimalDesignRules(designPattern);
    }
  }

  private extractPatternSection(content: string, pattern: string): string {
    const patternLower = pattern.toLowerCase();
    let sectionTitle = '';
    
    if (patternLower.includes('dashboard')) {
      sectionTitle = '## Dashboard Pattern';
    } else if (patternLower.includes('landing') || patternLower.includes('marketing')) {
      sectionTitle = '## Landing Page Pattern';
    } else if (patternLower.includes('saas')) {
      sectionTitle = '## SaaS App Pattern';
    }

    if (!sectionTitle) return '';

    const sectionStart = content.indexOf(sectionTitle);
    if (sectionStart === -1) return '';

    const nextSectionStart = content.indexOf('\n## ', sectionStart + sectionTitle.length);
    const sectionContent = nextSectionStart === -1 
      ? content.substring(sectionStart)
      : content.substring(sectionStart, nextSectionStart);

    return sectionContent.trim();
  }

  private extractGeneralPrinciples(content: string): string {
    // Extract key sections for all projects
    const sections = [
      'Color & Visual Design',
      'Interactions & Micro-animations',
      'Mobile Responsiveness',
      'Loading & Empty States',
      'Consistency Rules',
      'Technical Excellence',
      'Key Principles'
    ];

    let principles = '';
    sections.forEach(section => {
      const sectionStart = content.indexOf(`## ${section}`);
      if (sectionStart !== -1) {
        const nextSectionStart = content.indexOf('\n## ', sectionStart + section.length);
        const sectionContent = nextSectionStart === -1
          ? content.substring(sectionStart)
          : content.substring(sectionStart, nextSectionStart);
        principles += sectionContent.trim() + '\n\n---\n\n';
      }
    });

    return principles;
  }

  private getMinimalDesignRules(designPattern?: string): string {
    return `# Design Rules for This Project

${designPattern ? `## Project Design Pattern: ${designPattern}\n\n` : ''}

## Key Principles

1. Mobile-first responsive design
2. Smooth animations and transitions
3. Accessible (keyboard nav, ARIA, contrast)
4. Modern, bold designs
5. Consistent spacing and typography

See DESIGN_RULES.md in the server root for complete guidelines.
`;
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
                gitRepository: { type: 'string', description: 'Git repository URL' },
                gitHubToken: { type: 'string', description: 'GitHub OAuth token for authentication' },
                gitUserName: { type: 'string', description: 'Git user name for commits' },
                gitUserEmail: { type: 'string', description: 'Git user email for commits' },
                supabaseUrl: { type: 'string', description: 'Supabase project URL (optional, also accepts supabase_url)' },
                supabaseServiceRoleKey: { type: 'string', description: 'Supabase service role key (optional, also accepts supabase_service_role_key, supabaseServiceKey, or supabase_service_key)' },
                supabase_url: { type: 'string', description: 'Supabase project URL - snake_case variant (optional)' },
                supabase_service_role_key: { type: 'string', description: 'Supabase service role key - snake_case variant (optional)' },
                design_pattern: { type: 'string', description: 'Design pattern/style for the project (e.g., "modern dashboard", "landing page", "saas app") - DEPRECATED, use design pattern sections instead' },
                design_pattern_summary: { type: 'string', description: 'Short design pattern summary (e.g., "modern-dark-dashboard", "saas-app", "landing-page") - DEPRECATED, use design pattern sections instead' },
                design_pattern_details: { type: 'string', description: 'Detailed design pattern description or reference ID for server-side lookup - DEPRECATED, use design pattern sections instead' },
                design_color_palette: { type: 'string', description: 'Color palette section of the design pattern (e.g., primary colors, accent colors, background colors)' },
                design_typography_layout: { type: 'string', description: 'Typography and layout section of the design pattern (e.g., font families, weights, spacing, alignment)' },
                design_key_elements: { type: 'string', description: 'Key design elements section (e.g., card design, navigation, data visualization, interactive elements)' },
                design_philosophy: { type: 'string', description: 'Design philosophy section (e.g., visual language, UX goals, design principles)' },
                design_reference: { type: 'string', description: 'Complete design reference document with all design specifications' },
                design_pattern_id: { type: 'string', description: 'Reference ID for server-side design pattern lookup (e.g., "modern-dark-dashboard", "saas-app", "landing-page")' },
                design_pattern_store: { type: 'string', description: 'Design pattern data to store temporarily on server (will be stored with project-specific ID)' }
              },
              required: ['name', 'path', 'framework', 'packageManager']
            }
          },
          {
            name: 'cursor/store-design-pattern',
            description: 'Store a design pattern temporarily on the server for later use in project creation',
            inputSchema: {
              type: 'object',
              properties: {
                projectId: { type: 'string', description: 'Unique identifier for the project (will be used to retrieve the design pattern later)' },
                designPattern: { type: 'string', description: 'Complete design pattern specification' }
              },
              required: ['projectId', 'designPattern']
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
                files: { type: 'array', items: { type: 'string' }, description: 'Specific files to focus on' },
                gitHubToken: { type: 'string', description: 'GitHub OAuth token for auto-commit' },
                gitUserName: { type: 'string', description: 'Git user name for commits' },
                gitUserEmail: { type: 'string', description: 'Git user email for commits' }
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

        // Debug logging for all tool calls
        console.log('[MCP Server] Tool call received:', name);
        console.log('[MCP Server] Tool call args keys:', Object.keys(args));
        console.log('[MCP Server] Tool call args size:', JSON.stringify(args).length);

        switch (name) {
          case 'cursor/create-project':
            // Debug logging for raw args before validation
            console.log('[MCP Server] Raw args before validation:', JSON.stringify(args, null, 2));
            console.log('[MCP Server] Raw args keys:', Object.keys(args));
            console.log('[MCP Server] Raw args size:', JSON.stringify(args).length);
            console.log('[MCP Server] Raw design_pattern:', args.design_pattern);
            console.log('[MCP Server] Raw designPattern:', args.designPattern);
            console.log('[MCP Server] Raw design_pattern_summary:', args.design_pattern_summary);
            console.log('[MCP Server] Raw design_pattern_details:', args.design_pattern_details);
            console.log('[MCP Server] Raw design_color_palette:', args.design_color_palette);
            console.log('[MCP Server] Raw design_typography_layout:', args.design_typography_layout);
            console.log('[MCP Server] Raw design_key_elements:', args.design_key_elements);
            console.log('[MCP Server] Raw design_philosophy:', args.design_philosophy);
            console.log('[MCP Server] Raw design_reference:', args.design_reference);
            console.log('[MCP Server] Raw design_pattern_id:', args.design_pattern_id);
            console.log('[MCP Server] Raw design_pattern_store:', args.design_pattern_store);
            return await this.createProject(this.validateCreateProjectArgs(args));
          
          case 'cursor/store-design-pattern':
            console.log('[MCP Server] Storing design pattern with args:', args);
            return await this.storeDesignPatternForProject(args as { projectId: string; designPattern: string });
          
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
    this.toolHandlers.set('cursor/store-design-pattern', this.storeDesignPatternForProject.bind(this));
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
    console.log('[MCP Server] All arg keys:', Object.keys(args));
    
    // Debug logging for design_pattern parameters
    console.log('[MCP Server] Raw args size:', JSON.stringify(args).length);
    console.log('[MCP Server] design_pattern length:', typeof (args as any).design_pattern === 'string' ? (args as any).design_pattern.length : 'undefined');
    console.log('[MCP Server] designPattern length:', typeof (args as any).designPattern === 'string' ? (args as any).designPattern.length : 'undefined');
    console.log('[MCP Server] design_pattern_summary length:', typeof (args as any).design_pattern_summary === 'string' ? (args as any).design_pattern_summary.length : 'undefined');
    console.log('[MCP Server] design_pattern_details length:', typeof (args as any).design_pattern_details === 'string' ? (args as any).design_pattern_details.length : 'undefined');
    console.log('[MCP Server] design_color_palette length:', typeof (args as any).design_color_palette === 'string' ? (args as any).design_color_palette.length : 'undefined');
    console.log('[MCP Server] design_typography_layout length:', typeof (args as any).design_typography_layout === 'string' ? (args as any).design_typography_layout.length : 'undefined');
    console.log('[MCP Server] design_key_elements length:', typeof (args as any).design_key_elements === 'string' ? (args as any).design_key_elements.length : 'undefined');
    console.log('[MCP Server] design_philosophy length:', typeof (args as any).design_philosophy === 'string' ? (args as any).design_philosophy.length : 'undefined');
    console.log('[MCP Server] design_reference length:', typeof (args as any).design_reference === 'string' ? (args as any).design_reference.length : 'undefined');
    console.log('[MCP Server] design_pattern_id length:', typeof (args as any).design_pattern_id === 'string' ? (args as any).design_pattern_id.length : 'undefined');
    console.log('[MCP Server] design_pattern_store length:', typeof (args as any).design_pattern_store === 'string' ? (args as any).design_pattern_store.length : 'undefined');
    console.log('[MCP Server] design_color_palette preview:', typeof (args as any).design_color_palette === 'string' ? (args as any).design_color_palette.substring(0, 100) + '...' : 'undefined');
    console.log('[MCP Server] design_typography_layout preview:', typeof (args as any).design_typography_layout === 'string' ? (args as any).design_typography_layout.substring(0, 100) + '...' : 'undefined');
    console.log('[MCP Server] design_key_elements preview:', typeof (args as any).design_key_elements === 'string' ? (args as any).design_key_elements.substring(0, 100) + '...' : 'undefined');
    console.log('[MCP Server] design_philosophy preview:', typeof (args as any).design_philosophy === 'string' ? (args as any).design_philosophy.substring(0, 100) + '...' : 'undefined');
    console.log('[MCP Server] design_reference preview:', typeof (args as any).design_reference === 'string' ? (args as any).design_reference.substring(0, 100) + '...' : 'undefined');
    console.log('[MCP Server] design_pattern_id preview:', typeof (args as any).design_pattern_id === 'string' ? (args as any).design_pattern_id.substring(0, 100) + '...' : 'undefined');
    console.log('[MCP Server] design_pattern_store preview:', typeof (args as any).design_pattern_store === 'string' ? (args as any).design_pattern_store.substring(0, 100) + '...' : 'undefined');
    
    // Extract values - support both camelCase and snake_case naming conventions
    const { 
      name, 
      path, 
      framework, 
      packageManager, 
      template, 
      gitRepository, 
      gitHubToken, 
      gitUserName, 
      gitUserEmail, 
      supabaseUrl, 
      supabaseServiceRoleKey,
      // Also try snake_case variants
      supabase_url,
      supabase_service_role_key,
      supabaseServiceKey,
      supabase_service_key,
      // Design pattern parameters (deprecated)
      design_pattern,
      designPattern,
      design_pattern_summary,
      designPatternSummary,
      design_pattern_details,
      designPatternDetails,
      // Design pattern sections (new)
      design_color_palette,
      designColorPalette,
      design_typography_layout,
      designTypographyLayout,
      design_key_elements,
      designKeyElements,
      design_philosophy,
      designPhilosophy,
      design_reference,
      designReference,
      design_pattern_id,
      designPatternId,
      design_pattern_store,
      designPatternStore
    } = args as any;
    
    // Try both naming conventions for Supabase fields
    const finalSupabaseUrl = supabaseUrl || supabase_url;
    const finalSupabaseServiceRoleKey = supabaseServiceRoleKey || supabase_service_role_key || supabaseServiceKey || supabase_service_key;
    // Design pattern parameters (deprecated)
    const finalDesignPattern = design_pattern || designPattern;
    const finalDesignPatternSummary = design_pattern_summary || designPatternSummary;
    const finalDesignPatternDetails = design_pattern_details || designPatternDetails;
    // Design pattern sections (new)
    const finalDesignColorPalette = design_color_palette || designColorPalette;
    const finalDesignTypographyLayout = design_typography_layout || designTypographyLayout;
    const finalDesignKeyElements = design_key_elements || designKeyElements;
    const finalDesignPhilosophy = design_philosophy || designPhilosophy;
    const finalDesignReference = design_reference || designReference;
    const finalDesignPatternId = design_pattern_id || designPatternId;
    const finalDesignPatternStore = design_pattern_store || designPatternStore;
    
    console.log('[MCP Server] Extracted values:', { 
      name, 
      path, 
      framework, 
      packageManager, 
      template, 
      gitRepository, 
      gitHubToken, 
      gitUserName, 
      gitUserEmail, 
      supabaseUrl,
      supabase_url,
      finalSupabaseUrl,
      supabaseServiceRoleKey,
      supabase_service_role_key,
      finalSupabaseServiceRoleKey,
      // Design pattern parameters (deprecated)
      design_pattern,
      designPattern,
      finalDesignPattern,
      design_pattern_summary,
      designPatternSummary,
      finalDesignPatternSummary,
      design_pattern_details,
      designPatternDetails,
      finalDesignPatternDetails,
      // Design pattern sections (new)
      design_color_palette,
      designColorPalette,
      finalDesignColorPalette,
      design_typography_layout,
      designTypographyLayout,
      finalDesignTypographyLayout,
      design_key_elements,
      designKeyElements,
      finalDesignKeyElements,
      design_philosophy,
      designPhilosophy,
      finalDesignPhilosophy,
      design_reference,
      designReference,
      finalDesignReference,
      design_pattern_id,
      designPatternId,
      finalDesignPatternId,
      design_pattern_store,
      designPatternStore,
      finalDesignPatternStore
    });
    
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
      gitRepository: typeof gitRepository === 'string' ? gitRepository : undefined,
      gitHubToken: typeof gitHubToken === 'string' ? gitHubToken : undefined,
      gitUserName: typeof gitUserName === 'string' ? gitUserName : undefined,
      gitUserEmail: typeof gitUserEmail === 'string' ? gitUserEmail : undefined,
      supabaseUrl: typeof finalSupabaseUrl === 'string' ? finalSupabaseUrl : undefined,
      supabaseServiceRoleKey: typeof finalSupabaseServiceRoleKey === 'string' ? finalSupabaseServiceRoleKey : undefined,
      // Design pattern parameters (deprecated)
      designPattern: typeof finalDesignPattern === 'string' ? finalDesignPattern : undefined,
      designPatternSummary: typeof finalDesignPatternSummary === 'string' ? finalDesignPatternSummary : undefined,
      designPatternDetails: typeof finalDesignPatternDetails === 'string' ? finalDesignPatternDetails : undefined,
      // Design pattern sections (new)
      designColorPalette: typeof finalDesignColorPalette === 'string' ? finalDesignColorPalette : undefined,
      designTypographyLayout: typeof finalDesignTypographyLayout === 'string' ? finalDesignTypographyLayout : undefined,
      designKeyElements: typeof finalDesignKeyElements === 'string' ? finalDesignKeyElements : undefined,
      designPhilosophy: typeof finalDesignPhilosophy === 'string' ? finalDesignPhilosophy : undefined,
      designReference: typeof finalDesignReference === 'string' ? finalDesignReference : undefined,
      designPatternId: typeof finalDesignPatternId === 'string' ? finalDesignPatternId : undefined,
      designPatternStore: typeof finalDesignPatternStore === 'string' ? finalDesignPatternStore : undefined
    };
    
    console.log('[MCP Server] validateCreateProjectArgs result:', result);
    return result;
  }

  private validateExecutePromptArgs(args: Record<string, unknown>): ExecutePromptArgs {
    const { prompt, projectPath, timeout, context, files, gitHubToken, gitUserName, gitUserEmail, gitRepository, isFirstPrompt, retryCount, isRetry } = args;
    
    if (typeof prompt !== 'string') throw new Error('Prompt must be a string');
    if (typeof projectPath !== 'string') throw new Error('Project path must be a string');
    
    return {
      prompt,
      projectPath,
      timeout: typeof timeout === 'number' ? timeout : undefined,
      context: typeof context === 'string' ? context : undefined,
      files: Array.isArray(files) ? files.filter(f => typeof f === 'string') : undefined,
      gitHubToken: typeof gitHubToken === 'string' ? gitHubToken : undefined,
      gitUserName: typeof gitUserName === 'string' ? gitUserName : undefined,
      gitUserEmail: typeof gitUserEmail === 'string' ? gitUserEmail : undefined,
      gitRepository: typeof gitRepository === 'string' ? gitRepository : undefined,
      isFirstPrompt: typeof isFirstPrompt === 'boolean' ? isFirstPrompt : false,
      retryCount: typeof retryCount === 'number' ? retryCount : undefined,
      isRetry: typeof isRetry === 'boolean' ? isRetry : false
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

  // Helper method to combine design pattern parameters
  private combineDesignPattern(config: CursorProjectConfig): string | undefined {
    // Priority: designPatternId (stored via two-step process) > designPatternStore (direct storage) > designReference > Design pattern sections > designPatternSummary + designPatternDetails > designPattern (deprecated)
    
    // Highest priority: Stored design pattern via two-step process
    if (config.designPatternId) {
      const storedPattern = this.getTemporaryDesignPattern(config.designPatternId);
      if (storedPattern) {
        console.log(`[MCP Server] ✅ Using stored design pattern for project: ${config.designPatternId}`);
        return storedPattern;
      } else {
        console.log(`[MCP Server] ⚠️ Design pattern ID provided but not found in storage: ${config.designPatternId}`);
      }
    }
    
    // Second priority: Direct design pattern storage
    if (config.designPatternStore) {
      // Generate a unique project ID based on project name and path
      const projectId = `${config.projectName}-${config.projectPath}`.replace(/[^a-zA-Z0-9-]/g, '-');
      this.storeTemporaryDesignPattern(projectId, config.designPatternStore);
      console.log(`[MCP Server] ✅ Using direct design pattern storage for project: ${projectId}`);
      return config.designPatternStore;
    }
    
    // Third priority: Server-side design pattern lookup (predefined patterns)
    if (config.designPatternId) {
      const serverPattern = this.getDesignPattern(config.designPatternId);
      if (serverPattern) {
        console.log(`[MCP Server] ✅ Using predefined design pattern: ${config.designPatternId}`);
        return serverPattern;
      }
    }
    
    // Fourth priority: Complete design reference document
    if (config.designReference) {
      console.log(`[MCP Server] ✅ Using design reference document`);
      return config.designReference;
    }
    
    // Fifth priority: Section-based approach
    const sections = [];
    if (config.designColorPalette) sections.push(`## Color Palette\n\n${config.designColorPalette}`);
    if (config.designTypographyLayout) sections.push(`## Typography & Layout\n\n${config.designTypographyLayout}`);
    if (config.designKeyElements) sections.push(`## Key Design Elements\n\n${config.designKeyElements}`);
    if (config.designPhilosophy) sections.push(`## Design Philosophy\n\n${config.designPhilosophy}`);
    
    if (sections.length > 0) {
      console.log(`[MCP Server] ✅ Using section-based design pattern (${sections.length} sections)`);
      return sections.join('\n\n---\n\n');
    }
    
    // Fallback to deprecated parameters
    if (config.designPatternSummary && config.designPatternDetails) {
      console.log(`[MCP Server] ✅ Using deprecated design pattern summary + details`);
      return `${config.designPatternSummary}\n\n${config.designPatternDetails}`;
    } else if (config.designPatternSummary) {
      console.log(`[MCP Server] ✅ Using deprecated design pattern summary`);
      return config.designPatternSummary;
    } else if (config.designPattern) {
      console.log(`[MCP Server] ✅ Using deprecated design pattern`);
      return config.designPattern;
    }
    
    console.log(`[MCP Server] ⚠️ No design pattern provided`);
    return undefined;
  }

  // REAL CURSOR CLI INTEGRATION - FIXED PROJECT CREATION
  private async createProject(config: CursorProjectConfig) {
    const startTime = Date.now();
    
    try {
      console.log(`[MCP Server] Creating project: ${config.projectName} at ${config.projectPath}`);
      
      // Combine design pattern parameters
      const combinedDesignPattern = this.combineDesignPattern(config);
      console.log(`[MCP Server] Combined design pattern: ${combinedDesignPattern ? 'Present' : 'Not provided'}`);
      if (combinedDesignPattern) {
        console.log(`[MCP Server] Design pattern length: ${combinedDesignPattern.length}`);
        console.log(`[MCP Server] Design pattern preview: ${combinedDesignPattern.substring(0, 100)}...`);
      }
      
      // Validate project path
      if (!config.projectPath || typeof config.projectPath !== 'string') {
        throw new Error('Project path is required and must be a string');
      }
      
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

      // Auto-generate repository name from project path if not provided
      if (!config.gitRepository && config.gitHubToken) {
        const pathBasedName = path.basename(config.projectPath);
        console.log('[MCP Server] 📝 Auto-generating repository name from path:', pathBasedName);
        
        // This will be used by the GitHub creation logic below
        config.gitRepository = `https://github.com/auto-generated/${pathBasedName}.git`;
      }

      // Create GitHub repository BEFORE git init (if token and repo URL provided)
      if (config.gitRepository && config.gitHubToken) {
        try {
          const repoName = this.extractRepoName(config.gitRepository);
          console.log('[MCP Server] 🚀 Creating GitHub repository...');
          
          const repoResult = await this.createGitHubRepository(
            repoName,
            config.gitHubToken,
            false // public by default
          );
          
          if (repoResult.success) {
            // Update gitRepository with actual URL from GitHub
            config.gitRepository = repoResult.repoUrl;
            console.log('[MCP Server] ✅ Using GitHub repository:', repoResult.repoUrl);
          } else {
            console.warn('[MCP Server] ⚠️ GitHub repository creation failed, but continuing...');
            console.warn('[MCP Server] ⚠️', repoResult.message);
          }
        } catch (repoError) {
          console.error('[MCP Server] ❌ Error creating GitHub repository:', repoError);
          console.warn('[MCP Server] ⚠️ Continuing without GitHub repository...');
        }
      }

      // Save git configuration for future use
      if (config.gitHubToken || config.gitRepository || config.gitUserName || config.gitUserEmail) {
        const gitConfig: ProjectGitConfig = {
          gitRepository: config.gitRepository,
          gitHubToken: config.gitHubToken,
          gitUserName: config.gitUserName,
          gitUserEmail: config.gitUserEmail
        };
        await this.saveProjectGitConfig(config.projectPath, gitConfig);
        
        // Log configuration status for debugging
        if (config.gitHubToken && config.gitRepository) {
          console.log('[MCP Server] ✅ Git configuration saved with repository URL');
        } else if (config.gitHubToken && !config.gitRepository) {
          console.warn('[MCP Server] ⚠️ GitHub token provided but no repository URL - commits will be local only');
        }
      }

      // Auto-commit initial project if GitHub token provided
      if (config.gitHubToken) {
        try {
          console.log('[MCP Server] 🚀 Auto-committing initial project...');
          
          // Warn if repository URL is missing
          if (!config.gitRepository) {
            console.warn('[MCP Server] ⚠️ No gitRepository provided - commit will be local only (no push to remote)');
          }
          
          const commitMessage = `Initial commit: ${config.projectName}\n\nProject created with ScopesFlow automation using ${config.framework} framework.`;
          const result = await this.commitAndPush(
            config.projectPath,
            commitMessage,
            config.gitHubToken,
            config.gitUserName,
            config.gitUserEmail,
            config.gitRepository,
            0, // retryCount
            true // isInitialCommit - skip pull for empty repository
          );
          
          if (result.success) {
            console.log(`[MCP Server] ✅ ${result.message}`);
            if (result.changesCount && result.changesCount > 0) {
              console.log(`[MCP Server] 📊 Committed ${result.changesCount} files`);
            }
          } else {
            console.error(`[MCP Server] ❌ Initial commit failed: ${result.message}`);
          }
        } catch (commitError) {
          console.error('[MCP Server] ❌ Failed to commit initial project:', commitError);
          // Don't fail project creation, just log the error
        }
      }

      // Create .env.local file with Supabase credentials if provided
      if (config.supabaseUrl && config.supabaseServiceRoleKey) {
        const envContent = `VITE_SUPABASE_URL=${config.supabaseUrl}\nVITE_SUPABASE_ANON_KEY=${config.supabaseServiceRoleKey}\n`;
        const envPath = path.join(config.projectPath, '.env.local');
        await fs.writeFile(envPath, envContent, 'utf-8');
        console.log('[MCP Server] ✅ Created .env.local with Supabase credentials');
      }

      // Create a basic README.md file to ensure the directory is properly initialized
      const readmePath = path.join(config.projectPath, 'README.md');
      await fs.writeFile(readmePath, `# ${config.projectName}\n\nThis project was created with ScopesFlow automation.\n`, 'utf-8');

      // Generate Cursor project rules and design system
      try {
        // Create .cursor/rules/ directory structure
        const cursorRulesDir = path.join(config.projectPath, '.cursor', 'rules');
        await fs.mkdir(cursorRulesDir, { recursive: true });

        // Generate and write projectrules.mdc
        const cursorRulesContent = await this.generateCursorRules(combinedDesignPattern, config.projectPath);
        const projectRulesPath = path.join(cursorRulesDir, 'projectrules.mdc');
        await fs.writeFile(projectRulesPath, cursorRulesContent, 'utf-8');
        console.log(`[MCP Server] ✅ Created .cursor/rules/projectrules.mdc${combinedDesignPattern ? ` with design pattern: ${combinedDesignPattern.substring(0, 50)}...` : ''}`);

        // Generate and write design_rules.md
        const designRulesContent = await this.generateDesignRules(combinedDesignPattern);
        const designRulesPath = path.join(config.projectPath, 'design_rules.md');
        await fs.writeFile(designRulesPath, designRulesContent, 'utf-8');
        console.log('[MCP Server] ✅ Created design_rules.md with pattern-specific guidelines');
        
      } catch (rulesError) {
        console.warn('[MCP Server] ⚠️ Failed to create project rules and theme:', rulesError);
        // Don't fail the entire operation, but log the issue
      }

      // Validate and fix Tailwind v3 setup
      try {
        await this.validateAndFixTailwindV3(config.projectPath);
        console.log(`[MCP Server] ✅ Tailwind v3 validation completed for ${config.projectName}`);
      } catch (validationError) {
        console.warn(`[MCP Server] ⚠️ Tailwind v3 validation failed for ${config.projectName}:`, validationError);
        // Don't fail the entire operation, but log the issue
      }

      // Open project in Cursor (optional)
      try {
        await execAsync(`cursor "${config.projectPath}"`, { timeout: 10000 });
      } catch (cursorError) {
        console.warn('Failed to open in Cursor:', cursorError);
        // Don't fail the entire operation if Cursor isn't available
      }

      console.log(`[MCP Server] Project created successfully at ${config.projectPath}`);

      // Cleanup temporary design pattern storage
      const projectId = `${config.projectName}-${config.projectPath}`.replace(/[^a-zA-Z0-9-]/g, '-');
      this.cleanupTemporaryDesignPattern(projectId);

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
              projectPath: config.projectPath,
              gitRepository: config.gitRepository  // Return GitHub repository URL
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
              projectPath: config.projectPath,
              gitRepository: config.gitRepository  // Return GitHub repository URL even on error
            })
          }
        ]
      };
    }
  }

  // Extract design-specific content from user prompt
  private extractDesignContent(userPrompt: string): string {
    console.log('[MCP Server] 🔍 Extracting design content from prompt...');
    
    // Search for design system prompt markers (case-insensitive)
    const markers = [
      /\{[^}]*\}\s*Design\s+System\s+Prompt/i,  // {App Name} Design System Prompt
      /Design\s+System\s+Prompt/i,               // Design System Prompt
      /DESIGN\s+SYSTEM\s*:/i,                    // DESIGN SYSTEM:
      /Design\s+Requirements\s*:/i,              // Design Requirements:
      /Design\s+Specifications\s*:/i             // Design Specifications:
    ];
    
    for (const marker of markers) {
      const match = userPrompt.match(marker);
      if (match && match.index !== undefined) {
        const content = userPrompt.substring(match.index + match[0].length).trim();
        if (content.length > 0) {
          console.log(`[MCP Server] ✅ Found design marker: "${match[0]}" - extracted ${content.length} characters`);
          return content;
        }
      }
    }
    
    // Fallback: return full prompt for backward compatibility
    console.log('[MCP Server] ⚠️ No design marker found, using full prompt');
    return userPrompt;
  }

  // Extract design specifications from user prompt and save to project
  private async extractAndSaveDesignReference(projectPath: string, userPrompt: string): Promise<void> {
    // Read the master DESIGN_REFERENCE.md file
    let masterDesignReference = '';
    try {
      const masterDesignPath = path.join(process.cwd(), 'DESIGN_REFERENCE.md');
      masterDesignReference = await fs.readFile(masterDesignPath, 'utf-8');
      console.log(`[MCP Server] ✅ Loaded master DESIGN_REFERENCE.md`);
    } catch (error) {
      console.warn(`[MCP Server] ⚠️ Could not load DESIGN_REFERENCE.md, using fallback template:`, error);
      masterDesignReference = `# Modern Design Best Practices

## Note
This is a fallback template. The master DESIGN_REFERENCE.md could not be loaded.
Please refer to the repository's DESIGN_REFERENCE.md for complete design guidelines.
`;
    }

    // Extract only design-specific content from the prompt
    const designSpecificContent = this.extractDesignContent(userPrompt);

    const designContent = `${masterDesignReference}

---

# Project-Specific Customizations

**IMPORTANT: This section contains the specific design requirements for THIS project. The guidelines above are universal best practices - these customizations below take precedence for project-specific decisions.**

## User Design Requirements

${designSpecificContent}

## Implementation Notes

When implementing this project:

1. **Follow Universal Guidelines**: Use the design best practices documented above as your foundation
2. **Apply Project Customizations**: Implement the specific design requirements stated in the "User Design Requirements" section
3. **Priority Order**: Project-specific requirements override universal guidelines when there's a conflict
4. **Color System**: Extract and implement color values as CSS custom properties in RGB format
5. **Typography**: Define font families, sizes, and weights based on specifications
6. **Spacing**: Establish consistent spacing scale following the design system
7. **Components**: Style all Shadcn components to match the design aesthetic
8. **Animations**: Use Motion library for transitions matching the design personality
9. **Responsive Design**: Ensure mobile-first responsive implementation

## Implementation Checklist

- [ ] Review universal design guidelines above
- [ ] Extract project-specific color palette and define CSS variables
- [ ] Configure Tailwind theme with custom colors
- [ ] Set up typography system (fonts, sizes, weights)
- [ ] Define spacing and sizing scales
- [ ] Create component variants matching design
- [ ] Implement responsive breakpoints
- [ ] Add animations and transitions
- [ ] Ensure accessibility standards
- [ ] Validate against user design requirements

---

**Remember: Always reference this file for design decisions. Do not use generic or placeholder designs.**
`;

    const designRefPath = path.join(projectPath, 'Design_reference.md');
    await fs.writeFile(designRefPath, designContent, 'utf-8');
    console.log(`[MCP Server] ✅ Created Design_reference.md at ${designRefPath}`);
  }

  // CURSOR CLI INTEGRATION - Let Cursor handle the AI code generation!
  private async executePrompt(args: ExecutePromptArgs) {
    const startTime = Date.now();
    
    try {
      console.log(`[MCP Server] ========================================`);
      console.log(`[MCP Server] Executing prompt via Cursor CLI`);
      console.log(`[MCP Server] Project: ${args.projectPath}`);
      console.log(`[MCP Server] Prompt preview: ${args.prompt.substring(0, 200)}...`);
      console.log(`[MCP Server] Timeout: ${args.timeout || 300000}ms`);
      console.log(`[MCP Server] Retry count: ${args.retryCount || 0}`);
      console.log(`[MCP Server] Is retry: ${args.isRetry || false}`);
      console.log(`[MCP Server] ========================================`);
      
      // Verify project directory exists
      const projectExists = await fs.access(args.projectPath).then(() => true).catch(() => false);
      if (!projectExists) {
        throw new Error(`Project directory does not exist: ${args.projectPath}`);
      }

      // Load existing git configuration and merge with provided parameters
      console.log('[MCP Server] 🔍 Loading git configuration...');
      const existingConfig = await this.loadProjectGitConfig(args.projectPath);
      const mergedConfig: ProjectGitConfig = {
        gitRepository: args.gitRepository || existingConfig?.gitRepository,
        gitHubToken: args.gitHubToken || existingConfig?.gitHubToken,
        gitUserName: args.gitUserName || existingConfig?.gitUserName,
        gitUserEmail: args.gitUserEmail || existingConfig?.gitUserEmail
      };

      // Save updated configuration if any git parameters were provided
      if (args.gitRepository || args.gitHubToken || args.gitUserName || args.gitUserEmail) {
        await this.saveProjectGitConfig(args.projectPath, mergedConfig);
      }

      // Check if Cursor Agent is available
      if (!this.cursorAgentAvailable) {
        console.warn('[MCP Server] Cursor Agent not available, using fallback task file method');
        return await this.executePromptFallback(args, startTime);
      }

      // Execute prompt using Cursor Agent CLI
      // The cursor-agent command will:
      // 1. Analyze the project context
      // 2. Use its own AI to generate code
      // 3. Apply changes directly to the project
      console.log(`[MCP Server] Calling cursor-agent CLI...`);
      
      // Build command based on platform and VPS configuration
      const vpsConfig = this.getVPSConfig();
      const isWindows = process.platform === 'win32';
      let command: string;
      let actualProjectPath = args.projectPath;
      let useVPS = false;
      
      // Resolve relative paths to absolute paths
      if (!path.isAbsolute(args.projectPath)) {
        actualProjectPath = path.resolve(process.cwd(), args.projectPath);
        console.log(`[MCP Server] Resolved path: ${actualProjectPath}`);
      }
      
      // Determine if we should use VPS
      if (vpsConfig) {
        useVPS = true;
        console.log(`[MCP Server] Using VPS execution: ${vpsConfig.user}@${vpsConfig.host}`);
      }
      
      // Check for Supabase configuration
      let supabaseUrl: string | undefined;
      let hasSupabase = false;
      try {
        const envPath = path.join(actualProjectPath, '.env.local');
        const envContent = await fs.readFile(envPath, 'utf-8');
        const urlMatch = envContent.match(/VITE_SUPABASE_URL=(.+)/);
        if (urlMatch && urlMatch[1]) {
          supabaseUrl = urlMatch[1].trim();
          hasSupabase = true;
          console.log('[MCP Server] ✅ Detected Supabase configuration in .env.local');
          
          // Ensure migration structure exists
          await this.ensureSupabaseMigrationStructure(actualProjectPath);
        }
      } catch (error) {
        // No .env.local or no Supabase config - that's okay
      }
      
      // Prepare Supabase instructions - simplified for first prompt, detailed for subsequent prompts
      let supabaseInstructions = '';
      
      if (hasSupabase) {
        if (args.isFirstPrompt) {
          // Simplified Supabase instructions for first prompt - focus on basic setup only
          supabaseInstructions = `

=== SUPABASE INTEGRATION (IF CONFIGURED) ===
Supabase credentials have been configured in .env.local:
- VITE_SUPABASE_URL: ${supabaseUrl}
- VITE_SUPABASE_ANON_KEY: [configured]

REQUIRED SUPABASE SETUP:
1. Install Supabase client: npm install @supabase/supabase-js
2. Create src/lib/supabase.ts with proper client initialization
3. Use environment variables from .env.local (import.meta.env.VITE_SUPABASE_URL and import.meta.env.VITE_SUPABASE_ANON_KEY)
4. Follow Supabase best practices for auth and data fetching

Note: Database migrations will be handled in subsequent prompts when database features are needed.

`;
        } else {
          // Full detailed instructions for subsequent prompts - includes migration workflow
          supabaseInstructions = `

=== SUPABASE INTEGRATION (MANDATORY) ===
Supabase credentials have been configured in .env.local:
- VITE_SUPABASE_URL: ${supabaseUrl}
- VITE_SUPABASE_ANON_KEY: [configured]

REQUIRED SUPABASE SETUP:
1. Install Supabase client: npm install @supabase/supabase-js
2. Create src/lib/supabase.ts with proper client initialization
3. Use environment variables from .env.local (import.meta.env.VITE_SUPABASE_URL and import.meta.env.VITE_SUPABASE_ANON_KEY)
4. Implement proper type safety with Supabase types
5. Follow Supabase best practices for auth, RLS, and data fetching
6. Integrate Supabase auth with the app's authentication system if needed
7. Use React Query or similar for data fetching with Supabase
8. Implement proper error handling for Supabase operations

=== DATABASE MIGRATION WORKFLOW (CRITICAL) ===

⚠️ IMPORTANT: You NEVER execute SQL or push to Supabase directly!
✅ You ONLY create migration files that will be reviewed and applied by the application.

WHENEVER you create a feature requiring database tables, you MUST:

1. **Create Migration File**
   Location: supabase/migrations/{timestamp}_{description}.sql
   Example: supabase/migrations/20241013120000_create_projects_table.sql
   
   ⚠️ Use current timestamp in format: YYYYMMDDHHmmss
   ⚠️ Use descriptive snake_case names

2. **Migration File Template**
   \`\`\`sql
   -- =====================================================
   -- Migration: {Brief description}
   -- Created: {ISO timestamp}
   -- Tables: {table_name}
   -- Purpose: {What this accomplishes}
   -- =====================================================

   -- Enable UUID extension (idempotent)
   CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

   -- Helper function for updated_at (idempotent)
   CREATE OR REPLACE FUNCTION update_updated_at_column()
   RETURNS TRIGGER AS $$
   BEGIN
     NEW.updated_at = NOW();
     RETURN NEW;
   END;
   $$ LANGUAGE plpgsql;

   -- =====================================================
   -- TABLE: {table_name}
   -- Purpose: {Description}
   -- =====================================================
   CREATE TABLE IF NOT EXISTS {table_name} (
     id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
     user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
     
     -- Core fields
     name TEXT NOT NULL,
     description TEXT,
     status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
     
     -- Flexible metadata
     metadata JSONB DEFAULT '{}'::jsonb,
     
     -- Timestamps
     created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
     updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
     
     -- Constraints
     CONSTRAINT {table_name}_name_not_empty CHECK (length(trim(name)) > 0)
   );

   -- Performance indexes
   CREATE INDEX IF NOT EXISTS {table_name}_user_id_idx ON {table_name}(user_id);
   CREATE INDEX IF NOT EXISTS {table_name}_created_at_idx ON {table_name}(created_at DESC);
   CREATE INDEX IF NOT EXISTS {table_name}_status_idx ON {table_name}(status) WHERE status != 'deleted';

   -- Auto-update trigger
   DROP TRIGGER IF EXISTS update_{table_name}_updated_at ON {table_name};
   CREATE TRIGGER update_{table_name}_updated_at
     BEFORE UPDATE ON {table_name}
     FOR EACH ROW
     EXECUTE FUNCTION update_updated_at_column();

   -- Enable Row Level Security
   ALTER TABLE {table_name} ENABLE ROW LEVEL SECURITY;

   -- RLS Policies: Users can only access their own data
   CREATE POLICY "{table_name}_select_own"
     ON {table_name} FOR SELECT
     USING (auth.uid() = user_id);

   CREATE POLICY "{table_name}_insert_own"
     ON {table_name} FOR INSERT
     WITH CHECK (auth.uid() = user_id);

   CREATE POLICY "{table_name}_update_own"
     ON {table_name} FOR UPDATE
     USING (auth.uid() = user_id)
     WITH CHECK (auth.uid() = user_id);

   CREATE POLICY "{table_name}_delete_own"
     ON {table_name} FOR DELETE
     USING (auth.uid() = user_id);

   -- Documentation
   COMMENT ON TABLE {table_name} IS '{Table purpose and description}';
   COMMENT ON COLUMN {table_name}.id IS 'Primary key (UUID v4)';
   COMMENT ON COLUMN {table_name}.user_id IS 'Owner of this record (references auth.users)';

   -- =====================================================
   -- ROLLBACK INSTRUCTIONS (for documentation only)
   -- =====================================================
   -- To rollback this migration, execute:
   -- DROP TABLE IF EXISTS {table_name} CASCADE;
   \`\`\`

3. **Create Migration Metadata** (for tracking)
   Location: supabase/migrations/{timestamp}_{description}.meta.json
   \`\`\`json
   {
     "migration_name": "{timestamp}_{description}",
     "created_at": "{ISO timestamp}",
     "description": "Brief description of what this migration does",
     "tables_created": ["{table_name}"],
     "tables_modified": [],
     "tables_deleted": [],
     "breaking_changes": false,
     "rollback_sql": "DROP TABLE IF EXISTS {table_name} CASCADE;",
     "estimated_rows": 0,
     "requires_downtime": false
   }
   \`\`\`

4. **Generate TypeScript Types**
   Location: src/types/database/{table_name}.ts
   \`\`\`typescript
   /**
    * Database types for {table_name} table
    * Generated: {ISO timestamp}
    */

   export interface {TableName} {
     id: string;
     user_id: string;
     name: string;
     description: string | null;
     status: 'active' | 'archived' | 'deleted';
     metadata: Record<string, any>;
     created_at: string;
     updated_at: string;
   }

   export interface {TableName}Insert {
     id?: string;
     user_id: string;
     name: string;
     description?: string | null;
     status?: 'active' | 'archived' | 'deleted';
     metadata?: Record<string, any>;
   }

   export interface {TableName}Update {
     name?: string;
     description?: string | null;
     status?: 'active' | 'archived' | 'deleted';
     metadata?: Record<string, any>;
   }

   // Supabase query result type
   export type {TableName}Row = {TableName};
   \`\`\`

5. **Create API Layer** (src/api/{table_name}.ts)
6. **Create React Query Hooks** (src/hooks/use{TableName}.ts)

=== CRITICAL RULES ===

❌ NEVER:
- Execute SQL directly
- Run "npx supabase db push" or any Supabase CLI commands
- Connect to the database
- Apply migrations yourself
- Use "psql" or any database client

✅ ALWAYS:
- Create migration files in supabase/migrations/
- Use timestamp prefix for ordering
- Make migrations idempotent (IF NOT EXISTS, CREATE OR REPLACE)
- Include RLS policies (tables are locked down by default)
- Add indexes for foreign keys and common queries
- Use proper CASCADE rules
- Document with comments
- Create corresponding TypeScript types

⚠️ The application will:
- Review all migration SQL files
- Display them to the user for approval
- Apply them to Supabase when approved
- Track migration status

Your job: Generate the files. Application's job: Execute them.

`;
        }
      }
      
      // Build directive prompt based on whether this is first prompt or subsequent
      let directivePrompt: string;
      
      if (args.isFirstPrompt) {
        // FIRST PROMPT: Comprehensive with all boilerplate documentation
        console.log('[MCP Server] Using FIRST PROMPT with full boilerplate documentation');
        
        // Extract design from user prompt and save to project
        await this.extractAndSaveDesignReference(actualProjectPath, args.prompt);
        
        const reactBoilerplate = await this.readBoilerplateFile('REACT_BOILERPLATE.md');
        const quickReference = await this.readBoilerplateFile('MODERN_STACK_QUICK_REFERENCE.md');
        const testingGuide = await this.readBoilerplateFile('TESTING_GUIDE.md');
        const apiLayerGuide = await this.readBoilerplateFile('API_LAYER_GUIDE.md');
        const designReference = await this.readBoilerplateFile('DESIGN_REFERENCE.md');

        if (reactBoilerplate && quickReference) {
          // Use full boilerplate documentation
          directivePrompt = `⚠️ CRITICAL EXECUTION RULES - READ FIRST ⚠️
❌ NEVER run: npm run dev, npm start, yarn dev, pnpm dev, or ANY development server
❌ NEVER run: long-running processes, servers, or commands that don't exit
❌ NEVER test the application by starting it
✅ ALLOWED: npm install, npm run build, npm run test (if needed)
✅ YOUR TASK: Create/modify files only, then STOP and EXIT immediately
⚠️ The MCP server handles all testing and validation separately

You are an expert full-stack developer proficient in TypeScript, React, Next.js, and modern UI/UX frameworks (Tailwind CSS, Shadcn UI, Radix UI).

CRITICAL: Follow the boilerplate guidelines below EXACTLY. These are the official standards for this project.



=== REACT BOILERPLATE DOCUMENTATION ===
${reactBoilerplate}

=== QUICK REFERENCE GUIDE ===
${quickReference}


=== API LAYER ARCHITECTURE ===
${apiLayerGuide}

=== PROJECT REQUIREMENTS ===
${args.prompt}

IMPLEMENTATION INSTRUCTIONS:
1. Follow the DESIGN REFERENCE section above EXACTLY for ALL UI/UX implementation
2. Implement colors, typography, spacing, shadows, and animations EXACTLY as specified in Design Reference
3. Read and understand ALL boilerplate documentation above for architecture patterns
4. Follow the dependency versions EXACTLY as specified
5. Use the project structure outlined in the documentation
6. Use Tailwind CSS animations with custom keyframes (NOT Motion library or framer-motion)
7. Use native fetch() with the API utilities pattern in src/lib/api.ts
8. Use Recharts for all data visualization and charts
9. Use @tailwindcss/typography plugin for rich text content
10. Use Zod for form validation
11. Install ALL shadcn/ui components: npx shadcn@latest add button input card toast dialog select tabs accordion alert-dialog avatar checkbox collapsible dropdown-menu hover-card label menubar navigation-menu popover progress radio-group scroll-area separator slider switch toggle tooltip aspect-ratio breadcrumb calendar carousel command context-menu drawer form input-otp pagination resizable sheet skeleton table textarea toggle-group
12. Use Shadcn UI for all components
13. Build the components first, then the pages, make to not import non-existent components or types
14. Use Sonner for toast notifications
15. Build the design system based on Design Reference specifications above
16. Implement the user's requirements: ${args.prompt}

START IMPLEMENTING NOW. Do not ask questions - analyze the existing project and build according to the specifications above.`;
        } else {
          // Fallback prompt if boilerplate files can't be read
          directivePrompt = `You are an expert full-stack developer proficient in TypeScript, React, Next.js, and modern UI/UX frameworks (Tailwind CSS, Shadcn UI, Radix UI).

=== DESIGN REFERENCE (MANDATORY) ===
${designReference || 'DESIGN REFERENCE NOT FOUND - USE MODERN DESIGN BEST PRACTICES'}

*IMPORTANT*: For every page or component refer to ${designReference} for bestpractices and ${args.prompt} for style.

CRITICAL DESIGN REQUIREMENTS:
- You MUST follow ALL design principles and patterns specified in the Design Reference above
- Do NOT deviate from the design specifications without explicit user permission
- Implement ALL visual design elements (colors, typography, spacing, shadows, animations) as specified
- Use the file Design_reference.md on our project to create a project rule designrule.mdc with --- alwaysApply: true ---

CRITICAL TECHNICAL REQUIREMENTS:
- React 18.3.1, React Router 6.30.1
- Tailwind CSS v3 with tailwind.config.js and custom keyframes
- @tailwindcss/typography plugin for rich text content
- Shadcn UI v3 with shadcn.config.js
- Tailwind CSS animations (NOT Motion library or framer-motion)
- Sonner for toasts
- Recharts for data visualization
- Native fetch() with API utilities in src/lib/api.ts
- Design system with CSS custom properties based on Design Reference above
- Use RGB color values for theming
- Install ALL shadcn/ui components: npx shadcn@latest add button input card toast dialog select tabs accordion alert-dialog avatar checkbox collapsible dropdown-menu hover-card label menubar navigation-menu popover progress radio-group scroll-area separator slider switch toggle tooltip aspect-ratio breadcrumb calendar carousel command context-menu drawer form input-otp pagination resizable sheet skeleton table textarea toggle-group

PROJECT REQUIREMENTS:
${args.prompt}

IMPORTANT: All design decisions (colors, typography, spacing, animations) must follow the Design Reference section above EXACTLY.

START IMPLEMENTING NOW. Do not ask questions - analyze the existing project and build according to the specifications above.`;
        }
      } else {
        // SUBSEQUENT PROMPTS: Streamlined with design reference + success criteria
        console.log('[MCP Server] Using SUBSEQUENT PROMPT with design reference and success criteria');
        
        // Read Design_reference.md from the project directory first, then fallback to MCP server directory
        let designReference: string | null = null;
        try {
          const designRefPath = path.join(actualProjectPath, 'Design_reference.md');
          designReference = await fs.readFile(designRefPath, 'utf-8');
        } catch (error) {
          console.warn('[MCP Server] Could not read Design_reference.md from project, trying MCP server directory:', error);
          // Fallback to MCP server directory
          designReference = await this.readBoilerplateFile('DESIGN_REFERENCE.md');
        }
        
        const successCriteria = await this.readBoilerplateFile('SUCCESS_CRITERIA.md');
        
        directivePrompt = `⚠️ CRITICAL EXECUTION RULES - READ FIRST ⚠️
❌ NEVER run: npm run dev, npm start, yarn dev, pnpm dev, or ANY development server
❌ NEVER run: long-running processes, servers, or commands that don't exit
❌ NEVER test the application by starting it
✅ ALLOWED: npm install, npm run build, npm run test (if needed)
✅ YOUR TASK: Create/modify files only, then STOP and EXIT immediately
⚠️ The MCP server handles all testing and validation separately

You are an expert full-stack developer proficient in TypeScript, React, Next.js, and modern UI/UX frameworks (Tailwind CSS, Shadcn UI, Radix UI).

=== DESIGN REFERENCE (MANDATORY) ===
${designReference || 'ERROR: Design_reference.md not found - using default modern design best practices'}

*IMPORTANT*: For every page or component refer to ${designReference} for bestpractices and ${args.prompt} for style.

CRITICAL DESIGN REQUIREMENTS:
- You MUST follow ALL design principles and patterns specified in the Design Reference above
- Do NOT deviate from the design specifications without explicit user permission
- Implement ALL visual design elements (colors, typography, spacing, shadows, animations) as specified
- Follow the layout patterns and component designs exactly as documented
- Ensure all interactions and micro-animations match the reference specifications

CRITICAL TECHNICAL REQUIREMENTS:
- React 18.3.1, React Router 6.30.1
- Tailwind CSS v3 with tailwind.config.js and custom keyframes
- @tailwindcss/typography plugin for rich text content
- Tailwind CSS animations (NOT Motion library or framer-motion)
- Sonner for toasts
- Recharts for data visualization
- Native fetch() with API utilities in src/lib/api.ts
- Design system with CSS custom properties
- Use RGB color values for theming
${supabaseInstructions}
=== TASK ===
${args.prompt}

=== SUCCESS CRITERIA ===
${successCriteria || 'Ensure code quality, proper types, and follows existing patterns'}

IMPORTANT: ALL styling and design decisions must follow the Design Reference section above EXACTLY. Do not make arbitrary design choices.

Analyze the existing project structure and implement the task following the patterns already established. Ensure all success criteria are met.`;
      }
      
      if (useVPS && vpsConfig) {
        // VPS execution: Convert path and build SSH command
        const vpsProjectPath = this.convertToVPSPath(actualProjectPath, vpsConfig);
        console.log(`[MCP Server] VPS path: ${vpsProjectPath}`);
        
        // Save prompt to a temporary file locally first
        const tempPromptFile = path.join(actualProjectPath, '.cursor-prompt.tmp');
        await fs.writeFile(tempPromptFile, directivePrompt, 'utf-8');
        
        // Transfer prompt file to VPS
        const vpsPromptFile = `${vpsProjectPath}/.cursor-prompt.tmp`;
        try {
          await this.transferFileToVPS(tempPromptFile, vpsPromptFile, vpsConfig);
          console.log(`[MCP Server] ✓ Prompt file transferred to VPS`);
        } catch (error) {
          console.error(`[MCP Server] Failed to transfer prompt file to VPS:`, error);
          throw new Error(`Failed to transfer prompt file to VPS: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        
        // Command will be executed via SSH2 in the try block below
        command = `cd '${vpsProjectPath}' && cat '.cursor-prompt.tmp' | ~/.local/bin/cursor-agent --print --output-format stream-json --stream-partial-output --force --model auto`;
      } else if (isWindows) {
        // Convert absolute Windows path to WSL path
        const wslProjectPath = actualProjectPath
          .replace(/\\/g, '/')
          .replace(/^([A-Z]):/i, (match, drive) => `/mnt/${drive.toLowerCase()}`);
        
        console.log(`[MCP Server] WSL path: ${wslProjectPath}`);
        
        // Save prompt to a temporary file to avoid command-line length issues
        const tempPromptFile = path.join(actualProjectPath, '.cursor-prompt.tmp');
        await fs.writeFile(tempPromptFile, directivePrompt, 'utf-8');
        
        const wslPromptFile = wslProjectPath + '/.cursor-prompt.tmp';
        
        // Use --print flag for non-interactive mode, --force to allow commands
        // Available models: auto, sonnet-4.5, sonnet-4.5-thinking, gpt-5, opus-4.1, grok, gemini-3-pro
        command = `wsl -d Ubuntu bash -c "cd '${wslProjectPath}' && cat '${wslPromptFile}' | ~/.local/bin/cursor-agent --print --output-format stream-json --stream-partial-output --force --model auto"`;
      } else {
        // Save prompt to file for Unix-like systems too
        const tempPromptFile = path.join(actualProjectPath, '.cursor-prompt.tmp');
        await fs.writeFile(tempPromptFile, directivePrompt, 'utf-8');
        
        command = `cat .cursor-prompt.tmp | cursor-agent --print --output-format stream-json --stream-partial-output --force --model auto`;
      }
      
      console.log(`[MCP Server] Executing cursor-agent in: ${actualProjectPath}`);
      console.log(`[MCP Server] Original prompt length: ${args.prompt.length} characters`);
      console.log(`[MCP Server] Directive prompt length: ${directivePrompt.length} characters`);
      
      let stdout = '';
      let stderr = '';
      let cursorAgentLogs: Array<{ timestamp: string; type: string; message: string; data?: any }> = [];
      
      try {
        if (useVPS && vpsConfig) {
          // Execute on VPS using SSH2
          const result = await this.executeCursorAgentStreamingSSH(vpsConfig, command, args.timeout || 300000);
          stdout = result.stdout;
          stderr = result.stderr;
          cursorAgentLogs = result.logs;
          console.log(`[MCP Server] 📊 Captured ${cursorAgentLogs.length} log entries from cursor-agent`);
        } else if (command) {
          // Execute locally
          const result = await this.executeCursorAgentStreaming(
            command,
            isWindows ? undefined : actualProjectPath,
            args.timeout || 300000 // 5 minute default
          );
          stdout = result.stdout;
          stderr = result.stderr;
          cursorAgentLogs = result.logs;
          console.log(`[MCP Server] 📊 Captured ${cursorAgentLogs.length} log entries from cursor-agent`);
        }
      } catch (error: any) {
        // Check if this is a timeout error
        const isTimeoutError = error.message?.includes('timed out') || 
                              error.message?.includes('timeout') ||
                              error.message?.includes('terminating process');
        
        if (isTimeoutError) {
          console.log('[MCP Server] 🚨 Timeout detected, activating fallback mechanism...');
          return await this.handleTimeoutWithFallback(args, startTime);
        }
        
        // cursor-agent process errors - log but may have captured output
        console.error(`[MCP Server] ⚠ cursor-agent error:`, error.message);
        throw error;
      }
      
      // Clean up temp file
      try {
        await fs.unlink(path.join(actualProjectPath, '.cursor-prompt.tmp'));
      } catch (e) {
        // Ignore cleanup errors
      }

      console.log(`[MCP Server] ✓ Cursor Agent execution completed`);
      console.log(`[MCP Server] Output length: ${stdout.length} characters`);
      
      if (stderr) {
        console.warn(`[MCP Server] Stderr: ${stderr}`);
      }

      // Wait for file system changes to stabilize after cursor-agent execution
      console.log(`[MCP Server] ⏳ Waiting for file system changes to stabilize...`);
      await this.waitForFileSystemStability(actualProjectPath, 30000); // 30 second max wait
      console.log(`[MCP Server] ✅ File system changes stabilized`);

      // Get the files that were changed
      const filesChanged = await this.getChangedFiles(actualProjectPath);
      
      console.log(`[MCP Server] ========================================`);
      console.log(`[MCP Server] 📊 CURSOR AGENT RESULTS`);
      console.log(`[MCP Server] ========================================`);
      console.log(`[MCP Server] Total files changed: ${filesChanged.length}`);

      if (filesChanged.length > 0) {
        // Categorize files by type
        const categorized = this.categorizeFiles(filesChanged);
        
        Object.entries(categorized).forEach(([category, files]) => {
          if (files.length > 0) {
            console.log(`[MCP Server] ${category}:`);
            files.forEach(file => console.log(`[MCP Server]   ✓ ${file}`));
          }
        });
      } else {
        console.log(`[MCP Server] ⚠️ No files were changed`);
      }
      console.log(`[MCP Server] ========================================`);

      // Validate Tailwind v3 compliance after AI code generation
      try {
        await this.validateAndFixTailwindV3(actualProjectPath);
        console.log(`[MCP Server] ✅ Post-generation Tailwind v3 validation completed`);
      } catch (validationError) {
        console.warn(`[MCP Server] ⚠️ Post-generation Tailwind v3 validation failed:`, validationError);
        // Don't fail the entire operation, but log the issue
      }
      
      // Validate build and dev server, auto-fix errors if found
      console.log('[MCP Server] ========================================');
      console.log('[MCP Server] 🔍 VALIDATING BUILD AND DEV SERVER');
      console.log('[MCP Server] ========================================');
      
      let buildValidationPassed = false;
      
      try {
        const validationResult = await this.validateBuildAndDev(actualProjectPath);
        
        if (!validationResult.success) {
          console.log('[MCP Server] ⚠️ Build validation failed, initiating auto-fix...');
          console.log(`[MCP Server] ${validationResult.summary}`);
          console.log(`[MCP Server] Error count: ${validationResult.errors.length}`);
          
          const fixResult = await this.autoFixBuildErrors(actualProjectPath, validationResult);
          
          if (fixResult.success) {
            console.log(`[MCP Server] ✅ ${fixResult.message}`);
            console.log('[MCP Server] Build validation and auto-fix completed successfully');
            buildValidationPassed = true;
          } else {
            console.error(`[MCP Server] ❌ ${fixResult.message}`);
            console.warn('[MCP Server] ⚠️ Will commit changes despite unresolved build errors to preserve work');
            buildValidationPassed = false;
          }
        } else {
          console.log('[MCP Server] ✅ Build validation passed - no errors detected');
          buildValidationPassed = true;
        }
      } catch (validationError) {
        console.error('[MCP Server] ❌ Build validation check failed:', validationError);
        console.warn('[MCP Server] ⚠️ Will commit changes despite validation failure to preserve work');
        buildValidationPassed = false;
      }
      
      console.log('[MCP Server] ========================================');
      
      // Auto-commit changes if GitHub token provided and files changed (even with build errors)
      if (mergedConfig.gitHubToken && filesChanged.length > 0) {
        try {
          // Warn if build validation failed but still commit
          if (!buildValidationPassed) {
            console.warn('[MCP Server] ⚠️ Build has errors, but committing changes anyway to preserve work');
            console.warn('[MCP Server] ⚠️ Please review and fix build errors in subsequent commits');
          }
          
          console.log(`[MCP Server] 🚀 Auto-committing ${filesChanged.length} changed files...`);
          
          const commitMessage = buildValidationPassed 
            ? `feat: AI-generated changes\n\n${args.prompt}`
            : `feat: AI-generated changes (with build errors)\n\n${args.prompt}\n\nNote: Build validation failed. Manual fixes may be required.`;
          
          const result = await this.commitAndPush(
            actualProjectPath,
            commitMessage,
            mergedConfig.gitHubToken,
            mergedConfig.gitUserName,
            mergedConfig.gitUserEmail,
            mergedConfig.gitRepository
          );
          
          if (result.success) {
            console.log(`[MCP Server] ✅ ${result.message}`);
            if (result.changesCount && result.changesCount > 0) {
              console.log(`[MCP Server] 📊 Committed ${result.changesCount} files`);
            }
            if (!buildValidationPassed) {
              console.warn('[MCP Server] ⚠️ Changes committed despite build errors - review and fix manually');
            }
          } else {
            console.error(`[MCP Server] ❌ Auto-commit failed: ${result.message}`);
          }
        } catch (commitError) {
          console.error('[MCP Server] ❌ Auto-commit failed:', commitError);
          // Don't fail the operation, just log the error and continue
        }
      } else if (!mergedConfig.gitHubToken) {
        console.log('[MCP Server] ℹ️ No GitHub token provided - skipping auto-commit');
      } else if (filesChanged.length === 0) {
        console.log('[MCP Server] ℹ️ No files changed - skipping commit');
      }
      
      // Extract database migrations if any were created
      console.log('[MCP Server] 🔍 Checking for new database migrations...');
      const migrationsData = await this.extractNewMigrations(actualProjectPath);

      if (migrationsData.hasMigrations) {
        console.log(`[MCP Server] 📊 Found ${migrationsData.migrations.length} migration(s)`);
        migrationsData.migrations.forEach(m => {
          console.log(`[MCP Server]   📄 ${m.filename}: ${m.description}`);
        });
      } else {
        console.log('[MCP Server] ℹ️ No new migrations detected');
      }
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              output: `Cursor Agent executed successfully. Modified ${filesChanged.length} file(s).${migrationsData.hasMigrations ? ` Created ${migrationsData.migrations.length} database migration(s).` : ''}\n\n${stdout.substring(0, 500)}`,
              error: null,
              filesChanged: filesChanged,
              timeElapsed: Date.now() - startTime,
              cursorOutput: stdout,
              migrations: migrationsData.migrations,
              hasMigrations: migrationsData.hasMigrations,
              logs: cursorAgentLogs,
              logsSummary: {
                total: cursorAgentLogs.length,
                byType: cursorAgentLogs.reduce((acc: Record<string, number>, log) => {
                  acc[log.type] = (acc[log.type] || 0) + 1;
                  return acc;
                }, {})
              },
              // Timeout fallback metadata
              timedOut: false,
              partialCompletion: false,
              retried: args.isRetry || false,
              fallbackMode: 'none'
            })
          }
        ]
      };
    } catch (error) {
      console.error('[MCP Server] Cursor execution failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // If cursor-agent failed, try fallback method
      if (errorMessage.includes('cursor-agent') || errorMessage.includes('not found')) {
        console.log('[MCP Server] Falling back to task file method...');
        return await this.executePromptFallback(args, startTime);
      }
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              output: '',
              error: errorMessage,
              filesChanged: [],
              timeElapsed: Date.now() - startTime,
              // Timeout fallback metadata
              timedOut: false,
              partialCompletion: false,
              retried: args.isRetry || false,
              fallbackMode: 'none'
            })
          }
        ]
      };
    }
  }

  // Get project structure for AI context (kept for future use)
  private async getProjectStructure(projectPath: string): Promise<string> {
    try {
      const files = await this.getAllFiles(projectPath);
      const structure = files.map(file => {
        const relativePath = path.relative(projectPath, file);
        return relativePath;
      }).join('\n');
      
      return `Files in project:\n${structure}`;
    } catch (error) {
      return 'Unable to read project structure';
    }
  }

  /**
   * Ensure Supabase migration structure exists
   */
  private async ensureSupabaseMigrationStructure(projectPath: string): Promise<void> {
    const migrationsDir = path.join(projectPath, 'supabase', 'migrations');
    await fs.mkdir(migrationsDir, { recursive: true });

    // Create MIGRATIONS.md if it doesn't exist
    const migrationsDocPath = path.join(projectPath, 'supabase', 'MIGRATIONS.md');
    try {
      await fs.access(migrationsDocPath);
    } catch {
      const initialContent = `# Supabase Migrations

This file tracks all database migrations for this project.

## How to Apply Migrations

### Option 1: Supabase Dashboard (Recommended for Review)
1. Go to your project's SQL Editor
2. Copy the migration file contents
3. Review the SQL
4. Click "Run"

### Option 2: Supabase CLI
\`\`\`bash
npx supabase db push
\`\`\`

### Option 3: Via Application
The application will extract migration files and provide a review/approval interface.

## Migration History

<!-- Migrations are listed below in reverse chronological order -->

---
`;
      await fs.writeFile(migrationsDocPath, initialContent, 'utf-8');
      console.log('[MCP Server] ✅ Created MIGRATIONS.md');
    }

    // Create README.md for migrations directory
    const readmePath = path.join(migrationsDir, 'README.md');
    try {
      await fs.access(readmePath);
    } catch {
      const readmeContent = `# Supabase Migrations

This directory contains SQL migration files for the database schema.

## File Naming Convention
\`YYYYMMDDHHmmss_description.sql\`

Example: \`20241013120000_create_users_table.sql\`

## Creating a New Migration

1. Create a new SQL file with timestamp prefix
2. Write your SQL (CREATE TABLE, ALTER TABLE, etc.)
3. Include rollback instructions in comments
4. Create a corresponding .meta.json file
5. Update ../MIGRATIONS.md

## Migration Structure

Each migration should include:
- Extension requirements
- Helper functions (if needed)
- Table creation
- Indexes
- Triggers
- RLS policies
- Comments

See existing migrations for examples.

## Important Notes

- Migrations are NOT automatically executed
- All migrations are sent to the application for review and approval
- The application handles deployment to Supabase
- Never execute SQL directly from development environment
`;
      await fs.writeFile(readmePath, readmeContent, 'utf-8');
      console.log('[MCP Server] ✅ Created migrations README.md');
    }
  }

  /**
   * Extract new migration files from the project after cursor-agent execution
   */
  private async extractNewMigrations(projectPath: string): Promise<{
    migrations: Array<{
      filename: string;
      sql: string;
      metadata?: any;
      timestamp: string;
      description: string;
    }>;
    hasMigrations: boolean;
  }> {
    try {
      const migrationsDir = path.join(projectPath, 'supabase', 'migrations');
      
      // Check if migrations directory exists
      try {
        await fs.access(migrationsDir);
      } catch {
        return { migrations: [], hasMigrations: false };
      }

      const files = await fs.readdir(migrationsDir);
      const sqlFiles = files.filter(f => f.endsWith('.sql'));

      if (sqlFiles.length === 0) {
        return { migrations: [], hasMigrations: false };
      }

      const migrations = [];

      for (const filename of sqlFiles) {
        const sqlPath = path.join(migrationsDir, filename);
        const sql = await fs.readFile(sqlPath, 'utf-8');

        // Try to read corresponding metadata file
        const metaPath = path.join(migrationsDir, filename.replace('.sql', '.meta.json'));
        let metadata = null;
        try {
          const metaContent = await fs.readFile(metaPath, 'utf-8');
          metadata = JSON.parse(metaContent);
        } catch {
          // Metadata file doesn't exist or is invalid
        }

        // Extract timestamp and description from filename
        // Format: YYYYMMDDHHmmss_description.sql
        const match = filename.match(/^(\d{14})_(.+)\.sql$/);
        const timestamp = match ? match[1] : '';
        const description = match ? match[2].replace(/_/g, ' ') : filename;

        migrations.push({
          filename,
          sql,
          metadata,
          timestamp,
          description
        });
      }

      // Sort by timestamp (newest first)
      migrations.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

      return {
        migrations,
        hasMigrations: migrations.length > 0
      };

    } catch (error) {
      console.error('[MCP Server] Error extracting migrations:', error);
      return { migrations: [], hasMigrations: false };
    }
  }

  // Fallback prompt execution method (when cursor-agent is not available)
  private async executePromptFallback(args: ExecutePromptArgs, startTime: number) {
    try {
      // Create a development task file that Cursor can process
      console.log('[MCP Server] Using fallback mode - creating task file for manual processing');
      
      const taskFile = path.join(args.projectPath, 'CURSOR_TASK.md');
      const timestamp = new Date().toISOString();
      
      const taskContent = `# Cursor Development Task
**Created:** ${timestamp}
**Status:** Pending

## Task Description
${args.prompt}

## Context
${args.context || 'No additional context provided'}

## Files to Focus On
${args.files?.join(', ') || 'All files in project'}

## Instructions
This task was created by ScopesFlow automation. To complete:
1. Open this project in Cursor IDE
2. Use Cursor's AI to implement the task described above
3. Review and test the generated code
4. Delete this file when complete
`;
      
      await fs.writeFile(taskFile, taskContent, 'utf-8');
      
      console.log(`[MCP Server] ✓ Task file created: ${taskFile}`);
      console.log(`[MCP Server] ⚠ Manual intervention required - open project in Cursor IDE`);
      
      const filesChanged = [path.relative(args.projectPath, taskFile)];
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              output: `Task file created at ${taskFile}. Please open the project in Cursor IDE to complete the task manually.`,
              error: null,
              filesChanged,
              timeElapsed: Date.now() - startTime,
              requiresManualAction: true,
              // Timeout fallback metadata
              timedOut: false,
              partialCompletion: false,
              retried: args.isRetry || false,
              fallbackMode: 'task_file'
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
              timeElapsed: Date.now() - startTime,
              // Timeout fallback metadata
              timedOut: false,
              partialCompletion: false,
              retried: args.isRetry || false,
              fallbackMode: 'task_file_error'
            })
          }
        ]
      };
    }
  }

  /**
   * Handle timeout with fallback strategy
   * Captures partial work, commits it, and retries with longer timeout
   */
  private async handleTimeoutWithFallback(args: ExecutePromptArgs, startTime: number): Promise<{
    content: Array<{ type: string; text: string }>;
  }> {
    try {
      console.log('[MCP Server] ========================================');
      console.log('[MCP Server] 🚨 TIMEOUT FALLBACK ACTIVATED');
      console.log('[MCP Server] ========================================');
      
      // Capture partial work completed before timeout
      const partialWork = await this.capturePartialWork(args.projectPath, startTime);
      
      if (partialWork.hasPartialWork) {
        console.log(`[MCP Server] ✅ Found partial work: ${partialWork.validFiles.length} valid files`);
        
        // Run Tailwind validation on partial work
        try {
          await this.validateAndFixTailwindV3(args.projectPath);
          console.log('[MCP Server] ✅ Tailwind validation completed on partial work');
        } catch (validationError) {
          console.warn('[MCP Server] ⚠️ Tailwind validation failed on partial work:', validationError);
        }
        
        // Commit partial work if GitHub token is available
        if (args.gitHubToken) {
          try {
            console.log('[MCP Server] 💾 Committing partial work...');
            
            const commitMessage = `WIP: Partial completion (timeout)\n\n${args.prompt}\n\nNote: Operation timed out but partial work was completed. Files: ${partialWork.validFiles.join(', ')}`;
            
            const commitResult = await this.commitAndPush(
              args.projectPath,
              commitMessage,
              args.gitHubToken,
              args.gitUserName,
              args.gitUserEmail,
              args.gitRepository
            );
            
            if (commitResult.success) {
              console.log(`[MCP Server] ✅ Partial work committed: ${commitResult.message}`);
            } else {
              console.error(`[MCP Server] ❌ Failed to commit partial work: ${commitResult.message}`);
            }
          } catch (commitError) {
            console.error('[MCP Server] ❌ Error committing partial work:', commitError);
          }
        }
        
        // Check if we should retry (max 1 retry)
        const retryCount = args.retryCount || 0;
        if (retryCount < 1) {
          console.log('[MCP Server] 🔄 Retrying with longer timeout...');
          
          // Create retry args with longer timeout
          const retryArgs: ExecutePromptArgs = {
            ...args,
            timeout: (args.timeout || 300000) * 2, // Double the timeout
            retryCount: retryCount + 1,
            isRetry: true,
            prompt: `CONTINUE FROM PARTIAL STATE: ${args.prompt}\n\nNote: Previous attempt timed out but partial work was completed. Continue from where it left off. Files already modified: ${partialWork.validFiles.join(', ')}`
          };
          
          // Retry the operation
          return await this.executePrompt(retryArgs);
        } else {
          console.log('[MCP Server] ⚠️ Max retries reached, falling back to task file');
          return await this.executePromptFallback(args, startTime);
        }
      } else {
        console.log('[MCP Server] ⚠️ No partial work found, checking retry options...');
        
        // Check if we should retry (max 1 retry)
        const retryCount = args.retryCount || 0;
        if (retryCount < 1) {
          console.log('[MCP Server] 🔄 Retrying with longer timeout (no partial work)...');
          
          // Create retry args with longer timeout
          const retryArgs: ExecutePromptArgs = {
            ...args,
            timeout: (args.timeout || 300000) * 2, // Double the timeout
            retryCount: retryCount + 1,
            isRetry: true,
            prompt: `RETRY AFTER TIMEOUT: ${args.prompt}\n\nNote: Previous attempt timed out with no progress. Retrying with longer timeout.`
          };
          
          // Retry the operation
          return await this.executePrompt(retryArgs);
        } else {
          console.log('[MCP Server] ⚠️ Max retries reached, falling back to task file');
          return await this.executePromptFallback(args, startTime);
        }
      }
    } catch (error) {
      console.error('[MCP Server] ❌ Error in timeout fallback handler:', error);
      
      // Fall back to task file creation
      return await this.executePromptFallback(args, startTime);
    }
  }

  // BUILD VALIDATION AND AUTO-FIX METHODS
  
  /**
   * Parse error output from build/dev server to extract structured error information
   */
  private parseErrorOutput(output: string): { hasErrors: boolean; errors: string[]; summary: string } {
    const errors: string[] = [];
    const lines = output.split('\n');
    
    console.log(`[MCP Server] 🔍 Parsing ${lines.length} lines of build output for errors`);
    
    // Comprehensive error patterns for TypeScript, Vite, and build tools
    const errorPatterns = [
      /error TS\d+:/i,                    // TypeScript errors
      /ERROR in /i,                       // Webpack errors
      /\bError:\s/i,                      // General errors (word boundary to avoid false positives)
      /✘ \[ERROR\]/i,                     // Vite errors
      /\[vite\] error:/i,                 // Vite specific
      /Module not found:/i,               // Missing module errors
      /Cannot find module/i,              // Import errors
      /Syntax error:/i,                   // Syntax errors
      /Failed to compile/i,               // Compilation failures
      /ESLint error:/i,                   // ESLint errors
      /\berror\b.*?:\s+/i,                // Generic "error:" patterns
      /Build failed with \d+ error/i,     // Build failure messages
      /Command failed:/i,                 // Command execution failures
      /ENOENT:/i,                         // File not found errors
      /TypeError:/i,                      // Type errors in runtime
      /ReferenceError:/i,                 // Reference errors
      /SyntaxError:/i,                    // Syntax errors
      /⨯ /,                               // Vite/Next.js error indicator
      /❌/,                                // Error emoji
    ];
    
    let captureContext = false;
    let errorBlock: string[] = [];
    let errorCount = 0;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Check if this line contains an error
      const isError = errorPatterns.some(pattern => pattern.test(line));
      
      if (isError) {
        // Start a new error block
        if (errorBlock.length > 0) {
          // Save previous error block
          errors.push(errorBlock.join('\n'));
          errorCount++;
        }
        captureContext = true;
        errorBlock = [line];
        
        // Capture previous lines for context (up to 3 lines before)
        const contextLines = 3;
        for (let j = Math.max(0, i - contextLines); j < i; j++) {
          const contextLine = lines[j];
          if (contextLine.trim() && !errorPatterns.some(p => p.test(contextLine))) {
            errorBlock.unshift(contextLine);
          }
        }
      } else if (captureContext) {
        // Capture additional context lines after the error
        if (line.trim()) {
          errorBlock.push(line);
          
          // Stop capturing after blank line or after 15 lines total
          if (errorBlock.length >= 15) {
            errors.push(errorBlock.join('\n'));
            errorCount++;
            errorBlock = [];
            captureContext = false;
          }
        } else if (line.trim() === '' && errorBlock.length > 1) {
          // Blank line signals end of error block
          errors.push(errorBlock.join('\n'));
          errorCount++;
          errorBlock = [];
          captureContext = false;
        }
      }
    }
    
    // Add any remaining error block
    if (errorBlock.length > 0) {
      errors.push(errorBlock.join('\n'));
      errorCount++;
    }
    
    // If no structured errors found but output contains error indicators, capture full output
    if (errors.length === 0 && (output.toLowerCase().includes('error') || output.includes('failed'))) {
      console.log('[MCP Server] ⚠️ No structured errors captured, but output contains error keywords');
      // Try to find the most relevant section
      const relevantLines = lines.filter(line => 
        line.toLowerCase().includes('error') || 
        line.toLowerCase().includes('failed') ||
        line.includes('⨯') ||
        line.includes('✘')
      );
      
      if (relevantLines.length > 0) {
        errors.push('Unstructured error output:\n' + relevantLines.slice(0, 20).join('\n'));
        errorCount++;
      }
    }
    
    const hasErrors = errors.length > 0;
    
    console.log(`[MCP Server] 📊 Captured ${errorCount} error block(s)`);
    if (errors.length > 0) {
      console.log(`[MCP Server] First error preview: ${errors[0].substring(0, 300)}...`);
    }
    
    const summary = hasErrors 
      ? `Found ${errors.length} error(s) in build output`
      : 'Build completed successfully with no errors';
    
    return { hasErrors, errors, summary };
  }
  
  /**
   * Validate build and dev server, return error information
   */
  private async validateBuildAndDev(projectPath: string): Promise<{ 
    success: boolean; 
    errors: string[]; 
    output: string;
    summary: string;
  }> {
    console.log('[MCP Server] 🔍 Validating build and dev server...');
    
    let buildOutput = '';
    let devOutput = '';
    
    // Step 1: Run npm run build
    console.log('[MCP Server] Running npm run build...');
    try {
      const { stdout, stderr } = await execAsync('npm run build', {
        cwd: projectPath,
        timeout: this.BUILD_TIMEOUT
      });
      buildOutput = stdout + '\n' + stderr;
      console.log('[MCP Server] ✅ Build command completed');
    } catch (error: any) {
      buildOutput = (error.stdout || '') + '\n' + (error.stderr || '');
      console.log('[MCP Server] ❌ Build command failed');
      
      const parsed = this.parseErrorOutput(buildOutput);
      if (parsed.hasErrors) {
        return {
          success: false,
          errors: parsed.errors,
          output: buildOutput,
          summary: `Build failed: ${parsed.summary}`
        };
      }
    }
    
    // Step 2: Check build output for errors even if command succeeded
    const buildParsed = this.parseErrorOutput(buildOutput);
    if (buildParsed.hasErrors) {
      return {
        success: false,
        errors: buildParsed.errors,
        output: buildOutput,
        summary: `Build completed but has errors: ${buildParsed.summary}`
      };
    }
    
    // Step 3: Start dev server and monitor for errors
    console.log('[MCP Server] Starting dev server for validation...');
    try {
      const devResult = await this.checkDevServer(projectPath);
      devOutput = devResult.output;
      
      if (!devResult.success) {
        return {
          success: false,
          errors: devResult.errors,
          output: buildOutput + '\n\n=== DEV SERVER OUTPUT ===\n' + devOutput,
          summary: `Dev server failed: ${devResult.summary}`
        };
      }
    } catch (error: any) {
      console.log('[MCP Server] ⚠️ Dev server check failed:', error.message);
      // Dev server failures are less critical, log but continue
    }
    
    console.log('[MCP Server] ✅ Build and dev server validation passed');
    return {
      success: true,
      errors: [],
      output: buildOutput + '\n\n=== DEV SERVER OUTPUT ===\n' + devOutput,
      summary: 'Build and dev server validation passed successfully'
    };
  }
  
  /**
   * Start dev server and monitor for compilation errors
   */
  private async checkDevServer(projectPath: string): Promise<{
    success: boolean;
    errors: string[];
    output: string;
    summary: string;
  }> {
    return new Promise((resolve) => {
      let devProcess: ChildProcess | null = null;
      let output = '';
      let hasCompiled = false;
      let hasErrors = false;
      
      const timeout = setTimeout(() => {
        if (devProcess) {
          devProcess.kill();
        }
        
        const parsed = this.parseErrorOutput(output);
        
        if (!hasCompiled && !parsed.hasErrors) {
          resolve({
            success: true,
            errors: [],
            output,
            summary: 'Dev server started but did not complete compilation within timeout (non-critical)'
          });
        } else if (parsed.hasErrors) {
          resolve({
            success: false,
            errors: parsed.errors,
            output,
            summary: `Dev server errors detected: ${parsed.summary}`
          });
        } else {
          resolve({
            success: true,
            errors: [],
            output,
            summary: 'Dev server validation completed'
          });
        }
      }, this.DEV_SERVER_CHECK_TIMEOUT);
      
      try {
        // Start dev server
        devProcess = spawn('npm', ['run', 'dev'], {
          cwd: projectPath,
          shell: true,
          stdio: ['ignore', 'pipe', 'pipe']
        });
        
        devProcess.stdout?.on('data', (data: Buffer) => {
          const text = data.toString();
          output += text;
          
          // Check for successful compilation
          if (text.includes('compiled successfully') || 
              text.includes('ready in') ||
              text.includes('Local:') ||
              text.includes('Network:')) {
            hasCompiled = true;
          }
          
          // Check for errors
          if (text.includes('ERROR') || text.includes('error TS')) {
            hasErrors = true;
          }
        });
        
        devProcess.stderr?.on('data', (data: Buffer) => {
          const text = data.toString();
          output += text;
          
          // Check for errors in stderr
          if (text.includes('ERROR') || text.includes('error TS')) {
            hasErrors = true;
          }
        });
        
        devProcess.on('error', (error) => {
          clearTimeout(timeout);
          resolve({
            success: false,
            errors: [error.message],
            output,
            summary: `Dev server process error: ${error.message}`
          });
        });
        
        devProcess.on('exit', (code) => {
          clearTimeout(timeout);
          
          if (code !== 0 && code !== null) {
            const parsed = this.parseErrorOutput(output);
            resolve({
              success: false,
              errors: parsed.errors,
              output,
              summary: `Dev server exited with code ${code}`
            });
          }
        });
      } catch (error: any) {
        clearTimeout(timeout);
        resolve({
          success: false,
          errors: [error.message],
          output,
          summary: `Failed to start dev server: ${error.message}`
        });
      }
    });
  }
  
  /**
   * Auto-fix build errors using cursor-agent
   */
  private async autoFixBuildErrors(
    projectPath: string,
    errorDetails: { errors: string[]; output: string; summary: string },
    retryCount: number = 0
  ): Promise<{ success: boolean; message: string }> {
    console.log(`[MCP Server] 🔧 Auto-fixing build errors (attempt ${retryCount + 1}/${this.MAX_BUILD_FIX_RETRIES})...`);
    
    if (retryCount >= this.MAX_BUILD_FIX_RETRIES) {
      return {
        success: false,
        message: `Failed to fix build errors after ${this.MAX_BUILD_FIX_RETRIES} attempts`
      };
    }
    
    // Prepare error fix prompt
    const errorSummary = errorDetails.errors.slice(0, 10).join('\n\n---\n\n'); // Limit to first 10 errors
    const fixPrompt = `CRITICAL: The project has build errors that must be fixed immediately.

Build Status: ${errorDetails.summary}

Errors detected (showing first 10):
${errorSummary}

INSTRUCTIONS:
1. Analyze each error carefully
2. Fix the root cause of each error
3. Ensure all imports are correct
4. Verify TypeScript types are properly defined
5. Check for missing dependencies
6. Fix any syntax errors
7. Ensure all files compile without errors

Fix all errors now. Do not add new features, only fix the existing errors.`;
    
    try {
      // Build cursor-agent command
      const isWindows = process.platform === 'win32';
      let actualProjectPath = projectPath;
      
      if (!path.isAbsolute(projectPath)) {
        actualProjectPath = path.resolve(process.cwd(), projectPath);
      }
      
      // Ensure npm install has been run before attempting fixes
      // This resolves common issues with missing dependencies or TypeScript not being found
      console.log('[MCP Server] 🔍 Ensuring dependencies are installed...');
      try {
        const vpsConfig = this.getVPSConfig();
        
        if (vpsConfig) {
          // Run npm install on VPS
          const vpsProjectPath = this.convertToVPSPath(actualProjectPath, vpsConfig);
          const remoteCommand = `cd '${vpsProjectPath}' && npm install`;
          await this.executeSSHCommand(vpsConfig, remoteCommand);
        } else if (isWindows) {
          // Run npm install in WSL for Windows projects
          const wslProjectPath = actualProjectPath
            .replace(/\\/g, '/')
            .replace(/^([A-Z]):/i, (match, drive) => `/mnt/${drive.toLowerCase()}`);
          
          await execAsync(`wsl -d Ubuntu bash -c "cd '${wslProjectPath}' && npm install"`, { 
            timeout: 180000 // 3 minutes
          });
        } else {
          await execAsync('npm install', { 
            cwd: actualProjectPath,
            timeout: 180000 // 3 minutes
          });
        }
        console.log('[MCP Server] ✅ Dependencies installed successfully');
      } catch (installError: any) {
        console.warn('[MCP Server] ⚠️ npm install failed, continuing anyway:', installError.message);
        // Don't fail the fix attempt if npm install fails - agent might be able to fix it
      }
      
      // Save fix prompt to temp file
      const tempPromptFile = path.join(actualProjectPath, '.cursor-fix-prompt.tmp');
      await fs.writeFile(tempPromptFile, fixPrompt, 'utf-8');
      
      // Check if VPS config is available
      const vpsConfig = this.getVPSConfig();
      let command: string;
      let useVPS = false;
      
      if (vpsConfig) {
        useVPS = true;
        // VPS execution: Convert path and build SSH command
        const vpsProjectPath = this.convertToVPSPath(actualProjectPath, vpsConfig);
        
        // Transfer prompt file to VPS
        const vpsPromptFile = `${vpsProjectPath}/.cursor-fix-prompt.tmp`;
        try {
          await this.transferFileToVPS(tempPromptFile, vpsPromptFile, vpsConfig);
          console.log(`[MCP Server] ✓ Fix prompt file transferred to VPS`);
        } catch (error) {
          console.error(`[MCP Server] Failed to transfer fix prompt file to VPS:`, error);
          throw new Error(`Failed to transfer fix prompt file to VPS: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        
        // Execute cursor-agent on VPS using SSH2 streaming
        const remoteCommand = `cd '${vpsProjectPath}' && cat '.cursor-fix-prompt.tmp' | ~/.local/bin/cursor-agent --print --output-format stream-json --stream-partial-output --force --model auto`;
        await this.executeCursorAgentStreamingSSH(vpsConfig, remoteCommand, 300000);
        command = ''; // Set empty to skip local execution
      } else if (isWindows) {
        const wslProjectPath = actualProjectPath
          .replace(/\\/g, '/')
          .replace(/^([A-Z]):/i, (match, drive) => `/mnt/${drive.toLowerCase()}`);
        
        const wslPromptFile = wslProjectPath + '/.cursor-fix-prompt.tmp';
        command = `wsl -d Ubuntu bash -c "cd '${wslProjectPath}' && cat '${wslPromptFile}' | ~/.local/bin/cursor-agent --print --output-format stream-json --stream-partial-output --force --model auto"`;
      } else {
        command = `cat .cursor-fix-prompt.tmp | cursor-agent --print --output-format stream-json --stream-partial-output --force --model auto`;
      }
      
      console.log(`[MCP Server] Executing cursor-agent to fix errors...`);
      
      // Only execute locally if not using VPS
      if (!useVPS && command) {
        await this.executeCursorAgentStreaming(
          command,
          isWindows ? undefined : actualProjectPath,
          300000 // 5 minutes
        );
      }
      
      // Clean up temp file
      try {
        await fs.unlink(tempPromptFile);
      } catch (e) {
        // Ignore cleanup errors
      }
      
      console.log(`[MCP Server] ✅ Cursor-agent fix attempt completed`);
      
      // Wait for file system to stabilize
      await this.waitForFileSystemStability(actualProjectPath, 15000);
      
      // Validate again
      console.log(`[MCP Server] 🔍 Re-validating build after fix attempt...`);
      const validationResult = await this.validateBuildAndDev(actualProjectPath);
      
      if (validationResult.success) {
        console.log(`[MCP Server] ✅ Build errors fixed successfully!`);
        return {
          success: true,
          message: `Build errors fixed after ${retryCount + 1} attempt(s)`
        };
      } else {
        console.log(`[MCP Server] ⚠️ Build still has errors after fix attempt`);
        
        // Retry with incremented count
        return await this.autoFixBuildErrors(actualProjectPath, validationResult, retryCount + 1);
      }
    } catch (error: any) {
      console.error(`[MCP Server] ❌ Auto-fix attempt ${retryCount + 1} failed:`, error.message);
      
      // Retry
      return await this.autoFixBuildErrors(projectPath, errorDetails, retryCount + 1);
    }
  }

  /**
   * Execute cursor-agent command on VPS with real-time streaming output via SSH2
   */
  private async executeCursorAgentStreamingSSH(
    vpsConfig: VPSConfig,
    remoteCommand: string,
    timeout: number
  ): Promise<{ stdout: string; stderr: string; logs: Array<{ timestamp: string; type: string; message: string; data?: any }> }> {
    return new Promise((resolve, reject) => {
      const conn = new Client();
      let stdout = '';
      let stderr = '';
      let stdoutBuffer = '';
      let timedOut = false;
      const logs: Array<{ timestamp: string; type: string; message: string; data?: any }> = [];
      const startTime = Date.now();
      
      const addLog = (type: string, message: string, data?: any) => {
        logs.push({
          timestamp: new Date().toISOString(),
          type,
          message,
          data
        });
      };

      console.log('[MCP Server] Starting cursor-agent on VPS with streaming output...');
      addLog('info', 'Starting cursor-agent on VPS with streaming output');

      const timeoutHandle = setTimeout(() => {
        timedOut = true;
        const msg = 'Cursor-agent timed out, terminating process...';
        console.log(`[MCP Server] ⚠ ${msg}`);
        addLog('warning', msg);
        conn.end();
      }, timeout);

      conn.on('ready', () => {
        conn.exec(remoteCommand, (err, stream) => {
          if (err) {
            clearTimeout(timeoutHandle);
            conn.end();
            reject(err);
            return;
          }

          stream.on('data', (data: Buffer) => {
            const text = data.toString();
            stdout += text;
            stdoutBuffer += text;
            
            // Process complete lines for JSON streaming
            const lines = stdoutBuffer.split('\n');
            stdoutBuffer = lines.pop() || '';
            
            for (const line of lines) {
              if (!line.trim()) continue;
              
              try {
                const jsonData = JSON.parse(line);
                const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                
                // Log different event types (same as local execution)
                if (jsonData.type === 'status') {
                  const msg = jsonData.message || JSON.stringify(jsonData);
                  console.log(`[Cursor Agent] Status: ${msg}`);
                  addLog('agent_status', msg, { elapsed, raw: jsonData });
                } else if (jsonData.type === 'file_change' || jsonData.type === 'file') {
                  const path = jsonData.path || jsonData.file || JSON.stringify(jsonData);
                  console.log(`[Cursor Agent] File: ${path}`);
                  addLog('agent_file', `File modified: ${path}`, { elapsed, path, raw: jsonData });
                } else if (jsonData.type === 'thinking' || jsonData.type === 'thought') {
                  const thought = jsonData.content || jsonData.message || '...';
                  console.log(`[Cursor Agent] Thinking: ${thought}`);
                  addLog('agent_thinking', thought, { elapsed, raw: jsonData });
                } else if (jsonData.type === 'error') {
                  const errMsg = jsonData.message || JSON.stringify(jsonData);
                  console.error(`[Cursor Agent] Error: ${errMsg}`);
                  addLog('agent_error', errMsg, { elapsed, raw: jsonData });
                } else if (jsonData.type === 'completion' || jsonData.type === 'done') {
                  const msg = jsonData.message || 'Done';
                  console.log(`[Cursor Agent] Completed: ${msg}`);
                  addLog('agent_completion', msg, { elapsed, raw: jsonData });
                } else if (jsonData.type === 'delta' || jsonData.type === 'text_delta') {
                  const deltaText = jsonData.content || jsonData.text || jsonData.delta || '';
                  if (deltaText) {
                    process.stdout.write(deltaText);
                    addLog('agent_delta', deltaText, { elapsed, raw: jsonData });
                  }
                } else if (jsonData.type === 'tool_call') {
                  const toolInfo = JSON.stringify(jsonData).substring(0, 200);
                  console.log(`[Cursor Agent] Tool Call: ${toolInfo}`);
                  addLog('agent_tool_call', toolInfo, { elapsed, raw: jsonData });
                } else if (jsonData.type === 'assistant') {
                  const content = jsonData.message?.content || jsonData.content || '';
                  const preview = typeof content === 'string' ? content.substring(0, 100) : JSON.stringify(content).substring(0, 100);
                  console.log(`[Cursor Agent] Assistant: ${preview}`);
                  addLog('agent_assistant', preview, { elapsed, raw: jsonData });
                } else {
                  const eventInfo = JSON.stringify(jsonData).substring(0, 200);
                  console.log(`[Cursor Agent] ${jsonData.type || 'Event'}: ${eventInfo}`);
                  addLog('agent_event', eventInfo, { elapsed, eventType: jsonData.type, raw: jsonData });
                }
              } catch (parseError) {
                if (line.trim()) {
                  console.log(`[Cursor Agent] ${line}`);
                  addLog('agent_output', line);
                }
              }
            }
          });

          stream.stderr.on('data', (data: Buffer) => {
            const text = data.toString();
            stderr += text;
            
            const lines = text.split('\n').filter(l => l.trim());
            for (const line of lines) {
              console.error(`[Cursor Agent] stderr: ${line}`);
              addLog('agent_stderr', line);
            }
          });

          stream.on('close', (code: number, signal: string) => {
            clearTimeout(timeoutHandle);
            conn.end();
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            
            // Process any remaining buffer
            if (stdoutBuffer.trim()) {
              try {
                const jsonData = JSON.parse(stdoutBuffer);
                const preview = JSON.stringify(jsonData).substring(0, 200);
                console.log(`[Cursor Agent] Final: ${preview}`);
                addLog('agent_final', preview, { raw: jsonData });
              } catch {
                console.log(`[Cursor Agent] ${stdoutBuffer}`);
                addLog('agent_output', stdoutBuffer);
              }
            }
            
            if (timedOut) {
              const msg = 'Cursor-agent timed out but may have completed work';
              console.log(`[MCP Server] ⚠ ${msg}`);
              addLog('warning', msg, { elapsed, exitCode: code, signal });
              resolve({ stdout, stderr, logs });
            } else if (code !== 0 && code !== null) {
              const msg = `Cursor-agent exited with code ${code}`;
              console.log(`[MCP Server] ${msg}`);
              addLog('warning', msg, { elapsed, exitCode: code, signal });
              resolve({ stdout, stderr, logs });
            } else {
              const msg = 'Cursor-agent completed successfully';
              console.log(`[MCP Server] ✓ ${msg}`);
              addLog('success', msg, { elapsed });
              resolve({ stdout, stderr, logs });
            }
          });
        });
      });

      conn.on('error', (err) => {
        clearTimeout(timeoutHandle);
        reject(err);
      });

      conn.connect({
        host: vpsConfig.host,
        port: vpsConfig.port,
        username: vpsConfig.user,
        password: vpsConfig.password,
        readyTimeout: 10000
      });
    });
  }

  /**
   * Execute cursor-agent command with real-time streaming output
   * Parses JSON stream and logs all events as they occur
   */
  private async executeCursorAgentStreaming(
    command: string,
    cwd: string | undefined,
    timeout: number
  ): Promise<{ stdout: string; stderr: string; logs: Array<{ timestamp: string; type: string; message: string; data?: any }> }> {
    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      let stdoutBuffer = '';
      let timedOut = false;
      const logs: Array<{ timestamp: string; type: string; message: string; data?: any }> = [];
      const startTime = Date.now();
      
      // Helper to add log entry
      const addLog = (type: string, message: string, data?: any) => {
        logs.push({
          timestamp: new Date().toISOString(),
          type,
          message,
          data
        });
      };
      
      console.log('[MCP Server] Starting cursor-agent with streaming output...');
      addLog('info', 'Starting cursor-agent with streaming output');
      
      // Spawn the process
      const childProcess = spawn(command, {
        cwd,
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });
      
      // Set up timeout
      const timeoutHandle = setTimeout(() => {
        timedOut = true;
        const msg = 'Cursor-agent timed out, terminating process...';
        console.log(`[MCP Server] ⚠ ${msg}`);
        addLog('warning', msg);
        
        // Capture partial work before terminating
        addLog('info', 'Capturing partial work before timeout termination');
        
        childProcess.kill('SIGTERM');
        
        // Give it a moment to clean up, then force kill if needed
        setTimeout(() => {
          if (!childProcess.killed) {
            childProcess.kill('SIGKILL');
            addLog('warning', 'Force killed cursor-agent process');
          }
        }, 5000);
      }, timeout);
      
      // Process stdout line by line for JSON streaming
      childProcess.stdout?.on('data', (data: Buffer) => {
        const text = data.toString();
        stdout += text;
        stdoutBuffer += text;
        
        // ⚠️ DETECT DEV SERVER ATTEMPTS - Only match actual command executions
        // Match JSON command fields like: "command": "npm run dev"
        // Avoid false positives from file contents, comments, or arbitrary text
        const devServerPatterns = [
          /"command"\s*:\s*"[^"]*npm\s+run\s+(dev|start)[^"]*"/i,  // npm run dev/start in JSON command
          /"command"\s*:\s*"[^"]*(yarn|pnpm)\s+dev[^"]*"/i,         // yarn/pnpm dev in JSON command
          /shellToolCall[^}]*"command"[^}]*npm\s+run\s+dev/i,       // shellToolCall with npm run dev
        ];
        
        const isDevServerCommand = devServerPatterns.some(pattern => pattern.test(text));
        
        if (isDevServerCommand) {
          const alertMsg = 'ALERT: cursor-agent is trying to run a dev server!';
          console.error(`⚠️⚠️⚠️ [MCP Server] ${alertMsg}`);
          console.error('⚠️⚠️⚠️ [MCP Server] This will cause a 5-minute timeout. Killing in 10 seconds if not stopped...');
          addLog('error', alertMsg);
          addLog('warning', 'Will kill cursor-agent in 10 seconds to prevent hang');
          
          // Give cursor-agent 10 seconds to stop on its own, then force kill
          setTimeout(() => {
            if (!childProcess.killed) {
              const killMsg = 'Force-killing cursor-agent to prevent dev server hang!';
              console.error(`⚠️⚠️⚠️ [MCP Server] ${killMsg}`);
              addLog('error', killMsg);
              childProcess.kill('SIGKILL');
            }
          }, 10000);
        }
        
        // Process complete lines
        const lines = stdoutBuffer.split('\n');
        stdoutBuffer = lines.pop() || ''; // Keep incomplete line in buffer
        
        for (const line of lines) {
          if (!line.trim()) continue;
          
          try {
            const jsonData = JSON.parse(line);
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            
            // Log different event types with appropriate formatting
            if (jsonData.type === 'status') {
              const msg = jsonData.message || JSON.stringify(jsonData);
              console.log(`[Cursor Agent] Status: ${msg}`);
              addLog('agent_status', msg, { elapsed, raw: jsonData });
            } else if (jsonData.type === 'file_change' || jsonData.type === 'file') {
              const path = jsonData.path || jsonData.file || JSON.stringify(jsonData);
              console.log(`[Cursor Agent] File: ${path}`);
              addLog('agent_file', `File modified: ${path}`, { elapsed, path, raw: jsonData });
            } else if (jsonData.type === 'thinking' || jsonData.type === 'thought') {
              const thought = jsonData.content || jsonData.message || '...';
              console.log(`[Cursor Agent] Thinking: ${thought}`);
              addLog('agent_thinking', thought, { elapsed, raw: jsonData });
            } else if (jsonData.type === 'error') {
              const errMsg = jsonData.message || JSON.stringify(jsonData);
              console.error(`[Cursor Agent] Error: ${errMsg}`);
              addLog('agent_error', errMsg, { elapsed, raw: jsonData });
            } else if (jsonData.type === 'completion' || jsonData.type === 'done') {
              const msg = jsonData.message || 'Done';
              console.log(`[Cursor Agent] Completed: ${msg}`);
              addLog('agent_completion', msg, { elapsed, raw: jsonData });
            } else if (jsonData.type === 'delta' || jsonData.type === 'text_delta') {
              // Text deltas - log without newline if possible (accumulate)
              const deltaText = jsonData.content || jsonData.text || jsonData.delta || '';
              if (deltaText) {
                process.stdout.write(deltaText);
                addLog('agent_delta', deltaText, { elapsed, raw: jsonData });
              }
            } else if (jsonData.type === 'tool_call') {
              // Capture tool calls (important for debugging)
              const toolInfo = JSON.stringify(jsonData).substring(0, 200);
              console.log(`[Cursor Agent] Tool Call: ${toolInfo}`);
              addLog('agent_tool_call', toolInfo, { elapsed, raw: jsonData });
            } else if (jsonData.type === 'assistant') {
              // Capture assistant messages
              const content = jsonData.message?.content || jsonData.content || '';
              const preview = typeof content === 'string' ? content.substring(0, 100) : JSON.stringify(content).substring(0, 100);
              console.log(`[Cursor Agent] Assistant: ${preview}`);
              addLog('agent_assistant', preview, { elapsed, raw: jsonData });
            } else {
              // Log any other event types
              const eventInfo = JSON.stringify(jsonData).substring(0, 200);
              console.log(`[Cursor Agent] ${jsonData.type || 'Event'}: ${eventInfo}`);
              addLog('agent_event', eventInfo, { elapsed, eventType: jsonData.type, raw: jsonData });
            }
          } catch (parseError) {
            // Not JSON or malformed - log as plain text
            if (line.trim()) {
              console.log(`[Cursor Agent] ${line}`);
              addLog('agent_output', line);
            }
          }
        }
      });
      
      // Capture stderr
      childProcess.stderr?.on('data', (data: Buffer) => {
        const text = data.toString();
        stderr += text;
        
        // Log stderr in real-time too
        const lines = text.split('\n').filter(l => l.trim());
        for (const line of lines) {
          console.error(`[Cursor Agent] stderr: ${line}`);
          addLog('agent_stderr', line);
        }
      });
      
      // Handle process completion
      childProcess.on('close', (code, signal) => {
        clearTimeout(timeoutHandle);
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        
        // Process any remaining buffer
        if (stdoutBuffer.trim()) {
          try {
            const jsonData = JSON.parse(stdoutBuffer);
            const preview = JSON.stringify(jsonData).substring(0, 200);
            console.log(`[Cursor Agent] Final: ${preview}`);
            addLog('agent_final', preview, { raw: jsonData });
          } catch {
            console.log(`[Cursor Agent] ${stdoutBuffer}`);
            addLog('agent_output', stdoutBuffer);
          }
        }
        
        if (timedOut) {
          const msg = 'Cursor-agent timed out but may have completed work';
          console.log(`[MCP Server] ⚠ ${msg}`);
          addLog('warning', msg, { elapsed, exitCode: code, signal });
          resolve({ stdout, stderr, logs });
        } else if (code !== 0 && code !== null) {
          const msg = `Cursor-agent exited with code ${code}`;
          console.log(`[MCP Server] ${msg}`);
          addLog('warning', msg, { elapsed, exitCode: code, signal });
          resolve({ stdout, stderr, logs });
        } else {
          const msg = 'Cursor-agent completed successfully';
          console.log(`[MCP Server] ✓ ${msg}`);
          addLog('success', msg, { elapsed, exitCode: code, totalLogs: logs.length });
          resolve({ stdout, stderr, logs });
        }
      });
      
      // Handle process errors
      childProcess.on('error', (error) => {
        clearTimeout(timeoutHandle);
        const errMsg = `Cursor-agent process error: ${error.message}`;
        console.error(`[MCP Server] ❌ ${errMsg}`);
        addLog('error', errMsg, { error: error.message });
        reject(error);
      });
    });
  }

  /**
   * Capture partial work completed before timeout
   * Scans project directory for files modified during the operation
   */
  private async capturePartialWork(projectPath: string, operationStartTime: number): Promise<{
    hasPartialWork: boolean;
    filesChanged: string[];
    validFiles: string[];
    corruptedFiles: string[];
  }> {
    try {
      console.log('[MCP Server] 🔍 Capturing partial work from timeout...');
      
      // Get all files that were changed during the operation
      const filesChanged = await this.getChangedFiles(projectPath);
      
      if (filesChanged.length === 0) {
        console.log('[MCP Server] ℹ️ No files were modified before timeout');
        return {
          hasPartialWork: false,
          filesChanged: [],
          validFiles: [],
          corruptedFiles: []
        };
      }
      
      console.log(`[MCP Server] 📊 Found ${filesChanged.length} files modified before timeout`);
      
      // Validate that files are in usable state (not corrupted)
      const validFiles: string[] = [];
      const corruptedFiles: string[] = [];
      
      for (const filePath of filesChanged) {
        try {
          const fullPath = path.join(projectPath, filePath);
          const stats = await fs.stat(fullPath);
          
          // Check if file was modified after operation start
          if (stats.mtime.getTime() >= operationStartTime) {
            // Try to read the file to check if it's corrupted
            const content = await fs.readFile(fullPath, 'utf-8');
            
            // Basic validation - check for common corruption patterns
            if (this.isFileCorrupted(content, filePath)) {
              corruptedFiles.push(filePath);
              console.warn(`[MCP Server] ⚠️ File appears corrupted: ${filePath}`);
            } else {
              validFiles.push(filePath);
              console.log(`[MCP Server] ✅ Valid file: ${filePath}`);
            }
          }
        } catch (error) {
          console.warn(`[MCP Server] ⚠️ Error validating file ${filePath}:`, error);
          corruptedFiles.push(filePath);
        }
      }
      
      const hasPartialWork = validFiles.length > 0;
      
      console.log(`[MCP Server] 📊 Partial work analysis:`);
      console.log(`[MCP Server]   - Total files changed: ${filesChanged.length}`);
      console.log(`[MCP Server]   - Valid files: ${validFiles.length}`);
      console.log(`[MCP Server]   - Corrupted files: ${corruptedFiles.length}`);
      console.log(`[MCP Server]   - Has partial work: ${hasPartialWork}`);
      
      return {
        hasPartialWork,
        filesChanged,
        validFiles,
        corruptedFiles
      };
    } catch (error) {
      console.error('[MCP Server] ❌ Error capturing partial work:', error);
      return {
        hasPartialWork: false,
        filesChanged: [],
        validFiles: [],
        corruptedFiles: []
      };
    }
  }

  /**
   * Check if a file appears to be corrupted based on content analysis
   */
  private isFileCorrupted(content: string, filePath: string): boolean {
    // Check for common corruption patterns
    const corruptionPatterns = [
      /^[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]+$/, // Control characters only
      /^[\s]*$/, // Empty or whitespace only
      /undefined|null\s*$/, // Ends with undefined/null
      /\.\.\.$/, // Ends with ellipsis (incomplete)
      /^[\s]*\{[\s]*$/, // Only opening brace
      /^[\s]*\[[\s]*$/, // Only opening bracket
    ];
    
    // For TypeScript/JavaScript files, check for syntax issues
    if (filePath.endsWith('.ts') || filePath.endsWith('.tsx') || filePath.endsWith('.js') || filePath.endsWith('.jsx')) {
      // Check for incomplete function/class declarations
      if (content.includes('function ') && !content.includes('{')) return true;
      if (content.includes('class ') && !content.includes('{')) return true;
      if (content.includes('interface ') && !content.includes('{')) return true;
      if (content.includes('export ') && content.trim().endsWith('export')) return true;
    }
    
    // Check against corruption patterns
    return corruptionPatterns.some(pattern => pattern.test(content));
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
        timeout: 360000 // 6 minutes
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
    // Wrap git status in mutex to prevent concurrent git operations
    return await this.withGitMutex(async () => {
      try {
        console.log(`[MCP Server] 🔍 Checking git status in: ${projectPath}`);
        const { stdout } = await execAsync('git status --porcelain', { cwd: projectPath });
        
        if (!stdout.trim()) {
          console.log('[MCP Server] ℹ️ No changes detected by git');
          return [];
        }
        
        const files = stdout.trim().split('\n').filter(Boolean).map(line => {
          const status = line.substring(0, 2);
          const filepath = line.substring(3);
          console.log(`[MCP Server]   ${status} ${filepath}`);
          return filepath;
        });
        
        console.log(`[MCP Server] ✅ Found ${files.length} changed file(s)`);
        return files;
      } catch (error) {
        console.error('[MCP Server] ❌ Failed to get changed files:', error);
        return [];
      }
    });
  }

  private async waitForFileSystemStability(
    projectPath: string, 
    maxWaitMs: number = 30000
  ): Promise<void> {
    const startTime = Date.now();
    const pollInterval = 2000; // Check every 2 seconds
    let previousChangeCount = -1;
    let stableCount = 0;
    const requiredStableChecks = 2; // Need 2 consecutive stable checks
    
    while (Date.now() - startTime < maxWaitMs) {
      const files = await this.getChangedFiles(projectPath);
      const currentChangeCount = files.length;
      
      console.log(`[MCP Server] 🔍 File system check: ${currentChangeCount} changed files`);
      
      if (currentChangeCount === previousChangeCount && currentChangeCount > 0) {
        stableCount++;
        if (stableCount >= requiredStableChecks) {
          console.log(`[MCP Server] ✅ File system stable with ${currentChangeCount} changes`);
          return;
        }
      } else {
        stableCount = 0;
      }
      
      previousChangeCount = currentChangeCount;
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
    
    console.log(`[MCP Server] ⚠️ File system stability timeout after ${maxWaitMs}ms`);
  }

  private categorizeFiles(files: string[]): Record<string, string[]> {
    const categories: Record<string, string[]> = {
      'Source Files': [],
      'Components': [],
      'Styles': [],
      'Config Files': [],
      'Other': []
    };
    
    files.forEach(file => {
      if (file.match(/\.(tsx?|jsx?)$/)) {
        if (file.includes('component')) {
          categories['Components'].push(file);
        } else {
          categories['Source Files'].push(file);
        }
      } else if (file.match(/\.(css|scss|sass)$/)) {
        categories['Styles'].push(file);
      } else if (file.match(/\.(json|js|ts|config)$/) || file.includes('config')) {
        categories['Config Files'].push(file);
      } else {
        categories['Other'].push(file);
      }
    });
    
    return categories;
  }

  /**
   * Mutex wrapper to ensure git operations run sequentially
   */
  private async withGitMutex<T>(fn: () => Promise<T>): Promise<T> {
    const previousMutex = this.gitMutex;
    let resolveMutex: () => void;
    this.gitMutex = new Promise(resolve => {
      resolveMutex = resolve;
    });
    
    try {
      await previousMutex;
      return await fn();
    } finally {
      resolveMutex!();
    }
  }

  /**
   * Sanitize git URL by removing any existing authentication credentials
   * This prevents token duplication during retries
   */
  private sanitizeGitUrl(url: string): string {
    // Remove any existing credentials from https URLs
    // Handles cases like https://token@github.com or https://user:pass@github.com
    const sanitized = url.replace(/https:\/\/([^@]+@)+/g, 'https://');
    console.log(`[MCP Server] Sanitized URL from ${url.substring(0, 30)}... to ${sanitized.substring(0, 30)}...`);
    return sanitized;
  }

  /**
   * Check if there are any running git processes
   */
  private async isGitProcessRunning(projectPath: string): Promise<boolean> {
    try {
      const isWindows = process.platform === 'win32';
      if (isWindows) {
        // On Windows, check for git.exe processes
        const { stdout } = await execAsync('tasklist /FI "IMAGENAME eq git.exe" /NH', { 
          cwd: projectPath,
          timeout: 5000 
        });
        return stdout.toLowerCase().includes('git.exe');
      } else {
        // On Unix-like systems, check for git processes in the project directory
        const { stdout } = await execAsync(`pgrep -f "git.*${path.basename(projectPath)}"`, {
          timeout: 5000
        });
        return stdout.trim().length > 0;
      }
    } catch (error) {
      // If pgrep or tasklist fails (e.g., no processes found), return false
      return false;
    }
  }

  /**
   * Extract repository name from GitHub URL
   */
  private extractRepoName(gitUrl: string): string {
    // Extract repo name from URLs like:
    // https://github.com/user/repo.git
    // https://github.com/user/repo
    // git@github.com:user/repo.git
    
    const match = gitUrl.match(/\/([^\/]+?)(\.git)?$/);
    if (match) {
      return match[1];
    }
    
    // Fallback: use last part of URL
    const parts = gitUrl.replace('.git', '').split('/');
    return parts[parts.length - 1];
  }

  /**
   * Create GitHub repository using GitHub API
   */
  private async createGitHubRepository(
    repoName: string,
    gitHubToken: string,
    isPrivate: boolean = false
  ): Promise<{ success: boolean; repoUrl?: string; message: string }> {
    try {
      const { Octokit } = await import('@octokit/rest');
      const octokit = new Octokit({ auth: gitHubToken });
      
      // Check if repository already exists
      try {
        const { data: user } = await octokit.users.getAuthenticated();
        const { data: existingRepo } = await octokit.repos.get({
          owner: user.login,
          repo: repoName
        });
        
        console.log('[MCP Server] 📦 Repository already exists:', existingRepo.html_url);
        return {
          success: true,
          repoUrl: existingRepo.clone_url,
          message: 'Repository already exists'
        };
      } catch (notFoundError: any) {
        // Repository doesn't exist, create it
        if (notFoundError.status === 404) {
          console.log('[MCP Server] 🆕 Creating new GitHub repository:', repoName);
          
          const { data: user } = await octokit.users.getAuthenticated();
          const { data: newRepo } = await octokit.repos.createForAuthenticatedUser({
            name: repoName,
            private: isPrivate,
            auto_init: false, // CRITICAL: Don't create README/gitignore
            description: `Created by ScopesFlow MCP Server`
          });
          
          console.log('[MCP Server] ✅ Repository created:', newRepo.html_url);
          return {
            success: true,
            repoUrl: newRepo.clone_url,
            message: 'Repository created successfully'
          };
        }
        throw notFoundError;
      }
    } catch (error: any) {
      console.error('[MCP Server] ❌ Failed to create GitHub repository:', error.message);
      return {
        success: false,
        message: `Failed to create repository: ${error.message}`
      };
    }
  }

  /**
   * Save git configuration to project directory
   */
  private async saveProjectGitConfig(projectPath: string, config: ProjectGitConfig): Promise<void> {
    try {
      const configPath = path.join(projectPath, '.git-config.json');
      await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
      console.log('[MCP Server] ✅ Git configuration saved');
    } catch (error) {
      console.error('[MCP Server] ❌ Failed to save git configuration:', error);
    }
  }

  /**
   * Load git configuration from project directory
   */
  private async loadProjectGitConfig(projectPath: string): Promise<ProjectGitConfig | null> {
    try {
      const configPath = path.join(projectPath, '.git-config.json');
      const configData = await fs.readFile(configPath, 'utf-8');
      const config = JSON.parse(configData) as ProjectGitConfig;
      console.log('[MCP Server] ✅ Git configuration loaded');
      return config;
    } catch (error) {
      // File doesn't exist or is invalid - this is normal for new projects
      return null;
    }
  }

  /**
   * Sync with remote repository by fetching and pulling if needed
   * This prevents "fetch first" errors when the remote has commits we don't have locally
   */
  private async syncWithRemote(projectPath: string, branchName: string, isInitialPush: boolean = false): Promise<void> {
    // Skip pull for initial push to empty repository
    if (isInitialPush) {
      console.log('[MCP Server] ℹ️ Initial push to empty repository - skipping sync');
      return;
    }
    
    try {
      console.log('[MCP Server] 🔄 Syncing with remote repository...');
      
      // Fetch remote state
      try {
        await execAsync('git fetch origin', { cwd: projectPath, timeout: 30000 });
        console.log('[MCP Server] ✅ Fetched remote state');
      } catch (fetchError) {
        // If this is a new remote (no commits yet), fetch will fail - that's OK
        console.log('[MCP Server] Could not fetch remote (possibly new repository)');
        return; // No remote to sync with
      }
      
      // Check if remote branch exists
      let remoteBranchExists = false;
      try {
        const { stdout: remoteBranches } = await execAsync('git branch -r', { cwd: projectPath });
        remoteBranchExists = remoteBranches.includes(`origin/${branchName}`);
        
        if (!remoteBranchExists) {
          console.log(`[MCP Server] Remote branch origin/${branchName} does not exist yet, skipping pull`);
          return;
        }
        
        console.log(`[MCP Server] Remote branch origin/${branchName} exists, checking for differences...`);
      } catch (error) {
        console.log('[MCP Server] Could not check remote branches, skipping pull');
        return;
      }
      
      // If remote branch exists, ALWAYS attempt to pull to be safe
      // Git will do nothing if already up to date, so this is safe
      console.log(`[MCP Server] Pulling from origin/${branchName} to ensure local is up to date...`);
      
      try {
        // Try pull with rebase and allow unrelated histories
        await execAsync(
          `git pull --rebase origin ${branchName} --allow-unrelated-histories`,
          { cwd: projectPath, timeout: 60000 }
        );
        console.log('[MCP Server] ✅ Successfully synced with remote (rebase)');
      } catch (rebaseError: any) {
        // Check if the error is because we're already up to date
        const errorStr = rebaseError.message || rebaseError.toString();
        if (errorStr.includes('Already up to date') || errorStr.includes('Current branch') && errorStr.includes('up to date')) {
          console.log('[MCP Server] ✅ Local is already up to date with remote');
          return;
        }
        
        // If rebase fails for other reasons, try regular merge
        console.log('[MCP Server] Rebase failed, trying merge...');
        try {
          await execAsync(
            `git pull origin ${branchName} --allow-unrelated-histories`,
            { cwd: projectPath, timeout: 60000 }
          );
          console.log('[MCP Server] ✅ Successfully synced with remote (merge)');
        } catch (mergeError: any) {
          const mergeErrorStr = mergeError.message || mergeError.toString();
          if (mergeErrorStr.includes('Already up to date')) {
            console.log('[MCP Server] ✅ Local is already up to date with remote');
            return;
          }
          
          // If both rebase and merge fail, log but don't throw
          console.warn('[MCP Server] ⚠️ Could not pull remote changes:', mergeError);
        }
      }
    } catch (error) {
      // Log but don't throw - we want to attempt the push anyway
      console.warn('[MCP Server] ⚠️ Error during sync with remote:', error);
    }
  }

  /**
   * Clean stale git lock files if safe to do so
   */
  private async cleanGitLockFiles(projectPath: string): Promise<boolean> {
    try {
      const lockFile = path.join(projectPath, '.git', 'index.lock');
      
      // Check if lock file exists
      const lockExists = await fs.access(lockFile).then(() => true).catch(() => false);
      
      if (!lockExists) {
        return true; // No lock file, all good
      }
      
      console.log('[MCP Server] ⚠️ Found stale .git/index.lock file');
      
      // Wait a moment to ensure any git process has finished
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Check if git processes are still running
      const gitRunning = await this.isGitProcessRunning(projectPath);
      
      if (gitRunning) {
        console.log('[MCP Server] ⚠️ Git processes still running, waiting...');
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Check again
        const stillRunning = await this.isGitProcessRunning(projectPath);
        if (stillRunning) {
          console.log('[MCP Server] ❌ Cannot remove lock file - git processes still active');
          return false;
        }
      }
      
      // Safe to remove the lock file - check existence immediately before deletion
      try {
        // Double-check file still exists before attempting deletion
        await fs.access(lockFile);
        await fs.unlink(lockFile);
        console.log('[MCP Server] ✅ Removed stale .git/index.lock file');
        return true;
      } catch (unlinkError: any) {
        // ENOENT means file was already deleted by another process - this is success
        if (unlinkError.code === 'ENOENT') {
          console.log('[MCP Server] ✅ Lock file already removed by another process');
          return true;
        }
        throw unlinkError; // Re-throw other errors
      }
    } catch (error) {
      console.error('[MCP Server] ❌ Failed to clean git lock files:', error);
      return false;
    }
  }

  private async commitAndPush(
    projectPath: string,
    commitMessage: string,
    gitHubToken: string,
    gitUserName?: string,
    gitUserEmail?: string,
    gitRepository?: string,
    retryCount: number = 0,
    isInitialCommit: boolean = false
  ): Promise<{ success: boolean; message: string; changesCount?: number }> {
    try {
      console.log('[MCP Server] 🔍 Starting git commit and push process...');
      
      // If gitRepository not provided as parameter, try to load from config
      if (!gitRepository) {
        const config = await this.loadProjectGitConfig(projectPath);
        if (config?.gitRepository) {
          gitRepository = config.gitRepository;
          console.log('[MCP Server] 📋 Loaded git repository from config:', gitRepository);
        } else {
          console.warn('[MCP Server] ⚠️ No git repository configured - push will be skipped');
        }
      }
      
      // Ensure git repository is properly initialized
      const gitStatus = await this.ensureGitRepository(projectPath, gitRepository, gitHubToken);
      
      if (!gitStatus.isInitialized) {
        throw new Error('Failed to initialize git repository');
      }

      // Configure git user if provided
      if (gitUserName && gitUserEmail) {
        console.log('[MCP Server] Configuring git user...');
        await execAsync(`git config user.name "${gitUserName}"`, { cwd: projectPath });
        await execAsync(`git config user.email "${gitUserEmail}"`, { cwd: projectPath });
        console.log('[MCP Server] ✅ Git user configured');
      }
      
      // Clean any stale lock files FIRST before any git operations
      console.log('[MCP Server] 🔧 Cleaning any existing lock files...');
      const lockCleaned = await this.cleanGitLockFiles(projectPath);
      if (!lockCleaned) {
        console.warn('[MCP Server] ⚠️ Could not clean git lock files, but proceeding anyway');
      }

      // Add delay to ensure all previous git operations are complete
      console.log('[MCP Server] ⏳ Waiting for git operations to settle...');
      await new Promise(resolve => setTimeout(resolve, 5000)); // Increased to 5 second delay
      console.log('[MCP Server] ✅ Ready to commit');

      // Verify no lock files exist before proceeding
      const lockFile = path.join(projectPath, '.git', 'index.lock');
      const lockExists = await fs.access(lockFile).then(() => true).catch(() => false);
      if (lockExists) {
        console.log('[MCP Server] ⚠️ Lock file still exists, attempting final cleanup...');
        await this.cleanGitLockFiles(projectPath);
      }

      // Use mutex to ensure sequential git operations
      return await this.withGitMutex(async () => {
        // Check if there are changes to commit BEFORE staging
        console.log('[MCP Server] Checking for changes to commit...');
        const { stdout: statusOutput } = await execAsync('git status --porcelain', { cwd: projectPath });
        
        if (!statusOutput.trim()) {
          console.log('[MCP Server] ℹ️ No changes to commit - skipping commit process');
          return { success: true, message: 'No changes to commit', changesCount: 0 };
        }

        // Count changes for logging
        const changesCount = statusOutput.trim().split('\n').length;
        console.log(`[MCP Server] 📝 Found ${changesCount} file(s) with changes`);
        
        // Stage all changes
        console.log('[MCP Server] Staging changes...');
        await execAsync('git add .', { cwd: projectPath });
        console.log('[MCP Server] ✅ Changes staged');
        
        // Commit changes - truncate message to 20 characters to prevent Windows command line length errors
        const truncatedMessage = commitMessage.substring(0, 20);
        const escapedMessage = truncatedMessage.replace(/"/g, '\\"');
        console.log('[MCP Server] Creating commit...');
        await execAsync(`git commit -m "${escapedMessage}"`, { cwd: projectPath });
        console.log('[MCP Server] ✅ Commit created');
        
        // Only attempt to push if remote exists
        if (!gitStatus.hasRemote) {
          console.log('[MCP Server] ⚠️ No remote repository configured - skipping push');
          return { 
            success: true, 
            message: 'Commit created successfully, but no remote repository configured for push', 
            changesCount 
          };
        }

        // Get remote URL and authenticate
        console.log('[MCP Server] Preparing to push to remote...');
        const { stdout: remoteUrl } = await execAsync('git remote get-url origin', { cwd: projectPath });
        const cleanUrl = remoteUrl.trim();
        
        if (cleanUrl.startsWith('https://')) {
          // Sanitize URL to remove any existing credentials
          const sanitizedUrl = this.sanitizeGitUrl(cleanUrl);
          const authenticatedUrl = sanitizedUrl.replace('https://', `https://${gitHubToken}@`);
          
          // Validate URL to detect malformed URLs early
          const atCount = (authenticatedUrl.match(/@/g) || []).length;
          if (authenticatedUrl.includes('@@') || atCount > 1) {
            throw new Error(`Malformed git URL detected after authentication. URL has ${atCount} @ symbols. This usually indicates token duplication.`);
          }
          
          await execAsync(`git remote set-url origin "${authenticatedUrl}"`, { cwd: projectPath });
          console.log('[MCP Server] ✅ Remote URL authenticated');
        }
        
        // Detect current branch name
        console.log('[MCP Server] Detecting current branch...');
        const { stdout: currentBranch } = await execAsync('git branch --show-current', { cwd: projectPath });
        let branchName = currentBranch.trim() || 'main'; // fallback to 'main' if detection fails
        console.log(`[MCP Server] Current branch: ${branchName}`);
        
        // If local branch doesn't match remote default, try to align
        if (gitStatus.hasRemote) {
          try {
            const { stdout: remoteBranches } = await execAsync('git ls-remote --heads origin', { cwd: projectPath });
            const hasMain = remoteBranches.includes('refs/heads/main');
            const hasMaster = remoteBranches.includes('refs/heads/master');
            
            // If we're on master but remote has main, switch to main
            if (branchName === 'master' && hasMain && !hasMaster) {
              console.log('[MCP Server] Remote uses main branch, aligning local branch...');
              await execAsync('git branch -M main', { cwd: projectPath });
              const { stdout: newBranch } = await execAsync('git branch --show-current', { cwd: projectPath });
              branchName = newBranch.trim(); // Update branchName variable after rename
              console.log(`[MCP Server] Aligned to branch: ${branchName}`);
              
              // Sync with remote before pushing
              await this.syncWithRemote(projectPath, branchName, isInitialCommit);
              
              // Push to main branch
              console.log('[MCP Server] Pushing to remote repository (main)...');
              await execAsync('git push -u origin main', { cwd: projectPath });
              
              console.log('[MCP Server] ✅ Successfully committed and pushed changes');
              return { 
                success: true, 
                message: 'Successfully committed and pushed changes', 
                changesCount 
              };
            }
          } catch (lsRemoteError) {
            console.warn('[MCP Server] Could not check remote branches, proceeding with current branch');
          }
        }
        
        // Sync with remote before pushing
        await this.syncWithRemote(projectPath, branchName, isInitialCommit);
        
        // Push to detected branch
        console.log(`[MCP Server] Pushing to remote repository (${branchName})...`);
        await execAsync(`git push -u origin ${branchName}`, { cwd: projectPath });
        
        console.log('[MCP Server] ✅ Successfully committed and pushed changes');
        return { 
          success: true, 
          message: 'Successfully committed and pushed changes', 
          changesCount 
        };
      });
    } catch (error) {
      console.error('[MCP Server] ❌ Git operation failed:', error);
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Check if this is a GitHub secret scanning error
      const isSecretScanningError = errorMessage.includes('GITHUB PUSH PROTECTION') ||
                                   errorMessage.includes('Push cannot contain secrets') ||
                                   errorMessage.includes('.git-config.json');
      
      if (isSecretScanningError && retryCount === 0) {
        console.log('[MCP Server] 🔒 GitHub detected secrets in commit - attempting cleanup...');
        
        try {
          // Ensure .gitignore has the sensitive files
          await this.ensureGitignore(projectPath);
          
          // Remove the sensitive file from git tracking
          await execAsync('git rm --cached .git-config.json', { cwd: projectPath }).catch(() => {});
          await execAsync('git rm --cached .cursor-fix-prompt.tmp', { cwd: projectPath }).catch(() => {});
          
          // Amend the commit to remove these files
          await execAsync('git commit --amend --no-edit', { cwd: projectPath }).catch(() => {});
          
          console.log('[MCP Server] 🔄 Retrying push after removing secrets...');
          return await this.commitAndPush(projectPath, commitMessage, gitHubToken, gitUserName, gitUserEmail, gitRepository, retryCount + 1, isInitialCommit);
        } catch (cleanupError) {
          console.error('[MCP Server] ❌ Failed to cleanup secrets:', cleanupError);
          return { 
            success: false, 
            message: 'Push blocked by GitHub: Repository contains secrets. Please manually remove .git-config.json from git history and add it to .gitignore.' 
          };
        }
      }
      
      // Check if this is a "fetch first" or "non-fast-forward" error
      const needsPull = errorMessage.includes('fetch first') || 
                       errorMessage.includes('[rejected]') ||
                       errorMessage.includes('non-fast-forward') ||
                       errorMessage.includes('Updates were rejected');
      
      if (needsPull && retryCount === 0) {
        console.log('[MCP Server] 🔄 Remote has changes, pulling before push...');
        
        try {
          // Detect current branch
          const { stdout: currentBranch } = await execAsync('git branch --show-current', { cwd: projectPath });
          const branch = currentBranch.trim() || 'main';
          
          // Try pull with rebase and allow unrelated histories
          try {
            await execAsync(`git pull --rebase origin ${branch} --allow-unrelated-histories`, { cwd: projectPath });
            console.log('[MCP Server] ✅ Successfully pulled with rebase');
          } catch (rebaseError) {
            // If rebase fails, try regular merge
            console.log('[MCP Server] Rebase failed, trying merge...');
            await execAsync(`git pull origin ${branch} --allow-unrelated-histories`, { cwd: projectPath });
            console.log('[MCP Server] ✅ Successfully pulled with merge');
          }
          
          console.log('[MCP Server] 🔄 Retrying push after sync...');
          return await this.commitAndPush(projectPath, commitMessage, gitHubToken, gitUserName, gitUserEmail, gitRepository, retryCount + 1, false); // Not initial commit anymore after sync
        } catch (pullError) {
          console.error('[MCP Server] ❌ Failed to pull remote changes:', pullError);
          return { 
            success: false, 
            message: `Failed to sync with remote: ${pullError instanceof Error ? pullError.message : 'Unknown error'}` 
          };
        }
      }
      
      // Check if this is a lock file error
      const isLockFileError = errorMessage.includes('index.lock') || 
                             errorMessage.includes('unable to create');
      
      // Determine if error is transient (retryable)
      const isTransientError = isLockFileError || 
                              (!errorMessage.includes('No changes to commit') && 
                               !errorMessage.includes('Git repository initialization failed') &&
                               !errorMessage.includes('no remote repository configured') &&
                               !errorMessage.includes('GITHUB PUSH PROTECTION') && // Don't retry secret scanning after first attempt
                               !errorMessage.includes('src refspec') &&
                               !errorMessage.includes('does not match any') &&
                               !needsPull); // Don't treat pull errors as transient
      
      // Exponential backoff retry logic: 2s, 4s, 8s
      const maxRetries = 3;
      if (retryCount < maxRetries && isTransientError) {
        const delayMs = Math.pow(2, retryCount + 1) * 1000; // 2s, 4s, 8s
        console.warn(`[MCP Server] ⚠️ Transient error detected, retrying in ${delayMs/1000}s... (attempt ${retryCount + 1}/${maxRetries})`);
        
        // If lock file error, try to clean it
        if (isLockFileError) {
          console.log('[MCP Server] 🔧 Attempting to clean lock files...');
          await this.cleanGitLockFiles(projectPath);
        }
        
        await new Promise(resolve => setTimeout(resolve, delayMs));
        return await this.commitAndPush(projectPath, commitMessage, gitHubToken, gitUserName, gitUserEmail, gitRepository, retryCount + 1, isInitialCommit);
      } else {
        const finalError = isTransientError ? 
          `Commit/push failed after ${maxRetries} retries: ${errorMessage}` : 
          `Commit/push failed: ${errorMessage}`;
        console.error(`[MCP Server] ❌ ${finalError}`);
        return { success: false, message: finalError };
      }
    }
  }

  private async getRemoteUrl(projectPath: string): Promise<string | null> {
    try {
      const { stdout } = await execAsync('git remote get-url origin', { cwd: projectPath });
      return stdout.trim();
    } catch {
      return null;
    }
  }

  private async ensureGitRepository(
    projectPath: string,
    gitRepository?: string,
    gitHubToken?: string
  ): Promise<{ isInitialized: boolean; hasRemote: boolean; remoteUrl?: string }> {
    try {
      // Check if .git directory exists
      const gitDir = path.join(projectPath, '.git');
      const gitExists = await fs.access(gitDir).then(() => true).catch(() => false);
      
      if (!gitExists) {
        console.log('[MCP Server] Git repository not found, initializing...');
        await execAsync('git init', { cwd: projectPath });
        console.log('[MCP Server] ✅ Git repository initialized');
      } else {
        console.log('[MCP Server] Git repository already exists');
      }

      // Ensure .git-config.json is in .gitignore BEFORE any commits
      await this.ensureGitignore(projectPath);

      // Check if remote origin exists
      let hasRemote = false;
      let remoteUrl: string | undefined;
      
      try {
        const { stdout: remoteUrlOutput } = await execAsync('git remote get-url origin', { cwd: projectPath });
        remoteUrl = remoteUrlOutput.trim();
        hasRemote = true;
        console.log('[MCP Server] Remote origin found:', remoteUrl);
      } catch {
        console.log('[MCP Server] No remote origin found');
        
        // Set up remote if gitRepository is provided
        if (gitRepository) {
          await execAsync(`git remote add origin ${gitRepository}`, { cwd: projectPath });
          hasRemote = true;
          remoteUrl = gitRepository;
          console.log('[MCP Server] ✅ Remote origin added:', gitRepository);
        }
      }

      return {
        isInitialized: true,
        hasRemote,
        remoteUrl
      };
    } catch (error) {
      console.error('[MCP Server] ❌ Failed to ensure git repository:', error);
      throw new Error(`Git repository initialization failed: ${error}`);
    }
  }

  private async ensureGitignore(projectPath: string): Promise<void> {
    try {
      const gitignorePath = path.join(projectPath, '.gitignore');
      const entriesToIgnore = [
        '.git-config.json',
        '.cursor-fix-prompt.tmp',
        'cursor-prompt.tmp'
      ];
      
      let gitignoreContent = '';
      
      // Read existing .gitignore if it exists
      try {
        gitignoreContent = await fs.readFile(gitignorePath, 'utf-8');
      } catch {
        // .gitignore doesn't exist, will create it
        console.log('[MCP Server] Creating .gitignore file...');
      }
      
      // Check if entries are already present and add missing ones
      const lines = gitignoreContent.split('\n');
      let modified = false;
      
      for (const entry of entriesToIgnore) {
        if (!lines.some(line => line.trim() === entry)) {
          lines.push(entry);
          modified = true;
          console.log(`[MCP Server] Adding ${entry} to .gitignore`);
        }
      }
      
      // Write back if modified
      if (modified) {
        await fs.writeFile(gitignorePath, lines.join('\n'), 'utf-8');
        console.log('[MCP Server] ✅ .gitignore updated');
      }
    } catch (error) {
      console.error('[MCP Server] ⚠️ Failed to update .gitignore:', error);
      // Don't throw - this is not critical enough to stop the process
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

  // TAILWIND V3 VALIDATION METHODS
  private async validateAndFixTailwindV3(projectPath: string): Promise<void> {
    console.log('[MCP Server] 🔍 Validating Tailwind v3 setup...');
    
    try {
      // 1. Check package.json
      await this.validateTailwindV3Dependencies(projectPath);
      
      // 2. Validate and create config files
      await this.validateTailwindConfig(projectPath);
      await this.validatePostCSSConfig(projectPath);
      
      // 3. Validate and fix CSS
      await this.validateAndFixV3CSS(projectPath);
      
      // 4. Validate vite.config.ts
      await this.validateViteConfigV3(projectPath);
      
      console.log('[MCP Server] ✅ Tailwind v3 validation complete');
    } catch (error) {
      console.error('[MCP Server] ❌ Tailwind v3 validation failed:', error);
      throw error;
    }
  }

  private async validateTailwindV3Dependencies(projectPath: string): Promise<void> {
    const packageJsonPath = path.join(projectPath, 'package.json');
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
    
    // Check for correct v3 dependencies
    const hasTailwindV3 = packageJson.devDependencies?.['tailwindcss']?.includes('3');
    const hasPostCSS = packageJson.devDependencies?.['postcss'];
    const hasAutoprefixer = packageJson.devDependencies?.['autoprefixer'];
    
    if (!hasTailwindV3 || !hasPostCSS || !hasAutoprefixer) {
      console.log('[MCP Server] ⚠️ Fixing Tailwind v3 dependencies...');
      await this.fixTailwindV3Dependencies(projectPath);
    } else {
      console.log('[MCP Server] ✅ Tailwind v3 dependencies validated');
    }
  }

  private async fixTailwindV3Dependencies(projectPath: string): Promise<void> {
    const packageJsonPath = path.join(projectPath, 'package.json');
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
    
    // Remove v4 dependencies
    delete packageJson.devDependencies?.tailwindcss;
    delete packageJson.devDependencies?.['@tailwindcss/postcss'];
    delete packageJson.devDependencies?.['@tailwindcss/typography'];
    delete packageJson.devDependencies?.['@tailwindcss/forms'];
    
    // Add correct v3 dependencies
    packageJson.devDependencies = {
      ...packageJson.devDependencies,
      'tailwindcss': '^3.4.0',
      'postcss': '^8.4.0',
      'autoprefixer': '^10.4.0'
    };
    
    await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));
    
    // Run npm install
    await execAsync('npm install', { cwd: projectPath });
    console.log('[MCP Server] ✅ Tailwind v3 dependencies installed');
  }

  private async validateTailwindConfig(projectPath: string): Promise<void> {
    const configPath = path.join(projectPath, 'tailwind.config.js');
    
    try {
      await fs.access(configPath);
      console.log('[MCP Server] ✅ tailwind.config.js exists');
    } catch {
      console.log('[MCP Server] ⚠️ Creating tailwind.config.js...');
      await this.createTailwindConfig(projectPath);
    }
  }

  private async createTailwindConfig(projectPath: string): Promise<void> {
    const configPath = path.join(projectPath, 'tailwind.config.js');
    const configContent = `/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: 'rgb(var(--primary))',
          foreground: 'rgb(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'rgb(var(--secondary))',
          foreground: 'rgb(var(--secondary-foreground))',
        },
        accent: {
          DEFAULT: 'rgb(var(--accent))',
          foreground: 'rgb(var(--accent-foreground))',
        },
        background: 'rgb(var(--background))',
        foreground: 'rgb(var(--foreground))',
        card: {
          DEFAULT: 'rgb(var(--card))',
          foreground: 'rgb(var(--card-foreground))',
        },
        border: 'rgb(var(--border))',
        input: 'rgb(var(--input))',
        ring: 'rgb(var(--ring))',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      borderRadius: {
        lg: '0.75rem',
      },
      boxShadow: {
        card: '0 2px 8px rgba(0, 0, 0, 0.1)',
      },
    },
  },
  plugins: [],
}`;
    
    await fs.writeFile(configPath, configContent);
    console.log('[MCP Server] ✅ tailwind.config.js created');
  }

  private async validatePostCSSConfig(projectPath: string): Promise<void> {
    const configPath = path.join(projectPath, 'postcss.config.js');
    
    try {
      await fs.access(configPath);
      console.log('[MCP Server] ✅ postcss.config.js exists');
    } catch {
      console.log('[MCP Server] ⚠️ Creating postcss.config.js...');
      await this.createPostCSSConfig(projectPath);
    }
  }

  private async createPostCSSConfig(projectPath: string): Promise<void> {
    const configPath = path.join(projectPath, 'postcss.config.js');
    const configContent = `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}`;
    
    await fs.writeFile(configPath, configContent);
    console.log('[MCP Server] ✅ postcss.config.js created');
  }

  private async validateAndFixV3CSS(projectPath: string): Promise<void> {
    const cssPath = path.join(projectPath, 'src/index.css');
    let cssContent = await fs.readFile(cssPath, 'utf-8');
    
    // Check for v4 syntax and convert to v3
    if (cssContent.includes('@import "tailwindcss"') || cssContent.includes('@theme')) {
      console.log('[MCP Server] ⚠️ Converting CSS from v4 to v3 syntax...');
      
      // Replace v4 syntax with v3 syntax
      cssContent = cssContent
        .replace(/@import "tailwindcss";\s*/g, '')
        .replace(/@theme\s*\{[^}]*\}/g, '');
      
      // Ensure v3 directives are present
      if (!cssContent.includes('@tailwind base')) {
        cssContent = '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n\n' + cssContent;
      }
      
      // Add font import if not present
      if (!cssContent.includes('@import url')) {
        cssContent = cssContent.replace(
          '@tailwind utilities;',
          `@tailwind utilities;

@import url('https://fonts.googleapis.com/css2?family=Inter:wght@100;200;300;400;500;600;700;800;900&display=swap');`
        );
      }
      
      // Add base layer if not present
      if (!cssContent.includes('@layer base')) {
        cssContent += `

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground font-sans;
  }
}`;
      }
      
      await fs.writeFile(cssPath, cssContent);
    }
    
    // Validate v3 structure
    this.validateV3CSSStructure(cssContent);
    console.log('[MCP Server] ✅ CSS v3 structure validated');
  }

  private validateV3CSSStructure(cssContent: string): void {
    const requiredElements = [
      '@tailwind base',
      '@tailwind components',
      '@tailwind utilities'
    ];
    
    const missing = requiredElements.filter(element => !cssContent.includes(element));
    
    if (missing.length > 0) {
      throw new Error(`CSS missing required v3 structure: ${missing.join(', ')}`);
    }
    
    // Check for forbidden v4 elements
    const forbiddenElements = ['@import "tailwindcss"', '@theme'];
    const found = forbiddenElements.filter(element => cssContent.includes(element));
    
    if (found.length > 0) {
      throw new Error(`CSS contains forbidden v4 syntax: ${found.join(', ')}`);
    }
  }

  private async validateViteConfigV3(projectPath: string): Promise<void> {
    const viteConfigPath = path.join(projectPath, 'vite.config.ts');
    let viteConfig = await fs.readFile(viteConfigPath, 'utf-8');
    
    // Remove v4 PostCSS configuration
    if (viteConfig.includes('@tailwindcss/postcss')) {
      console.log('[MCP Server] ⚠️ Removing v4 PostCSS config from vite.config.ts...');
      
      // Remove the import
      viteConfig = viteConfig.replace(
        /import tailwindcss from '@tailwindcss\/postcss'\s*\n?/g,
        ''
      );
      
      // Remove the PostCSS configuration
      viteConfig = viteConfig.replace(
        /,\s*css:\s*\{\s*postcss:\s*\{\s*plugins:\s*\[tailwindcss\(\)\]\s*\}\s*\}/g,
        ''
      );
      
      await fs.writeFile(viteConfigPath, viteConfig);
    }
    
    console.log('[MCP Server] ✅ Vite config v3 validated');
  }

  private generateThemeForProject(projectDescription: string): object {
    // Analyze project description to suggest appropriate colors
    const themes = {
      business: {
        primary: {
          DEFAULT: '#1e40af',
          foreground: '#ffffff'
        },
        secondary: {
          DEFAULT: '#64748b',
          foreground: '#ffffff'
        },
        accent: {
          DEFAULT: '#059669',
          foreground: '#ffffff'
        },
        background: '#ffffff',
        foreground: '#1e293b'
      },
      creative: {
        primary: {
          DEFAULT: '#7c3aed',
          foreground: '#ffffff'
        },
        secondary: {
          DEFAULT: '#ec4899',
          foreground: '#ffffff'
        },
        accent: {
          DEFAULT: '#f59e0b',
          foreground: '#ffffff'
        },
        background: '#fefefe',
        foreground: '#1e293b'
      },
      healthcare: {
        primary: {
          DEFAULT: '#059669',
          foreground: '#ffffff'
        },
        secondary: {
          DEFAULT: '#0d9488',
          foreground: '#ffffff'
        },
        accent: {
          DEFAULT: '#dc2626',
          foreground: '#ffffff'
        },
        background: '#ffffff',
        foreground: '#1e293b'
      },
      finance: {
        primary: {
          DEFAULT: '#1f2937',
          foreground: '#ffffff'
        },
        secondary: {
          DEFAULT: '#6b7280',
          foreground: '#ffffff'
        },
        accent: {
          DEFAULT: '#059669',
          foreground: '#ffffff'
        },
        background: '#ffffff',
        foreground: '#1e293b'
      },
      default: {
        primary: {
          DEFAULT: '#3b82f6',
          foreground: '#ffffff'
        },
        secondary: {
          DEFAULT: '#64748b',
          foreground: '#ffffff'
        },
        accent: {
          DEFAULT: '#f59e0b',
          foreground: '#ffffff'
        },
        background: '#ffffff',
        foreground: '#1e293b'
      }
    };
    
    // Simple keyword matching to suggest theme
    const description = projectDescription.toLowerCase();
    let selectedTheme = themes.default;
    
    if (description.includes('business') || description.includes('corporate')) {
      selectedTheme = themes.business;
    } else if (description.includes('creative') || description.includes('design') || description.includes('art')) {
      selectedTheme = themes.creative;
    } else if (description.includes('health') || description.includes('medical')) {
      selectedTheme = themes.healthcare;
    } else if (description.includes('finance') || description.includes('banking') || description.includes('money')) {
      selectedTheme = themes.finance;
    }
    
    return selectedTheme;
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

  async processMessage(message: any) {
    try {
      console.log('[MCP Server] Processing message:', message);
      
      if (message.type === 'request' && message.method) {
        const toolName = message.method;
        const args = message.params || {};
        
        // Debug logging for design_pattern at message level
        console.log('[MCP Server] Message level args keys:', Object.keys(args));
        console.log('[MCP Server] Message level args size:', JSON.stringify(args).length);
        console.log('[MCP Server] Message level design_pattern:', (args as any).design_pattern);
        console.log('[MCP Server] Message level designPattern:', (args as any).designPattern);
        console.log('[MCP Server] Message level design_pattern_summary:', (args as any).design_pattern_summary);
        console.log('[MCP Server] Message level design_pattern_details:', (args as any).design_pattern_details);
        console.log('[MCP Server] Message level design_color_palette:', (args as any).design_color_palette);
        console.log('[MCP Server] Message level design_typography_layout:', (args as any).design_typography_layout);
        console.log('[MCP Server] Message level design_key_elements:', (args as any).design_key_elements);
        console.log('[MCP Server] Message level design_philosophy:', (args as any).design_philosophy);
        console.log('[MCP Server] Message level design_reference:', (args as any).design_reference);
        console.log('[MCP Server] Message level design_pattern_id:', (args as any).design_pattern_id);
        console.log('[MCP Server] Message level design_pattern_store:', (args as any).design_pattern_store);
        
        console.log('[MCP Server] Tool call:', toolName, 'with args:', args);
        
        // Validate arguments based on tool type
        let validatedArgs;
        switch (toolName) {
          case 'cursor/create-project':
            validatedArgs = this.validateCreateProjectArgs(args);
            break;
          case 'cursor/store-design-pattern':
            // No validation needed for store-design-pattern, args are used directly
            validatedArgs = args;
            break;
          case 'cursor/execute-prompt':
            validatedArgs = this.validateExecutePromptArgs(args);
            break;
          case 'cursor/get-project-state':
          case 'cursor/build-project':
          case 'cursor/run-tests':
          case 'cursor/check-project':
            validatedArgs = this.validateProjectPathArgs(args);
            break;
          case 'cursor/get-files':
            validatedArgs = this.validateGetFilesArgs(args);
            break;
          case 'cursor/server-info':
            validatedArgs = {};
            break;
          default:
            throw new Error(`Unknown tool: ${toolName}`);
        }
        
        const handler = this.toolHandlers.get(toolName);
        if (!handler) {
          throw new Error(`Unknown tool: ${toolName}`);
        }
        
        const result = await handler(validatedArgs);
        
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
              name: 'cursor/store-design-pattern',
              description: 'Store a design pattern temporarily on the server'
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

  // NEW: stdio server for Cursor integration
  async run() {
    console.error('Starting ScopesFlow Cursor MCP Server on stdio');
    
    // For now, just log that stdio mode is not yet implemented
    // TODO: Implement proper stdio integration with MCP SDK
    console.error('stdio mode not yet implemented - using WebSocket mode instead');
    
    // Fallback to WebSocket mode for now
    await this.runWebSocket();
  }

  async stop() {
    if (this.wss) {
      this.wss.close();
      console.error('WebSocket server stopped');
    }
  }
}

// Only start the server if this file is run directly (not imported as a module)
// For ES modules, check if we're being imported vs run directly
// Also check if we're in a Netlify Function environment
const isNetlifyFunction = process.env.NETLIFY_DEV || process.env.NETLIFY_FUNCTION_TARGET || process.env.AWS_LAMBDA_FUNCTION_NAME;
const isRunDirectly = process.argv[1]?.includes('server.ts') || process.argv[1]?.includes('server.js');

if (isRunDirectly && !isNetlifyFunction) {
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

  // Determine server mode based on command line arguments
  const args = process.argv.slice(2);
  const mode = args.includes('--cursor') ? 'cursor' : 'websocket';

  if (mode === 'cursor') {
    // Start stdio server for Cursor integration
    console.error('Starting MCP server in Cursor mode (stdio)...');
    server.run().catch(console.error);
  } else {
    // Start WebSocket server for ScopesFlow integration
    console.error('Starting MCP server in WebSocket mode...');
    server.runWebSocket().catch(console.error);
  }
}








