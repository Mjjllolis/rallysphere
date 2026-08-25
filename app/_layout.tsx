// app/_layout.tsx
import '../lib/silence-logs';
import React, { useEffect, useState, useRef, useCallback, createContext, useContext, useMemo } from 'react';
import { Platform, Linking, Alert, useColorScheme, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import SandboxBanner from '../components/SandboxBanner';
import { Stack, useRouter } from 'expo-router';
import { Provider as PaperProvider, MD3LightTheme, MD3DarkTheme } from 'react-native-paper';
import { onAuthStateChange, type User } from '../lib/firebase';
import { registerPushTokenForUser } from '../hooks/usePushToken';
import { initAppCheck } from '../lib/appCheck';
import * as SecureStore from 'expo-secure-store';
import * as SplashScreen from 'expo-splash-screen';
import Constants from 'expo-constants';
import { CartProvider } from '../lib/cartContext';
import { FavoritesProvider } from '../lib/favoritesContext';
import { DebugProvider } from '../lib/debugContext';

// Prevent auto-hiding splash screen
SplashScreen.preventAutoHideAsync().catch(() => {});

// Auth Context
type AuthContextType = { 
  user: User | null; 
  isLoading: boolean; 
};

const AuthContext = createContext<AuthContextType>({ 
  user: null, 
  isLoading: true 
});

export const useAuth = () => useContext(AuthContext);

// Theme Context
type ThemePreference = 'light' | 'dark' | 'system';

type ThemeContextType = {
  isDark: boolean;
  themePreference: ThemePreference;
  setThemePreference: (pref: ThemePreference) => void;
  isLoading: boolean;
};

const ThemeContext = createContext<ThemeContextType>({
  isDark: false,
  themePreference: 'system',
  setThemePreference: () => {},
  isLoading: true,
});

export const useThemeToggle = () => useContext(ThemeContext);

// Brand colors
const BRAND_BLUE = '#1B365D';
const BRAND_BLUE_LIGHT = '#2B4A73';

const lightTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#2563EB',
    primaryContainer: '#DBEAFE',
    secondary: '#3B82F6',
    secondaryContainer: '#BFDBFE',
    tertiary: '#1D4ED8',
    tertiaryContainer: '#93C5FD',
    error: '#DC2626',
    errorContainer: '#FEE2E2',
    success: '#059669',
    warning: '#D97706',
    background: '#F8FAFC',
    surface: '#FFFFFF',
    surfaceVariant: '#F1F5F9',
    surfaceDisabled: '#E2E8F0',
    outline: '#CBD5E1',
    outlineVariant: '#E2E8F0',
    onPrimary: '#FFFFFF',
    onPrimaryContainer: '#1E3A8A',
    onSecondary: '#FFFFFF',
    onSecondaryContainer: '#1E40AF',
    onTertiary: '#FFFFFF',
    onTertiaryContainer: '#1E3A8A',
    onSurface: '#0F172A',
    onSurfaceVariant: '#475569',
    onSurfaceDisabled: '#94A3B8',
    onError: '#FFFFFF',
    onErrorContainer: '#7F1D1D',
    onBackground: '#0F172A',
    inverseSurface: '#1E293B',
    inverseOnSurface: '#F1F5F9',
    inversePrimary: '#60A5FA',
    shadow: '#000000',
    scrim: '#000000',
    backdrop: 'rgba(0, 0, 0, 0.4)',
    elevation: {
      level0: 'transparent',
      level1: '#F8FAFC',
      level2: '#F1F5F9',
      level3: '#E2E8F0',
      level4: '#CBD5E1',
      level5: '#94A3B8',
    },
  },
  // Custom gradients for light mode
  gradients: {
    primary: ['#DBEAFE', '#BFDBFE', '#93C5FD'],
    card: ['rgba(37, 99, 235, 0.15)', 'rgba(59, 130, 246, 0.1)'],
    background: ['rgba(219, 234, 254, 0.4)', 'rgba(147, 197, 253, 0.2)', 'rgba(255, 255, 255, 0)'],
  },
};

export const darkTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: '#60A5FA',
    primaryContainer: '#1B365D',
    secondary: '#3B82F6',
    secondaryContainer: '#2B4A73',
    tertiary: '#93C5FD',
    tertiaryContainer: '#3A5F8F',
    error: '#EF4444',
    errorContainer: '#7F1D1D',
    success: '#4CAF50',
    warning: '#F59E0B',
    background: '#000000',
    surface: 'rgba(20,30,48,0.8)',
    surfaceVariant: 'rgba(27, 54, 93, 0.4)',
    surfaceDisabled: 'rgba(75,85,99,0.4)',
    outline: 'rgba(255,255,255,0.1)',
    outlineVariant: 'rgba(255,255,255,0.05)',
    onPrimary: '#FFFFFF',
    onPrimaryContainer: '#BFDBFE',
    onSecondary: '#FFFFFF',
    onSecondaryContainer: '#BFDBFE',
    onTertiary: '#FFFFFF',
    onTertiaryContainer: '#DBEAFE',
    onSurface: '#FFFFFF',
    onSurfaceVariant: 'rgba(255,255,255,0.7)',
    onSurfaceDisabled: 'rgba(255,255,255,0.4)',
    onError: '#FFFFFF',
    onErrorContainer: '#FCA5A5',
    onBackground: '#FFFFFF',
    inverseSurface: '#E2E8F0',
    inverseOnSurface: '#1E293B',
    inversePrimary: BRAND_BLUE,
    shadow: '#000000',
    scrim: '#000000',
    backdrop: 'rgba(0, 0, 0, 0.8)',
    elevation: {
      level0: 'transparent',
      level1: 'rgba(20,30,48,0.8)',
      level2: 'rgba(27, 54, 93, 0.4)',
      level3: 'rgba(42, 74, 115, 0.5)',
      level4: 'rgba(58, 95, 143, 0.6)',
      level5: 'rgba(96, 165, 250, 0.3)',
    },
  },
  // Custom gradients for our design
  gradients: {
    primary: ['#1B365D', '#2B4A73', '#3A5F8F'],
    card: ['rgba(96, 165, 250, 0.5)', 'rgba(59, 130, 246, 0.4)'],
    background: ['rgba(27, 54, 93, 0.3)', 'rgba(96, 165, 250, 0.1)', 'rgba(0, 0, 0, 0)'],
  },
};

const THEME_STORAGE_KEY = "rallysphere-theme";

// Cross-platform storage utilities
const getStoredTheme = async (): Promise<string | null> => {
  try {
    if (Platform.OS === 'web') {
      return localStorage.getItem(THEME_STORAGE_KEY);
    } else {
      return await SecureStore.getItemAsync(THEME_STORAGE_KEY);
    }
  } catch (error) {
    // console.log('Error getting stored theme:', error);
    return null;
  }
};

const setStoredTheme = async (theme: string): Promise<void> => {
  try {
    if (Platform.OS === 'web') {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } else {
      await SecureStore.setItemAsync(THEME_STORAGE_KEY, theme);
    }
  } catch (error) {
    // console.log('Error setting stored theme:', error);
  }
};

export default function RootLayout() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>('system');
  const [themeLoading, setThemeLoading] = useState(true);
  const router = useRouter();
  const systemColorScheme = useColorScheme();

  // Load theme preference
  useEffect(() => {
    const loadTheme = async () => {
      try {
        const stored = await getStoredTheme();
        if (stored === 'light' || stored === 'dark' || stored === 'system') {
          setThemePreferenceState(stored);
        } else {
          // Default to system for new installs
          setThemePreferenceState('system');
          await setStoredTheme('system');
        }
      } catch (error) {
        // console.log('Error loading theme:', error);
      } finally {
        setThemeLoading(false);
      }
    };
    loadTheme();
  }, []);

  const setThemePreference = async (pref: ThemePreference) => {
    setThemePreferenceState(pref);
    await setStoredTheme(pref);
  };

  const isDark = useMemo(() => {
    if (themePreference === 'system') {
      return systemColorScheme !== 'light';
    }
    return themePreference === 'dark';
  }, [themePreference, systemColorScheme]);

  // Initialize App Check before any Firebase calls go out.
  useEffect(() => {
    initAppCheck();
  }, []);

  // Auth state listener
  useEffect(() => {
    // console.log('Setting up Firebase auth listener...');

    const unsubscribe = onAuthStateChange((user) => {
      // console.log('Auth state changed:', user ? `User: ${user.email}` : 'No user');
      setUser(user);
      setAuthLoading(false);
      // Attach this device's push token to the user so the server can reach
      // them — e.g. when Finix stalls a payout application waiting on documents.
      // Fire-and-forget: it must never gate rendering or sign-in.
      if (user?.uid) {
        registerPushTokenForUser(user.uid).catch(() => {});
      }
    });

    // Cleanup function
    return unsubscribe;
  }, []);

  // Deep link handler
  // A link can arrive via Linking.getInitialURL() during a cold start, before
  // the Stack below has mounted (RootLayout still returns null while
  // authLoading/themeLoading are true). Calling router.push/replace before
  // the navigator exists throws and leaves the app stuck on the splash
  // screen, so any URL that arrives that early is stashed and replayed once
  // the Stack is actually up.
  const pendingDeepLinkRef = useRef<string | null>(null);

  const processDeepLink = useCallback((url: string) => {
    if (url.includes('payment-return')) {
      return;
    }

    // Handle payment success
    if (url.includes('payment-success')) {
      const urlParams = new URLSearchParams(url.split('?')[1]);
      const eventId = urlParams.get('event_id');

      Alert.alert(
        'Payment Successful!',
        'You have successfully purchased your ticket. You are now registered for the event.',
        [
          {
            text: 'View Event',
            onPress: () => {
              if (eventId) {
                router.push(`/event/${eventId}`);
              }
            },
          },
          {
            text: 'OK',
            style: 'cancel',
          },
        ]
      );
      return;
    }

    // Handle payment cancellation
    if (url.includes('payment-cancel')) {
      const urlParams = new URLSearchParams(url.split('?')[1]);
      const eventId = urlParams.get('event_id');

      Alert.alert(
        'Payment Cancelled',
        'Your payment was cancelled. You can try again anytime.',
        [
          {
            text: 'Try Again',
            onPress: () => {
              if (eventId) {
                router.push(`/event/${eventId}`);
              }
            },
          },
          {
            text: 'OK',
            style: 'cancel',
          },
        ]
      );
      return;
    }

    // Any other deep link — either the custom scheme (rallysphere://event/abc123,
    // used by the web preview page's fallback redirect) or a Universal Link
    // (https://rally-sphere.web.app/event/abc123, delivered directly by iOS
    // when the app has the associated domain) — route to the matching
    // in-app screen instead of always bouncing to Home.
    const isCustomScheme = url.startsWith('rallysphere://');
    const isUniversalLink = /^https?:\/\/(rally-sphere\.web\.app|rallysphere\.app)\//.test(url);
    if (isCustomScheme || isUniversalLink) {
      const path = url
        .replace(/^rallysphere:\/\//, '')
        .replace(/^https?:\/\/[^/]+\//, '')
        .split('?')[0]
        .replace(/\/$/, '');
      try {
        if (!path) {
          router.replace('/(tabs)/home');
          return;
        }
        // A shared event link for a signed-out visitor: events can be
        // private (Firestore only allows authenticated reads for those), and
        // even a public one drops a stranger into a screen built entirely
        // around an existing member. Show a lightweight preview + sign-in /
        // create-account prompt instead, and send them on to the real event
        // once they're in.
        const eventMatch = path.match(/^event\/([^/]+)$/);
        if (eventMatch && !user) {
          router.push({ pathname: '/event-preview/[id]', params: { id: eventMatch[1] } });
          return;
        }
        // Signed in already: land on a clean Home first rather than pushing
        // straight from whatever index.tsx's own (async, racing) redirect
        // left as the current screen — otherwise the destination can appear
        // before Home has settled underneath it, or get pushed a second time
        // once that redirect resolves. Replacing with Home first then
        // pushing the real destination guarantees a deterministic
        // Home-then-destination stack, so Back always goes to a clean Home.
        router.replace('/(tabs)/home');
        router.push(`/${path}` as any);
      } catch (error) {
        console.log('[DeepLink] Failed to navigate:', error);
      }
    }
  }, [router, user]);

  // Keep a ref to the latest processDeepLink (it changes identity whenever
  // `user` changes) so the mount-once effect below can always call the
  // current version without needing to re-subscribe / re-query
  // getInitialURL on every auth change — that re-querying is what used to
  // replay the same cold-start link a second time and stack the event
  // screen on top of itself.
  const processDeepLinkRef = useRef(processDeepLink);
  processDeepLinkRef.current = processDeepLink;

  const readyRef = useRef(false);
  useEffect(() => {
    readyRef.current = !authLoading && !themeLoading;
  }, [authLoading, themeLoading]);

  useEffect(() => {
    const handleIncomingUrl = (event: { url: string }) => {
      if (readyRef.current) {
        processDeepLinkRef.current(event.url);
      } else {
        // Navigator isn't mounted yet — replay this once it is.
        pendingDeepLinkRef.current = event.url;
      }
    };

    // Listen for deep links when app is already open
    const subscription = Linking.addEventListener('url', handleIncomingUrl);

    // Check if app was opened via deep link. Runs exactly once for the life
    // of the app instance, matching what Linking.getInitialURL() itself
    // guarantees.
    Linking.getInitialURL().then((url) => {
      if (url) {
        handleIncomingUrl({ url });
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  // Replay a deep link that arrived before the Stack had mounted. This is
  // the only place pendingDeepLinkRef is consumed, so a given URL is handed
  // to processDeepLink exactly once.
  useEffect(() => {
    if (!authLoading && !themeLoading && pendingDeepLinkRef.current) {
      const url = pendingDeepLinkRef.current;
      pendingDeepLinkRef.current = null;
      processDeepLink(url);
    }
  }, [authLoading, themeLoading, processDeepLink]);

  // Hide splash screen when ready
  useEffect(() => {
    console.log('[Splash] authLoading:', authLoading, 'themeLoading:', themeLoading);
    const hideSplash = async () => {
      if (!authLoading && !themeLoading) {
        console.log('[Splash] Conditions met, hiding splash screen...');
        try {
          await SplashScreen.hideAsync();
          console.log('[Splash] Splash screen hidden successfully');
        } catch (error) {
          console.log('[Splash] Error hiding splash screen:', error);
        }
      } else {
        console.log('[Splash] Still waiting - authLoading:', authLoading, 'themeLoading:', themeLoading);
      }
    };
    hideSplash();
  }, [authLoading, themeLoading]);

  const theme = isDark ? darkTheme : lightTheme;

  // Show loading state while initializing
  if (authLoading || themeLoading) {
    // console.log('Still loading - Auth:', authLoading, 'Theme:', themeLoading);
    return null; // This will show the splash screen
  }

  // Log final state
  // console.log('Layout ready - User:', user ? user.email : 'No user');

  const content = (
    <PaperProvider theme={theme}>
      {/* Sandbox strip sits above the navigator so it survives every screen
          change — it renders nothing unless staff have Debug on. */}
      <View style={{ flex: 1 }}>
        <SandboxBanner />
        <Stack screenOptions={{ headerShown: false, animation: 'none' }} />
      </View>
    </PaperProvider>
  );

  return (
    // SafeAreaProvider at the root: expo-router nests one around the navigator,
    // but SandboxBanner renders OUTSIDE that, and useSafeAreaInsets throws
    // without a provider above it. Nesting is harmless — each consumer reads
    // its nearest provider, so existing screens are unaffected.
    <SafeAreaProvider>
      <AuthContext.Provider value={{ user, isLoading: authLoading }}>
        <ThemeContext.Provider value={{ isDark, themePreference, setThemePreference, isLoading: themeLoading }}>
          <FavoritesProvider>
            <CartProvider>
              <DebugProvider>
                {content}
              </DebugProvider>
            </CartProvider>
          </FavoritesProvider>
        </ThemeContext.Provider>
      </AuthContext.Provider>
    </SafeAreaProvider>
  );
}
