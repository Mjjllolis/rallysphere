import React, { createContext, useContext, useEffect, useState } from "react";
import { MD3DarkTheme, MD3LightTheme, Provider as PaperProvider } from "react-native-paper";
import { DarkTheme as NavDark, DefaultTheme as NavLight } from "@react-navigation/native";
import * as SecureStore from "expo-secure-store";
import merge from "deepmerge";

// Custom theme colors
const customDarkTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: '#60A5FA',
    primaryContainer: '#1B365D',
    secondary: '#3B82F6',
    secondaryContainer: '#2B4A73',
    background: '#000000',
    surface: 'rgba(20,30,48,0.8)',
    surfaceVariant: 'rgba(27, 54, 93, 0.4)',
    onSurface: '#FFFFFF',
    onSurfaceVariant: 'rgba(255,255,255,0.7)',
    onBackground: '#FFFFFF',
    error: '#EF4444',
    success: '#4CAF50',
    warning: '#F59E0B',
  },
  gradients: {
    primary: ['#1B365D', '#2B4A73', '#3A5F8F'],
    card: ['rgba(96, 165, 250, 0.5)', 'rgba(59, 130, 246, 0.4)'],
    background: ['rgba(27, 54, 93, 0.3)', 'rgba(96, 165, 250, 0.1)', 'rgba(0, 0, 0, 0)'],
  },
};

const customLightTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#2563EB',
    primaryContainer: '#DBEAFE',
    secondary: '#3B82F6',
    secondaryContainer: '#BFDBFE',
    background: '#F8FAFC',
    surface: '#FFFFFF',
    surfaceVariant: '#F1F5F9',
    onSurface: '#0F172A',
    onSurfaceVariant: '#475569',
    onBackground: '#0F172A',
    error: '#DC2626',
    success: '#059669',
    warning: '#D97706',
  },
  gradients: {
    primary: ['#DBEAFE', '#BFDBFE', '#93C5FD'],
    card: ['rgba(37, 99, 235, 0.1)', 'rgba(59, 130, 246, 0.05)'],
    background: ['rgba(219, 234, 254, 0.3)', 'rgba(147, 197, 253, 0.1)', 'rgba(255, 255, 255, 0)'],
  },
};

const LightTheme = merge(customLightTheme, NavLight);
const DarkTheme = merge(customDarkTheme, NavDark);
const STORAGE_KEY = "rallysphere-theme";

interface ThemeContextType {
    toggleTheme: () => void;
    isDark: boolean;
    loading: boolean;
    theme: typeof DarkTheme;
}

const ThemeContext = createContext<ThemeContextType>({
    toggleTheme: () => { },
    isDark: false,
    loading: true,
    theme: DarkTheme,
});

export const useAppTheme = () => useContext(ThemeContext);

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
    const [isDark, setIsDark] = useState(false);
    const [loading, setLoading] = useState(true);

    const loadTheme = async () => {
        const stored = await SecureStore.getItemAsync(STORAGE_KEY);
        setIsDark(stored === "dark");
        setLoading(false);
    };

    const saveTheme = async (theme: "dark" | "light") => {
        await SecureStore.setItemAsync(STORAGE_KEY, theme);
    };

    const toggleTheme = () => {
        const next = !isDark;
        setIsDark(next);
        saveTheme(next ? "dark" : "light");
    };

    useEffect(() => {
        loadTheme();
    }, []);

    const theme = isDark ? DarkTheme : LightTheme;

    if (loading) return null;

    return (
        <ThemeContext.Provider value={{ toggleTheme, isDark, loading, theme }}>
            <PaperProvider theme={theme}>{children}</PaperProvider>
        </ThemeContext.Provider>
    );
};

export default ThemeProvider;