// hooks/usePushToken.ts — Expo push registration + token persistence.
//
// The token has to reach the server for anything to be pushable, so registering
// is only half the job: registerPushTokenForUser() writes it to
// users/{uid}.expoPushTokens[], which is where the Cloud Functions notifier
// reads from. Stored as an ARRAY — one person can install the app on a phone
// and a tablet, and both should ring.
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { doc, setDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../lib/firebase';

export async function registerForPushNotificationsAsync(): Promise<string | null> {
    if (!Device.isDevice) return null;

    // Don't re-prompt someone who already answered — asking again after a denial
    // is a no-op on iOS anyway and just burns a round-trip.
    const existing = await Notifications.getPermissionsAsync();
    let granted = existing.granted;
    if (!granted && existing.canAskAgain !== false) {
        granted = (await Notifications.requestPermissionsAsync()).granted;
    }
    if (!granted) return null;

    // Android needs a channel before anything will surface.
    if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
            name: 'default',
            importance: Notifications.AndroidImportance.DEFAULT,
        });
    }

    try {
        const token = (await Notifications.getExpoPushTokenAsync()).data;
        return token || null;
    } catch {
        // Missing APNs/FCM credentials in a dev build shouldn't crash startup.
        return null;
    }
}

/**
 * Register for push and attach the token to the signed-in user. Safe to call on
 * every launch — arrayUnion dedupes, and a merge write won't clobber the doc.
 */
export async function registerPushTokenForUser(uid: string): Promise<string | null> {
    if (!uid) return null;
    const token = await registerForPushNotificationsAsync();
    if (!token) return null;
    try {
        await setDoc(
            doc(db, 'users', uid),
            { expoPushTokens: arrayUnion(token), pushTokenUpdatedAt: new Date() },
            { merge: true }
        );
    } catch {
        // A failed token write must never block sign-in.
        return null;
    }
    return token;
}
