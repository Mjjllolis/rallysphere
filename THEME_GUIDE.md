# RallySphere Theme System Guide

## Overview
The app now has a comprehensive light/dark theme system with custom colors and gradients matching your design.

## Theme Toggle
Users can toggle between light and dark mode in **Settings** (Profile tab → Settings button). The preference is saved and persists across app restarts.

## Theme Colors

### Dark Mode
- **Background**: Pure black `#000000`
- **Primary**: Light blue `#60A5FA`
- **Surface**: Semi-transparent navy `rgba(20,30,48,0.8)`
- **Text**: White `#FFFFFF`
- **Gradients**: Blue tones for cards and backgrounds

### Light Mode
- **Background**: Light gray `#F8FAFC`
- **Primary**: Royal blue `#2563EB`
- **Surface**: White `#FFFFFF`
- **Text**: Dark slate `#0F172A`
- **Gradients**: Lighter blue tones

## How to Use the Theme

### 1. Import the Hook
```typescript
import { useTheme } from 'react-native-paper';
import { useThemeToggle } from '../app/_layout';
```

### 2. Access Theme in Component
```typescript
export default function MyComponent() {
  const theme = useTheme();
  const { isDark } = useThemeToggle();

  // Access theme colors
  const backgroundColor = theme.colors.background;
  const textColor = theme.colors.onSurface;

  // Access custom gradients
  const gradients = (theme as any).gradients || {};
}
```

### 3. Apply Themed Backgrounds
```typescript
return (
  <View style={{ flex: 1 }}>
    {/* Background */}
    <View style={StyleSheet.absoluteFill}>
      <View style={{ flex: 1, backgroundColor: theme.colors.background }} />
    </View>

    {/* Gradient Overlay */}
    <LinearGradient
      colors={gradients.background}
      locations={[0, 0.3, 1]}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    />

    {/* Your content */}
  </View>
);
```

### 4. Themed Components
```typescript
// Text
<Text style={{ color: theme.colors.onSurface }}>Hello</Text>

// Surface/Card
<View style={{
  backgroundColor: theme.colors.surface,
  borderColor: theme.colors.outline
}}>
  {/* content */}
</View>

// BlurView (automatically adjusts tint)
<BlurView intensity={40} tint={isDark ? "dark" : "light"} style={styles.myBlur}>
  {/* content */}
</BlurView>

// Gradient Cards
<LinearGradient
  colors={gradients.card}
  style={styles.card}
>
  {/* content */}
</LinearGradient>
```

## Available Theme Colors

```typescript
theme.colors.primary           // Main brand color
theme.colors.primaryContainer  // Lighter/darker variant
theme.colors.secondary         // Secondary actions
theme.colors.background        // Page background
theme.colors.surface          // Card/panel background
theme.colors.surfaceVariant    // Alternative surface
theme.colors.onSurface         // Text on surfaces
theme.colors.onSurfaceVariant  // Secondary text
theme.colors.onBackground      // Text on background
theme.colors.outline           // Borders
theme.colors.error             // Error state
theme.colors.success           // Success state (custom)
theme.colors.warning           // Warning state (custom)
```

## Custom Gradients
```typescript
const gradients = (theme as any).gradients;

gradients.primary     // ['#1B365D', '#2B4A73', '#3A5F8F'] (dark)
gradients.card        // For card borders/backgrounds
gradients.background  // For page overlays
```

## Examples from Existing Components

### Clubs Page (Already Themed)
```typescript
// Background
<View style={{ backgroundColor: '#000000' }} />
<LinearGradient
  colors={['rgba(27, 54, 93, 0.3)', 'rgba(96, 165, 250, 0.1)', 'rgba(0, 0, 0, 0)']}
  style={StyleSheet.absoluteFill}
/>

// Tabs
<View style={{
  backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F1F5F9',
  borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#CBD5E1'
}} />
```

### Club Cards (Already Themed)
```typescript
// Card with gradient border
<LinearGradient
  colors={['rgba(96, 165, 250, 0.5)', 'rgba(59, 130, 246, 0.4)']}
  style={{ borderRadius: 16, padding: 2 }}
>
  <BlurView intensity={25} tint="dark" style={{
    borderRadius: 14,
    backgroundColor: 'rgba(20,30,48,0.8)'
  }}>
    {/* content */}
  </BlurView>
</LinearGradient>
```

## Pages to Update

The following pages should be updated to use the theme system:

### High Priority
1. **Home** (`app/(tabs)/home.tsx`) - Main landing page
2. **Events** (`app/(tabs)/events.tsx`) - Events listing
3. **Store** (`app/(tabs)/store.tsx`) - Store items
4. **Profile** (`app/(tabs)/profile.tsx`) - User profile

### Already Themed
- ✅ **Clubs** (`app/(tabs)/clubs.tsx`)
- ✅ **Club Cards** (`components/ClubCard.tsx`)
- ✅ **Create Page** (`app/(tabs)/create.tsx`)
- ✅ **Settings** (`components/SettingsScreen.tsx` - partially)

### How to Update a Page

1. Import hooks at top of file
2. Get theme and isDark in component
3. Replace hardcoded colors with `theme.colors.*`
4. Replace hardcoded backgrounds with theme backgrounds
5. Update BlurView tint prop: `tint={isDark ? "dark" : "light"}`
6. Test in both light and dark modes

## Best Practices

1. **Always use theme colors** instead of hardcoded hex values
2. **Use gradients from theme** for consistency
3. **Test both modes** when making changes
4. **Use BlurView tint** based on isDark
5. **Maintain contrast ratios** for accessibility

## Quick Reference

```typescript
// Standard page template
export default function MyPage() {
  const theme = useTheme();
  const { isDark } = useThemeToggle();
  const gradients = (theme as any).gradients || {};

  return (
    <View style={{ flex: 1 }}>
      {/* Background */}
      <View style={StyleSheet.absoluteFill}>
        <View style={{ flex: 1, backgroundColor: theme.colors.background }} />
      </View>

      {/* Gradient */}
      <LinearGradient
        colors={gradients.background}
        locations={[0, 0.3, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {/* Content with themed elements */}
        <Text style={{ color: theme.colors.onSurface }}>
          Themed content
        </Text>
      </SafeAreaView>
    </View>
  );
}
```

## Theme Configuration

The theme is configured in `app/_layout.tsx`:
- Dark theme uses pure black background
- Light theme uses light gray background
- Custom colors defined for both modes
- Saved to secure storage

Toggle is accessible via Settings in the Profile tab.
