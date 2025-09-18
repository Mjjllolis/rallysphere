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
    secondary: BRAND_BLUE_LIGHT,
    background: '#F8FAFC',
    surface: '#FFFFFF',
    surfaceVariant: '#F1F5F9',
    outline: '#E2E8F0',
    onPrimary: '#FFFFFF',
    onPrimaryContainer: BRAND_BLUE,
    onSurface: '#0F172A',
    onBackground: '#0F172A',
    onSurfaceVariant: '#64748B',
  },
};

const darkTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: '#4F8CC9',
    primaryContainer: '#1E3A52',
    secondary: BRAND_BLUE_LIGHT,
    background: '#0F172A',
    surface: '#1E293B',
    surfaceVariant: '#334155',
    outline: '#334155',
    onPrimary: '#0F172A',
    onPrimaryContainer: '#B8D4F0',
    onSurface: '#F1F5F9',
    onBackground: '#F8FAFC',
    onSurfaceVariant: '#94A3B8',
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
  const [authError, setAuthError] = useState<string | null>(null);

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

  // Auth state listener with timeout
  useEffect(() => {
    console.log('Setting up Firebase auth listener...');
    
    // Set up auth state listener
    const unsubscribe = onAuthStateChange((user) => {
      console.log('Auth state changed:', user ? `User: ${user.email}` : 'No user');
      setUser(user);
      setAuthLoading(false);
      setAuthError(null);
    });
    
    // Set a timeout to prevent infinite loading
    const timeoutId = setTimeout(() => {
      console.log('Auth initialization timeout - proceeding without auth');
      setAuthLoading(false);
      setAuthError('Auth initialization timeout');
    }, 10000); // 10 second timeout
    
    // Cleanup function
    return () => {
      clearTimeout(timeoutId);
      unsubscribe();
    };
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
  console.log('Layout ready - User:', user ? user.email : 'No user', 'Error:', authError);

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
