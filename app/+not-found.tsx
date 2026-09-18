import { Redirect } from 'expo-router';
import { HOME_HREF } from '../lib/routes';
import { useAuth } from './_layout';

export default function NotFoundScreen() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return null;
  }

  return <Redirect href={user ? HOME_HREF : '/welcome-simple'} />;
}
