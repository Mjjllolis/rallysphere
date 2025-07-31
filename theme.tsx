// theme.ts
import React from "react";
import { useColorScheme } from "react-native";
import {
    MD3DarkTheme,
    MD3LightTheme,
    Provider as PaperProvider,
} from "react-native-paper";
import {
    DarkTheme as NavigationDarkTheme,
    DefaultTheme as NavigationLightTheme,
} from "@react-navigation/native";
import merge from "deepmerge";

const CombinedLightTheme = merge(MD3LightTheme, NavigationLightTheme);
const CombinedDarkTheme = merge(MD3DarkTheme, NavigationDarkTheme);

export const useAppTheme = () => {
    const scheme = useColorScheme();
    return scheme === "dark" ? CombinedDarkTheme : CombinedLightTheme;
};

export const CombinedThemeProvider = ({ children }: { children: React.ReactNode }) => {
    const theme = useAppTheme();

    return <PaperProvider theme={theme}>{children}</PaperProvider>;
};