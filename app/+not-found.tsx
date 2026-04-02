import { Redirect } from 'expo-router';
import { useAuth } from './_layout';

export default function NotFoundScreen() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return null;
  }

  return <Redirect href={user ? '/(tabs)/home' : '/(auth)/welcome-simple'} />;
}
