# API Layer Architecture Guide

## Overview
This guide covers the centralized API layer architecture for the modern React boilerplate. The API layer provides a clean separation between data fetching logic and UI components, making the codebase more maintainable and testable. **Canonical approach:** native `fetch()` via `src/lib/api.ts`. When Supabase is used, the client handles DB/Auth/Realtime/Storage, and Edge Functions act as the API for server-only logic (e.g. LLM, secrets).

## Architecture Principles

### 1. Centralized Data Fetching
- All API calls are centralized in the `src/api/` directory
- Each resource has its own API module (e.g., `projects.ts`, `users.ts`)
- Consistent error handling and response formatting
- Type-safe API functions with TypeScript

### 2. React Query Integration
- API functions are consumed by React Query hooks
- Automatic caching, background updates, and optimistic updates
- Built-in loading and error states
- Request deduplication and retry logic

### 3. Separation of Concerns
- API layer handles data fetching and transformation
- React Query hooks handle caching and state management
- Components focus on UI and user interactions
- Clear boundaries between layers

## File Structure

```
src/
├── lib/
│   └── api.ts            # Fetch-based API client (canonical)
├── api/                    # Centralized API functions
│   ├── projects.ts        # Project-related API calls
│   ├── users.ts          # User-related API calls
│   ├── auth.ts           # Authentication API calls
│   └── index.ts          # Re-export all API functions
├── hooks/                 # React Query hooks
│   ├── useProjects.ts    # Project-related hooks
│   ├── useUsers.ts       # User-related hooks
│   └── useAuth.ts        # Authentication hooks
└── types/                 # TypeScript type definitions
    ├── api.ts            # API response types
    ├── project.ts        # Project types
    └── user.ts           # User types
```

When using Supabase, add `src/lib/supabase.ts` (or `src/integrations/supabase/client.ts`) and call Edge Functions via `supabase.functions.invoke()`.

## API Layer Implementation

### 1. API Client Configuration (`src/lib/api.ts`) – preferred

Use native `fetch()` with a thin wrapper. No axios dependency.

```ts
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const base = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
  const url = `${base}${endpoint}`;
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  const token = localStorage.getItem('auth_token');
  if (token) (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;

  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    if (res.status === 401) {
      localStorage.removeItem('auth_token');
      window.location.href = '/login';
    }
    throw new Error(`API Error: ${res.status}`);
  }
  return res.json();
}

export const api = {
  get: <T>(endpoint: string) => apiRequest<T>(endpoint),
  post: <T>(endpoint: string, data: unknown) =>
    apiRequest<T>(endpoint, { method: 'POST', body: JSON.stringify(data) }),
  put: <T>(endpoint: string, data: unknown) =>
    apiRequest<T>(endpoint, { method: 'PUT', body: JSON.stringify(data) }),
  patch: <T>(endpoint: string, data: unknown) =>
    apiRequest<T>(endpoint, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: <T>(endpoint: string) => apiRequest<T>(endpoint, { method: 'DELETE' }),
};

export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
}

export interface PaginatedResponse<T> {
  data: T[];
  count: number;
  page: number;
  limit: number;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public code?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
```

### 2. Projects API (`src/api/projects.ts`)
```ts
import { api } from '@/lib/api';
import type { Project, CreateProjectInput, UpdateProjectInput } from '@/types/project';

export const projectsApi = {
  getAll: async (): Promise<Project[]> =>
    api.get<Project[]>('/projects'),

  getById: async (id: string): Promise<Project> =>
    api.get<Project>(`/projects/${id}`),

  create: async (project: CreateProjectInput): Promise<Project> =>
    api.post<Project>('/projects', project),

  update: async (id: string, updates: UpdateProjectInput): Promise<Project> =>
    api.put<Project>(`/projects/${id}`, updates),

  patch: async (id: string, updates: Partial<UpdateProjectInput>): Promise<Project> =>
    api.patch<Project>(`/projects/${id}`, updates),

  delete: async (id: string): Promise<void> =>
    api.delete(`/projects/${id}`),

  getByUserId: async (userId: string): Promise<Project[]> =>
    api.get<Project[]>(`/projects/user/${userId}`),

  search: async (query: string): Promise<Project[]> =>
    api.get<Project[]>(`/projects/search?q=${encodeURIComponent(query)}`),
};
```

### 3. Users API (`src/api/users.ts`)
```ts
import { api } from '@/lib/api';
import type { User, UpdateUserInput } from '@/types/user';

export const usersApi = {
  getCurrent: async (): Promise<User> =>
    api.get<User>('/users/me'),

  updateProfile: async (updates: UpdateUserInput): Promise<User> =>
    api.put<User>(`/users/${updates.id}`, updates),

  getById: async (id: string): Promise<User> =>
    api.get<User>(`/users/${id}`),

  getAll: async (): Promise<User[]> =>
    api.get<User[]>('/users'),

  delete: async (id: string): Promise<void> =>
    api.delete(`/users/${id}`),
};
```

### 4. Authentication API (`src/api/auth.ts`)
```ts
import { api } from '@/lib/api';
import type { AuthResponse, SignInInput, SignUpInput } from '@/types/auth';

export const authApi = {
  signIn: async (credentials: SignInInput): Promise<AuthResponse> => {
    const data = await api.post<AuthResponse>('/auth/login', credentials);
    if (data.token) localStorage.setItem('auth_token', data.token);
    return data;
  },

  signUp: async (credentials: SignUpInput): Promise<AuthResponse> => {
    const data = await api.post<AuthResponse>('/auth/register', credentials);
    if (data.token) localStorage.setItem('auth_token', data.token);
    return data;
  },

  signOut: async (): Promise<void> => {
    await api.post('/auth/logout', {});
    localStorage.removeItem('auth_token');
  },

  resetPassword: async (email: string): Promise<void> =>
    api.post('/auth/forgot-password', { email }),

  updatePassword: async (token: string, newPassword: string): Promise<void> =>
    api.post('/auth/reset-password', { token, password: newPassword }),

  refreshToken: async (): Promise<AuthResponse> => {
    const data = await api.post<AuthResponse>('/auth/refresh', {});
    if (data.token) localStorage.setItem('auth_token', data.token);
    return data;
  },

  verifyEmail: async (token: string): Promise<void> =>
    api.post('/auth/verify-email', { token }),
};
```

## React Query Hooks

### 1. Projects Hooks (`src/hooks/useProjects.ts`)
```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { projectsApi } from '@/api/projects';
import { toast } from 'sonner';
import type { Project, CreateProjectInput, UpdateProjectInput } from '@/types/project';

// Query keys
export const projectKeys = {
  all: ['projects'] as const,
  lists: () => [...projectKeys.all, 'list'] as const,
  list: (filters: string) => [...projectKeys.lists(), { filters }] as const,
  details: () => [...projectKeys.all, 'detail'] as const,
  detail: (id: string) => [...projectKeys.details(), id] as const,
};

// Get all projects
export const useProjects = () => {
  return useQuery({
    queryKey: projectKeys.lists(),
    queryFn: projectsApi.getAll,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};

// Get project by ID
export const useProject = (id: string) => {
  return useQuery({
    queryKey: projectKeys.detail(id),
    queryFn: () => projectsApi.getById(id),
    enabled: !!id,
  });
};

// Create project mutation
export const useCreateProject = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: projectsApi.create,
    onSuccess: (newProject) => {
      // Invalidate and refetch projects list
      queryClient.invalidateQueries({ queryKey: projectKeys.lists() });
      
      // Add the new project to the cache
      queryClient.setQueryData(projectKeys.detail(newProject.id), newProject);
      
      toast.success('Project created successfully!');
    },
    onError: (error) => {
      toast.error(`Failed to create project: ${error.message}`);
    },
  });
};

// Update project mutation
export const useUpdateProject = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: UpdateProjectInput }) =>
      projectsApi.update(id, updates),
    onSuccess: (updatedProject) => {
      // Update the project in the cache
      queryClient.setQueryData(projectKeys.detail(updatedProject.id), updatedProject);
      
      // Invalidate projects list to ensure consistency
      queryClient.invalidateQueries({ queryKey: projectKeys.lists() });
      
      toast.success('Project updated successfully!');
    },
    onError: (error) => {
      toast.error(`Failed to update project: ${error.message}`);
    },
  });
};

// Delete project mutation
export const useDeleteProject = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: projectsApi.delete,
    onSuccess: (_, deletedId) => {
      // Remove the project from the cache
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

### 2. Authentication Hooks (`src/hooks/useAuth.ts`)
```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authApi } from '@/api/auth';
import { usersApi } from '@/api/users';
import { toast } from 'sonner';
import type { SignInInput, SignUpInput } from '@/types/auth';

// Query keys
export const authKeys = {
  user: ['auth', 'user'] as const,
};

// Get current user
export const useCurrentUser = () => {
  return useQuery({
    queryKey: authKeys.user,
    queryFn: usersApi.getCurrent,
    retry: false,
    staleTime: 1000 * 60 * 10, // 10 minutes
    enabled: !!localStorage.getItem('auth_token'), // Only fetch if token exists
  });
};

// Sign in mutation
export const useSignIn = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: authApi.signIn,
    onSuccess: (data) => {
      // Update the user in the cache
      if (data.user) {
        queryClient.setQueryData(authKeys.user, data.user);
      }
      
      toast.success('Signed in successfully!');
    },
    onError: (error: any) => {
      toast.error(`Sign in failed: ${error.response?.data?.message || error.message}`);
    },
  });
};

// Sign up mutation
export const useSignUp = () => {
  return useMutation({
    mutationFn: authApi.signUp,
    onSuccess: () => {
      toast.success('Account created! Please check your email to verify your account.');
    },
    onError: (error: any) => {
      toast.error(`Sign up failed: ${error.response?.data?.message || error.message}`);
    },
  });
};

// Sign out mutation
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
      toast.error(`Sign out failed: ${error.response?.data?.message || error.message}`);
    },
  });
};

// Password reset mutation
export const usePasswordReset = () => {
  return useMutation({
    mutationFn: authApi.resetPassword,
    onSuccess: () => {
      toast.success('Password reset email sent! Check your inbox.');
    },
    onError: (error: any) => {
      toast.error(`Password reset failed: ${error.response?.data?.message || error.message}`);
    },
  });
};
```

## Type Definitions

### 1. API Types (`src/types/api.ts`)
```ts
export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
}

export interface PaginatedResponse<T> {
  data: T[];
  count: number;
  page: number;
  limit: number;
}

export interface ApiError {
  message: string;
  status?: number;
  code?: string;
}
```

### 2. Project Types (`src/types/project.ts`)
```ts
export interface Project {
  id: string;
  name: string;
  description: string;
  user_id: string;
  created_at: string;
  updated_at: string;
}

export interface CreateProjectInput {
  name: string;
  description: string;
  user_id: string;
}

export interface UpdateProjectInput {
  id: string;
  name?: string;
  description?: string;
}
```

### 3. User Types (`src/types/user.ts`)
```ts
export interface User {
  id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

export interface UpdateUserInput {
  id: string;
  full_name?: string;
  avatar_url?: string;
}
```

## Usage in Components

### 1. Using Query Hooks
```tsx
// src/components/ProjectList.tsx
import { useProjects } from '@/hooks/useProjects';
import { ProjectCard } from './ProjectCard';

export function ProjectList() {
  const { data: projects, isLoading, error } = useProjects();

  if (isLoading) {
    return <div>Loading projects...</div>;
  }

  if (error) {
    return <div>Error: {error.message}</div>;
  }

  return (
    <div className="grid gap-4">
      {projects?.map((project) => (
        <ProjectCard key={project.id} project={project} />
      ))}
    </div>
  );
}
```

### 2. Using Mutation Hooks
```tsx
// src/components/CreateProjectForm.tsx
import { useCreateProject } from '@/hooks/useProjects';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const createProjectSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().min(1, 'Description is required'),
});

type CreateProjectForm = z.infer<typeof createProjectSchema>;

export function CreateProjectForm() {
  const createProject = useCreateProject();
  const { register, handleSubmit, formState: { errors } } = useForm<CreateProjectForm>({
    resolver: zodResolver(createProjectSchema),
  });

  const onSubmit = (data: CreateProjectForm) => {
    createProject.mutate({
      ...data,
      user_id: 'current-user-id', // Get from auth context
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input
        {...register('name')}
        placeholder="Project name"
        className="w-full p-2 border rounded"
      />
      {errors.name && <span className="text-red-500">{errors.name.message}</span>}

      <textarea
        {...register('description')}
        placeholder="Project description"
        className="w-full p-2 border rounded"
      />
      {errors.description && <span className="text-red-500">{errors.description.message}</span>}

      <button
        type="submit"
        disabled={createProject.isPending}
        className="px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50"
      >
        {createProject.isPending ? 'Creating...' : 'Create Project'}
      </button>
    </form>
  );
}
```

## API Layer with Supabase

When Supabase is configured, use two surfaces:

- **Supabase client** (`src/lib/supabase.ts`): Auth, database (with RLS), Realtime, Storage. Use the client directly in API modules or hooks for CRUD and subscriptions.
- **Edge Functions**: Server-only logic, LLM calls, third-party APIs with secrets. Invoke from the app with `supabase.functions.invoke()`.

File layout: keep `src/api/` for resource modules; add `src/lib/supabase.ts` and, for Edge, call `supabase.functions.invoke('function-name', { body })` from a dedicated API function or hook.

## Edge Functions as API

Treat Edge Functions as API endpoints: define typed request/response and call them from hooks.

```ts
// src/api/edge.ts
import { supabase } from '@/lib/supabase';

export const edgeApi = {
  invoke: async <TReq, TRes>(name: string, body: TReq): Promise<TRes> => {
    const { data, error } = await supabase.functions.invoke(name, { body });
    if (error) throw new Error(error.message);
    return data as TRes;
  },
};
```

Use in a hook with the same React Query and toast patterns (e.g. `useMutation`, `onError: (e) => toast.error(e.message)`). For streaming (e.g. LLM), consume the response stream in the hook and update state as chunks arrive.

## LLM and External APIs

- **Rule:** Never call LLM or third-party APIs with API keys from the client. Use an Edge Function (or app backend) as a proxy.
- **Pattern:** Create an Edge Function (e.g. `llm-proxy`) that accepts `{ messages, model?, stream? }`, calls OpenAI/Anthropic with a server-side API key, and returns JSON or a stream. Call it via `supabase.functions.invoke('llm-proxy', { body })` from a hook (e.g. `useLLM` or `useChat`).
- Use the same error handling and toasts as the rest of the API layer; map provider/rate-limit errors to user-facing messages.

## Best Practices

### 1. Error Handling
- Use consistent error handling across all API functions
- Provide meaningful error messages to users
- Log errors for debugging purposes
- Handle network errors gracefully

### 2. Caching Strategy
- Use appropriate stale times for different types of data
- Implement optimistic updates for better UX
- Invalidate related queries when data changes
- Use query keys consistently

### 3. Type Safety
- Define TypeScript interfaces for all API responses
- Use generic types for reusable API functions
- Validate API responses with runtime checks if needed
- Keep types in sync with backend schema
- Use generic types and API response types for type safety

### 4. Testing
- Mock API functions in tests
- Test error scenarios
- Verify query invalidation logic
- Test optimistic updates

This API layer architecture provides a solid foundation for data management in React applications, making the codebase more maintainable, testable, and user-friendly.
