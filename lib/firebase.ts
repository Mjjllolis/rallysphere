// lib/firebase.ts
// Initializes Firebase and exposes Auth + Firestore helpers.

import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  initializeAuth,
  getReactNativePersistence,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  type User,
  type UserCredential,
  type Auth, // ✅ import the Auth type
} from "firebase/auth";
import { getFirestore, doc, setDoc } from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

// --- 1. Types for Expo extra env vars ---
type Extra = {
  EXPO_PUBLIC_API_KEY: string;
  EXPO_PUBLIC_AUTH_DOMAIN: string;
  EXPO_PUBLIC_PROJECT_ID: string;
  EXPO_PUBLIC_STORAGE_BUCKET: string;
  EXPO_PUBLIC_MESSAGING_SENDER_ID: string;
  EXPO_PUBLIC_APP_ID: string;
  EXPO_PUBLIC_MEASUREMENT_ID: string;
};

const extra = Constants.expoConfig?.extra as Extra;

// --- 2. Firebase config ---
const firebaseConfig = {
  apiKey: extra.EXPO_PUBLIC_API_KEY,
  authDomain: extra.EXPO_PUBLIC_AUTH_DOMAIN,
  projectId: extra.EXPO_PUBLIC_PROJECT_ID,
  storageBucket: extra.EXPO_PUBLIC_STORAGE_BUCKET,
  messagingSenderId: extra.EXPO_PUBLIC_MESSAGING_SENDER_ID,
  appId: extra.EXPO_PUBLIC_APP_ID,
  measurementId: extra.EXPO_PUBLIC_MEASUREMENT_ID,
};

// --- 3. Initialize Firebase ---
console.log("Firebase config:", firebaseConfig);
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// --- 4. Auth with AsyncStorage persistence ---
let auth: Auth; // ✅ explicitly typed
try {
  auth = getAuth(app); // reuse existing if possible
} catch {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
}

// --- 5. Firestore ---
const db = getFirestore(app);

// --- 6. Custom user profile type ---
export type UserProfile = {
  firstName: string;
  lastName: string;
};

// --- 7. SignUp helper ---
export async function signUp(
  email: string,
  password: string,
  profile: UserProfile
): Promise<{ success: boolean; error?: string }> {
  try {
    const cred: UserCredential = await createUserWithEmailAndPassword(
      auth,
      email,
      password
    );

    await setDoc(doc(db, "users", cred.user.uid), {
      email,
      ...profile,
      createdAt: new Date().toISOString(),
    });

    return { success: true };
  } catch (err: any) {
    console.error("Firebase signup error:", err);
    return { success: false, error: err.message };
  }
}

// --- 8. onAuthStateChange wrapper (for _layout.tsx) ---
export function onAuthStateChange(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}

// --- 9. Export everything ---
export { auth, db, app, type User };
