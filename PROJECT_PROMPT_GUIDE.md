# Project Prompt Guide

## How to Create a New Project with ScopesFlow

This guide explains which reference files to attach and how to structure your prompts when creating new projects with the ScopesFlow MCP server.

---

## Required Reference Files (First Prompt)

When creating a new project, **ALWAYS attach these reference files** to your first prompt:

### Core Reference Files

1. **@DESIGN_REFERENCE.md**
   - Contains universal design best practices and patterns
   - Provides guidelines for modern UI/UX implementation
   - Includes specifications for layouts, animations, interactions, and accessibility
   - **Why needed**: Ensures consistent, professional design across all projects

2. **Framework-Specific Boilerplate** (Choose based on project type):
   - **@REACT_BOILERPLATE.md** - For web React projects (Vite + React + TypeScript)
   - **@EXPO_BOILERPLATE.md** - For mobile Expo/React Native projects
   - Complete boilerplate documentation with dependency versions and setup instructions
   - Project structure and architecture patterns
   - Testing setup
   - API layer architecture
   - **Why needed**: Provides the technical foundation and architecture standards

3. **@MODERN_STACK_QUICK_REFERENCE.md**
   - Quick reference for common patterns and code snippets
   - Essential configuration files
   - Component examples
   - Testing patterns
   - Common mistakes to avoid
   - **Why needed**: Speeds up development with ready-to-use patterns

### Optional but Recommended

4. **@TESTING_GUIDE.md** (if available)
   - Testing strategies and best practices
   - Component testing examples

5. **@API_LAYER_GUIDE.md** (if available)
   - Detailed API layer architecture
   - Data fetching patterns with React Query

---

## First Prompt Structure

### Important: Design Marker Feature

**NEW:** You can use design markers to separate design content from technical content. Only the content after the marker will be included in your project's `Design_reference.md`.

**Supported markers:**
- `{App Name} Design System Prompt` (recommended)
- `Design System Prompt`
- `DESIGN SYSTEM:`
- `Design Requirements:`
- `Design Specifications:`

**Why use markers?**
- Keeps `Design_reference.md` focused on design only
- Technical requirements stay in project requirements but not in design reference
- Cleaner separation of concerns

### Template

```
Create a [type of application] with the following requirements:

[Describe the application purpose and main features]

Technical Requirements:
- [Any specific integrations or APIs]
- [State management needs]
- [Authentication requirements]
- [Any special features]

Pages/Routes:
1. [Page name]: [Description]
2. [Page name]: [Description]
...

{App Name} Design System Prompt

[Everything below this marker will be extracted into Design_reference.md]

Design Requirements:
- [Color scheme, branding, visual style]
- [Typography preferences]
- [Any specific UI components or layouts]
- [Animation style and interactions]
- [Spacing and layout guidelines]

Additional Design Notes:
- [Any other design-specific details]
```

### Template (Without Marker - Legacy)

If you don't use a marker, the entire prompt will be included in `Design_reference.md`:

```
Create a [type of application] with the following requirements:

[Describe the application purpose and main features]

Design Requirements:
- [Color scheme, branding, visual style]
- [Typography preferences]
- [Any specific UI components or layouts]
- [Animation style and interactions]

Technical Requirements:
- [Any specific integrations or APIs]
- [State management needs]
- [Authentication requirements]
- [Any special features]

Pages/Routes:
1. [Page name]: [Description]
2. [Page name]: [Description]
...

Additional Notes:
- [Any other important details]
```

### Example Prompt (With Design Marker - Recommended)

```
Create a project management dashboard with task tracking and team collaboration features.

Technical Requirements:
- User authentication with email/password
- Real-time updates for task changes
- API integration ready (will provide endpoints later)
- Export data to CSV functionality

Pages/Routes:
1. Dashboard: Overview with task statistics and recent activity
2. Projects: List of projects with filters and search
3. Tasks: Kanban board view with drag-and-drop
4. Team: Team members management
5. Settings: User profile and preferences

Additional Notes:
- Mobile-responsive with drawer navigation on mobile
- Implement optimistic UI updates for better UX
- Include loading states and skeleton loaders

{Project Management Dashboard} Design System Prompt

Color Palette:
- Primary: Blue/purple gradient (#6366F1 to #8B5CF6)
- Secondary: Slate gray for text (#64748B)
- Background: Clean white with subtle gray (#F8FAFC)
- Accent: Vibrant purple for CTAs (#A855F7)
- Dark mode: Deep navy background (#0F172A) with elevated surfaces

Typography:
- Font Family: Inter for all text
- Headings: Bold (700), sizes 24-48px
- Body: Regular (400), 14-16px
- Small text: Medium (500), 12px

Layout:
- Card-based design with rounded-2xl corners
- Generous whitespace (24px-32px padding)
- Collapsible sidebar navigation
- Dashboard cards with shadow-lg on hover
- Glassmorphism for modals (backdrop-blur-lg)

Animations:
- Smooth transitions (300ms ease-out)
- Cards lift on hover (translateY -4px)
- Page transitions: fade + slide
- Skeleton loaders for data fetching
- Button scale on hover (1.02x)
- Hover glow on interactive elements

Components:
- Gradient buttons for primary actions
- Outlined buttons for secondary actions
- Data tables with sticky headers
- Kanban cards with drag indicators
- Metric cards with trend indicators
- Toast notifications (Sonner)

Responsive:
- Mobile: Drawer navigation, stacked cards
- Tablet: 2-column grid for cards
- Desktop: Full sidebar, 3-column grid
- Breakpoints: sm(640px), md(768px), lg(1024px)
```

### Example Prompt (Without Marker - Legacy)

```
Create a project management dashboard with task tracking and team collaboration features.

Design Requirements:
- Modern, professional design with a blue/purple gradient color scheme
- Clean, minimalist interface with card-based layouts
- Smooth animations on hover and transitions
- Dark mode support
- Glassmorphism for overlays and modals

Technical Requirements:
- User authentication with email/password
- Real-time updates for task changes
- API integration ready (will provide endpoints later)
- Export data to CSV functionality

Pages/Routes:
1. Dashboard: Overview with task statistics and recent activity
2. Projects: List of projects with filters and search
3. Tasks: Kanban board view with drag-and-drop
4. Team: Team members management
5. Settings: User profile and preferences

Additional Notes:
- Mobile-responsive with drawer navigation on mobile
- Implement optimistic UI updates for better UX
- Include loading states and skeleton loaders
```

---

## What Happens During Project Creation

### 1. Project Scaffolding
- Framework-specific project is created:
  - **Web**: Vite + React + TypeScript (or Next.js/Vue)
  - **Mobile**: Expo + React Native + TypeScript
- All dependencies are installed automatically
- UI components are initialized (Shadcn/ui for web, NativeWind for mobile)
- Project structure is set up

### 2. Design Reference Creation
Your project will receive a `Design_reference.md` file that includes:
- **Universal Design Guidelines**: Complete copy of DESIGN_REFERENCE.md with best practices
- **Project-Specific Customizations**: Your specific design requirements appended to the file
  - If you used a design marker, only the content after the marker is included
  - If no marker was found, the entire prompt is included (backward compatible)
- This becomes the single source of truth for all design decisions

### 3. AI Implementation
The Cursor Agent will:
- Read all attached reference files
- Understand your requirements
- Implement the project following the boilerplate standards
- Apply your specific design requirements
- Set up the complete project structure

---

## Creating Mobile Apps with Expo

For mobile app development, specify `react-expo` as the framework:

```
Create a mobile app with Expo and React Native with the following requirements:

[Describe the mobile app features]

Framework: react-expo

Technical Requirements:
- Native mobile features (camera, notifications, etc.)
- Offline support
- Push notifications
- Platform-specific design (iOS/Android)

Pages/Screens:
1. Home Screen: [Description]
2. Profile Screen: [Description]
...

{App Name} Design System Prompt

Design Requirements:
- Mobile-optimized UI
- Touch-friendly interface
- Platform-specific design patterns
...
```

**Important for Mobile Projects:**
- Use `@EXPO_BOILERPLATE.md` instead of `@REACT_BOILERPLATE.md`
- Design considerations should account for iOS and Android differences
- Touch targets must be at least 44x44 points
- Handle safe areas (notches, navigation bars)

## Subsequent Prompts

After the initial project creation, you can send additional prompts without attaching the reference files:

```
Add a user profile page with the following sections:
- Profile photo upload
- Personal information form
- Account settings
- Activity history
```

The system automatically includes:
- Your project's `Design_reference.md`
- SUCCESS_CRITERIA.md for quality standards

---

## Best Practices

### ✅ Do

- **Be Specific**: Provide clear, detailed requirements
- **Include Design Details**: Describe colors, layout preferences, animation style
- **List All Pages**: Enumerate the main pages/routes you need
- **Mention Integrations**: Note any APIs or external services
- **Describe User Flows**: Explain how users will interact with the app

### ❌ Don't

- **Be Vague**: "Make a nice dashboard" is too generic
- **Skip Design Details**: This results in generic designs
- **Forget Mobile**: Always consider responsive design
- **Omit Features**: List all features upfront to get better architecture
- **Use Technical Jargon Only**: Include user-facing descriptions

---

## Common Use Cases

### Landing Page / Marketing Site

```
Attach: @DESIGN_REFERENCE.md, @REACT_BOILERPLATE.md, @MODERN_STACK_QUICK_REFERENCE.md

Create a landing page for a SaaS product with:
- Hero section with animated gradient background
- Feature showcase with icons and descriptions
- Pricing section with three tiers
- Testimonials carousel
- FAQ accordion
- Contact form

Design: Modern, bold with vibrant colors. Use animations on scroll.
```

### Dashboard Application

```
Attach: @DESIGN_REFERENCE.md, @REACT_BOILERPLATE.md, @MODERN_STACK_QUICK_REFERENCE.md

Create an analytics dashboard with:
- Collapsible sidebar navigation
- Dashboard overview with metric cards
- Interactive charts (line, bar, pie)
- Data tables with sorting and filtering
- Settings page

Design: Professional, clean with subtle animations. Dark mode support.
```

### E-commerce Product Catalog

```
Attach: @DESIGN_REFERENCE.md, @REACT_BOILERPLATE.md, @MODERN_STACK_QUICK_REFERENCE.md

Create a product catalog application with:
- Product grid with filters
- Product detail pages
- Shopping cart
- Checkout flow

Design: Modern e-commerce style with product image focus. Smooth transitions.
```

---

## Troubleshooting

### Issue: Generic Design

**Problem**: The generated app has generic colors and design
**Solution**: Provide more specific design requirements in your initial prompt. Include color schemes, typography preferences, and visual style descriptions.

### Issue: Missing Features

**Problem**: Some features you expected are missing
**Solution**: Be explicit about all features in the initial prompt. List each page and component you need.

### Issue: Wrong Architecture

**Problem**: The project structure doesn't match your needs
**Solution**: Specify technical requirements upfront (authentication, state management, API patterns, etc.)

---

## Quick Checklist

Before sending your first prompt:

- [ ] Attached @DESIGN_REFERENCE.md
- [ ] Attached @REACT_BOILERPLATE.md
- [ ] Attached @MODERN_STACK_QUICK_REFERENCE.md
- [ ] Described the application purpose clearly
- [ ] Specified design requirements (colors, style, animations)
- [ ] Listed all pages/routes needed
- [ ] Mentioned any technical requirements or integrations
- [ ] Included notes about responsive design and mobile experience

---

## Need Help?

- Review `DESIGN_REFERENCE.md` for design inspiration and patterns
- Check `REACT_BOILERPLATE.md` for technical capabilities and standards
- See `MODERN_STACK_QUICK_REFERENCE.md` for quick code examples
- Look at existing projects in `cursor-projects/` for examples

---

**Remember**: The quality of your output depends on the quality of your input. Take time to craft a detailed, specific prompt with clear design requirements.

