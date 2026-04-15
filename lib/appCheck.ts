// lib/appCheck.ts - Firebase App Check initialization for RallySphere
import { Platform } from 'react-native';
import Constants from 'expo-constants';

let appCheckInitialized = false;

/**
 * Check if we're running in Expo Go (no native modules available)
 */
function isExpoGo(): boolean {
  return Constants.appOwnership === 'expo';
}

/**
 * Initialize Firebase App Check for native platforms.
 * Uses @react-native-firebase/app-check for iOS (DeviceCheck/AppAttest)
 * and Android (Play Integrity).
 *
 * This should be called once at app startup before any Firebase calls.
 * Skips initialization in Expo Go since native modules aren't available.
 */
export async function initAppCheck(): Promise<void> {
  if (appCheckInitialized) {
    return;
  }

  // Skip App Check on web - it requires reCAPTCHA setup
  if (Platform.OS === 'web') {
    console.log('[AppCheck] Skipping on web');
    appCheckInitialized = true;
    return;
  }

  // Skip App Check in Expo Go - native modules not available
  if (isExpoGo()) {
    console.log('[AppCheck] Skipping in Expo Go (no native modules)');
    appCheckInitialized = true;
    return;
  }

  try {
    // Dynamically import to avoid issues on web/Expo Go
    const appCheck = require('@react-native-firebase/app-check').default;

    // Initialize with platform-appropriate provider
    const rnfbProvider = appCheck().newReactNativeFirebaseAppCheckProvider();

    rnfbProvider.configure({
      android: {
        provider: __DEV__ ? 'debug' : 'playIntegrity',
        debugToken: __DEV__ ? 'YOUR-DEBUG-TOKEN' : undefined,
      },
      apple: {
        provider: __DEV__ ? 'debug' : 'appAttestWithDeviceCheckFallback',
        debugToken: __DEV__ ? 'YOUR-DEBUG-TOKEN' : undefined,
      },
    });

    await appCheck().initializeAppCheck({
      provider: rnfbProvider,
      isTokenAutoRefreshEnabled: true,
    });

    appCheckInitialized = true;
    console.log('[AppCheck] Initialized successfully');
  } catch (error) {
    // Log but don't crash - App Check is optional for development
    console.warn('[AppCheck] Failed to initialize:', error);
    appCheckInitialized = true; // Mark as initialized to prevent retries
  }
}
