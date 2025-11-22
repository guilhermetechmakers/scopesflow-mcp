# Supabase Migration Workflow Integration

## Overview

The MCP server now includes an automated Supabase migration workflow that ensures **cursor-agent generates migration files** which are then **sent to your application for review and approval**. No SQL is ever executed automatically.

## What Changed

### 1. Enhanced Supabase Instructions
The prompt sent to cursor-agent now includes comprehensive instructions for creating database migrations:

- **Migration file format**: `YYYYMMDDHHmmss_description.sql`
- **Migration structure**: Complete template with extensions, tables, indexes, triggers, and RLS policies
- **Metadata files**: JSON files tracking migration details
- **TypeScript types**: Automatic type generation for new tables
- **Critical rules**: Never execute SQL, only create files

### 2. New Helper Methods

#### `ensureSupabaseMigrationStructure(projectPath: string)`
- Creates `supabase/migrations/` directory structure
- Generates `MIGRATIONS.md` tracking document
- Creates `README.md` with migration guidelines
- Automatically called when Supabase configuration is detected

#### `extractNewMigrations(projectPath: string)`
- Scans `supabase/migrations/` directory for SQL files
- Reads migration SQL and metadata
- Extracts timestamp and description from filenames
- Returns structured migration data

### 3. Updated `executePrompt` Method
Now includes:
- Automatic migration structure setup when Supabase is detected
- Migration extraction after cursor-agent completes
- Migration data included in response to your application

## How It Works

### Step 1: Cursor-Agent Execution
When building features, cursor-agent:
1. Creates migration files in `supabase/migrations/`
2. Follows the standardized template
3. Includes RLS policies, indexes, and triggers
4. Generates TypeScript types
5. Creates API layer code
6. **Never executes SQL**

### Step 2: MCP Extracts Migrations
After cursor-agent completes:
1. MCP scans the migrations directory
2. Reads all `.sql` and `.meta.json` files
3. Structures the data for your app

### Step 3: Your App Reviews & Deploys
Your application receives:
```typescript
{
  success: true,
  output: "Cursor Agent executed successfully. Modified 12 file(s). Created 2 database migration(s).",
  filesChanged: ["src/api/posts.ts", "src/hooks/usePosts.ts", ...],
  migrations: [
    {
      filename: "20241013120000_create_posts_table.sql",
      sql: "-- Full SQL content here",
      metadata: {
        migration_name: "20241013120000_create_posts_table",
        tables_created: ["posts"],
        breaking_changes: false,
        ...
      },
      timestamp: "20241013120000",
      description: "create posts table"
    }
  ],
  hasMigrations: true
}
```

## Migration File Structure

### SQL File Example
```sql
-- =====================================================
-- Migration: Create posts table
-- Created: 2024-10-13T12:00:00Z
-- Tables: posts
-- Purpose: Store user blog posts
-- =====================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS posts (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT posts_title_not_empty CHECK (length(trim(title)) > 0)
);

-- Indexes
CREATE INDEX IF NOT EXISTS posts_user_id_idx ON posts(user_id);
CREATE INDEX IF NOT EXISTS posts_created_at_idx ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS posts_status_idx ON posts(status);

-- Trigger
DROP TRIGGER IF EXISTS update_posts_updated_at ON posts;
CREATE TRIGGER update_posts_updated_at
  BEFORE UPDATE ON posts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "posts_select_own"
  ON posts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "posts_insert_own"
  ON posts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Rollback: DROP TABLE IF EXISTS posts CASCADE;
```

### Metadata File Example
```json
{
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
}
```

## Your Application Integration

### Receiving Migrations
```typescript
const result = await mcpClient.call('cursor/execute-prompt', {
  projectPath: './my-project',
  prompt: 'Add blog post feature with comments'
});

if (result.hasMigrations) {
  // Show migrations to user for review
  showMigrationReviewUI(result.migrations);
}
```

### Deploying Approved Migrations

#### Option 1: Supabase Management API
```typescript
async function deployMigration(sql: string, projectRef: string, serviceKey: string) {
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query: sql })
    }
  );
  
  return await response.json();
}
```

#### Option 2: Show Instructions to User
```typescript
function showMigrationInstructions(migration: Migration) {
  return `
Apply this migration via Supabase Dashboard:

1. Go to: https://app.supabase.com/project/${projectRef}/editor
2. Click "SQL Editor"
3. Paste the migration SQL
4. Review carefully
5. Click "Run"

Migration File: ${migration.filename}
Tables Affected: ${migration.metadata?.tables_created?.join(', ')}
  `;
}
```

#### Option 3: Supabase CLI (Programmatic)
```typescript
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function applyMigrations(projectPath: string, projectRef: string) {
  // Link project
  await execAsync(`npx supabase link --project-ref ${projectRef}`, {
    cwd: projectPath
  });
  
  // Push all migrations
  await execAsync('npx supabase db push', {
    cwd: projectPath
  });
}
```

## Benefits

### ✅ Full Control
- Review all SQL before execution
- Approve/reject individual migrations
- Track migration history

### ✅ Safety
- No automatic database changes
- Version-controlled migrations
- Easy rollback instructions

### ✅ Transparency
- Complete visibility into schema changes
- Structured metadata
- Clear documentation

### ✅ Workflow Integration
- Fits into existing approval processes
- Can be integrated with CI/CD
- Supports team review

## Best Practices

### For Cursor-Agent
- Always create migrations before API code
- Use descriptive migration names
- Include comprehensive RLS policies
- Add comments explaining intent
- Make migrations idempotent

### For Your Application
- Always review SQL before execution
- Test migrations in development first
- Keep track of applied migrations
- Backup database before migrations
- Monitor migration execution

### For Teams
- Require peer review for migrations
- Document breaking changes clearly
- Use migration metadata for tracking
- Automate migration status checks
- Maintain migration audit log

## Troubleshooting

### No Migrations Detected
- Check if `supabase/migrations/` directory exists
- Verify SQL files follow naming convention: `YYYYMMDDHHmmss_description.sql`
- Ensure cursor-agent completed successfully

### Invalid Migration SQL
- Review SQL syntax
- Check for missing extensions
- Verify RLS policies are complete
- Test in local Supabase instance first

### Migration Conflicts
- Check if table already exists
- Review foreign key constraints
- Verify user permissions
- Check for circular dependencies

## Example Usage Flow

```typescript
// 1. Execute prompt via MCP
const result = await mcp.execute({
  tool: 'cursor/execute-prompt',
  args: {
    projectPath: './my-app',
    prompt: 'Add user profiles with avatar and bio',
    isFirstPrompt: false
  }
});

// 2. Check for migrations
if (result.hasMigrations) {
  console.log(`Found ${result.migrations.length} migration(s)`);
  
  // 3. Show to user
  for (const migration of result.migrations) {
    const approved = await showMigrationReview({
      title: migration.description,
      sql: migration.sql,
      metadata: migration.metadata,
      tables: migration.metadata?.tables_created || []
    });
    
    // 4. Deploy if approved
    if (approved) {
      await deployToSupabase(migration.sql);
      console.log(`✅ Applied: ${migration.filename}`);
    }
  }
}

// 5. Notify user of completion
console.log('All migrations reviewed and applied!');
```

## File Structure in Project

```
my-app/
├── supabase/
│   ├── MIGRATIONS.md              # Migration tracking document
│   └── migrations/
│       ├── README.md              # Migration guidelines
│       ├── 20241013120000_create_posts.sql
│       ├── 20241013120000_create_posts.meta.json
│       ├── 20241013123000_create_comments.sql
│       └── 20241013123000_create_comments.meta.json
├── src/
│   ├── types/
│   │   └── database/
│   │       ├── posts.ts           # Generated types
│   │       └── comments.ts
│   ├── api/
│   │   ├── posts.ts               # API layer
│   │   └── comments.ts
│   └── hooks/
│       ├── usePosts.ts            # React Query hooks
│       └── useComments.ts
└── .env.local                     # Supabase credentials
```

## Security Notes

⚠️ **Important Security Considerations:**

1. **Never expose service role keys** in client-side code
2. **Always use environment variables** for credentials
3. **Review RLS policies carefully** before deployment
4. **Test migrations in development** before production
5. **Backup production data** before running migrations
6. **Monitor migration execution** for errors
7. **Use read-only connections** for review/preview
8. **Implement audit logging** for migration deployments

## Next Steps

1. ✅ Migrations are now automatically generated by cursor-agent
2. ✅ MCP extracts and returns them to your app
3. 🔜 Implement review UI in your application
4. 🔜 Add deployment logic (API/CLI/Manual)
5. 🔜 Track applied migrations
6. 🔜 Add rollback functionality
7. 🔜 Set up migration alerts/notifications

---

**Ready to use!** The MCP server will now automatically handle Supabase migrations with full review and approval workflow. 🚀

