// app/_layout.tsx
import React, { useEffect, useState, createContext, useContext } from 'react';
import { Platform } from 'react-native';
import { Slot } from 'expo-router';
import { Provider as PaperProvider, MD3LightTheme, MD3DarkTheme } from 'react-native-paper';
import { onAuthStateChange, type User } from '../lib/firebase';
import * as SecureStore from 'expo-secure-store';
import * as SplashScreen from 'expo-splash-screen';

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
    primary: BRAND_BLUE,
    primaryContainer: '#E1E7F1',
    secondary: '#64748B',
    secondaryContainer: '#E2E8F0',
    tertiary: '#475569',
    tertiaryContainer: '#CBD5E1',
    error: '#DC2626',
    errorContainer: '#FEE2E2',
    background: '#F8FAFC',
    surface: '#FFFFFF',
    surfaceVariant: '#F1F5F9',
    surfaceDisabled: '#E2E8F0',
    outline: '#CBD5E1',
    outlineVariant: '#E2E8F0',
    onPrimary: '#FFFFFF',
    onPrimaryContainer: BRAND_BLUE,
    onSecondary: '#FFFFFF',
    onSecondaryContainer: '#1E293B',
    onTertiary: '#FFFFFF',
    onTertiaryContainer: '#1E293B',
    onSurface: '#0F172A',
    onSurfaceVariant: '#475569',
    onSurfaceDisabled: '#94A3B8',
    onError: '#FFFFFF',
    onErrorContainer: '#DC2626',
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
};

const darkTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: '#60A5FA',
    primaryContainer: '#1E3A52',
    secondary: '#94A3B8',
    secondaryContainer: '#334155',
    tertiary: '#CBD5E1',
    tertiaryContainer: '#475569',
    error: '#EF4444',
    errorContainer: '#7F1D1D',
    background: '#0F172A',
    surface: '#1E293B',
    surfaceVariant: '#334155',
    surfaceDisabled: '#475569',
    outline: '#475569',
    outlineVariant: '#334155',
    onPrimary: '#0F172A',
    onPrimaryContainer: '#BFDBFE',
    onSecondary: '#0F172A',
    onSecondaryContainer: '#CBD5E1',
    onTertiary: '#0F172A',
    onTertiaryContainer: '#E2E8F0',
    onSurface: '#F1F5F9',
    onSurfaceVariant: '#94A3B8',
    onSurfaceDisabled: '#64748B',
    onError: '#FFFFFF',
    onErrorContainer: '#FCA5A5',
    onBackground: '#F8FAFC',
    inverseSurface: '#E2E8F0',
    inverseOnSurface: '#1E293B',
    inversePrimary: BRAND_BLUE,
    shadow: '#000000',
    scrim: '#000000',
    backdrop: 'rgba(0, 0, 0, 0.6)',
    elevation: {
      level0: 'transparent',
      level1: '#1E293B',
      level2: '#334155',
      level3: '#475569',
      level4: '#64748B',
      level5: '#94A3B8',
    },
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

  // Show loading state while initializing
  if (authLoading || themeLoading) {
    console.log('Still loading - Auth:', authLoading, 'Theme:', themeLoading);
    return null; // This will show the splash screen
  }
  
  // Log final state
  console.log('Layout ready - User:', user ? user.email : 'No user');

  return (
    <AuthContext.Provider value={{ user, isLoading: authLoading }}>
      <ThemeContext.Provider value={{ isDark, toggleTheme, isLoading: themeLoading }}>
        <PaperProvider theme={theme}>
          <Slot />
        </PaperProvider>
      </ThemeContext.Provider>
    </AuthContext.Provider>
  );
}
