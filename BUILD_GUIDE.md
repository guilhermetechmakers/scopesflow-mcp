# Build Guide - Modern React Stack

## Quick Setup

```bash
# 1. Create Vite + React + TypeScript project
npm create vite@latest my-app -- --template react-ts
cd my-app

# 2. Install dependencies
npm install react@^18.3.1 react-dom@^18.3.1 react-router-dom@^6.30.1 \
  @tanstack/react-query@^5.83.0 axios@^1.7.9 \
  react-hook-form@^7.61.1 @hookform/resolvers@^3.10.0 zod@^3.25.76 \
  clsx@^2.1.1 class-variance-authority@^0.7.1 tailwind-merge@^2.6.0 \
  tailwindcss-animate@^1.0.7 motion@^12.23.12 lucide-react@^0.462.0 \
  sonner@^1.7.4 date-fns@^3.6.0 \
  @radix-ui/react-slot@^1.2.3 @radix-ui/react-dropdown-menu@^2.1.15 \
  @radix-ui/react-dialog@^1.1.14 @radix-ui/react-select@^2.2.5 \
  @radix-ui/react-tabs@^1.1.12 @radix-ui/react-avatar@^1.1.10 \
  @radix-ui/react-label@^2.1.7

npm install -D @vitejs/plugin-react-swc@^3.11.0 \
  tailwindcss@^3.4.17 postcss@^8.5.6 autoprefixer@^10.4.21

# 3. Setup Shadcn
npx shadcn@latest init -d
npx shadcn@latest add button input card toast dialog

# 4. Run
npm run dev
```

## ⚠️ CRITICAL: Always Run npm install First

**NEVER run build commands without installing dependencies first!**

```bash
# ✅ CORRECT
npm install
npm run build

# ❌ WRONG - Will fail
npm run build
```

**Common errors fixed by npm install:**
- `Cannot find module 'typescript'`
- `vite: command not found`
- `Module not found: Can't resolve 'react'`

## Critical Project Rules

1. **ALWAYS run `npm install` before any build commands**
2. **ALWAYS implement dark and light modes** - Never create single-mode projects
3. Use Motion library for animations, NOT framer-motion
4. Import Inter font in index.css
5. Use Tailwind v3 with tailwind.config.js (not CSS-based config)
6. Use `@/` path aliases for imports
7. Use Shadcn components instead of custom UI components
8. Use theme-provider and theme-toggle components for theme management

## Essential Configuration Files

### vite.config.ts
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

### tailwind.config.js
```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        border: 'hsl(var(--border))',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      borderRadius: {
        lg: 'var(--radius)',
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
```

### src/index.css
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@import url('https://fonts.googleapis.com/css2?family=Inter:wght@100;200;300;400;500;600;700;800;900&display=swap');

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --radius: 0.5rem;
  }
  
  body {
    @apply bg-background text-foreground font-sans;
  }
}
```

## API Layer Pattern

### API Client (src/lib/api.ts)
```ts
import axios from 'axios';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000/api',
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

// Add auth token to requests
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle 401 errors
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('auth_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default apiClient;
```

### Resource API (src/api/projects.ts)
```ts
import apiClient from '@/lib/api';
import type { Project } from '@/types/project';

export const projectsApi = {
  getAll: async () => {
    const response = await apiClient.get<Project[]>('/projects');
    return response.data;
  },
  getById: async (id: string) => {
    const response = await apiClient.get<Project>(`/projects/${id}`);
    return response.data;
  },
  create: async (project: Partial<Project>) => {
    const response = await apiClient.post<Project>('/projects', project);
    return response.data;
  },
  update: async (id: string, updates: Partial<Project>) => {
    const response = await apiClient.put<Project>(`/projects/${id}`, updates);
    return response.data;
  },
  delete: async (id: string) => {
    await apiClient.delete(`/projects/${id}`);
  },
};
```

### React Query Hooks (src/hooks/useProjects.ts)
```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { projectsApi } from '@/api/projects';
import { toast } from 'sonner';

export const useProjects = () => {
  return useQuery({
    queryKey: ['projects'],
    queryFn: projectsApi.getAll,
    staleTime: 1000 * 60 * 5,
  });
};

export const useCreateProject = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: projectsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Project created!');
    },
    onError: (error) => {
      toast.error(`Failed: ${error.message}`);
    },
  });
};
```

## Core Component Patterns

### Utils (src/lib/utils.ts)
```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

### Animated Component
```tsx
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";

const MotionButton = motion.create(Button);

export function AnimatedButton(props) {
  return (
    <MotionButton
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      {...props}
    />
  );
}
```

### Card Component
```tsx
import { motion } from "motion/react";
import { Card } from "@/components/ui/card";
import { FileText } from "lucide-react";

export function ProjectCard({ title, description }) {
  return (
    <motion.div whileHover={{ y: -4 }}>
      <Card className="p-6">
        <div className="flex gap-4">
          <div className="rounded-lg bg-primary/10 p-3">
            <FileText className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold">{title}</h3>
            <p className="text-muted-foreground">{description}</p>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
```

## Design Patterns

### Landing Pages & Marketing Sites

**Hero Sections:**
- Animated gradients with subtle movement
- Particle systems or geometric shapes
- Interactive canvas backgrounds (Three.js, WebGL)
- Parallax scrolling effects
- Morphing blob animations
- Avoid plain solid colors

**Layout Patterns:**
- Bento grids (asymmetric card layouts)
- Masonry layouts
- Feature sections with diagonal cuts
- Overlapping elements
- Split-screen designs

**Scroll Animations:**
- Fade-in and slide-up for sections
- Scroll-triggered parallax
- Progress indicators
- Sticky elements that transform
- Text reveal animations
- Number counters

**CTAs:**
- Gradient buttons with hover effects
- Floating action buttons
- Animated borders or glowing effects
- Scale/lift on hover
- Pulsing indicators

### Dashboard Applications

**Layout Structure:**
```
/dashboard (layout with collapsible sidebar)
  /dashboard/overview
  /dashboard/analytics
  /dashboard/settings
```

**Sidebar Requirements:**
- Collapsible to icons only
- Smooth transitions
- Persistent state
- Mobile: drawer
- Desktop: sidebar with toggle

**Data Tables:**
- Sticky headers
- Row hover with elevation
- Sortable columns
- Pagination
- Search/filter
- Selection checkboxes
- Responsive: cards on mobile
- Loading skeletons
- Empty states with illustrations

**Charts:**
- Use Recharts, Chart.js v4, or Apache ECharts
- Animated transitions
- Interactive tooltips
- Responsive sizing
- Color scheme matching design system

**Metric Cards:**
- Gradient backgrounds
- Trend indicators (↑ ↓)
- Sparkline charts
- Hover effects
- Icons representing metrics

### Color & Visual Design

**Color Palettes:**
- Primary gradient (not just solid)
- Subtle background gradients
- Gradient text for headings
- Dark mode with elevated surfaces
- 60-30-10 rule (dominant, secondary, accent)
- Accessible contrast (WCAG AA)

**Typography:**
- Large, bold headings (48-72px for heroes)
- Clear size differences
- Variable weights (300, 400, 600, 700)
- Line height 1.5-1.7 for body
- Inter, Poppins, or DM Sans

**Shadows & Depth:**
- Multi-layer shadows
- Colored shadows matching element
- Elevated states on hover

### Interactions & Micro-animations

**Buttons:**
- Scale on hover (1.02-1.05)
- Lift with shadow
- Ripple effect on click
- Loading state with spinner
- Disabled state visible
- Success state with checkmark

**Cards:**
- Lift on hover with shadow
- Subtle border glow
- Tilt effect (3D transform)
- Smooth transitions (200-300ms)

**Forms:**
- Focus states with border color
- Floating labels
- Real-time validation
- Success checkmarks
- Error shake animation
- Password strength indicators
- Character count

**Page Transitions:**
- Fade + slide
- Skeleton loaders
- Optimistic UI
- Stagger animations for lists

### Mobile Responsiveness

**Mobile-First:**
- Touch targets 44x44px minimum
- Generous padding
- Sticky bottom navigation
- Collapsible sections
- Swipeable cards
- Pull-to-refresh

**Responsive Patterns:**
- Hamburger menu → full nav
- Card grid → stack
- Sidebar → drawer
- Multi-column → single
- Data tables → card list

### Loading & Empty States

**Loading:**
- Skeleton screens matching layout
- Progress bars for known durations
- Spinners only for <3s waits
- Stagger loading
- Shimmer effects

**Empty States:**
- Illustrations or icons
- Helpful copy
- Clear CTA
- Examples or suggestions

### Unique Elements

**Distinctive Features:**
- Custom cursor effects
- Animated page indicators
- Unusual hover effects
- Custom scrollbars
- Glassmorphism
- Animated SVG icons
- Typewriter effects
- Confetti animations

**Interactive Elements:**
- Drag-and-drop
- Sliders and range controls
- Toggle switches with animations
- Progress steps
- Expandable sections
- Tabs with slide indicators

## Consistency Rules

**Maintain:**
- Spacing scale: 4px, 8px, 16px, 24px, 32px, 48px, 64px
- Border radius values
- Animation timing: 200ms, 300ms, 500ms
- Color system
- Typography scale
- Icon style
- Button styles
- Form elements

**Project-Specific:**
- Color palette
- Layout creativity
- Illustration style
- Animation personality
- Hero section design

## Technical Excellence

**Performance:**
- Optimize images (WebP, lazy loading)
- Code splitting
- Debounce search inputs
- Virtualize long lists
- Minimize re-renders
- Proper memoization

**Accessibility:**
- Keyboard navigation
- ARIA labels
- Focus indicators
- Screen reader friendly
- Sufficient contrast
- Respect reduced motion

## Key Principles

1. **Be Bold** - Try unique layouts and interactions
2. **Be Consistent** - Same patterns for similar functions
3. **Be Responsive** - Beautiful on all devices
4. **Be Fast** - Smooth animations, quick loading
5. **Be Accessible** - Everyone can use it
6. **Be Modern** - Current trends and tech
7. **Be Unique** - Each project has personality
8. **Be Intuitive** - No instructions needed

