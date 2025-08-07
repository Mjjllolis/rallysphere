// app/_layout.tsx
import React, { useEffect, useMemo, useState, createContext, useContext } from 'react';
import { Slot } from 'expo-router';
import { Provider as PaperProvider, MD3LightTheme } from 'react-native-paper';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth } from '../firebase/config';

type AuthCtx = { user: User | null; ready: boolean };
const Ctx = createContext<AuthCtx>({ user: null, ready: false });
export const useAuth = () => useContext(Ctx);

// Brand colors (from your logo)
const BRAND_BLUE = '#0085FF';
const BRAND_BG = '#F5F8FF';      // soft light bg
const BRAND_SURFACE = '#FFFFFF';
const BRAND_OUTLINE = '#D5E3FF'; // light blue-gray for outlines

const theme = {
    ...MD3LightTheme,
    colors: {
        ...MD3LightTheme.colors,
        primary: BRAND_BLUE,
        secondary: BRAND_BLUE,
        background: BRAND_BG,
        surface: BRAND_SURFACE,
        surfaceVariant: '#EEF4FF',
        outline: BRAND_OUTLINE,
        onPrimary: '#FFFFFF',
        onSurface: '#111827',
        onBackground: '#111827',
    },
};

export default function RootLayout() {
    const [user, setUser] = useState<User | null>(null);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        const sub = onAuthStateChanged(auth, u => { setUser(u); setReady(true); });
        return sub;
    }, []);

    if (!ready) return null;

    return (
        <Ctx.Provider value={{ user, ready }}>
            <PaperProvider theme={theme}>
                <Slot />
            </PaperProvider>
        </Ctx.Provider>
    );
}