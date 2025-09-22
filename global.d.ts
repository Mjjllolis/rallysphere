// global.d.ts

// allow importing PNGs
declare module '*.png' {
  const value: any;
  export default value;
}

// 👇 Ensure this is a *module augmentation* (merges with real types)
import type {} from 'firebase/auth';

declare module 'firebase/auth' {
  // Add the RN helpers to the existing module so TS knows about them
  export function getReactNativePersistence(storage: any): import('firebase/auth').Persistence;
  export function initializeAuth(
    app: import('firebase/app').FirebaseApp,
    deps: { persistence: import('firebase/auth').Persistence }
  ): import('firebase/auth').Auth;
}
