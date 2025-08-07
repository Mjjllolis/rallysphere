// app/(auth)/login.tsx
import { useLocalSearchParams, Link, useRouter } from 'expo-router';
// ...
const { r } = useLocalSearchParams<{ r?: 'player' | 'club' }>();
// ...
<Link href={{ pathname: '/(auth)/signup', params: { r } }}>
    Create an account
</Link>