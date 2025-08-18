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

// Brand colors (from your logo)
const BRAND_BLUE = '#0085FF';
const BRAND_BG_LIGHT = '#F5F8FF';
const BRAND_BG_DARK = '#0A0A0A';
const BRAND_SURFACE_LIGHT = '#FFFFFF';
const BRAND_SURFACE_DARK = '#1A1A1A';
const BRAND_OUTLINE_LIGHT = '#D5E3FF';
const BRAND_OUTLINE_DARK = '#2A3441';

const lightTheme = {
    ...MD3LightTheme,
    colors: {
        ...MD3LightTheme.colors,
        primary: BRAND_BLUE,
        secondary: BRAND_BLUE,
        background: BRAND_BG_LIGHT,
        surface: BRAND_SURFACE_LIGHT,
        surfaceVariant: '#EEF4FF',
        outline: BRAND_OUTLINE_LIGHT,
        onPrimary: '#FFFFFF',
        onSurface: '#111827',
        onBackground: '#111827',
        onSurfaceVariant: '#6B7280',
    },
};

const darkTheme = {
    ...MD3DarkTheme,
    colors: {
        ...MD3DarkTheme.colors,
        primary: BRAND_BLUE,
        secondary: BRAND_BLUE,
        background: BRAND_BG_DARK,
        surface: BRAND_SURFACE_DARK,
        surfaceVariant: '#2A2A2A',
        outline: BRAND_OUTLINE_DARK,
        onPrimary: '#FFFFFF',
        onSurface: '#F9FAFB',
        onBackground: '#F9FAFB',
        onSurfaceVariant: '#9CA3AF',
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
