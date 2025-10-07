import { Redirect } from 'expo-router';
import { useAuth } from './_layout';
import { View, Text } from 'react-native';

export default function Index() {
    const { user, isLoading } = useAuth();
    
    console.log('Index.tsx - isLoading:', isLoading, 'user:', user ? user.email : 'No user');
    
    if (isLoading) {
        console.log('Index showing loading state');
        return null;
    }
    
    const redirectPath = user ? '/(tabs)/home' : '/(auth)/welcome-simple';
    console.log('Index redirecting to:', redirectPath);
    
    return <Redirect href={redirectPath} />;
}
