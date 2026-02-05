# Expo + React Native + TypeScript + NativeWind Boilerplate

## Overview
A modern React Native mobile app boilerplate built with Expo, TypeScript, and NativeWind (Tailwind CSS for React Native). This boilerplate is optimized for rapid mobile app development with best practices for iOS and Android.

## Tech Stack
- **Language:** TypeScript
- **Framework:** React Native with Expo SDK
- **Styling:** NativeWind (Tailwind CSS for React Native)
- **Navigation:** React Navigation (if needed)
- **State Management:** React Context or Zustand
- **Forms & Validation:** React Hook Form with Zod validation
- **Data Fetching:** Native fetch() or Axios
- **Icons:** Expo Vector Icons or React Native Vector Icons
- **Animations:** React Native Animated API or Reanimated
- **Notifications:** Expo Notifications
- **Backend:** Supabase (optional)

## Project Structure
```
my-app/
├─ app.json              # Expo configuration
├─ babel.config.js       # Babel config with NativeWind plugin
├─ tailwind.config.js    # Tailwind/NativeWind configuration
├─ postcss.config.js     # PostCSS configuration
├─ nativewind-env.d.ts   # TypeScript definitions for NativeWind
├─ package.json
├─ tsconfig.json
├─ .env                  # Environment variables (EXPO_PUBLIC_ prefix)
└─ src/
   ├─ App.tsx            # Root component
   ├─ app/
   │  ├─ (tabs)/         # Tab navigation screens
   │  │  ├─ index.tsx
   │  │  └─ _layout.tsx
   │  └─ _layout.tsx      # Root layout
   ├─ components/
   │  ├─ ui/             # Reusable UI components
   │  └─ layout/         # Layout components
   ├─ hooks/             # Custom hooks
   │  ├─ useAuth.ts
   │  └─ useApi.ts
   ├─ lib/
   │  ├─ utils.ts        # Utility functions (cn, etc.)
   │  └─ supabase.ts      # Supabase client (if used)
   ├─ types/
   │  └─ index.ts         # TypeScript types
   └─ contexts/          # React Context providers
      └─ AuthContext.tsx
```

## Dependencies

### Core Dependencies
```json
{
  "dependencies": {
    "expo": "~51.0.0",
    "expo-status-bar": "~1.12.1",
    "react": "18.2.0",
    "react-native": "0.74.0",
    "react-native-safe-area-context": "4.10.1",
    "react-native-screens": "~3.31.1",
    "nativewind": "^4.0.1",
    "@react-navigation/native": "^6.1.0",
    "@react-navigation/bottom-tabs": "^6.5.0",
    "@react-navigation/native-stack": "^6.9.0",
    "react-hook-form": "^7.61.1",
    "@hookform/resolvers": "^3.10.0",
    "zod": "^3.25.76",
    "clsx": "^2.1.1",
    "tailwind-merge": "^2.6.0",
    "@supabase/supabase-js": "^2.39.0"
  },
  "devDependencies": {
    "@babel/core": "^7.24.0",
    "@types/react": "~18.2.0",
    "typescript": "^5.3.0",
    "tailwindcss": "^3.4.1",
    "postcss": "^8.4.35",
    "autoprefixer": "^10.4.17"
  }
}
```

## Essential Configuration Files

### `babel.config.js`
```js
module.exports = function(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['nativewind/babel'],
  };
};
```

### `tailwind.config.js`
```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./App.{js,jsx,ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}",
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#3b82f6',
          foreground: '#ffffff',
        },
        secondary: {
          DEFAULT: '#64748b',
          foreground: '#ffffff',
        },
      },
    },
  },
  plugins: [],
};
```

### `postcss.config.js`
```js
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

### `nativewind-env.d.ts`
```ts
/// <reference types="nativewind/types" />
```

### `tsconfig.json`
```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": [
    "**/*.ts",
    "**/*.tsx",
    ".expo/types/**/*.ts",
    "expo-env.d.ts"
  ]
}
```

### `.env` (Environment Variables)
```env
# Supabase Configuration (use EXPO_PUBLIC_ prefix for client-side access)
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# Also support VITE_ prefix for compatibility
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## Component Patterns

### Basic Component with NativeWind
```tsx
import { View, Text } from 'react-native';
import { cn } from '@/lib/utils';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
}

export function Button({ title, onPress, variant = 'primary' }: ButtonProps) {
  return (
    <View
      className={cn(
        'px-4 py-3 rounded-lg',
        variant === 'primary' ? 'bg-blue-500' : 'bg-gray-500'
      )}
    >
      <Text className="text-white font-semibold text-center">{title}</Text>
    </View>
  );
}
```

### Safe Area Component
```tsx
import { SafeAreaView } from 'react-native-safe-area-context';
import { View, Text } from 'react-native';

export function Screen({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaView className="flex-1 bg-white">
      {children}
    </SafeAreaView>
  );
}
```

### Scrollable List
```tsx
import { FlatList, View, Text } from 'react-native';

interface Item {
  id: string;
  title: string;
}

export function ItemList({ items }: { items: Item[] }) {
  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <View className="p-4 border-b border-gray-200">
          <Text className="text-lg font-semibold">{item.title}</Text>
        </View>
      )}
      contentContainerClassName="pb-4"
    />
  );
}
```

## Utility Functions

### `src/lib/utils.ts`
```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

### Supabase Client Setup
```ts
// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl || 
  process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey || 
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

## Mobile-Specific Best Practices

### Touch Targets
- Minimum size: 44x44 points (iOS) or 48x48 dp (Android)
- Provide adequate spacing between interactive elements
- Use larger targets for primary actions

### Platform-Specific Code
```tsx
import { Platform } from 'react-native';

const styles = Platform.select({
  ios: {
    paddingTop: 20,
  },
  android: {
    paddingTop: 10,
  },
  default: {
    paddingTop: 15,
  },
});
```

### Safe Area Handling
```tsx
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function MyComponent() {
  const insets = useSafeAreaInsets();
  
  return (
    <View style={{ paddingTop: insets.top }}>
      {/* Content */}
    </View>
  );
}
```

### Keyboard Avoidance
```tsx
import { KeyboardAvoidingView, Platform } from 'react-native';

<KeyboardAvoidingView
  behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
  className="flex-1"
>
  {/* Form content */}
</KeyboardAvoidingView>
```

## Navigation Setup

### Install React Navigation
```bash
npm install @react-navigation/native @react-navigation/bottom-tabs @react-navigation/native-stack
npx expo install react-native-screens react-native-safe-area-context
```

### Basic Tab Navigation
```tsx
// src/app/(tabs)/_layout.tsx
import { Tabs } from 'expo-router';

export default function TabLayout() {
  return (
    <Tabs>
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
```

## Forms with React Hook Form

```tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { View, TextInput, Text } from 'react-native';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export function LoginForm() {
  const { control, handleSubmit } = useForm({
    resolver: zodResolver(schema),
  });

  return (
    <View className="p-4">
      <TextInput
        className="border border-gray-300 rounded p-2 mb-4"
        placeholder="Email"
        // Use react-hook-form controller
      />
      {/* Form implementation */}
    </View>
  );
}
```

## Testing Setup

### Install Testing Dependencies
```bash
npm install --save-dev @testing-library/react-native @testing-library/jest-native jest-expo
```

### `jest.config.js`
```js
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['@testing-library/jest-native/extend-expect'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg)',
  ],
};
```

## Common Patterns

### Loading States
```tsx
import { ActivityIndicator, View } from 'react-native';

{isLoading ? (
  <View className="flex-1 items-center justify-center">
    <ActivityIndicator size="large" color="#3b82f6" />
  </View>
) : (
  // Content
)}
```

### Error Handling
```tsx
import { View, Text } from 'react-native';

{error && (
  <View className="bg-red-100 p-4 rounded-lg">
    <Text className="text-red-800">{error.message}</Text>
  </View>
)}
```

### Pull to Refresh
```tsx
<FlatList
  data={items}
  refreshing={isRefreshing}
  onRefresh={handleRefresh}
  // ... other props
/>
```

## Performance Optimization

1. **Use FlatList for long lists** - Automatic virtualization
2. **Memoize expensive components** - Use React.memo()
3. **Optimize images** - Use Expo Image component
4. **Lazy load screens** - Use React.lazy() for navigation screens
5. **Avoid unnecessary re-renders** - Use useMemo() and useCallback()

## Accessibility

```tsx
import { View, Text } from 'react-native';

<View
  accessible={true}
  accessibilityLabel="Submit button"
  accessibilityHint="Double tap to submit the form"
  accessibilityRole="button"
>
  <Text>Submit</Text>
</View>
```

## Deployment

### Build for Production
```bash
# iOS
eas build --platform ios

# Android
eas build --platform android

# Both
eas build --platform all
```

### Environment Variables in Production
Update `app.json`:
```json
{
  "expo": {
    "extra": {
      "supabaseUrl": process.env.EXPO_PUBLIC_SUPABASE_URL,
      "supabaseAnonKey": process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
    }
  }
}
```

## Quick Reference

### Common NativeWind Classes
- Layout: `flex-1`, `flex-row`, `items-center`, `justify-center`
- Spacing: `p-4`, `m-2`, `px-4`, `py-2`
- Colors: `bg-blue-500`, `text-white`, `border-gray-300`
- Typography: `text-lg`, `font-bold`, `text-center`
- Borders: `rounded-lg`, `border`, `border-2`

### React Native Components
- `View` - Container (like div)
- `Text` - Text content (must wrap all text)
- `ScrollView` - Scrollable container
- `FlatList` - Optimized list
- `Image` - Image display
- `TextInput` - Text input
- `TouchableOpacity` - Pressable button
- `ActivityIndicator` - Loading spinner

## Key Differences from Web React

1. **No HTML elements** - Use React Native components
2. **No CSS** - Use NativeWind (Tailwind) or StyleSheet
3. **Text must be wrapped** - All text in `<Text>` component
4. **Flexbox by default** - No need for `display: flex`
5. **Platform-specific** - Use Platform.select() for differences
6. **Safe areas** - Handle notches and navigation bars
7. **Touch events** - Use onPress instead of onClick

## Resources

- [Expo Documentation](https://docs.expo.dev/)
- [React Native Documentation](https://reactnative.dev/)
- [NativeWind Documentation](https://www.nativewind.dev/)
- [React Navigation](https://reactnavigation.org/)
- [Expo Vector Icons](https://docs.expo.dev/guides/icons/)



