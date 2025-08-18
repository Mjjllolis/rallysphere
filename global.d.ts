// global.d.ts
declare module '*.png' {
    const value: any;
    export default value;
}
declare module 'firebase/auth/react-native' {
    import { Persistence } from 'firebase/auth';
    export function getReactNativePersistence(storage: any): Persistence;
}

declare module 'firebase/auth' {
    export function getReactNativePersistence(storage: any): import('firebase/auth').Persistence;
}