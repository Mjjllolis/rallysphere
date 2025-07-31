// global.d.ts
import 'react-native';

declare module 'react-native-paper' {
    import * as React from 'react';

    export const Provider: React.ComponentType<{
        theme: any;
        children: React.ReactNode;
    }>;
}