import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';

export async function registerForPushNotificationsAsync() {
    if (!Device.isDevice) return null;

    const { granted } = await Notifications.requestPermissionsAsync();
    if (!granted) return null;

    const token = (await Notifications.getExpoPushTokenAsync()).data;
    return token;
}