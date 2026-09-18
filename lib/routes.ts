// lib/routes.ts - hrefs that expo-router's typed routes can't express
import type { Href } from 'expo-router';

// The home tab is app/(tabs)/home/_layout.tsx with no index file, so the generated
// route types don't list it even though it resolves at runtime.
export const HOME_HREF = '/(tabs)/home' as Href;
