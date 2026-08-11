// lib/googlePlaces.ts
// Client-side helpers for the Places API (New). Centralized here so every call
// site shares the same session-token + field-mask discipline — both matter for
// billing: an Autocomplete session followed by a scoped Place Details call is
// billed as one cheap unit, while untokenized per-keystroke calls are each
// billed individually.
import { Platform } from 'react-native';
import Constants from 'expo-constants';

const PLACES_BASE = 'https://places.googleapis.com/v1';

function getApiKey(): string {
  const apiKey = process.env.EXPO_PUBLIC_GOOGLE_API_KEY;
  if (!apiKey) throw new Error('Missing Google API key');
  return apiKey;
}

// Lets a Google Cloud Console "Application restriction" (iOS bundle ID / Android
// package) actually apply to these hand-rolled fetch() calls. The native Maps SDKs
// attach these headers automatically; raw REST calls have to set them explicitly or
// a restricted key rejects every request the app itself makes.
function getRestrictionHeaders(): Record<string, string> {
  if (Platform.OS === 'ios') {
    const bundleId = Constants.expoConfig?.ios?.bundleIdentifier;
    return bundleId ? { 'X-Ios-Bundle-Identifier': bundleId } : {};
  }
  if (Platform.OS === 'android') {
    const pkg = Constants.expoConfig?.android?.package;
    const headers: Record<string, string> = pkg ? { 'X-Android-Package': pkg } : {};
    // Android app restrictions also require the signing cert's SHA-1 fingerprint.
    // Get it with `eas credentials -p android` and set it as EXPO_PUBLIC_ANDROID_CERT_SHA1
    // before turning on an "Android apps" key restriction in Cloud Console.
    const cert = process.env.EXPO_PUBLIC_ANDROID_CERT_SHA1;
    if (cert) headers['X-Android-Cert'] = cert;
    return headers;
  }
  return {};
}

export function createSessionToken(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export interface PlacePrediction {
  placeId: string;
  description: string;
}

export async function fetchPlacePredictions(
  input: string,
  sessionToken: string,
  includedPrimaryTypes?: string[]
): Promise<PlacePrediction[]> {
  const apiKey = getApiKey();
  const res = await fetch(`${PLACES_BASE}/places:autocomplete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      ...getRestrictionHeaders(),
    },
    body: JSON.stringify({
      input,
      sessionToken,
      ...(includedPrimaryTypes ? { includedPrimaryTypes } : {}),
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'Location search is unavailable');

  const suggestions = data.suggestions || [];
  return suggestions
    .filter((s: any) => s.placePrediction)
    .map((s: any) => ({
      placeId: s.placePrediction.placeId,
      description: s.placePrediction.text.text,
    }));
}

export async function fetchPlaceLocation(
  placeId: string,
  sessionToken: string
): Promise<{ latitude: number; longitude: number } | null> {
  const apiKey = getApiKey();
  const res = await fetch(
    `${PLACES_BASE}/places/${placeId}?sessionToken=${encodeURIComponent(sessionToken)}`,
    {
      headers: {
        'X-Goog-Api-Key': apiKey,
        // Cheapest Place Details (New) SKU — only ask for what we use.
        'X-Goog-FieldMask': 'location',
        ...getRestrictionHeaders(),
      },
    }
  );
  const data = await res.json();
  if (!data.location) return null;
  return { latitude: data.location.latitude, longitude: data.location.longitude };
}
