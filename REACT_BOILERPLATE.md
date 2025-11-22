# Enhanced Vite + React (TS) + Tailwind v3 + Shadcn Boilerplate (Lovable-Compatible)

## Overview
A streamlined, modern React boilerplate built for rapid development and prototyping. This boilerplate features Vite, TypeScript, **Tailwind CSS v3**, shadcn/ui components, React Router, React Query, and **Recharts** for data visualization - optimized to match Lovable's approach.

## Tech Stack
- **Language:** TypeScript
- **Framework:** React 18 + **Vite**
- **Routing:** `react-router-dom` v6
- **Styling/UI:** **Tailwind CSS v3**, **shadcn/ui** (Radix), `class-variance-authority`, `tailwind-merge`, `tailwindcss-animate`
- **Typography:** **@tailwindcss/typography** for rich text content
- **Animations:** **Tailwind CSS animations** + custom keyframes
- **Forms & Validation:** `react-hook-form`, `zod`, `@hookform/resolvers`
- **Data Fetching:** **@tanstack/react-query** + **native fetch()**
- **Charts:** **Recharts** for data visualization
- **Icons:** **lucide-react**
- **Linting/Types:** ESLint, TypeScript

## Project Structure
```
my-app/
├─ index.html
├─ package.json
├─ tsconfig.json
├─ vite.config.ts
├─ components.json     # shadcn/ui config
├─ .env               # local env (never commit)
├─ .env.example       # documents required env vars
└─ src/
   ├─ main.tsx        # mounts <App />
   ├─ App.tsx         # Router + Providers (QueryClient, Theme, Toast)
   ├─ index.css       # Enhanced with CSS custom properties
   ├─ pages/
   │  ├─ Home.tsx
   │  ├─ ProjectDetails.tsx
   │  └─ NotFound.tsx
   ├─ components/
   │  ├─ ui/          # shadcn-generated components (button, input, card, ...)
   │  ├─ layout/      # Layout components (Navbar, Footer, etc.)
   │  └─ charts/      # Recharts components
   ├─ hooks/          # custom hooks
   │  ├─ useProjects.ts
   │  └─ use-toast.ts
   ├─ lib/
   │  ├─ utils.ts     # cn() via clsx + tailwind-merge, helpers
   │  └─ api.ts       # Fetch-based API utilities
   ├─ types/
   │  └─ project.ts
   └─ contexts/
```

## Dependencies
```jsonc
// package.json (essentials)
"dependencies": {
  "react": "^18.3.1",
  "react-dom": "^18.3.1",
  "react-router-dom": "^6.30.1",
  "@tanstack/react-query": "^5.83.0",
  "react-hook-form": "^7.61.1",
  "@hookform/resolvers": "^3.10.0",
  "zod": "^3.25.76",
  "clsx": "^2.1.1",
  "class-variance-authority": "^0.7.1",
  "tailwind-merge": "^2.6.0",
  "tailwindcss-animate": "^1.0.7",
  "lucide-react": "^0.462.0",
  "sonner": "^1.7.4",
  "date-fns": "^3.6.0",
  "recharts": "^2.15.4",
  
  // Complete Radix UI Component Suite (from itinerary-orchestra)
  "@radix-ui/react-accordion": "^1.2.11",
  "@radix-ui/react-alert-dialog": "^1.1.14",
  "@radix-ui/react-aspect-ratio": "^1.1.7",
  "@radix-ui/react-avatar": "^1.1.10",
  "@radix-ui/react-checkbox": "^1.3.2",
  "@radix-ui/react-collapsible": "^1.1.11",
  "@radix-ui/react-context-menu": "^2.2.15",
  "@radix-ui/react-dialog": "^1.1.14",
  "@radix-ui/react-dropdown-menu": "^2.1.15",
  "@radix-ui/react-hover-card": "^1.1.14",
  "@radix-ui/react-label": "^2.1.7",
  "@radix-ui/react-menubar": "^1.1.15",
  "@radix-ui/react-navigation-menu": "^1.2.13",
  "@radix-ui/react-popover": "^1.1.14",
  "@radix-ui/react-progress": "^1.1.7",
  "@radix-ui/react-radio-group": "^1.3.7",
  "@radix-ui/react-scroll-area": "^1.2.9",
  "@radix-ui/react-select": "^2.2.5",
  "@radix-ui/react-separator": "^1.1.7",
  "@radix-ui/react-slider": "^1.3.5",
  "@radix-ui/react-slot": "^1.2.3",
  "@radix-ui/react-switch": "^1.2.5",
  "@radix-ui/react-tabs": "^1.1.12",
  "@radix-ui/react-toast": "^1.2.14",
  "@radix-ui/react-toggle": "^1.1.9",
  "@radix-ui/react-toggle-group": "^1.1.10",
  "@radix-ui/react-tooltip": "^1.2.7",
  
  // Additional UI packages
  "cmdk": "^1.1.1",
  "embla-carousel-react": "^8.6.0",
  "input-otp": "^1.4.2",
  "react-day-picker": "^8.10.1",
  "react-resizable-panels": "^2.1.9",
  "vaul": "^0.9.9",
  "next-themes": "^0.3.0"
},
"devDependencies": {
  "vite": "^5.4.19",
  "typescript": "^5.8.3",
  "@vitejs/plugin-react-swc": "^3.11.0",
  "tailwindcss": "^3.4.17",
  "@tailwindcss/typography": "^0.5.16",
  "eslint": "^9.32.0",
  "@types/react": "^18.3.23",
  "@types/react-dom": "^18.3.7",
  "postcss": "^8.5.6",
  "autoprefixer": "^10.4.21"
}
```

## ⚠️ Critical Setup Steps for AI Agents

**IMPORTANT:** When working on a React project, you MUST follow these steps in order:

### 1. After Modifying package.json - ALWAYS Run npm install

```bash
npm install
```

**Why this matters:**
- Installing dependencies is NOT automatic when you modify `package.json`
- TypeScript, Vite, and all libraries must be installed before building
- Missing dependencies cause cryptic build errors

**Common errors fixed by npm install:**
- `Cannot find module 'typescript'` → Run `npm install`
- `vite: command not found` → Run `npm install`
- `Module not found: Can't resolve 'react'` → Run `npm install`
- Any `ENOENT` or path resolution errors → Run `npm install`

### 2. Before Running Build Commands

NEVER run `npm run build` or `npm run dev` without first running `npm install`:

```bash
# ✅ CORRECT ORDER
npm install
npm run build

# ❌ WRONG - Will fail with missing module errors
npm run build
```

### 3. After Cloning or Creating a Project

```bash
cd project-directory
npm install          # Install all dependencies first
npm run dev          # Then start development
```

### 4. Troubleshooting Build Errors

If you encounter build errors:

1. **First, always try:** `npm install`
2. Check that `package.json` has all required dependencies
3. Verify `node_modules/` directory exists and has content
4. Check that TypeScript is installed: `npx tsc --version`
5. Only then investigate the specific error message

**Remember:** 90% of initial build errors are caused by missing dependencies!

## Quickstart
```bash
# 1) Create project
npm create vite@latest my-app -- --template react-ts
cd my-app

# 2) Install core dependencies
npm install react@^18.3.1 react-dom@^18.3.1 react-router-dom@^6.30.1 \
  @tanstack/react-query@^5.83.0 \
  react-hook-form@^7.61.1 @hookform/resolvers@^3.10.0 zod@^3.25.76 \
  clsx@^2.1.1 class-variance-authority@^0.7.1 tailwind-merge@^2.6.0 \
  tailwindcss-animate@^1.0.7 lucide-react@^0.462.0 \
  sonner@^1.7.4 date-fns@^3.6.0 recharts@^2.15.4 \
  @radix-ui/react-accordion@^1.2.11 @radix-ui/react-alert-dialog@^1.1.14 \
  @radix-ui/react-aspect-ratio@^1.1.7 @radix-ui/react-avatar@^1.1.10 \
  @radix-ui/react-checkbox@^1.3.2 @radix-ui/react-collapsible@^1.1.11 \
  @radix-ui/react-context-menu@^2.2.15 @radix-ui/react-dialog@^1.1.14 \
  @radix-ui/react-dropdown-menu@^2.1.15 @radix-ui/react-hover-card@^1.1.14 \
  @radix-ui/react-label@^2.1.7 @radix-ui/react-menubar@^1.1.15 \
  @radix-ui/react-navigation-menu@^1.2.13 @radix-ui/react-popover@^1.1.14 \
  @radix-ui/react-progress@^1.1.7 @radix-ui/react-radio-group@^1.3.7 \
  @radix-ui/react-scroll-area@^1.2.9 @radix-ui/react-select@^2.2.5 \
  @radix-ui/react-separator@^1.1.7 @radix-ui/react-slider@^1.3.5 \
  @radix-ui/react-slot@^1.2.3 @radix-ui/react-switch@^1.2.5 \
  @radix-ui/react-tabs@^1.1.12 @radix-ui/react-toast@^1.2.14 \
  @radix-ui/react-toggle@^1.1.9 @radix-ui/react-toggle-group@^1.1.10 \
  @radix-ui/react-tooltip@^1.2.7 cmdk@^1.1.1 embla-carousel-react@^8.6.0 \
  input-otp@^1.4.2 react-day-picker@^8.10.1 react-resizable-panels@^2.1.9 \
  vaul@^0.9.9 next-themes@^0.3.0

# 3) Install dev dependencies
npm install -D @vitejs/plugin-react-swc@^3.11.0 \
  tailwindcss@^3.4.17 @tailwindcss/typography@^0.5.16 \
  postcss@^8.5.6 autoprefixer@^10.4.21

# 4) Initialize shadcn/ui
npx shadcn@latest init -d

# 5) Add ALL shadcn components (complete UI library)
npx shadcn@latest add button input card toast dialog select tabs accordion \
  alert-dialog avatar checkbox collapsible dropdown-menu hover-card label \
  menubar navigation-menu popover progress radio-group scroll-area separator \
  slider switch toggle tooltip aspect-ratio breadcrumb calendar carousel \
  command context-menu drawer form input-otp pagination resizable sheet \
  skeleton table textarea toggle-group

# 6) Setup environment
cp .env.example .env  # then fill API endpoint values

# 7) Run
npm run dev
```

## Complete Shadcn/UI Component Setup

### Why Install All Components Upfront?

Based on the itinerary-orchestra project pattern, we install ALL shadcn/ui components from the start because:

- **Consistency**: Every project has the same component library available
- **Productivity**: No need to stop development to install missing components
- **Design System**: Ensures consistent UI patterns across all projects
- **Future-Proof**: Components are ready when features are added

### Complete Component List

The boilerplate includes these shadcn/ui components:

**Core Components:**
- `button`, `input`, `card`, `toast`, `dialog`, `select`, `tabs`

**Layout Components:**
- `accordion`, `collapsible`, `separator`, `aspect-ratio`, `resizable`

**Navigation Components:**
- `menubar`, `navigation-menu`, `breadcrumb`, `pagination`

**Form Components:**
- `checkbox`, `radio-group`, `switch`, `toggle`, `toggle-group`, `slider`, `form`, `input-otp`

**Overlay Components:**
- `alert-dialog`, `popover`, `hover-card`, `dropdown-menu`, `context-menu`, `sheet`, `drawer`

**Data Display:**
- `table`, `calendar`, `carousel`, `avatar`, `skeleton`, `progress`

**Interactive Components:**
- `command`, `scroll-area`, `label`, `tooltip`, `textarea`

### Component Import Pattern

All components use the `@/` path alias system:

```tsx
// Import any component from the complete library
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
// ... and 40+ more components available
```

### Path Aliases Configuration

The `components.json` configuration matches itinerary-orchestra:

```json
{
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

This ensures consistent imports across all projects and matches the proven pattern from itinerary-orchestra.

## Tailwind v3 Setup

⚠️ **IMPORTANT:** Tailwind v3 uses traditional configuration with `tailwind.config.js`

### 1. Vite Configuration (`vite.config.ts`)
```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
})
```

### 2. Tailwind Configuration (`tailwind.config.js`)
```js
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Define your color system based on Design_reference.md
        // Use CSS custom properties for theme consistency
        primary: {
          DEFAULT: 'rgb(var(--primary))',
          foreground: 'rgb(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'rgb(var(--secondary))',
          foreground: 'rgb(var(--secondary-foreground))',
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
        // Add more colors as specified in Design_reference.md
      },
      fontFamily: {
        // Define fonts based on Design_reference.md
        sans: ['Inter', 'sans-serif'],
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out',
        'fade-in-up': 'fadeInUp 0.4s ease-out',
        'fade-in-down': 'fadeInDown 0.4s ease-out',
        'slide-in-left': 'slideInLeft 0.3s ease-out',
        'slide-in-right': 'slideInRight 0.3s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
        'bounce-in': 'bounceIn 0.6s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeInDown: {
          '0%': { opacity: '0', transform: 'translateY(-20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInLeft: {
          '0%': { opacity: '0', transform: 'translateX(-20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.9)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        bounceIn: {
          '0%': { opacity: '0', transform: 'scale(0.3)' },
          '50%': { opacity: '1', transform: 'scale(1.05)' },
          '70%': { transform: 'scale(0.9)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
      // Add custom shadows, spacing, etc. based on Design_reference.md
    },
  },
  plugins: [
    require("tailwindcss-animate"),
    require("@tailwindcss/typography"),
  ],
}
```

### 3. PostCSS Configuration (`postcss.config.js`)
```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

### 4. CSS Setup with Design System (`src/index.css`)

**IMPORTANT:** Define your color system based on `Design_reference.md` specifications.

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* Import fonts as specified in Design_reference.md */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@100;200;300;400;500;600;700;800;900&display=swap');

/* Design System with CSS Custom Properties */
@layer base {
  :root {
    /* Define your color palette based on Design_reference.md */
    /* Use RGB format for consistency: --color-name: R G B; */
    /* RGB values without rgb() wrapper - space-separated */
    
    --background: 255 255 255;
    --foreground: 30 41 59;
    
    --primary: 59 130 246;
    --primary-foreground: 255 255 255;
    
    --secondary: 100 116 139;
    --secondary-foreground: 255 255 255;
    
    --card: 255 255 255;
    --card-foreground: 30 41 59;
    
    --border: 226 232 240;
    --input: 226 232 240;
    --ring: 59 130 246;
    
    /* Add more variables as needed from Design_reference.md */
    
    --radius: 0.5rem; /* Adjust based on design */
  }
}

@layer base {
  * {
    @apply border-border;
  }
  
  body {
    @apply bg-background text-foreground font-sans;
    /* Apply typography from Design_reference.md */
  }
  
  /* Configure heading styles based on Design_reference.md */
  h1, h2, h3, h4, h5, h6 {
    font-weight: 600;
    line-height: 1.2;
  }
}

@layer components {
  /* Add custom component classes based on Design_reference.md */
  /* Example: .btn-primary, .card-hover, etc. */
}

/* Smooth Scrolling */
@media (prefers-reduced-motion: no-preference) {
  html {
    scroll-behavior: smooth;
  }
}

/* Custom Animations */
@keyframes accordion-down {
  from { height: 0; }
  to { height: var(--radix-accordion-content-height); }
}

@keyframes accordion-up {
  from { height: var(--radix-accordion-content-height); }
  to { height: 0; }
}

/* Focus Visible for Accessibility */
:focus-visible {
  outline: 2px solid rgb(var(--ring));
  outline-offset: 2px;
}
```

**Note:** All color values, typography, spacing, and design tokens should be extracted from `Design_reference.md` and implemented in your CSS custom properties.

## API Layer with Native Fetch

Simple, lightweight API utilities using native fetch():

### Fetch-based API Utilities (`src/lib/api.ts`)
```ts
// Simple fetch wrapper with error handling
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${import.meta.env.VITE_API_URL || 'http://localhost:3000/api'}${endpoint}`;
  
  const config: RequestInit = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  };

  // Add auth token if available
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers = {
      ...config.headers,
      Authorization: `Bearer ${token}`,
    };
  }

  const response = await fetch(url, config);

  if (!response.ok) {
    if (response.status === 401) {
      localStorage.removeItem('auth_token');
      window.location.href = '/login';
    }
    throw new Error(`API Error: ${response.status}`);
  }

  return response.json();
}

// API utilities
export const api = {
  get: <T>(endpoint: string) => apiRequest<T>(endpoint),
  post: <T>(endpoint: string, data: unknown) => 
    apiRequest<T>(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  put: <T>(endpoint: string, data: unknown) => 
    apiRequest<T>(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (endpoint: string) => 
    apiRequest(endpoint, { method: 'DELETE' }),
};
```

### Resource API Example
```ts
// src/hooks/useProjects.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Project, CreateProjectInput } from '@/types/project';

export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: () => api.get<Project[]>('/projects'),
  });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: ['projects', id],
    queryFn: () => api.get<Project>(`/projects/${id}`),
    enabled: !!id,
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (project: CreateProjectInput) => 
      api.post<Project>('/projects', project),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}
```

## Environment Configuration
**.env**
```ini
VITE_API_URL=http://localhost:3000/api
```

**.env.example**
```ini
# API Configuration
VITE_API_URL=http://localhost:3000/api

# Add your backend API URL here
# For production, use your deployed API endpoint
```

## Providers in `App.tsx`
Wrap the app with Router, QueryClient, and Toaster.
```tsx
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toast";
import Home from "@/pages/Home";
import ProjectDetails from "@/pages/ProjectDetails";
import NotFound from "@/pages/NotFound";

// React Query client with optimal defaults
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 10, // 10 minutes (formerly cacheTime)
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/project/:id" element={<ProjectDetails />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
      <Toaster />
    </QueryClientProvider>
  );
}
```

## Tailwind CSS Animations

### Enhanced Tailwind Configuration with Custom Animations
```js
// tailwind.config.js - Add to theme.extend
module.exports = {
  theme: {
    extend: {
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out',
        'fade-in-up': 'fadeInUp 0.4s ease-out',
        'fade-in-down': 'fadeInDown 0.4s ease-out',
        'slide-in-left': 'slideInLeft 0.3s ease-out',
        'slide-in-right': 'slideInRight 0.3s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
        'bounce-in': 'bounceIn 0.6s ease-out',
        'stagger': 'fadeInUp 0.4s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeInDown: {
          '0%': { opacity: '0', transform: 'translateY(-20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInLeft: {
          '0%': { opacity: '0', transform: 'translateX(-20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.9)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        bounceIn: {
          '0%': { opacity: '0', transform: 'scale(0.3)' },
          '50%': { opacity: '1', transform: 'scale(1.05)' },
          '70%': { transform: 'scale(0.9)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
```

### Page Transitions with CSS
```tsx
// src/components/AnimatedPage.tsx
import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface AnimatedPageProps {
  children: ReactNode;
  className?: string;
}

export function AnimatedPage({ children, className }: AnimatedPageProps) {
  return (
    <div className={cn("animate-fade-in-up", className)}>
      {children}
    </div>
  );
}
```

### Staggered List Animations
```tsx
// src/components/AnimatedList.tsx
import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function AnimatedList({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-2">
      {children}
    </div>
  );
}

export function AnimatedListItem({ 
  children, 
  delay = 0 
}: { 
  children: ReactNode;
  delay?: number;
}) {
  return (
    <div 
      className="animate-fade-in-up"
      style={{ animationDelay: `${delay * 100}ms` }}
    >
      {children}
    </div>
  );
}
```

### Interactive Button Animations
```tsx
// Example usage with hover and active states
<button className="bg-primary text-white px-6 py-3 rounded-lg transition-all duration-200 hover:scale-105 hover:shadow-lg active:scale-95 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2">
  Click Me
</button>
```

## Recharts Integration

### Basic Chart Component
```tsx
// src/components/charts/AnalyticsChart.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface ChartData {
  name: string;
  value: number;
}

interface AnalyticsChartProps {
  data: ChartData[];
  title: string;
}

export function AnalyticsChart({ data, title }: AnalyticsChartProps) {
  return (
    <Card className="animate-fade-in-up">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Line 
              type="monotone" 
              dataKey="value" 
              stroke="rgb(var(--primary))" 
              strokeWidth={2}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
```

### Dashboard with Multiple Charts
```tsx
// src/components/charts/Dashboard.tsx
import { AnalyticsChart } from "./AnalyticsChart";
import { BarChart, Bar, PieChart, Pie, Cell } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const COLORS = ['rgb(var(--primary))', 'rgb(var(--secondary))', '#8884d8', '#82ca9d'];

export function Dashboard() {
  const lineData = [
    { name: 'Jan', value: 400 },
    { name: 'Feb', value: 300 },
    { name: 'Mar', value: 600 },
    { name: 'Apr', value: 800 },
  ];

  const pieData = [
    { name: 'Group A', value: 400 },
    { name: 'Group B', value: 300 },
    { name: 'Group C', value: 300 },
    { name: 'Group D', value: 200 },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6">
      <AnalyticsChart data={lineData} title="Monthly Analytics" />
      
      <Card className="animate-fade-in-up">
        <CardHeader>
          <CardTitle>Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
```

## Typography Plugin Usage

### Rich Text Content
```tsx
// src/components/RichContent.tsx
import { Card } from "@/components/ui/card";

export function RichContent({ content }: { content: string }) {
  return (
    <Card className="p-6">
      <div 
        className="prose prose-slate max-w-none"
        dangerouslySetInnerHTML={{ __html: content }}
      />
    </Card>
  );
}
```

### Blog Post Component
```tsx
// src/components/BlogPost.tsx
import { Card, CardContent, CardHeader } from "@/components/ui/card";

interface BlogPostProps {
  title: string;
  content: string;
  author: string;
  date: string;
}

export function BlogPost({ title, content, author, date }: BlogPostProps) {
  return (
    <article className="animate-fade-in-up">
      <Card>
        <CardHeader>
          <h1 className="text-3xl font-bold">{title}</h1>
          <div className="text-muted-foreground">
            By {author} • {date}
          </div>
        </CardHeader>
        <CardContent>
          <div className="prose prose-lg prose-slate max-w-none">
            {content.split('\n').map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>
        </CardContent>
      </Card>
    </article>
  );
}
```

## Useful Patterns

### 1. `cn()` Utility (`src/lib/utils.ts`)
```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

### 2. Custom Hooks Organization
- **Domain models:** `src/types/*`
- **Feature sections:** `src/components/home/*`, `src/components/charts/*`
- **Data hooks:** `src/hooks/useProjects.ts` using React Query + native fetch
- **API utilities:** `src/lib/api.ts`

### 3. Modern Component Pattern with Tailwind Animations
```tsx
// src/components/ProjectCard.tsx
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProjectCardProps {
  title: string;
  description: string;
  date: string;
  className?: string;
}

export function ProjectCard({ title, description, date, className }: ProjectCardProps) {
  return (
    <div className="group animate-fade-in-up">
      <Card className={cn(
        "p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg",
        className
      )}>
        <div className="flex items-start gap-4">
          <div className="rounded-lg bg-primary/10 p-3 transition-colors group-hover:bg-primary/20">
            <FileText className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-lg transition-colors group-hover:text-primary">
              {title}
            </h3>
            <p className="text-muted-foreground mt-1">{description}</p>
            <div className="flex items-center gap-2 mt-3 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>{date}</span>
            </div>
          </div>
        </div>
        <Button 
          variant="outline" 
          className="w-full mt-4 transition-all hover:scale-[1.02]"
        >
          View Details
        </Button>
      </Card>
    </div>
  );
}
```

### 4. Enhanced Button Component
```tsx
// src/components/ui/animated-button.tsx
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function AnimatedButton({ className, ...props }: ButtonProps) {
  return (
    <Button
      className={cn(
        "transition-all duration-200 hover:scale-105 hover:shadow-lg active:scale-95",
        className
      )}
      {...props}
    />
  );
}
```

### 5. Sonner Toast Integration
```tsx
// Use Sonner for toast notifications
import { toast } from "sonner";
import { Toaster } from "sonner";

// In your App.tsx
function App() {
  return (
    <div>
      {/* Your app content */}
      <Toaster />
    </div>
  );
}

// Usage in components
function MyComponent() {
  const handleSuccess = () => {
    toast.success("Project created successfully!");
  };
  
  const handleError = () => {
    toast.error("Failed to create project");
  };
  
  const handleLoading = () => {
    const toastId = toast.loading("Creating project...");
    // Later...
    toast.success("Project created!", { id: toastId });
  };
}
```

---

## Best Practices Checklist

### ✅ Styling & Design
- [x] Tailwind v3 with comprehensive CSS custom properties
- [x] Inter font loaded via Google Fonts
- [x] Shadcn/ui components for consistent design system
- [x] Tailwind CSS animations with custom keyframes
- [x] Typography plugin for rich text content
- [x] Lucide React for modern icons
- [x] Base styles with proper reset and typography
- [x] Enhanced design system with RGB color values
- [x] Responsive design with mobile-first approach
- [x] Accessibility with focus-visible styles

### ✅ Performance
- [x] React Query with optimal cache settings
- [x] Code splitting with dynamic imports
- [x] Optimized CSS animations with hardware acceleration
- [x] Native fetch() for lightweight HTTP requests
- [x] Proper image optimization (WebP, lazy loading)
- [x] Tree-shaking enabled in Vite
- [x] SWC for faster builds

### ✅ Developer Experience
- [x] TypeScript strict mode
- [x] ESLint configured
- [x] Path aliases (`@/*`)
- [x] Environment variables with type safety
- [x] Lightweight fetch-based API utilities
- [x] Recharts for data visualization
- [x] Typography plugin for rich content

### ✅ Architecture
- [x] Feature-based folder structure
- [x] Separation of concerns (components, hooks, utils, charts)
- [x] Lightweight API utilities in `src/lib/api.ts`
- [x] Schema validation with Zod
- [x] Error boundaries
- [x] Streamlined for rapid prototyping

---

## Important Notes

⚠️ **Critical Setup Requirements:**

1. **Tailwind v3 Config** - Use `tailwind.config.js` with CSS custom properties and Typography plugin
2. **Font Import** - Always include Inter font in CSS for consistent typography
3. **Vite SWC** - Use `@vitejs/plugin-react-swc` for faster builds
4. **Shadcn Init** - Run `npx shadcn@latest init -d` to setup components properly
5. **Base Styles** - Include body, root, and reset styles in `index.css`
6. **Custom Animations** - Add keyframes to Tailwind config for smooth transitions
7. **API Utilities** - Use lightweight fetch wrapper in `src/lib/api.ts`

📦 **Project Consistency:**
- Commit `ui/` (shadcn) components for consistency across projects
- Keep `.env.example` updated so onboarding is trivial
- Prefer typed APIs and schema validation with `zod` for reliability
- Use Tailwind CSS animations for all interactive elements and page transitions
- Always use `lucide-react` icons for consistency
- Use Sonner for toast notifications
- Use Recharts for data visualization
- Use native fetch() with lightweight API utilities
- Typography plugin for rich text content

🎨 **Beautiful UI Requirements:**
- Modern card-based layouts with shadows and rounded corners
- Smooth page transitions with Tailwind CSS animations
- Hover states on interactive elements
- Loading states with skeleton loaders
- Toast notifications with Sonner
- Data visualization with Recharts
- Rich typography with Typography plugin
- Comprehensive design system with RGB colors
