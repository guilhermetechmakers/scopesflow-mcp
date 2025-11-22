# Testing Guide - Vitest + React Testing Library

## Overview
This guide covers testing setup and patterns for the modern React boilerplate using Vitest and React Testing Library.

## Setup

### 1. Vitest Configuration (`vitest.config.ts`)
```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

### 2. Test Setup (`src/__tests__/setup.ts`)
```ts
import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock scrollTo
window.scrollTo = vi.fn();

// Mock Supabase client
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: null, error: null })),
        })),
        order: vi.fn(() => Promise.resolve({ data: [], error: null })),
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: null, error: null })),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ data: null, error: null })),
      })),
      delete: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ data: null, error: null })),
      })),
    })),
    auth: {
      getUser: vi.fn(() => Promise.resolve({ data: { user: null }, error: null })),
      signInWithPassword: vi.fn(() => Promise.resolve({ data: { user: null }, error: null })),
      signUp: vi.fn(() => Promise.resolve({ data: { user: null }, error: null })),
      signOut: vi.fn(() => Promise.resolve({ error: null })),
    },
  },
}));
```

### 3. Package.json Scripts
```json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage",
    "test:run": "vitest run"
  }
}
```

## Testing Patterns

### 1. Component Testing

#### Basic Component Test
```tsx
// src/__tests__/components/Button.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from '@/components/ui/button';

describe('Button', () => {
  it('renders with correct text', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });

  it('handles click events', () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click me</Button>);
    
    fireEvent.click(screen.getByText('Click me'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('applies variant classes correctly', () => {
    render(<Button variant="destructive">Delete</Button>);
    const button = screen.getByText('Delete');
    expect(button).toHaveClass('bg-destructive');
  });
});
```

#### Component with Motion Library
```tsx
// src/__tests__/components/AnimatedButton.test.tsx
import { render, screen } from '@testing-library/react';
import { AnimatedButton } from '@/components/AnimatedButton';

// Mock motion library
vi.mock('motion/react', () => ({
  motion: {
    create: vi.fn((Component) => Component),
  },
}));

describe('AnimatedButton', () => {
  it('renders with motion props', () => {
    render(<AnimatedButton>Animated Button</AnimatedButton>);
    expect(screen.getByText('Animated Button')).toBeInTheDocument();
  });
});
```

### 2. Hook Testing

#### Custom Hook Test
```tsx
// src/__tests__/hooks/useProjects.test.tsx
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useProjects } from '@/hooks/useProjects';

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('useProjects', () => {
  it('fetches projects successfully', async () => {
    const { result } = renderHook(() => useProjects(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toBeDefined();
    expect(result.current.error).toBeNull();
  });
});
```

### 3. API Testing

#### API Function Test
```tsx
// src/__tests__/api/projects.test.ts
import { describe, it, expect, vi } from 'vitest';
import { projectsApi } from '@/api/projects';

// Mock Supabase
const mockSupabase = {
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      order: vi.fn(() => Promise.resolve({ data: [], error: null })),
    })),
  })),
};

vi.mock('@/integrations/supabase/client', () => ({
  supabase: mockSupabase,
}));

describe('projectsApi', () => {
  it('fetches all projects', async () => {
    const projects = await projectsApi.getAll();
    expect(projects).toBeDefined();
    expect(mockSupabase.from).toHaveBeenCalledWith('projects');
  });
});
```

### 4. Integration Testing

#### Page Component Test
```tsx
// src/__tests__/pages/Dashboard.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Dashboard } from '@/pages/Dashboard';

const createTestWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{children}</BrowserRouter>
    </QueryClientProvider>
  );
};

describe('Dashboard', () => {
  it('renders dashboard content', async () => {
    render(<Dashboard />, { wrapper: createTestWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
    });
  });
});
```

## Testing Utilities

### 1. Custom Render Function
```tsx
// src/__tests__/utils/test-utils.tsx
import { render, RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { ReactElement } from 'react';

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  queryClient?: QueryClient;
}

export function renderWithProviders(
  ui: ReactElement,
  { queryClient = createTestQueryClient(), ...renderOptions }: CustomRenderOptions = {}
) {
  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>{children}</BrowserRouter>
      </QueryClientProvider>
    );
  }

  return { ...render(ui, { wrapper: Wrapper, ...renderOptions }), queryClient };
}
```

### 2. Mock Data Factories
```tsx
// src/__tests__/utils/factories.ts
export const createMockProject = (overrides = {}) => ({
  id: '1',
  name: 'Test Project',
  description: 'A test project',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  ...overrides,
});

export const createMockUser = (overrides = {}) => ({
  id: '1',
  email: 'test@example.com',
  created_at: '2024-01-01T00:00:00Z',
  ...overrides,
});
```

## Best Practices

### 1. Test Structure
- Use `describe` blocks to group related tests
- Use descriptive test names that explain the expected behavior
- Follow the AAA pattern: Arrange, Act, Assert

### 2. Mocking Strategy
- Mock external dependencies (APIs, libraries)
- Use `vi.mock()` for module mocking
- Create reusable mock factories for data

### 3. Async Testing
- Use `waitFor` for async operations
- Use `findBy*` queries for elements that appear asynchronously
- Set up proper query client with retry: false for tests

### 4. Coverage Goals
- Aim for 80%+ code coverage
- Focus on testing business logic and user interactions
- Don't test implementation details

## Common Test Scenarios

### 1. Form Testing
```tsx
// Testing form submission
it('submits form with valid data', async () => {
  const handleSubmit = vi.fn();
  render(<ProjectForm onSubmit={handleSubmit} />);

  fireEvent.change(screen.getByLabelText('Project Name'), {
    target: { value: 'New Project' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Create Project' }));

  await waitFor(() => {
    expect(handleSubmit).toHaveBeenCalledWith({
      name: 'New Project',
    });
  });
});
```

### 2. Error Handling
```tsx
// Testing error states
it('displays error message when API fails', async () => {
  // Mock API to return error
  vi.mocked(projectsApi.getAll).mockRejectedValue(new Error('API Error'));

  render(<ProjectList />);

  await waitFor(() => {
    expect(screen.getByText('Failed to load projects')).toBeInTheDocument();
  });
});
```

### 3. Loading States
```tsx
// Testing loading states
it('shows loading spinner while fetching data', () => {
  render(<ProjectList />);
  expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
});
```

## Running Tests

### Commands
```bash
# Run tests in watch mode
npm test

# Run tests once
npm run test:run

# Run tests with UI
npm run test:ui

# Generate coverage report
npm run test:coverage

# Run specific test file
npm test Button.test.tsx

# Run tests matching pattern
npm test -- --grep "Button"
```

### CI/CD Integration
```yaml
# GitHub Actions example
- name: Run tests
  run: npm run test:run

- name: Generate coverage
  run: npm run test:coverage
```

This testing setup provides a solid foundation for testing React components, hooks, and API functions with Vitest and React Testing Library.
