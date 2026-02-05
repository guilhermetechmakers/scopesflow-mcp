# Frontend App Integration Guide: Adding Expo Mobile Development Support

## Overview

This guide explains how to update your frontend application to enable Expo mobile development support. The backend MCP server already supports `react-expo` framework - you just need to expose it in your UI.

## Prerequisites

- Backend MCP server has been updated with Expo support (already done)
- Access to your frontend codebase
- Understanding of where framework selection happens in your app

---

## Step 1: Locate Framework Selection Component

### Where to Look

Search for files containing:
- `framework` + `select` or `dropdown`
- `BuildSequenceConfig` or `cursorConfig`
- Framework options like `'react'`, `'vue'`, `'nextjs'`

### Common Locations

- Project creation form/dialog component
- Build configuration component
- Settings or project setup page
- Component that creates `BuildSequenceConfig` objects

### Search Commands

```bash
# Search for framework selection
grep -r "framework.*react\|vue\|nextjs" src/
grep -r "BuildSequenceConfig" src/
grep -r "cursorConfig" src/
```

---

## Step 2: Update Framework Type Definition

### Find TypeScript Type Files

Look for files that define or import `BuildSequenceConfig`:

```typescript
// Example location: src/types/build.ts or similar
export interface BuildSequenceConfig {
  cursorConfig: {
    framework: 'react' | 'vue' | 'nextjs' | 'vite' | 'node'; // ← UPDATE THIS
    // ...
  };
}
```

### Update the Type

**Change:**
```typescript
framework: 'react' | 'vue' | 'nextjs' | 'vite' | 'node';
```

**To:**
```typescript
framework: 'react' | 'vue' | 'nextjs' | 'vite' | 'node' | 'react-expo';
```

---

## Step 3: Add Expo to Framework Options

### If Using an Array

**Find code like:**
```typescript
const frameworks = ['react', 'vue', 'nextjs', 'vite', 'node'];
```

**Update to:**
```typescript
const frameworks = ['react', 'vue', 'nextjs', 'vite', 'node', 'react-expo'];
```

### If Using a Select/Dropdown Component

**Find code like:**
```tsx
<Select value={framework} onValueChange={setFramework}>
  <SelectItem value="react">React</SelectItem>
  <SelectItem value="vue">Vue</SelectItem>
  <SelectItem value="nextjs">Next.js</SelectItem>
  <SelectItem value="vite">Vite</SelectItem>
  <SelectItem value="node">Node.js</SelectItem>
</Select>
```

**Add Expo option:**
```tsx
<Select value={framework} onValueChange={setFramework}>
  <SelectItem value="react">React</SelectItem>
  <SelectItem value="vue">Vue</SelectItem>
  <SelectItem value="nextjs">Next.js</SelectItem>
  <SelectItem value="vite">Vite</SelectItem>
  <SelectItem value="node">Node.js</SelectItem>
  <SelectItem value="react-expo">Expo (Mobile)</SelectItem> {/* ADD THIS */}
</Select>
```

### If Using a Radio Group or Tabs

**Find code like:**
```tsx
<RadioGroup value={framework} onValueChange={setFramework}>
  <RadioGroupItem value="react">React</RadioGroupItem>
  <RadioGroupItem value="vue">Vue</RadioGroupItem>
  {/* ... */}
</RadioGroup>
```

**Add Expo option:**
```tsx
<RadioGroupItem value="react-expo">Expo (Mobile)</RadioGroupItem>
```

---

## Step 4: Add Framework Display Labels (Optional but Recommended)

### Create Label Mapping

Add a helper object for display labels:

```typescript
export const frameworkLabels: Record<string, string> = {
  'react': 'React',
  'vue': 'Vue',
  'nextjs': 'Next.js',
  'vite': 'Vite',
  'node': 'Node.js',
  'react-expo': 'Expo (Mobile)', // ADD THIS
};

export const frameworkDescriptions: Record<string, string> = {
  'react': 'React web application',
  'vue': 'Vue.js web application',
  'nextjs': 'Next.js full-stack application',
  'vite': 'Vite + React application',
  'node': 'Node.js backend application',
  'react-expo': 'React Native mobile app for iOS and Android', // ADD THIS
};
```

### Use in UI

```tsx
<SelectItem value="react-expo">
  <div>
    <div className="font-semibold">{frameworkLabels['react-expo']}</div>
    <div className="text-sm text-muted-foreground">
      {frameworkDescriptions['react-expo']}
    </div>
  </div>
</SelectItem>
```

---

## Step 5: Update Template Mapping (If Applicable)

### Find Template-to-Framework Mapping

If your app has template selection that maps to frameworks, look for code like:

```typescript
// Example location: src/utils/frameworkMapping.ts or similar
function mapTemplateToFramework(template?: string): string {
  if (template?.includes('vite')) {
    return 'vite';
  } else if (template?.includes('next')) {
    return 'nextjs';
  } else if (template?.includes('vue')) {
    return 'vue';
  }
  return 'react';
}
```

### Add Expo Mapping

```typescript
function mapTemplateToFramework(template?: string): string {
  if (template?.includes('vite')) {
    return 'vite';
  } else if (template?.includes('next')) {
    return 'nextjs';
  } else if (template?.includes('vue')) {
    return 'vue';
  } else if (template?.includes('expo')) { // ADD THIS
    return 'react-expo';
  }
  return 'react';
}
```

---

## Step 6: Add Visual Indicators (Optional Enhancement)

### Add Mobile Icon/Indicator

```tsx
import { Smartphone } from 'lucide-react'; // or your icon library

<SelectItem value="react-expo">
  <div className="flex items-center gap-2">
    <Smartphone className="h-4 w-4" />
    <span>Expo (Mobile)</span>
  </div>
</SelectItem>
```

### Add Badge or Tag

```tsx
<SelectItem value="react-expo">
  <div className="flex items-center justify-between">
    <span>Expo</span>
    <Badge variant="secondary">Mobile</Badge>
  </div>
</SelectItem>
```

---

## Step 7: Update Validation (If Any)

### Find Validation Logic

If there's client-side validation for framework selection:

```typescript
// Example validation
const validFrameworks = ['react', 'vue', 'nextjs', 'vite', 'node'];

if (!validFrameworks.includes(framework)) {
  throw new Error('Invalid framework');
}
```

### Add Expo to Validation

```typescript
const validFrameworks = ['react', 'vue', 'nextjs', 'vite', 'node', 'react-expo'];
```

---

## Step 8: Update Form Defaults (If Applicable)

### Check Default Framework Value

If your form has a default framework value:

```typescript
const [framework, setFramework] = useState<'react' | 'vue' | 'nextjs' | 'vite' | 'node'>('react');
```

### Update Type and Default (if needed)

```typescript
const [framework, setFramework] = useState<'react' | 'vue' | 'nextjs' | 'vite' | 'node' | 'react-expo'>('react');
```

---

## Step 9: Testing Checklist

After making changes, test the following:

### ✅ Basic Functionality
- [ ] Framework dropdown/select shows "Expo (Mobile)" option
- [ ] Selecting Expo option updates the framework state
- [ ] Form validation accepts `'react-expo'` as valid
- [ ] TypeScript compilation succeeds without errors

### ✅ Project Creation Flow
- [ ] Create a new project with `framework: 'react-expo'`
- [ ] Verify `BuildSequenceConfig` includes `react-expo` in framework
- [ ] Check that project creation request is sent correctly
- [ ] Verify backend receives and processes the request

### ✅ UI/UX
- [ ] Expo option is clearly labeled as mobile
- [ ] Visual indicators (icons/badges) display correctly
- [ ] Description text is helpful and accurate
- [ ] Mobile-specific hints/notes appear (if implemented)

### ✅ Edge Cases
- [ ] Switching between frameworks works correctly
- [ ] Form reset clears Expo selection properly
- [ ] Validation errors show appropriate messages
- [ ] Loading states work during project creation

---

## Step 10: Verify Backend Integration

### Check Request Payload

When creating a project, verify the request includes:

```json
{
  "cursorConfig": {
    "framework": "react-expo",
    "packageManager": "npm",
    "template": "blank-typescript"
  }
}
```

### Monitor Backend Logs

Check MCP server logs for:
```
[MCP Server] Creating project: [name] at [path]
[MCP Server] Framework: react-expo
[MCP Server] Setting up NativeWind for Expo project...
```

---

## Common Issues and Solutions

### Issue: TypeScript Error - Type 'react-expo' is not assignable

**Solution:** Update the TypeScript type definition (Step 2)

### Issue: Framework option doesn't appear in dropdown

**Solution:** Check that you added it to the options array/select items (Step 3)

### Issue: Backend doesn't recognize framework

**Solution:** Verify the exact string is `'react-expo'` (not `'expo'` or `'react_expo'`)

### Issue: Project creation fails

**Solution:** 
1. Check backend logs for errors
2. Verify MCP server is running latest version
3. Ensure Expo CLI is installed on server: `npm install -g expo-cli`

---

## Example Complete Implementation

Here's a complete example of a framework selection component:

```tsx
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Smartphone } from 'lucide-react';

const frameworkLabels: Record<string, string> = {
  'react': 'React',
  'vue': 'Vue',
  'nextjs': 'Next.js',
  'vite': 'Vite',
  'node': 'Node.js',
  'react-expo': 'Expo (Mobile)',
};

const frameworkDescriptions: Record<string, string> = {
  'react': 'React web application',
  'vue': 'Vue.js web application',
  'nextjs': 'Next.js full-stack application',
  'vite': 'Vite + React application',
  'node': 'Node.js backend application',
  'react-expo': 'React Native mobile app for iOS and Android',
};

export function FrameworkSelector({ 
  value, 
  onValueChange 
}: { 
  value: string; 
  onValueChange: (value: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger>
        <SelectValue placeholder="Select framework" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="react">{frameworkLabels['react']}</SelectItem>
        <SelectItem value="vue">{frameworkLabels['vue']}</SelectItem>
        <SelectItem value="nextjs">{frameworkLabels['nextjs']}</SelectItem>
        <SelectItem value="vite">{frameworkLabels['vite']}</SelectItem>
        <SelectItem value="node">{frameworkLabels['node']}</SelectItem>
        <SelectItem value="react-expo">
          <div className="flex items-center gap-2">
            <Smartphone className="h-4 w-4" />
            <div>
              <div className="font-semibold">{frameworkLabels['react-expo']}</div>
              <div className="text-xs text-muted-foreground">
                {frameworkDescriptions['react-expo']}
              </div>
            </div>
          </div>
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
```

---

## Additional Resources

- **Backend Documentation:** See `README.md` for MCP server details
- **Expo Boilerplate:** See `EXPO_BOILERPLATE.md` for Expo project structure
- **Project Prompt Guide:** See `PROJECT_PROMPT_GUIDE.md` for creating Expo projects

---

## Summary

The main changes needed are:

1. ✅ Add `'react-expo'` to TypeScript type definitions
2. ✅ Add Expo option to framework selection UI
3. ✅ Update any template-to-framework mappings
4. ✅ Add display labels and descriptions
5. ✅ Test the complete flow

Once these changes are made, users will be able to select Expo as a framework option and create mobile React Native projects through your app!

