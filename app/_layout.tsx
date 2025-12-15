// app/_layout.tsx
import React, { useEffect, useState, createContext, useContext } from 'react';
import { Platform, Linking, Alert } from 'react-native';
import { Slot, useRouter } from 'expo-router';
import { Provider as PaperProvider, MD3LightTheme, MD3DarkTheme } from 'react-native-paper';
import { onAuthStateChange, type User } from '../lib/firebase';
import * as SecureStore from 'expo-secure-store';
import * as SplashScreen from 'expo-splash-screen';
import Constants from 'expo-constants';
import { CartProvider } from '../lib/cartContext';
import { FavoritesProvider } from '../lib/favoritesContext';

// Conditionally import Stripe - only on native platforms
let StripeProvider: any = null;
let initializeStripe: any = null;

if (Platform.OS !== 'web') {
  try {
    const stripeModule = require('@stripe/stripe-react-native');
    StripeProvider = stripeModule.StripeProvider;
    const stripeLib = require('../lib/stripe');
    initializeStripe = stripeLib.initializeStripe;
  } catch (error) {
    console.warn('Stripe not available - rebuild app with: npx expo prebuild');
  }
}

// Prevent auto-hiding splash screen
SplashScreen.preventAutoHideAsync();

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
type ThemeContextType = {
  isDark: boolean;
  toggleTheme: () => void;
  isLoading: boolean;
};

const ThemeContext = createContext<ThemeContextType>({
  isDark: false,
  toggleTheme: () => {},
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

const darkTheme = {
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
    console.log('Error getting stored theme:', error);
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
    console.log('Error setting stored theme:', error);
  }
};

export default function RootLayout() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isDark, setIsDark] = useState(false);
  const [themeLoading, setThemeLoading] = useState(true);
  const [stripeInitialized, setStripeInitialized] = useState(false);
  const router = useRouter();

  // Initialize Stripe (only if available)
  useEffect(() => {
    if (initializeStripe) {
      const init = async () => {
        const result = await initializeStripe();
        setStripeInitialized(result.success);
        if (!result.success) {
          console.error('Failed to initialize Stripe:', result.error);
        }
      };
      init();
    } else {
      setStripeInitialized(false);
    }
  }, []);

  // Load theme preference
  useEffect(() => {
    const loadTheme = async () => {
      try {
        const stored = await getStoredTheme();
        if (stored) {
          setIsDark(stored === "dark");
        }
      } catch (error) {
        console.log('Error loading theme:', error);
      } finally {
        setThemeLoading(false);
      }
    };
    loadTheme();
  }, []);

  const toggleTheme = async () => {
    const newTheme = !isDark;
    setIsDark(newTheme);
    await setStoredTheme(newTheme ? "dark" : "light");
  };

  // Auth state listener
  useEffect(() => {
    console.log('Setting up Firebase auth listener...');

    const unsubscribe = onAuthStateChange((user) => {
      console.log('Auth state changed:', user ? `User: ${user.email}` : 'No user');
      setUser(user);
      setAuthLoading(false);
    });

    // Cleanup function
    return unsubscribe;
  }, []);

  // Deep link handler for Stripe payment callbacks
  useEffect(() => {
    const handleDeepLink = (event: { url: string }) => {
      const url = event.url;
      console.log('Deep link received:', url);

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
                  router.push(`/(tabs)/event-detail?id=${eventId}`);
                }
              },
            },
            {
              text: 'OK',
              style: 'cancel',
            },
          ]
        );
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
                  router.push(`/(tabs)/event-detail?id=${eventId}`);
                }
              },
            },
            {
              text: 'OK',
              style: 'cancel',
            },
          ]
        );
      }
    };

    // Listen for deep links when app is already open
    const subscription = Linking.addEventListener('url', handleDeepLink);

    // Check if app was opened via deep link
    Linking.getInitialURL().then((url) => {
      if (url) {
        handleDeepLink({ url });
      }
    });

    return () => {
      subscription.remove();
    };
  }, [router]);

  // Hide splash screen when ready
  useEffect(() => {
    const hideSplash = async () => {
      if (!authLoading && !themeLoading) {
        try {
          await SplashScreen.hideAsync();
          console.log('Splash screen hidden');
        } catch (error) {
          console.log('Error hiding splash screen:', error);
        }
      }
    };
    hideSplash();
  }, [authLoading, themeLoading]);

  const theme = isDark ? darkTheme : lightTheme;
  const publishableKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ||
    Constants.expoConfig?.extra?.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';

  // Show loading state while initializing
  if (authLoading || themeLoading) {
    console.log('Still loading - Auth:', authLoading, 'Theme:', themeLoading);
    return null; // This will show the splash screen
  }

  // Log final state
  console.log('Layout ready - User:', user ? user.email : 'No user');

  const content = (
    <PaperProvider theme={theme}>
      <Slot />
    </PaperProvider>
  );

  return (
    <AuthContext.Provider value={{ user, isLoading: authLoading }}>
      <ThemeContext.Provider value={{ isDark, toggleTheme, isLoading: themeLoading }}>
        <FavoritesProvider>
          <CartProvider>
            {StripeProvider ? (
              <StripeProvider
                publishableKey={publishableKey}
                merchantIdentifier="merchant.com.rallysphere"
                urlScheme="rallysphere"
              >
                {content}
              </StripeProvider>
            ) : (
              content
            )}
          </CartProvider>
        </FavoritesProvider>
      </ThemeContext.Provider>
    </AuthContext.Provider>
  );
}
