# Supabase API Layer Examples

## Overview
This guide provides comprehensive examples of implementing the API layer with Supabase. These patterns work seamlessly with React Query for efficient data management and caching.

---

## Table of Contents
1. [Base Supabase Setup](#base-supabase-setup)
2. [Projects API](#projects-api)
3. [Users API](#users-api)
4. [Authentication API](#authentication-api)
5. [React Query Hooks](#react-query-hooks)
6. [Advanced Patterns](#advanced-patterns)
7. [Error Handling](#error-handling)
8. [Testing](#testing)

---

## Base Supabase Setup

### Client Configuration
```ts
// src/integrations/supabase/client.ts
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
```

### Error Handling Helper
```ts
// src/api/supabase-helpers.ts
import { PostgrestError } from '@supabase/supabase-js';

export class SupabaseError extends Error {
  constructor(
    message: string,
    public code?: string,
    public details?: string,
    public hint?: string
  ) {
    super(message);
    this.name = 'SupabaseError';
  }
}

export const handleSupabaseError = (error: PostgrestError): never => {
  throw new SupabaseError(
    error.message,
    error.code,
    error.details,
    error.hint
  );
};

export const createSupabaseFunction = <T>(
  operation: () => Promise<{ data: T | null; error: PostgrestError | null }>
) => {
  return async (): Promise<T> => {
    const { data, error } = await operation();
    if (error) handleSupabaseError(error);
    if (!data) throw new Error('No data returned');
    return data;
  };
};
```

---

## Projects API

### Complete Projects API Implementation
```ts
// src/api/projects.ts
import { supabase } from '@/integrations/supabase/client';
import { handleSupabaseError } from './supabase-helpers';
import type { Database } from '@/integrations/supabase/types';

type Project = Database['public']['Tables']['projects']['Row'];
type CreateProjectInput = Database['public']['Tables']['projects']['Insert'];
type UpdateProjectInput = Database['public']['Tables']['projects']['Update'];

export const projectsApi = {
  /**
   * Get all projects for the current user
   */
  getAll: async (): Promise<Project[]> => {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) handleSupabaseError(error);
    return data;
  },

  /**
   * Get a single project by ID
   */
  getById: async (id: string): Promise<Project> => {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) handleSupabaseError(error);
    return data;
  },

  /**
   * Create a new project
   */
  create: async (project: CreateProjectInput): Promise<Project> => {
    const { data, error } = await supabase
      .from('projects')
      .insert(project)
      .select()
      .single();
    
    if (error) handleSupabaseError(error);
    return data;
  },

  /**
   * Update an existing project
   */
  update: async (id: string, updates: UpdateProjectInput): Promise<Project> => {
    const { data, error } = await supabase
      .from('projects')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    
    if (error) handleSupabaseError(error);
    return data;
  },

  /**
   * Delete a project
   */
  delete: async (id: string): Promise<void> => {
    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', id);
    
    if (error) handleSupabaseError(error);
  },

  /**
   * Get projects by user ID
   */
  getByUserId: async (userId: string): Promise<Project[]> => {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    
    if (error) handleSupabaseError(error);
    return data;
  },

  /**
   * Search projects by name or description
   */
  search: async (query: string): Promise<Project[]> => {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .or(`name.ilike.%${query}%,description.ilike.%${query}%`)
      .order('created_at', { ascending: false });
    
    if (error) handleSupabaseError(error);
    return data;
  },

  /**
   * Get paginated projects
   */
  getPaginated: async (page: number, limit: number): Promise<{
    data: Project[];
    count: number;
  }> => {
    const from = page * limit;
    const to = from + limit - 1;

    const { data, error, count } = await supabase
      .from('projects')
      .select('*', { count: 'exact' })
      .range(from, to)
      .order('created_at', { ascending: false });
    
    if (error) handleSupabaseError(error);
    
    return {
      data,
      count: count || 0,
    };
  },

  /**
   * Get projects with related data (joins)
   */
  getWithUsers: async (): Promise<any[]> => {
    const { data, error } = await supabase
      .from('projects')
      .select(`
        *,
        users:user_id (
          id,
          email,
          full_name
        )
      `)
      .order('created_at', { ascending: false });
    
    if (error) handleSupabaseError(error);
    return data;
  },
};
```

---

## Users API

### Complete Users API Implementation
```ts
// src/api/users.ts
import { supabase } from '@/integrations/supabase/client';
import { handleSupabaseError } from './supabase-helpers';
import type { User } from '@supabase/supabase-js';

export interface UserProfile {
  id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

export interface UpdateUserProfileInput {
  full_name?: string;
  avatar_url?: string;
}

export const usersApi = {
  /**
   * Get current authenticated user
   */
  getCurrent: async (): Promise<User> => {
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error) throw error;
    if (!user) throw new Error('No authenticated user');
    
    return user;
  },

  /**
   * Get user profile by ID
   */
  getProfile: async (userId: string): Promise<UserProfile> => {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();
    
    if (error) handleSupabaseError(error);
    return data;
  },

  /**
   * Get current user's profile
   */
  getCurrentProfile: async (): Promise<UserProfile> => {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) throw new Error('No authenticated user');
    
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();
    
    if (error) handleSupabaseError(error);
    return data;
  },

  /**
   * Update user profile
   */
  updateProfile: async (updates: UpdateUserProfileInput): Promise<UserProfile> => {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) throw new Error('No authenticated user');
    
    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', user.id)
      .select()
      .single();
    
    if (error) handleSupabaseError(error);
    return data;
  },

  /**
   * Update user email
   */
  updateEmail: async (newEmail: string): Promise<User> => {
    const { data: { user }, error } = await supabase.auth.updateUser({
      email: newEmail,
    });
    
    if (error) throw error;
    if (!user) throw new Error('Failed to update email');
    
    return user;
  },

  /**
   * Upload user avatar
   */
  uploadAvatar: async (file: File): Promise<string> => {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) throw new Error('No authenticated user');
    
    const fileExt = file.name.split('.').pop();
    const fileName = `${user.id}-${Date.now()}.${fileExt}`;
    
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: true,
      });
    
    if (uploadError) throw uploadError;
    
    const { data: { publicUrl } } = supabase.storage
      .from('avatars')
      .getPublicUrl(fileName);
    
    // Update user profile with new avatar URL
    await usersApi.updateProfile({ avatar_url: publicUrl });
    
    return publicUrl;
  },
};
```

---

## Authentication API

### Complete Authentication API Implementation
```ts
// src/api/auth.ts
import { supabase } from '@/integrations/supabase/client';
import type { AuthResponse, User, Session } from '@supabase/supabase-js';

export interface SignUpCredentials {
  email: string;
  password: string;
  fullName?: string;
}

export interface SignInCredentials {
  email: string;
  password: string;
}

export const authApi = {
  /**
   * Sign up with email and password
   */
  signUp: async (credentials: SignUpCredentials): Promise<AuthResponse> => {
    const { data, error } = await supabase.auth.signUp({
      email: credentials.email,
      password: credentials.password,
      options: {
        data: {
          full_name: credentials.fullName,
        },
      },
    });
    
    if (error) throw error;
    return data;
  },

  /**
   * Sign in with email and password
   */
  signIn: async (credentials: SignInCredentials): Promise<AuthResponse> => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: credentials.email,
      password: credentials.password,
    });
    
    if (error) throw error;
    return data;
  },

  /**
   * Sign in with OAuth provider
   */
  signInWithOAuth: async (provider: 'google' | 'github' | 'gitlab') => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    
    if (error) throw error;
    return data;
  },

  /**
   * Sign out
   */
  signOut: async (): Promise<void> => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  /**
   * Send password reset email
   */
  resetPassword: async (email: string): Promise<void> => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    
    if (error) throw error;
  },

  /**
   * Update password
   */
  updatePassword: async (newPassword: string): Promise<User> => {
    const { data: { user }, error } = await supabase.auth.updateUser({
      password: newPassword,
    });
    
    if (error) throw error;
    if (!user) throw new Error('Failed to update password');
    
    return user;
  },

  /**
   * Get current session
   */
  getSession: async (): Promise<Session | null> => {
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error) throw error;
    return session;
  },

  /**
   * Refresh session
   */
  refreshSession: async (): Promise<Session> => {
    const { data: { session }, error } = await supabase.auth.refreshSession();
    
    if (error) throw error;
    if (!session) throw new Error('Failed to refresh session');
    
    return session;
  },

  /**
   * Verify OTP (for email confirmation or passwordless login)
   */
  verifyOTP: async (email: string, token: string): Promise<AuthResponse> => {
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'email',
    });
    
    if (error) throw error;
    return data;
  },
};
```

---

## React Query Hooks

### Projects Hooks
```ts
// src/hooks/useProjects.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { projectsApi } from '@/api/projects';
import { toast } from 'sonner';
import type { Database } from '@/integrations/supabase/types';

type Project = Database['public']['Tables']['projects']['Row'];
type CreateProjectInput = Database['public']['Tables']['projects']['Insert'];
type UpdateProjectInput = Database['public']['Tables']['projects']['Update'];

// Query keys factory
export const projectKeys = {
  all: ['projects'] as const,
  lists: () => [...projectKeys.all, 'list'] as const,
  list: (filters: string) => [...projectKeys.lists(), { filters }] as const,
  details: () => [...projectKeys.all, 'detail'] as const,
  detail: (id: string) => [...projectKeys.details(), id] as const,
  search: (query: string) => [...projectKeys.all, 'search', query] as const,
};

/**
 * Get all projects
 */
export const useProjects = () => {
  return useQuery({
    queryKey: projectKeys.lists(),
    queryFn: projectsApi.getAll,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};

/**
 * Get project by ID
 */
export const useProject = (id: string) => {
  return useQuery({
    queryKey: projectKeys.detail(id),
    queryFn: () => projectsApi.getById(id),
    enabled: !!id,
  });
};

/**
 * Search projects
 */
export const useSearchProjects = (query: string) => {
  return useQuery({
    queryKey: projectKeys.search(query),
    queryFn: () => projectsApi.search(query),
    enabled: query.length > 0,
    staleTime: 1000 * 30, // 30 seconds
  });
};

/**
 * Create project mutation
 */
export const useCreateProject = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: projectsApi.create,
    onMutate: async (newProject) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: projectKeys.lists() });

      // Snapshot previous value
      const previousProjects = queryClient.getQueryData(projectKeys.lists());

      // Optimistically update
      queryClient.setQueryData(projectKeys.lists(), (old: Project[] = []) => [
        { ...newProject, id: 'temp-id', created_at: new Date().toISOString() } as Project,
        ...old,
      ]);

      return { previousProjects };
    },
    onSuccess: (newProject) => {
      // Update cache with real data
      queryClient.setQueryData(projectKeys.detail(newProject.id), newProject);
      
      // Invalidate and refetch
      queryClient.invalidateQueries({ queryKey: projectKeys.lists() });
      
      toast.success('Project created successfully!');
    },
    onError: (error, _, context) => {
      // Rollback on error
      if (context?.previousProjects) {
        queryClient.setQueryData(projectKeys.lists(), context.previousProjects);
      }
      
      toast.error(`Failed to create project: ${error.message}`);
    },
  });
};

/**
 * Update project mutation
 */
export const useUpdateProject = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: UpdateProjectInput }) =>
      projectsApi.update(id, updates),
    onSuccess: (updatedProject) => {
      // Update the project in the cache
      queryClient.setQueryData(projectKeys.detail(updatedProject.id), updatedProject);
      
      // Invalidate projects list
      queryClient.invalidateQueries({ queryKey: projectKeys.lists() });
      
      toast.success('Project updated successfully!');
    },
    onError: (error) => {
      toast.error(`Failed to update project: ${error.message}`);
    },
  });
};

/**
 * Delete project mutation
 */
export const useDeleteProject = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: projectsApi.delete,
    onSuccess: (_, deletedId) => {
      // Remove from cache
      queryClient.removeQueries({ queryKey: projectKeys.detail(deletedId) });
      
      // Invalidate projects list
      queryClient.invalidateQueries({ queryKey: projectKeys.lists() });
      
      toast.success('Project deleted successfully!');
    },
    onError: (error) => {
      toast.error(`Failed to delete project: ${error.message}`);
    },
  });
};
```

### Authentication Hooks
```ts
// src/hooks/useAuth.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authApi } from '@/api/auth';
import { usersApi } from '@/api/users';
import { toast } from 'sonner';
import type { SignInCredentials, SignUpCredentials } from '@/api/auth';

// Query keys
export const authKeys = {
  user: ['auth', 'user'] as const,
  session: ['auth', 'session'] as const,
};

/**
 * Get current user
 */
export const useCurrentUser = () => {
  return useQuery({
    queryKey: authKeys.user,
    queryFn: usersApi.getCurrent,
    retry: false,
    staleTime: 1000 * 60 * 10, // 10 minutes
  });
};

/**
 * Sign in mutation
 */
export const useSignIn = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: authApi.signIn,
    onSuccess: (data) => {
      // Update user in cache
      queryClient.setQueryData(authKeys.user, data.user);
      
      toast.success('Signed in successfully!');
    },
    onError: (error: any) => {
      toast.error(`Sign in failed: ${error.message}`);
    },
  });
};

/**
 * Sign up mutation
 */
export const useSignUp = () => {
  return useMutation({
    mutationFn: authApi.signUp,
    onSuccess: () => {
      toast.success('Account created! Please check your email to verify your account.');
    },
    onError: (error: any) => {
      toast.error(`Sign up failed: ${error.message}`);
    },
  });
};

/**
 * Sign out mutation
 */
export const useSignOut = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: authApi.signOut,
    onSuccess: () => {
      // Clear all cached data
      queryClient.clear();
      
      toast.success('Signed out successfully!');
    },
    onError: (error: any) => {
      toast.error(`Sign out failed: ${error.message}`);
    },
  });
};

/**
 * Password reset mutation
 */
export const usePasswordReset = () => {
  return useMutation({
    mutationFn: authApi.resetPassword,
    onSuccess: () => {
      toast.success('Password reset email sent! Check your inbox.');
    },
    onError: (error: any) => {
      toast.error(`Password reset failed: ${error.message}`);
    },
  });
};

/**
 * Update password mutation
 */
export const useUpdatePassword = () => {
  return useMutation({
    mutationFn: authApi.updatePassword,
    onSuccess: () => {
      toast.success('Password updated successfully!');
    },
    onError: (error: any) => {
      toast.error(`Failed to update password: ${error.message}`);
    },
  });
};
```

---

## Advanced Patterns

### Real-time Subscriptions with React Query
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
      .channel('projects-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'projects',
        },
        (payload) => {
          console.log('Project change:', payload);
          
          // Invalidate and refetch projects
          queryClient.invalidateQueries({ queryKey: projectKeys.lists() });
          
          // If it's an update or insert, update the specific project
          if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
            const project = payload.new;
            queryClient.setQueryData(projectKeys.detail(project.id), project);
          }
          
          // If it's a delete, remove from cache
          if (payload.eventType === 'DELETE') {
            const projectId = payload.old.id;
            queryClient.removeQueries({ queryKey: projectKeys.detail(projectId) });
          }
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [queryClient]);
};
```

### Pagination Hook
```ts
// src/hooks/usePaginatedProjects.ts
import { useInfiniteQuery } from '@tanstack/react-query';
import { projectsApi } from '@/api/projects';

export const usePaginatedProjects = (limit: number = 10) => {
  return useInfiniteQuery({
    queryKey: ['projects', 'paginated', limit],
    queryFn: ({ pageParam = 0 }) => projectsApi.getPaginated(pageParam, limit),
    getNextPageParam: (lastPage, allPages) => {
      const totalFetched = allPages.reduce((acc, page) => acc + page.data.length, 0);
      return totalFetched < lastPage.count ? allPages.length : undefined;
    },
    initialPageParam: 0,
  });
};
```

### Batch Operations
```ts
// src/api/batch-operations.ts
import { supabase } from '@/integrations/supabase/client';

export const batchOperations = {
  /**
   * Bulk insert projects
   */
  bulkInsertProjects: async (projects: any[]) => {
    const { data, error } = await supabase
      .from('projects')
      .insert(projects)
      .select();
    
    if (error) throw error;
    return data;
  },

  /**
   * Bulk update projects
   */
  bulkUpdateProjects: async (updates: { id: string; [key: string]: any }[]) => {
    const promises = updates.map(({ id, ...update }) =>
      supabase
        .from('projects')
        .update(update)
        .eq('id', id)
        .select()
        .single()
    );
    
    const results = await Promise.all(promises);
    
    const errors = results.filter(r => r.error).map(r => r.error);
    if (errors.length > 0) throw errors[0];
    
    return results.map(r => r.data);
  },

  /**
   * Bulk delete projects
   */
  bulkDeleteProjects: async (ids: string[]) => {
    const { error } = await supabase
      .from('projects')
      .delete()
      .in('id', ids);
    
    if (error) throw error;
  },
};
```

---

## Error Handling

### Supabase Error Types
```ts
// src/utils/supabase-errors.ts
import type { PostgrestError, AuthError } from '@supabase/supabase-js';

export const getErrorMessage = (error: PostgrestError | AuthError | Error): string => {
  if ('code' in error && error.code) {
    // Supabase-specific error codes
    switch (error.code) {
      case '23505':
        return 'This record already exists.';
      case '23503':
        return 'Related record not found.';
      case '42501':
        return 'Permission denied. You do not have access to this resource.';
      case 'PGRST116':
        return 'Record not found.';
      default:
        return error.message;
    }
  }
  
  return error.message || 'An unexpected error occurred';
};

export const isAuthError = (error: any): error is AuthError => {
  return error && 'status' in error && typeof error.status === 'number';
};

export const isPostgrestError = (error: any): error is PostgrestError => {
  return error && 'code' in error && 'details' in error;
};
```

---

## Testing

### Mock Supabase Client
```ts
// src/__tests__/mocks/supabase.ts
import { vi } from 'vitest';

export const createMockSupabaseClient = () => ({
  from: vi.fn(() => ({
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: {}, error: null }),
    order: vi.fn().mockReturnThis(),
  })),
  auth: {
    getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    signInWithPassword: vi.fn().mockResolvedValue({ data: {}, error: null }),
    signUp: vi.fn().mockResolvedValue({ data: {}, error: null }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
  },
  storage: {
    from: vi.fn(() => ({
      upload: vi.fn().mockResolvedValue({ data: {}, error: null }),
      getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'http://example.com' } }),
    })),
  },
});
```

### Test API Functions
```ts
// src/__tests__/api/projects.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { projectsApi } from '@/api/projects';
import { supabase } from '@/integrations/supabase/client';

vi.mock('@/integrations/supabase/client');

describe('projectsApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch all projects', async () => {
    const mockProjects = [{ id: '1', name: 'Test Project' }];
    
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: mockProjects, error: null }),
    } as any);

    const result = await projectsApi.getAll();
    
    expect(result).toEqual(mockProjects);
    expect(supabase.from).toHaveBeenCalledWith('projects');
  });
});
```

---

## Best Practices

### 1. Type Safety
- Always use generated Supabase types
- Define explicit return types for API functions
- Use TypeScript discriminated unions for responses

### 2. Error Handling
- Always check for errors before accessing data
- Provide user-friendly error messages
- Log detailed errors for debugging

### 3. Performance
- Use `.select()` to fetch only needed columns
- Implement pagination for large datasets
- Use React Query's caching strategies
- Consider using `.maybeSingle()` when a record might not exist

### 4. Security
- Never expose service role key in client code
- Always implement Row Level Security (RLS)
- Validate user input before database operations
- Use parameterized queries (Supabase does this automatically)

---

## Additional Resources

- [Supabase JavaScript Client Docs](https://supabase.com/docs/reference/javascript)
- [React Query Docs](https://tanstack.com/query/latest/docs/react/overview)
- [Supabase RLS Guide](https://supabase.com/docs/guides/auth/row-level-security)

---

**Happy coding with Supabase! 🚀**



