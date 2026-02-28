# Modern React Stack - Quick Reference

## 🎯 The Golden Rules

1. **USE `tailwind.config.js`** - Tailwind v3 with CSS custom properties
2. **ALWAYS import Inter font** in `src/index.css`
3. **ALWAYS use Tailwind CSS animations** with custom keyframes (NOT Motion library or framer-motion)
4. **ALWAYS use Shadcn components** instead of custom
5. **ALWAYS use Lucide icons**
6. **ALWAYS use Sonner** for toast notifications
7. **ALWAYS set up Vitest** for testing
8. **API layer:** Use native `fetch()` with the API utilities in `src/lib/api.ts` (see REACT_BOILERPLATE)
9. **When using Supabase:** Use the client for DB/Auth/Realtime/Storage; use Edge Functions for server-only logic and LLM. **Always** create `supabase/functions/_shared/cors.ts` first. Every Edge Function must handle OPTIONS preflight, import `corsHeaders`, and pass the `Authorization` header through to the Supabase client (see EDGE_FUNCTIONS_GUIDE).
10. **LLM / AI:** Never expose LLM API keys in the client. Call an Edge Function or backend: `supabase.functions.invoke('llm-proxy', { body: { messages } })`.

---

## 🚀 Quick Setup

```bash
# 1. Create project
npm create vite@latest my-app -- --template react-ts
cd my-app

# 2. Install everything (native fetch - no axios; Tailwind animations - no Motion)
npm install react@^18.3.1 react-dom@^18.3.1 react-router-dom@^6.30.1 \
  @tanstack/react-query@^5.83.0 \
  react-hook-form@^7.61.1 @hookform/resolvers@^3.10.0 zod@^3.25.76 \
  clsx@^2.1.1 class-variance-authority@^0.7.1 tailwind-merge@^2.6.0 \
  tailwindcss-animate@^1.0.7 lucide-react@^0.462.0 \
  sonner@^1.7.4 date-fns@^3.6.0 recharts@^2.15.4 \
  @radix-ui/react-slot@^1.2.3 @radix-ui/react-dropdown-menu@^2.1.15 \
  @radix-ui/react-toast@^1.2.14 @radix-ui/react-dialog@^1.1.14 \
  @radix-ui/react-select@^2.2.5 @radix-ui/react-tabs@^1.1.12 \
  @radix-ui/react-avatar@^1.1.10 @radix-ui/react-label@^2.1.7

# Optional when using Supabase: npm install @supabase/supabase-js

npm install -D vitest@^3.2.4 @testing-library/react@^16.3.0 \
  @testing-library/jest-dom@^6.7.0 @testing-library/user-event@^14.6.1 \
  jsdom@^26.1.0 @vitejs/plugin-react-swc@^3.11.0 \
  tailwindcss@^3.4.17 @tailwindcss/typography@^0.5.16 postcss@^8.5.6 autoprefixer@^10.4.21

# 3. Setup Shadcn
npx shadcn@latest init -d
npx shadcn@latest add button input card toast
```

---

## 📝 Essential Files

### `vite.config.ts`
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

### `tailwind.config.js`
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
        // Define colors based on Design_reference.md
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        // Add more colors from Design_reference.md
      },
      fontFamily: {
        // Define fonts from Design_reference.md
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

### `src/index.css` (Setup)
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* Import fonts from Design_reference.md */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@100;200;300;400;500;600;700;800;900&display=swap');

@layer base {
  :root {
    /* Define CSS variables based on Design_reference.md */
    /* Use HSL format: --color-name: H S% L%; */
    --background: /* from Design_reference.md */;
    --foreground: /* from Design_reference.md */;
    --primary: /* from Design_reference.md */;
    /* Add all design system variables here */
    --radius: 0.5rem; /* from Design_reference.md */
  }
  
  .dark {
    /* Dark mode colors if specified in Design_reference.md */
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground font-sans;
  }
}
```

---

## 🎨 Component Patterns

### Animated Page (Tailwind CSS animations)
```tsx
import { cn } from "@/lib/utils";

export function AnimatedPage({ children, className }) {
  return (
    <div className={cn("animate-fade-in-up", className)}>
      {children}
    </div>
  );
}
```

### Button with hover (Tailwind)
```tsx
import { Button } from "@/components/ui/button";

export function AnimatedButton(props) {
  return (
    <Button
      className="transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
      {...props}
    />
  );
}
```

### Card with Icon
```tsx
import { Card } from "@/components/ui/card";
import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";

export function ProjectCard({ title, description, className }) {
  return (
    <Card className={cn("p-6 transition-all hover:-translate-y-0.5 hover:shadow-lg animate-fade-in-up", className)}>
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
  );
}
```

---

## 🔧 Utilities

### `src/lib/utils.ts`
```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

---

## 📱 Common Animations

### Stagger List
```tsx
const container = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const item = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 }
};

<motion.div variants={container} initial="hidden" animate="visible">
  {items.map(item => (
    <motion.div key={item.id} variants={item}>
      {item.content}
    </motion.div>
  ))}
</motion.div>
```

### Fade In
```tsx
<motion.div
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  transition={{ duration: 0.5 }}
/>
```

### Slide Up
```tsx
<motion.div
  initial={{ y: 50, opacity: 0 }}
  animate={{ y: 0, opacity: 1 }}
  transition={{ type: "spring", stiffness: 100 }}
/>
```

## 🧪 Testing Quick Reference

### Run Tests
```bash
npm test              # Run tests in watch mode
npm run test:ui       # Run with UI
npm run test:coverage # Generate coverage report
```

### Basic Component Test
```tsx
import { render, screen } from '@testing-library/react';
import { Button } from '@/components/ui/button';

test('renders button', () => {
  render(<Button>Click me</Button>);
  expect(screen.getByText('Click me')).toBeInTheDocument();
});
```

### API Layer Pattern (native fetch)
```tsx
// Use src/lib/api.ts (api.get, api.post, etc.) - see REACT_BOILERPLATE
import { api } from '@/lib/api';

export const projectsApi = {
  getAll: async () => api.get('/projects'),
};
```

---

## 🎯 Design System Reference

**IMPORTANT:** All design decisions (colors, typography, spacing, shadows) must come from `Design_reference.md` in your project root.

```css
@layer base {
  :root {
    /* Define design tokens based on Design_reference.md */
    /* Use HSL format for colors: --color-name: H S% L%; */
    
    /* Example structure - replace with actual values from Design_reference.md */
    --background: /* your value */;
    --foreground: /* your value */;
    --primary: /* your value */;
    --primary-foreground: /* your value */;
    
    /* Add shadows, transitions, spacing from Design_reference.md */
    --radius: /* your value */;
  }
}
```

**Always reference Design_reference.md before implementing any styling.**

---

## ✅ Pre-Flight Checklist

Before starting any project:

- [ ] Vite configured with SWC plugin
- [ ] `tailwind.config.js` with CSS custom properties
- [ ] Inter font imported in CSS
- [ ] CSS custom properties in `src/index.css`
- [ ] Base styles (body, *, headings) defined
- [ ] Motion library installed (NOT framer-motion)
- [ ] Shadcn initialized
- [ ] Lucide React installed
- [ ] Sonner for toasts
- [ ] Vitest testing setup
- [ ] Path aliases configured (`@/*`)
- [ ] Axios API client setup
- [ ] API layer structure created

---

## 🚨 Common Mistakes to Avoid

❌ **DON'T:**
- Use Motion library or framer-motion (use Tailwind CSS animations)
- Expose LLM or third-party API keys in the client (use Edge Functions)
- Forget to import fonts
- Skip base styles
- Use plain buttons (use Shadcn)
- Use FontAwesome (use Lucide)
- Skip animations
- Skip testing setup
- Use Radix toast (use Sonner)

✅ **DO:**
- Use Tailwind v3 with CSS custom properties and custom keyframes
- Import Inter font
- Include base styles
- Use Shadcn components
- Use Lucide icons
- Use Tailwind animation classes (animate-fade-in-up, etc.)
- Set up Vitest testing
- Use Sonner for toasts
- Use native fetch() in src/lib/api.ts for API layer
- Call LLM via supabase.functions.invoke or backend only

---

## 📦 Package.json Essentials

```json
{
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.30.1",
    "motion": "^12.23.12",
    "lucide-react": "^0.462.0",
    "sonner": "^1.7.4",
    "@tanstack/react-query": "^5.83.0",
    "axios": "^1.7.9",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "tailwind-merge": "^2.6.0"
  },
  "devDependencies": {
    "vite": "^5.4.19",
    "tailwindcss": "^3.4.17",
    "vitest": "^3.2.4",
    "@testing-library/react": "^16.3.0",
    "@vitejs/plugin-react-swc": "^3.11.0",
    "typescript": "^5.8.3"
  }
}
```

---

## 🎨 Shadcn Components to Use

Essential:
```bash
npx shadcn@latest add button
npx shadcn@latest add card
npx shadcn@latest add input
npx shadcn@latest add toast
```

Recommended:
```bash
npx shadcn@latest add dialog
npx shadcn@latest add dropdown-menu
npx shadcn@latest add select
npx shadcn@latest add tabs
npx shadcn@latest add form
```

---

## 💡 Pro Tips

1. **Wrap routes in AnimatedPage (Tailwind animate-fade-in-up)**
2. **Use Tailwind transition/hover classes on interactive elements**
3. **Stagger list items with animationDelay**
4. **Use Lucide icons with consistent sizing**
5. **Leverage CSS custom properties (RGB format in boilerplate)**
6. **Mobile-first with Tailwind**
7. **Dark mode via CSS variables**
8. **Use `cn()` for conditional classes**
9. **Use native fetch() in src/lib/api.ts for API layer**
10. **Use Sonner for better toast UX**
11. **Test components with Vitest**
12. **When using Supabase: Edge Functions for LLM and secrets; client for DB/Auth/Realtime**

---

**Save this file for quick reference! 📌**







