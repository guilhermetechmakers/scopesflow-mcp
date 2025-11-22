# Supabase Integration Guide

## Overview
This guide provides comprehensive instructions for integrating Supabase into your React + Vite project. Supabase is an open-source Firebase alternative that provides authentication, database, real-time subscriptions, storage, and edge functions.

## Prerequisites
- Existing React + Vite + TypeScript project
- Supabase account (create one at [supabase.com](https://supabase.com))
- Basic understanding of PostgreSQL

---

## Table of Contents
1. [Installation](#installation)
2. [Project Setup](#project-setup)
3. [Client Configuration](#client-configuration)
4. [Environment Variables](#environment-variables)
5. [Database Schema](#database-schema)
6. [Type Generation](#type-generation)
7. [Row Level Security (RLS)](#row-level-security-rls)
8. [API Layer Integration](#api-layer-integration)
9. [Authentication](#authentication)
10. [Real-time Subscriptions](#real-time-subscriptions)
11. [Storage](#storage)
12. [Edge Functions](#edge-functions)
13. [Migration from Generic API](#migration-from-generic-api)

---

## Installation

### 1. Install Supabase Client
```bash
npm install @supabase/supabase-js@^2.55.0
```

### 2. Update Dependencies
Add Supabase to your `package.json`:
```json
{
  "dependencies": {
    "@supabase/supabase-js": "^2.55.0"
  }
}
```

---

## Project Setup

### 1. Create Supabase Project
1. Go to [supabase.com](https://supabase.com)
2. Click "New Project"
3. Fill in project details:
   - Project Name
   - Database Password (save this!)
   - Region (choose closest to your users)
4. Wait for project to be created (~2 minutes)

### 2. Get API Credentials
1. Go to Project Settings > API
2. Copy your:
   - **Project URL**: `https://xxxxxxxxxxxxx.supabase.co`
   - **Anon Public Key**: `eyJhbGc...` (safe to use in client)
   - **Service Role Key**: `eyJhbGc...` (NEVER expose this in client!)

---

## Client Configuration

### 1. Create Supabase Client (`src/integrations/supabase/client.ts`)
```ts
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// Helper function to get the current user
export const getCurrentUser = async () => {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  return user;
};

// Helper function to check if user is authenticated
export const isAuthenticated = async (): Promise<boolean> => {
  const { data: { session } } = await supabase.auth.getSession();
  return !!session;
};
```

### 2. Project Structure
Update your project structure to include Supabase integration:
```
src/
├── integrations/
│   └── supabase/
│       ├── client.ts      # Supabase client initialization
│       └── types.ts       # Generated database types
├── api/
│   ├── projects.ts        # Updated with Supabase queries
│   ├── users.ts
│   └── auth.ts
└── hooks/
    ├── useSupabase.ts     # Custom Supabase hooks
    └── useProjects.ts
```

---

## Environment Variables

### 1. Update `.env`
```ini
# Supabase Configuration
VITE_SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# NEVER commit the service role key to version control
# Only use in server-side/backend code
# SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 2. Update `.env.example`
```ini
# Supabase Configuration
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# Get these values from: https://app.supabase.com/project/_/settings/api
```

---

## Database Schema

### Example: Projects Table
```sql
-- Create projects table
CREATE TABLE projects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create index for faster queries
CREATE INDEX projects_user_id_idx ON projects(user_id);
CREATE INDEX projects_created_at_idx ON projects(created_at DESC);
```

---

## Type Generation

### 1. Install Supabase CLI
```bash
npm install -g supabase
```

### 2. Login to Supabase
```bash
supabase login
```

### 3. Generate Types
```bash
# Generate types for your project
supabase gen types typescript --project-id "your-project-id" > src/integrations/supabase/types.ts
```

### 4. Add to package.json scripts
```json
{
  "scripts": {
    "types:supabase": "supabase gen types typescript --project-id your-project-id > src/integrations/supabase/types.ts"
  }
}
```

### 5. Generated Types Example (`src/integrations/supabase/types.ts`)
```ts
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      projects: {
        Row: {
          id: string
          name: string
          description: string | null
          user_id: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          user_id: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          user_id?: string
          created_at?: string
          updated_at?: string
        }
      }
    }
  }
}
```

---

## Row Level Security (RLS)

### 1. Enable RLS
```sql
-- Enable RLS on projects table
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
```

### 2. Create Policies
```sql
-- Policy: Users can view their own projects
CREATE POLICY "Users can view own projects"
  ON projects
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own projects
CREATE POLICY "Users can insert own projects"
  ON projects
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own projects
CREATE POLICY "Users can update own projects"
  ON projects
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own projects
CREATE POLICY "Users can delete own projects"
  ON projects
  FOR DELETE
  USING (auth.uid() = user_id);
```

### 3. Public Data Policy
```sql
-- Allow everyone to read public projects
CREATE POLICY "Public projects are viewable by everyone"
  ON projects
  FOR SELECT
  USING (is_public = true);
```

---

## API Layer Integration

See `SUPABASE_API_EXAMPLES.md` for complete API layer patterns with Supabase.

Quick example:
```ts
// src/api/projects.ts
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

type Project = Database['public']['Tables']['projects']['Row'];
type CreateProject = Database['public']['Tables']['projects']['Insert'];

export const projectsApi = {
  getAll: async (): Promise<Project[]> => {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data;
  },
  
  getById: async (id: string): Promise<Project> => {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) throw error;
    return data;
  },
  
  create: async (project: CreateProject): Promise<Project> => {
    const { data, error } = await supabase
      .from('projects')
      .insert(project)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },
};
```

---

## Authentication

### 1. Email/Password Authentication
```ts
// src/api/auth.ts
import { supabase } from '@/integrations/supabase/client';

export const authApi = {
  // Sign up
  signUp: async (email: string, password: string, metadata?: object) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: metadata,
      },
    });
    
    if (error) throw error;
    return data;
  },
  
  // Sign in
  signIn: async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    
    if (error) throw error;
    return data;
  },
  
  // Sign out
  signOut: async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },
  
  // Reset password
  resetPassword: async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    
    if (error) throw error;
  },
  
  // Update password
  updatePassword: async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });
    
    if (error) throw error;
  },
};
```

### 2. OAuth Providers
```ts
// Sign in with Google
await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: {
    redirectTo: `${window.location.origin}/auth/callback`,
  },
});

// Sign in with GitHub
await supabase.auth.signInWithOAuth({
  provider: 'github',
  options: {
    redirectTo: `${window.location.origin}/auth/callback`,
  },
});
```

### 3. Auth State Listener
```ts
// src/hooks/useAuth.ts
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User } from '@supabase/supabase-js';

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  return { user, loading };
};
```

---

## Real-time Subscriptions

### 1. Enable Real-time on Tables
In Supabase Dashboard:
1. Go to Database > Replication
2. Enable replication for tables you want to subscribe to

### 2. Subscribe to Changes
```ts
// Subscribe to all project changes
const subscription = supabase
  .channel('projects-channel')
  .on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'projects',
    },
    (payload) => {
      console.log('Change received!', payload);
      // Handle INSERT, UPDATE, DELETE events
    }
  )
  .subscribe();

// Unsubscribe when done
subscription.unsubscribe();
```

### 3. Real-time Hook Example
```ts
// src/hooks/useRealtimeProjects.ts
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { projectKeys } from './useProjects';

export const useRealtimeProjects = () => {
  const queryClient = useQueryClient();

  useEffect(() => {
    const subscription = supabase
      .channel('projects-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'projects',
        },
        () => {
          // Invalidate and refetch projects
          queryClient.invalidateQueries({ queryKey: projectKeys.all });
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [queryClient]);
};
```

---

## Storage

### 1. Create Storage Bucket
```ts
// Create a public bucket for avatars
const { data, error } = await supabase.storage.createBucket('avatars', {
  public: true,
  fileSizeLimit: 1024 * 1024 * 2, // 2MB
  allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
});
```

### 2. Upload Files
```ts
// src/api/storage.ts
import { supabase } from '@/integrations/supabase/client';

export const storageApi = {
  uploadAvatar: async (file: File, userId: string) => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${userId}-${Date.now()}.${fileExt}`;
    
    const { data, error } = await supabase.storage
      .from('avatars')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false,
      });
    
    if (error) throw error;
    return data;
  },
  
  getAvatarUrl: (path: string) => {
    const { data } = supabase.storage
      .from('avatars')
      .getPublicUrl(path);
    
    return data.publicUrl;
  },
  
  deleteAvatar: async (path: string) => {
    const { error } = await supabase.storage
      .from('avatars')
      .remove([path]);
    
    if (error) throw error;
  },
};
```

---

## Edge Functions

### 1. Create Edge Function
```bash
supabase functions new my-function
```

### 2. Edge Function Example
```ts
// supabase/functions/my-function/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  );

  const { data, error } = await supabase.from('projects').select('*');

  return new Response(JSON.stringify({ data, error }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
```

### 3. Call Edge Function
```ts
const { data, error } = await supabase.functions.invoke('my-function', {
  body: { name: 'Functions' },
});
```

---

## Migration from Generic API

### 1. Replace API Client
**Before (generic axios):**
```ts
import apiClient from './client';

const response = await apiClient.get('/projects');
return response.data;
```

**After (Supabase):**
```ts
import { supabase } from '@/integrations/supabase/client';

const { data, error } = await supabase
  .from('projects')
  .select('*');

if (error) throw error;
return data;
```

### 2. Update Authentication
**Before:**
```ts
localStorage.setItem('auth_token', token);
```

**After:**
```ts
// Supabase handles token storage automatically
await supabase.auth.signInWithPassword({ email, password });
```

### 3. Update Environment Variables
Remove generic API URL and add Supabase credentials:
```diff
- VITE_API_URL=http://localhost:3000/api
+ VITE_SUPABASE_URL=https://xxxxx.supabase.co
+ VITE_SUPABASE_ANON_KEY=eyJhbGc...
```

---

## Best Practices

### 1. Security
- ✅ Always use RLS policies
- ✅ Never expose service role key in client
- ✅ Validate user input before database operations
- ✅ Use parameterized queries (Supabase handles this)
- ✅ Enable email confirmation for sign-ups

### 2. Performance
- ✅ Use indexes on frequently queried columns
- ✅ Limit data with `.select()` to only what you need
- ✅ Use `.single()` for single row queries
- ✅ Implement pagination with `.range()`
- ✅ Cache query results with React Query

### 3. Error Handling
```ts
const { data, error } = await supabase.from('projects').select('*');

if (error) {
  // Log error for debugging
  console.error('Supabase error:', error);
  
  // Throw user-friendly error
  throw new Error('Failed to fetch projects. Please try again.');
}
```

---

## Troubleshooting

### Common Issues

**1. "JWT expired" error**
- Solution: Supabase auto-refreshes tokens. Ensure `autoRefreshToken: true` in client config.

**2. RLS policy blocking queries**
- Solution: Check your RLS policies. Temporarily disable RLS to test queries.

**3. Real-time not working**
- Solution: Enable replication in Database > Replication settings.

**4. CORS errors**
- Solution: Add your domain to allowed origins in Project Settings > API.

---

## Additional Resources

- [Supabase Documentation](https://supabase.com/docs)
- [Supabase JavaScript Client](https://supabase.com/docs/reference/javascript)
- [Row Level Security Guide](https://supabase.com/docs/guides/auth/row-level-security)
- [Real-time Guide](https://supabase.com/docs/guides/realtime)
- [Storage Guide](https://supabase.com/docs/guides/storage)
- [Edge Functions Guide](https://supabase.com/docs/guides/functions)

---

## Next Steps

1. ✅ Set up Supabase project
2. ✅ Configure client and environment variables
3. ✅ Create database schema
4. ✅ Generate TypeScript types
5. ✅ Implement RLS policies
6. ✅ Integrate with API layer (see `SUPABASE_API_EXAMPLES.md`)
7. ✅ Test authentication flow
8. ✅ Add real-time subscriptions (optional)
9. ✅ Set up storage (optional)
10. ✅ Deploy and monitor

---

**Happy coding with Supabase! 🚀**



