# Migration Data Flow Example

## Complete End-to-End Example

This document shows exactly how migration data flows from the MCP server to your application.

## 1. MCP Client Setup (Your Application)

```typescript
// app/services/mcp-client.ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

class MCPClient {
  private client: Client;
  private transport: StdioClientTransport;

  async connect() {
    // Connect to MCP server via stdio
    this.transport = new StdioClientTransport({
      command: 'node',
      args: ['path/to/scopesflow-mcp-server/dist/server.js', '--cursor']
    });

    this.client = new Client({
      name: 'scopesflow-app',
      version: '1.0.0'
    }, {
      capabilities: {}
    });

    await this.client.connect(this.transport);
  }

  async executePrompt(args: {
    projectPath: string;
    prompt: string;
    isFirstPrompt?: boolean;
  }) {
    const result = await this.client.request({
      method: 'tools/call',
      params: {
        name: 'cursor/execute-prompt',
        arguments: args
      }
    });

    return JSON.parse(result.content[0].text);
  }
}

export const mcpClient = new MCPClient();
```

## 2. Making the Request

```typescript
// app/services/project-builder.ts
import { mcpClient } from './mcp-client';

async function buildFeature(projectPath: string, featureDescription: string) {
  console.log('🚀 Building feature:', featureDescription);

  // Call MCP server
  const result = await mcpClient.executePrompt({
    projectPath: projectPath,
    prompt: featureDescription,
    isFirstPrompt: false
  });

  console.log('✅ MCP execution complete');
  console.log('📊 Files changed:', result.filesChanged.length);
  
  // NEW: Check for migrations
  if (result.hasMigrations) {
    console.log('🗄️ Database migrations detected:', result.migrations.length);
    return result;
  }

  return result;
}
```

## 3. What MCP Server Returns

### Example Response (Actual JSON Structure)

```json
{
  "success": true,
  "output": "Cursor Agent executed successfully. Modified 8 file(s). Created 2 database migration(s).\n\n[Cursor output truncated...]",
  "error": null,
  "filesChanged": [
    "supabase/migrations/20241013120000_create_posts_table.sql",
    "supabase/migrations/20241013120000_create_posts_table.meta.json",
    "supabase/migrations/20241013123000_create_comments_table.sql",
    "supabase/migrations/20241013123000_create_comments_table.meta.json",
    "src/types/database/posts.ts",
    "src/types/database/comments.ts",
    "src/api/posts.ts",
    "src/api/comments.ts",
    "src/hooks/usePosts.ts",
    "src/hooks/useComments.ts"
  ],
  "timeElapsed": 45230,
  "cursorOutput": "[Full cursor-agent output...]",
  "hasMigrations": true,
  "migrations": [
    {
      "filename": "20241013120000_create_posts_table.sql",
      "sql": "-- =====================================================\n-- Migration: Create posts table\n-- Created: 2024-10-13T12:00:00Z\n-- Tables: posts\n-- Purpose: Store user blog posts\n-- =====================================================\n\nCREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";\n\nCREATE OR REPLACE FUNCTION update_updated_at_column()\nRETURNS TRIGGER AS $$\nBEGIN\n  NEW.updated_at = NOW();\n  RETURN NEW;\nEND;\n$$ LANGUAGE plpgsql;\n\nCREATE TABLE IF NOT EXISTS posts (\n  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,\n  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,\n  title TEXT NOT NULL,\n  content TEXT,\n  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),\n  metadata JSONB DEFAULT '{}'::jsonb,\n  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,\n  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,\n  CONSTRAINT posts_title_not_empty CHECK (length(trim(title)) > 0)\n);\n\nCREATE INDEX IF NOT EXISTS posts_user_id_idx ON posts(user_id);\nCREATE INDEX IF NOT EXISTS posts_created_at_idx ON posts(created_at DESC);\nCREATE INDEX IF NOT EXISTS posts_status_idx ON posts(status) WHERE status != 'deleted';\n\nDROP TRIGGER IF EXISTS update_posts_updated_at ON posts;\nCREATE TRIGGER update_posts_updated_at\n  BEFORE UPDATE ON posts\n  FOR EACH ROW\n  EXECUTE FUNCTION update_updated_at_column();\n\nALTER TABLE posts ENABLE ROW LEVEL SECURITY;\n\nCREATE POLICY \"posts_select_own\"\n  ON posts FOR SELECT\n  USING (auth.uid() = user_id);\n\nCREATE POLICY \"posts_insert_own\"\n  ON posts FOR INSERT\n  WITH CHECK (auth.uid() = user_id);\n\nCREATE POLICY \"posts_update_own\"\n  ON posts FOR UPDATE\n  USING (auth.uid() = user_id)\n  WITH CHECK (auth.uid() = user_id);\n\nCREATE POLICY \"posts_delete_own\"\n  ON posts FOR DELETE\n  USING (auth.uid() = user_id);\n\nCOMMENT ON TABLE posts IS 'User blog posts with rich content';\nCOMMENT ON COLUMN posts.id IS 'Primary key (UUID v4)';\nCOMMENT ON COLUMN posts.user_id IS 'Owner of this record (references auth.users)';\n\n-- ROLLBACK: DROP TABLE IF EXISTS posts CASCADE;",
      "metadata": {
        "migration_name": "20241013120000_create_posts_table",
        "created_at": "2024-10-13T12:00:00Z",
        "description": "Create posts table for user blog posts",
        "tables_created": ["posts"],
        "tables_modified": [],
        "tables_deleted": [],
        "breaking_changes": false,
        "rollback_sql": "DROP TABLE IF EXISTS posts CASCADE;",
        "estimated_rows": 0,
        "requires_downtime": false
      },
      "timestamp": "20241013120000",
      "description": "create posts table"
    },
    {
      "filename": "20241013123000_create_comments_table.sql",
      "sql": "-- =====================================================\n-- Migration: Create comments table\n-- Created: 2024-10-13T12:30:00Z\n-- Tables: comments\n-- Purpose: Store user comments on posts\n-- =====================================================\n\nCREATE TABLE IF NOT EXISTS comments (\n  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,\n  post_id UUID REFERENCES posts(id) ON DELETE CASCADE NOT NULL,\n  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,\n  content TEXT NOT NULL,\n  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,\n  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,\n  CONSTRAINT comments_content_not_empty CHECK (length(trim(content)) > 0)\n);\n\nCREATE INDEX IF NOT EXISTS comments_post_id_idx ON comments(post_id);\nCREATE INDEX IF NOT EXISTS comments_user_id_idx ON comments(user_id);\nCREATE INDEX IF NOT EXISTS comments_created_at_idx ON comments(created_at DESC);\n\nDROP TRIGGER IF EXISTS update_comments_updated_at ON comments;\nCREATE TRIGGER update_comments_updated_at\n  BEFORE UPDATE ON comments\n  FOR EACH ROW\n  EXECUTE FUNCTION update_updated_at_column();\n\nALTER TABLE comments ENABLE ROW LEVEL SECURITY;\n\nCREATE POLICY \"comments_select_all\"\n  ON comments FOR SELECT\n  USING (true);\n\nCREATE POLICY \"comments_insert_own\"\n  ON comments FOR INSERT\n  WITH CHECK (auth.uid() = user_id);\n\nCREATE POLICY \"comments_update_own\"\n  ON comments FOR UPDATE\n  USING (auth.uid() = user_id);\n\nCREATE POLICY \"comments_delete_own\"\n  ON comments FOR DELETE\n  USING (auth.uid() = user_id);\n\nCOMMENT ON TABLE comments IS 'User comments on blog posts';",
      "metadata": {
        "migration_name": "20241013123000_create_comments_table",
        "created_at": "2024-10-13T12:30:00Z",
        "description": "Create comments table for post discussions",
        "tables_created": ["comments"],
        "tables_modified": [],
        "tables_deleted": [],
        "breaking_changes": false,
        "rollback_sql": "DROP TABLE IF EXISTS comments CASCADE;",
        "estimated_rows": 0,
        "requires_downtime": false
      },
      "timestamp": "20241013123000",
      "description": "create comments table"
    }
  ]
}
```

## 4. Processing Migrations in Your App

### React Example (Frontend)

```typescript
// app/components/MigrationReview.tsx
import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';

interface Migration {
  filename: string;
  sql: string;
  metadata?: {
    description: string;
    tables_created: string[];
    breaking_changes: boolean;
    rollback_sql: string;
  };
  timestamp: string;
  description: string;
}

interface MigrationReviewProps {
  migrations: Migration[];
  onApprove: (migration: Migration) => Promise<void>;
  onReject: (migration: Migration) => void;
}

export function MigrationReview({ migrations, onApprove, onReject }: MigrationReviewProps) {
  const [deployingIndex, setDeployingIndex] = useState<number | null>(null);

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Review Database Migrations</h2>
      <p className="text-muted-foreground">
        {migrations.length} migration{migrations.length !== 1 ? 's' : ''} pending your approval
      </p>

      {migrations.map((migration, index) => (
        <Card key={migration.filename} className="p-6">
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold capitalize">
                  {migration.description}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {migration.filename}
                </p>
              </div>
              {migration.metadata?.breaking_changes && (
                <Alert variant="destructive">
                  <span className="text-sm">⚠️ Breaking Changes</span>
                </Alert>
              )}
            </div>

            {/* Metadata */}
            {migration.metadata && (
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium">Tables Created:</span>
                  <div className="text-muted-foreground">
                    {migration.metadata.tables_created.join(', ')}
                  </div>
                </div>
                <div>
                  <span className="font-medium">Timestamp:</span>
                  <div className="text-muted-foreground">
                    {new Date(migration.metadata.created_at).toLocaleString()}
                  </div>
                </div>
              </div>
            )}

            {/* SQL Preview */}
            <div>
              <span className="text-sm font-medium">SQL Preview:</span>
              <SyntaxHighlighter language="sql" className="text-xs">
                {migration.sql}
              </SyntaxHighlighter>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button
                onClick={async () => {
                  setDeployingIndex(index);
                  try {
                    await onApprove(migration);
                  } finally {
                    setDeployingIndex(null);
                  }
                }}
                disabled={deployingIndex !== null}
                className="bg-green-600 hover:bg-green-700"
              >
                {deployingIndex === index ? 'Deploying...' : '✓ Approve & Deploy'}
              </Button>
              <Button
                variant="outline"
                onClick={() => onReject(migration)}
                disabled={deployingIndex !== null}
              >
                ✗ Reject
              </Button>
              {migration.metadata?.rollback_sql && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    navigator.clipboard.writeText(migration.metadata!.rollback_sql);
                  }}
                  className="ml-auto"
                >
                  📋 Copy Rollback SQL
                </Button>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
```

### Using the Component

```typescript
// app/pages/ProjectBuilder.tsx
import { useState } from 'react';
import { mcpClient } from '@/services/mcp-client';
import { MigrationReview } from '@/components/MigrationReview';
import { deployMigration } from '@/services/supabase-deployment';

export function ProjectBuilderPage() {
  const [migrations, setMigrations] = useState<any[]>([]);
  const [showReview, setShowReview] = useState(false);

  const handleBuildFeature = async (prompt: string) => {
    // Execute via MCP
    const result = await mcpClient.executePrompt({
      projectPath: './my-project',
      prompt: prompt,
      isFirstPrompt: false
    });

    // Check for migrations
    if (result.hasMigrations) {
      setMigrations(result.migrations);
      setShowReview(true);
    }
  };

  const handleApproveMigration = async (migration: any) => {
    try {
      await deployMigration({
        sql: migration.sql,
        projectRef: 'your-project-ref',
        serviceKey: process.env.SUPABASE_SERVICE_KEY!
      });

      // Remove from pending list
      setMigrations(prev => prev.filter(m => m.filename !== migration.filename));
      
      // Show success toast
      toast.success(`Migration ${migration.description} deployed successfully!`);
    } catch (error) {
      toast.error(`Failed to deploy migration: ${error.message}`);
    }
  };

  const handleRejectMigration = (migration: any) => {
    setMigrations(prev => prev.filter(m => m.filename !== migration.filename));
    toast.info(`Migration ${migration.description} rejected`);
  };

  return (
    <div>
      {/* Your project builder UI */}
      <button onClick={() => handleBuildFeature('Add blog posts feature')}>
        Build Feature
      </button>

      {/* Migration Review Modal/Panel */}
      {showReview && migrations.length > 0 && (
        <MigrationReview
          migrations={migrations}
          onApprove={handleApproveMigration}
          onReject={handleRejectMigration}
        />
      )}
    </div>
  );
}
```

## 5. Deploying to Supabase

### Option 1: Using Supabase Management API

```typescript
// app/services/supabase-deployment.ts
interface DeploymentConfig {
  sql: string;
  projectRef: string;
  serviceKey: string;
}

export async function deployMigration(config: DeploymentConfig) {
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${config.projectRef}/database/query`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.serviceKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: config.sql
      })
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Supabase API error: ${error.message}`);
  }

  const result = await response.json();
  return result;
}
```

### Option 2: Batch Deployment

```typescript
// app/services/supabase-deployment.ts
export async function deployMigrationsBatch(
  migrations: Migration[],
  projectRef: string,
  serviceKey: string
) {
  const results = [];

  for (const migration of migrations) {
    try {
      console.log(`📤 Deploying: ${migration.description}`);
      
      const result = await deployMigration({
        sql: migration.sql,
        projectRef,
        serviceKey
      });

      results.push({
        migration: migration.filename,
        success: true,
        result
      });

      console.log(`✅ Deployed: ${migration.description}`);
    } catch (error) {
      console.error(`❌ Failed: ${migration.description}`, error);
      
      results.push({
        migration: migration.filename,
        success: false,
        error: error.message
      });

      // Stop on first error
      break;
    }
  }

  return results;
}
```

## 6. Tracking Applied Migrations

```typescript
// app/services/migration-tracker.ts
interface MigrationRecord {
  filename: string;
  appliedAt: Date;
  appliedBy: string;
  success: boolean;
  error?: string;
}

class MigrationTracker {
  private storage: MigrationRecord[] = [];

  async recordMigration(migration: Migration, success: boolean, error?: string) {
    const record: MigrationRecord = {
      filename: migration.filename,
      appliedAt: new Date(),
      appliedBy: 'current-user-id', // Get from auth
      success,
      error
    };

    this.storage.push(record);
    
    // Persist to your database
    await this.saveToDB(record);
  }

  async getAppliedMigrations(): Promise<MigrationRecord[]> {
    return this.storage;
  }

  async isMigrationApplied(filename: string): Promise<boolean> {
    return this.storage.some(r => r.filename === filename && r.success);
  }

  private async saveToDB(record: MigrationRecord) {
    // Save to your application database
    await fetch('/api/migrations/record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record)
    });
  }
}

export const migrationTracker = new MigrationTracker();
```

## 7. Complete Workflow Example

```typescript
// app/workflows/feature-builder.ts
import { mcpClient } from '@/services/mcp-client';
import { deployMigration } from '@/services/supabase-deployment';
import { migrationTracker } from '@/services/migration-tracker';
import { toast } from 'sonner';

export async function buildAndDeployFeature(
  projectPath: string,
  featureDescription: string,
  supabaseConfig: { projectRef: string; serviceKey: string }
) {
  console.log('🚀 Starting feature build:', featureDescription);

  // Step 1: Execute via MCP
  const result = await mcpClient.executePrompt({
    projectPath,
    prompt: featureDescription,
    isFirstPrompt: false
  });

  console.log('✅ Code generation complete');
  console.log(`📝 Modified ${result.filesChanged.length} files`);

  // Step 2: Handle migrations if any
  if (result.hasMigrations) {
    console.log(`🗄️ Found ${result.migrations.length} database migrations`);

    for (const migration of result.migrations) {
      // Check if already applied
      const isApplied = await migrationTracker.isMigrationApplied(migration.filename);
      if (isApplied) {
        console.log(`⏭️ Skipping already applied: ${migration.filename}`);
        continue;
      }

      // Show to user for approval
      const approved = await showMigrationReviewDialog({
        title: migration.description,
        sql: migration.sql,
        tables: migration.metadata?.tables_created || [],
        breakingChanges: migration.metadata?.breaking_changes || false
      });

      if (!approved) {
        console.log(`❌ Migration rejected: ${migration.filename}`);
        toast.error(`Migration ${migration.description} was rejected`);
        continue;
      }

      // Deploy to Supabase
      try {
        console.log(`📤 Deploying: ${migration.filename}`);
        
        await deployMigration({
          sql: migration.sql,
          projectRef: supabaseConfig.projectRef,
          serviceKey: supabaseConfig.serviceKey
        });

        // Record successful deployment
        await migrationTracker.recordMigration(migration, true);

        console.log(`✅ Deployed: ${migration.filename}`);
        toast.success(`Migration ${migration.description} deployed!`);
      } catch (error) {
        console.error(`❌ Deployment failed: ${migration.filename}`, error);
        
        // Record failed deployment
        await migrationTracker.recordMigration(
          migration,
          false,
          error.message
        );

        toast.error(`Failed to deploy ${migration.description}: ${error.message}`);
        
        // Stop on error
        throw error;
      }
    }
  }

  return {
    success: true,
    filesChanged: result.filesChanged,
    migrationsDeployed: result.migrations?.length || 0
  };
}
```

## 8. Usage in Your App

```typescript
// app/pages/Dashboard.tsx
import { buildAndDeployFeature } from '@/workflows/feature-builder';

async function handleBuildFeature() {
  try {
    const result = await buildAndDeployFeature(
      './my-project',
      'Add blog posts with comments and likes',
      {
        projectRef: process.env.NEXT_PUBLIC_SUPABASE_PROJECT_REF!,
        serviceKey: process.env.SUPABASE_SERVICE_KEY!
      }
    );

    console.log('🎉 Feature built successfully!');
    console.log(`📝 ${result.filesChanged.length} files modified`);
    console.log(`🗄️ ${result.migrationsDeployed} migrations deployed`);
  } catch (error) {
    console.error('❌ Feature build failed:', error);
  }
}
```

## Summary

### Data Flow
1. **Your App** → Calls MCP `cursor/execute-prompt`
2. **MCP Server** → Executes cursor-agent, extracts migrations
3. **MCP Server** → Returns JSON with `migrations` array
4. **Your App** → Receives migration SQL and metadata
5. **Your App** → Shows review UI to user
6. **User** → Approves or rejects
7. **Your App** → Deploys to Supabase via API
8. **Your App** → Tracks applied migrations

### Key Points
- ✅ Migration SQL is **returned as JSON** in the response
- ✅ Your app has **full control** over deployment
- ✅ **No automatic execution** - everything requires approval
- ✅ Complete **metadata** for informed decisions
- ✅ **Version controlled** in the project repo


