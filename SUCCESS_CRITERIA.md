# Success Criteria Checklist

## Code Quality

### TypeScript
- [ ] No TypeScript errors (`tsc --noEmit` passes)
- [ ] All functions and components have proper type definitions
- [ ] No `any` types used (use `unknown` if type is truly unknown)
- [ ] Props interfaces defined for all components
- [ ] API responses have type definitions

### Code Standards
- [ ] All imports use path aliases (@/ prefix)
- [ ] Components follow the established naming convention
- [ ] Files are organized in correct directories
- [ ] No unused imports or variables
- [ ] Consistent code formatting

## Component Implementation

### UI Components
- [ ] Use shadcn/ui components (Button, Card, Input, etc.) instead of building from scratch
- [ ] All interactive elements have hover states
- [ ] Components use the `cn()` utility for class merging
- [ ] Proper TypeScript props interfaces defined
- [ ] Components are responsive (mobile, tablet, desktop)

### Animations
- [ ] Motion library used for all animations (NOT framer-motion)
- [ ] Page transitions implemented with fade/slide
- [ ] Interactive elements have whileHover/whileTap animations
- [ ] List items use stagger animations where appropriate
- [ ] Animations respect `prefers-reduced-motion`

### Icons
- [ ] Lucide React icons used consistently
- [ ] Icons have consistent sizing (h-4 w-4, h-5 w-5, h-6 w-6)
- [ ] Icon colors match design system (text-primary, text-muted-foreground)

## Data Management

### React Query
- [ ] All data fetching uses React Query hooks
- [ ] Query keys follow the established pattern
- [ ] Mutations invalidate related queries
- [ ] Loading and error states handled
- [ ] Optimistic updates implemented where appropriate

### Forms
- [ ] Forms use react-hook-form
- [ ] Validation uses Zod schemas
- [ ] Error messages display properly
- [ ] Form submission shows loading state
- [ ] Success/error feedback via toast notifications

### API Layer
- [ ] API functions in src/api/ directory
- [ ] Axios used for HTTP requests
- [ ] Proper error handling with try/catch
- [ ] Auth tokens handled by interceptors
- [ ] Type-safe API function signatures

## User Experience

### Notifications
- [ ] Sonner toasts used for all notifications
- [ ] Success actions show success toast
- [ ] Errors show descriptive error messages
- [ ] Loading states show toast.loading()

### Loading States
- [ ] Skeleton loaders shown during data fetch
- [ ] Buttons show loading state during submission
- [ ] Disabled state applied during async operations

### Error Handling
- [ ] Network errors caught and displayed
- [ ] User-friendly error messages (no stack traces)
- [ ] Fallback UI for error states
- [ ] No unhandled promise rejections

## Navigation

### Route Accessibility
- [ ] All pages have routes defined in router configuration
- [ ] Every page is accessible through navigation (menu, sidebar, or direct URL)
- [ ] Main pages (Dashboard, Home, Settings, etc.) accessible from primary navigation
- [ ] Secondary pages accessible through contextual navigation or direct links
- [ ] Deep-linked pages have breadcrumbs or back navigation
- [ ] 404/Not Found page implemented for invalid routes
- [ ] Protected routes have proper authentication checks
- [ ] Navigation state persists across page refreshes where appropriate

### Navigation UX
- [ ] Active route highlighted in navigation menu
- [ ] Clear visual hierarchy in navigation structure
- [ ] Mobile navigation is accessible and usable
- [ ] Navigation items have hover/focus states
- [ ] Nested routes show parent-child relationships
- [ ] User can always return to main areas (Dashboard/Home)

## Styling

### Tailwind CSS
- [ ] Tailwind v3 classes used
- [ ] HSL color variables from design system
- [ ] Custom CSS properties used where defined
- [ ] Responsive breakpoints: mobile-first approach
- [ ] Dark mode support via CSS variables

### Design System
- [ ] Colors use theme variables (primary, secondary, accent)
- [ ] Spacing uses Tailwind scale (p-4, gap-6, etc.)
- [ ] Border radius uses theme values (rounded-lg)
- [ ] Shadows use theme values (shadow-card)
- [ ] Typography follows Inter font system

## Accessibility

- [ ] Semantic HTML elements used
- [ ] Buttons have descriptive labels
- [ ] Forms have proper labels
- [ ] Focus states visible on interactive elements
- [ ] Color contrast meets WCAG standards

## Performance

- [ ] No console.log statements in production code
- [ ] No console errors in browser
- [ ] Images optimized (WebP, lazy loading)
- [ ] Large lists use virtualization if needed
- [ ] React Query cache configured appropriately

## Testing Readiness

- [ ] Components structured for easy testing
- [ ] Business logic separated from presentation
- [ ] Mock-friendly API layer
- [ ] No hardcoded values that should be configurable
- [ ] Environment variables properly configured

## Final Checks

- [ ] Code builds without errors (`npm run build`)
- [ ] Development server runs without errors (`npm run dev`)
- [ ] No TypeScript errors in editor
- [ ] Browser console is clean (no errors or warnings)
- [ ] All functionality works as expected
- [ ] Code follows existing project patterns
- [ ] Changes are consistent with the rest of the codebase

