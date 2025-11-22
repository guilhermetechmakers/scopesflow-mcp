# API Layer Architecture Guide

## Overview
This guide covers the centralized API layer architecture for the modern React boilerplate. The API layer provides a clean separation between data fetching logic and UI components, making the codebase more maintainable and testable. This guide uses generic REST API patterns that work with any backend.

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

## API Layer Implementation

### 1. API Client Configuration (`src/api/client.ts`)
```ts
import axios, { AxiosInstance, AxiosError } from 'axios';

// Create axios instance with default config
const apiClient: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000/api',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for auth tokens
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      // Handle unauthorized access
      localStorage.removeItem('auth_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default apiClient;

// Type definitions
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
import apiClient from './client';
import type { Project, CreateProjectInput, UpdateProjectInput } from '@/types/project';

export const projectsApi = {
  // Get all projects
  getAll: async (): Promise<Project[]> => {
    const response = await apiClient.get<Project[]>('/projects');
    return response.data;
  },

  // Get project by ID
  getById: async (id: string): Promise<Project> => {
    const response = await apiClient.get<Project>(`/projects/${id}`);
    return response.data;
  },

  // Create new project
  create: async (project: CreateProjectInput): Promise<Project> => {
    const response = await apiClient.post<Project>('/projects', project);
    return response.data;
  },

  // Update project
  update: async (id: string, updates: UpdateProjectInput): Promise<Project> => {
    const response = await apiClient.put<Project>(`/projects/${id}`, updates);
    return response.data;
  },

  // Partial update project
  patch: async (id: string, updates: Partial<UpdateProjectInput>): Promise<Project> => {
    const response = await apiClient.patch<Project>(`/projects/${id}`, updates);
    return response.data;
  },

  // Delete project
  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/projects/${id}`);
  },

  // Get projects by user
  getByUserId: async (userId: string): Promise<Project[]> => {
    const response = await apiClient.get<Project[]>(`/projects/user/${userId}`);
    return response.data;
  },

  // Search projects
  search: async (query: string): Promise<Project[]> => {
    const response = await apiClient.get<Project[]>('/projects/search', {
      params: { q: query },
    });
    return response.data;
  },
};
```

### 3. Users API (`src/api/users.ts`)
```ts
import apiClient from './client';
import type { User, UpdateUserInput } from '@/types/user';

export const usersApi = {
  // Get current user
  getCurrent: async (): Promise<User> => {
    const response = await apiClient.get<User>('/users/me');
    return response.data;
  },

  // Update user profile
  updateProfile: async (updates: UpdateUserInput): Promise<User> => {
    const response = await apiClient.put<User>(`/users/${updates.id}`, updates);
    return response.data;
  },

  // Get user by ID
  getById: async (id: string): Promise<User> => {
    const response = await apiClient.get<User>(`/users/${id}`);
    return response.data;
  },

  // Get all users (admin only)
  getAll: async (): Promise<User[]> => {
    const response = await apiClient.get<User[]>('/users');
    return response.data;
  },

  // Delete user account
  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/users/${id}`);
  },
};
```

### 4. Authentication API (`src/api/auth.ts`)
```ts
import apiClient from './client';
import type { AuthResponse, SignInInput, SignUpInput } from '@/types/auth';

export const authApi = {
  // Sign in with email and password
  signIn: async (credentials: SignInInput): Promise<AuthResponse> => {
    const response = await apiClient.post<AuthResponse>('/auth/login', credentials);
    
    // Store auth token
    if (response.data.token) {
      localStorage.setItem('auth_token', response.data.token);
    }
    
    return response.data;
  },

  // Sign up with email and password
  signUp: async (credentials: SignUpInput): Promise<AuthResponse> => {
    const response = await apiClient.post<AuthResponse>('/auth/register', credentials);
    
    // Optionally store token on signup
    if (response.data.token) {
      localStorage.setItem('auth_token', response.data.token);
    }
    
    return response.data;
  },

  // Sign out
  signOut: async (): Promise<void> => {
    await apiClient.post('/auth/logout');
    localStorage.removeItem('auth_token');
  },

  // Reset password - send reset email
  resetPassword: async (email: string): Promise<void> => {
    await apiClient.post('/auth/forgot-password', { email });
  },

  // Update password with reset token
  updatePassword: async (token: string, newPassword: string): Promise<void> => {
    await apiClient.post('/auth/reset-password', { token, password: newPassword });
  },

  // Refresh auth token
  refreshToken: async (): Promise<AuthResponse> => {
    const response = await apiClient.post<AuthResponse>('/auth/refresh');
    
    if (response.data.token) {
      localStorage.setItem('auth_token', response.data.token);
    }
    
    return response.data;
  },

  // Verify email with token
  verifyEmail: async (token: string): Promise<void> => {
    await apiClient.post('/auth/verify-email', { token });
  },
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
- Use axios response types for type safety

### 4. Testing
- Mock API functions in tests
- Test error scenarios
- Verify query invalidation logic
- Test optimistic updates

This API layer architecture provides a solid foundation for data management in React applications, making the codebase more maintainable, testable, and user-friendly.
