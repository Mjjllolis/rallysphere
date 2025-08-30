// app/_layout.tsx
import React, { useEffect, useMemo, useState, createContext, useContext } from 'react';
import { Slot } from 'expo-router';
import { Provider as PaperProvider, MD3LightTheme, MD3DarkTheme } from 'react-native-paper';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth } from '../lib/firebase/auth';
import * as SecureStore from 'expo-secure-store';

type AuthCtx = { user: User | null; ready: boolean };
const AuthContext = createContext<AuthCtx>({ user: null, ready: false });
export const useAuth = () => useContext(AuthContext);

// Theme Context
type ThemeCtx = {
    toggleTheme: () => void;
    isDark: boolean;
    loading: boolean;
};
const ThemeContext = createContext<ThemeCtx>({
    toggleTheme: () => { },
    isDark: false,
    loading: true
});
export const useThemeToggle = () => useContext(ThemeContext);

// Brand colors (dark blue from logo)
const BRAND_BLUE = '#1B365D'; // Dark blue from logo
const BRAND_BLUE_LIGHT = '#2B4A73'; // Lighter variant for interaction states
const BRAND_BG_LIGHT = '#F8FAFC';
const BRAND_BG_DARK = '#0F172A';
const BRAND_SURFACE_LIGHT = '#FFFFFF';
const BRAND_SURFACE_DARK = '#1E293B';
const BRAND_OUTLINE_LIGHT = '#E2E8F0';
const BRAND_OUTLINE_DARK = '#334155';

const lightTheme = {
    ...MD3LightTheme,
    colors: {
        ...MD3LightTheme.colors,
        primary: BRAND_BLUE,
        primaryContainer: '#E1E7F1',
        secondary: BRAND_BLUE_LIGHT,
        background: BRAND_BG_LIGHT,
        surface: BRAND_SURFACE_LIGHT,
        surfaceVariant: '#F1F5F9',
        outline: BRAND_OUTLINE_LIGHT,
        onPrimary: '#FFFFFF',
        onPrimaryContainer: BRAND_BLUE,
        onSurface: '#0F172A',
        onBackground: '#0F172A',
        onSurfaceVariant: '#64748B',
        elevation: {
            level0: 'transparent',
            level1: '#FFFFFF',
            level2: '#F8FAFC',
            level3: '#F1F5F9',
            level4: '#E2E8F0',
            level5: '#CBD5E1',
        },
    },
};

const darkTheme = {
    ...MD3DarkTheme,
    colors: {
        ...MD3DarkTheme.colors,
        primary: '#4F8CC9', // Lighter blue for dark theme accessibility
        primaryContainer: '#1E3A52',
        secondary: BRAND_BLUE_LIGHT,
        background: BRAND_BG_DARK,
        surface: BRAND_SURFACE_DARK,
        surfaceVariant: '#334155',
        outline: BRAND_OUTLINE_DARK,
        onPrimary: '#0F172A',
        onPrimaryContainer: '#B8D4F0',
        onSurface: '#F1F5F9',
        onBackground: '#F8FAFC',
        onSurfaceVariant: '#94A3B8',
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

const STORAGE_KEY = "rallysphere-theme";

export default function RootLayout() {
    const [user, setUser] = useState<User | null>(null);
    const [authReady, setAuthReady] = useState(false);
    const [isDark, setIsDark] = useState(false);
    const [themeLoading, setThemeLoading] = useState(true);

    // Load theme from storage
    useEffect(() => {
        const loadTheme = async () => {
            try {
                const stored = await SecureStore.getItemAsync(STORAGE_KEY);
                setIsDark(stored === "dark");
            } catch (error) {
                console.log('Error loading theme:', error);
            } finally {
                setThemeLoading(false);
            }
        };
        loadTheme();
    }, []);

    // Save theme to storage
    const saveTheme = async (theme: "dark" | "light") => {
        try {
            await SecureStore.setItemAsync(STORAGE_KEY, theme);
        } catch (error) {
            console.log('Error saving theme:', error);
        }
    };

    const toggleTheme = () => {
        const nextTheme = !isDark;
        setIsDark(nextTheme);
        saveTheme(nextTheme ? "dark" : "light");
    };

    // Auth state listener
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            setUser(user);
            setAuthReady(true);
        });
        return unsubscribe;
    }, []);

    const theme = isDark ? darkTheme : lightTheme;

    if (!authReady || themeLoading) return null;

    return (
        <AuthContext.Provider value={{ user, ready: authReady }}>
            <ThemeContext.Provider value={{ toggleTheme, isDark, loading: themeLoading }}>
                <PaperProvider theme={theme}>
                    <Slot />
                </PaperProvider>
            </ThemeContext.Provider>
        </AuthContext.Provider>
    );
}
