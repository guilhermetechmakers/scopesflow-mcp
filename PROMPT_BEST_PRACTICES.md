# 📝 Cursor Agent Prompt Best Practices

## How to Get the Best Results from Cursor-Agent

Your MCP server now wraps your prompts with directive instructions, but you can still optimize your prompts for better results.

---

## ✅ Good Prompt Structure

### Example 1: Initial Setup
```markdown
**Task**: Set up the SpecLock project foundation

**What to do**:
1. Install required dependencies:
   - @supabase/supabase-js
   - react-router-dom
   - tailwindcss
   - lucide-react (for icons)

2. Create folder structure:
   - src/components/
   - src/pages/
   - src/hooks/
   - src/lib/
   - src/types/

3. Configure Supabase:
   - Create lib/supabase.ts with client initialization
   - Set up environment variables (.env.local)
   - Add types for database tables

4. Set up Tailwind config with the color palette:
   - Primary: #005F73
   - Secondary: #0A9396
   - Accent: #94D2BD
   - Background: #E9D8A6
   - Error: #AE2012

**Deliverables**: 
- Working project structure
- Supabase configured
- Tailwind with custom colors
- Ready for feature development
```

### Example 2: Building a Feature
```markdown
**Task**: Build the Login/Signup page

**Requirements**:
1. Create components/auth/LoginForm.tsx
2. Create components/auth/SignupForm.tsx
3. Create pages/Auth.tsx that contains both forms

**Functionality**:
- Email and password fields with validation
- Toggle between login and signup
- Use Supabase Auth for authentication
- Show loading states
- Display error messages
- Redirect to /dashboard on success

**Styling**:
- Use the project color palette
- Mobile-responsive
- Floating labels on inputs
- Rounded buttons with 12px padding

**Code requirements**:
- TypeScript with proper types
- Form validation with controlled inputs
- Error handling for auth failures
- Clean, commented code
```

### Example 3: Iterating on Existing Code
```markdown
**Task**: Add forgot password functionality to the auth page

**Context**: We already have Login and Signup forms in src/pages/Auth.tsx

**What to do**:
1. Add a "Forgot Password?" link below the login form
2. Create a ForgotPasswordModal component
3. Implement Supabase password reset flow
4. Show success message when reset email is sent

**Keep**:
- Existing auth form styling
- Current color palette
- Mobile responsiveness

**Add**:
- Modal overlay component
- Email input for password reset
- Success/error toast notifications
```

---

## ❌ Common Pitfalls to Avoid

### Too Vague
```markdown
❌ Build a dashboard
```
**Problem**: No specifics about what the dashboard should contain

**Better**:
```markdown
✅ Build a dashboard page that displays:
- Project list with cards
- Recent decisions timeline
- Phase overview sidebar
- Navigation menu
```

### Too Complex in One Prompt
```markdown
❌ Build the entire SpecLock application with all pages, authentication, database, 
admin panel, PDF exports, e-signatures, and mobile optimization.
```
**Problem**: Too much at once, likely to be incomplete or have issues

**Better**: Break into 5-10 focused prompts:
```markdown
✅ Prompt 1: Project setup + Supabase
✅ Prompt 2: Authentication pages
✅ Prompt 3: Dashboard layout
✅ Prompt 4: Project management pages
✅ Prompt 5: Decision logging features
etc.
```

### No Technical Details
```markdown
❌ Add a nice looking homepage
```
**Problem**: "Nice looking" is subjective, no guidance

**Better**:
```markdown
✅ Create a landing page with:
- Hero section with project tagline
- 3-column feature highlights
- Testimonial carousel
- CTA buttons for signup
- Use Framer Motion for scroll animations
- Implement with the project color palette
```

---

## 🎯 Prompt Templates

### Template 1: New Component
```markdown
**Component**: [ComponentName]

**Location**: src/components/[folder]/[ComponentName].tsx

**Purpose**: [What this component does]

**Props**:
- prop1: type (description)
- prop2: type (description)

**Features**:
1. [Feature 1]
2. [Feature 2]

**Styling**: [Tailwind classes, colors, responsive behavior]

**State Management**: [If any - Zustand, Context, local state]

**Integration**: [APIs, Supabase tables, etc.]
```

### Template 2: Page Implementation
```markdown
**Page**: [PageName] (/route)

**Layout**:
- [Header/Navigation]
- [Main content sections]
- [Footer if needed]

**Components to create**:
1. [Component 1] - [purpose]
2. [Component 2] - [purpose]

**Data**:
- Fetch from: [Supabase table / API]
- Display: [what data to show]
- Actions: [what user can do]

**Responsive**:
- Mobile: [mobile layout]
- Desktop: [desktop layout]
```

### Template 3: Feature Addition
```markdown
**Feature**: [Feature Name]

**Affects Files**:
- [file1.tsx] - [what changes]
- [file2.ts] - [what changes]

**New Files Needed**:
- [newFile.tsx] - [purpose]

**Logic**:
1. [Step 1]
2. [Step 2]

**User Flow**:
1. User [action]
2. System [response]
3. Display [result]

**Edge Cases**:
- [Case 1 and handling]
- [Case 2 and handling]
```

---

## 💡 Pro Tips

### 1. Reference Existing Code
```markdown
Follow the same pattern as Dashboard.tsx for the ProjectPhase page
```

### 2. Specify Libraries/Tools
```markdown
Use:
- React Hook Form for form handling
- Zod for validation
- Tanstack Query for data fetching
```

### 3. Include Examples
```markdown
The decision cards should look like this:
- Title (Roboto, 18px, bold)
- Thumbnail image (200x150px)
- Status badge (green/yellow/red)
- Last updated timestamp
```

### 4. Set Priorities
```markdown
**Must Have**:
- Authentication working
- Basic CRUD operations

**Nice to Have**:
- Animations
- Dark mode toggle

**Skip for Now**:
- Admin panel
- PDF exports
```

### 5. Request Documentation
```markdown
Add JSDoc comments to all exported functions and components
```

---

## 📊 Prompt Sizing Guide

| Prompt Type | Approximate Lines | Example |
|-------------|------------------|---------|
| Small Task | 10-20 lines | Add a button, fix styling |
| Component | 20-40 lines | Build a form component |
| Page | 40-80 lines | Create dashboard page |
| Feature | 60-100 lines | Implement auth flow |
| Large Feature | 100-150 lines | Build decision management system |

**Recommendation**: Keep prompts under 100 lines for best results. Break larger features into multiple prompts.

---

## 🔄 Iterative Development Flow

```mermaid
1. Setup Prompt
   → Project structure, dependencies, configs
   
2. Core Features Prompt
   → Authentication, main layouts
   
3. Feature Prompts (one per major feature)
   → Decision logging
   → Choice boards
   → User management
   
4. Refinement Prompts
   → Polish UI
   → Add animations
   → Improve error handling
   
5. Testing/Bug Fixes
   → Fix specific issues
   → Add missing validations
```

---

## 📚 Resources

- **Your Specifications**: Reference your original spec doc when needed
- **Supabase Docs**: cursor-agent has knowledge of Supabase patterns
- **React Patterns**: Mention specific patterns (Context, custom hooks, etc.)
- **Component Libraries**: Reference Shadcn, Radix, etc. if using them

---

## 🎬 Quick Start

For your SpecLock project, here's a suggested prompt sequence:

**Prompt 1** (Setup):
```markdown
Set up SpecLock project with Supabase, install dependencies, configure Tailwind with our color palette, create folder structure
```

**Prompt 2** (Auth):
```markdown
Build Login and Signup pages with Supabase Auth, email verification, error handling
```

**Prompt 3** (Dashboard):
```markdown
Create Dashboard page showing user's projects in cards, phase overview sidebar, recent decisions timeline
```

**Prompt 4** (Project Management):
```markdown
Build Project Phase page with decision items list, add decision form, phase navigation
```

**Continue with more focused prompts for each feature...**

---

Happy building! 🚀





