import React, { createContext, useContext, useEffect, useState } from "react";
import { MD3DarkTheme, MD3LightTheme, Provider as PaperProvider } from "react-native-paper";
import { DarkTheme as NavDark, DefaultTheme as NavLight } from "@react-navigation/native";
import * as SecureStore from "expo-secure-store";
import merge from "deepmerge";

const LightTheme = merge(MD3LightTheme, NavLight);
const DarkTheme = merge(MD3DarkTheme, NavDark);
const STORAGE_KEY = "rallysphere-theme";

const ThemeContext = createContext({
    toggleTheme: () => { },
    isDark: false,
    loading: true,
});

export const useThemeToggle = () => useContext(ThemeContext);

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
        <ThemeContext.Provider value={{ toggleTheme, isDark, loading }}>
            <PaperProvider theme={theme}>{children}</PaperProvider>
        </ThemeContext.Provider>
    );
};

export default ThemeProvider;