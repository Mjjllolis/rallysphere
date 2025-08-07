import { Redirect } from 'expo-router';
import { useAuth } from './_layout';

export default function Index() {
    const { user, ready } = useAuth();
    if (!ready) return null;
    return <Redirect href={user ? '/(tabs)' : '/(auth)/welcome'} />;
}