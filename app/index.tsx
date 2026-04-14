import { Redirect } from 'expo-router';
import { useAuth } from './_layout';
import { useEffect, useState } from 'react';
import { getDoc, doc, getFirestore } from 'firebase/firestore';

export default function Index() {
    const { user, isLoading } = useAuth();
    const [checked, setChecked] = useState(false);
    const [profileComplete, setProfileComplete] = useState(false);

    useEffect(() => {
        if (!user) {
            setChecked(true);
            return;
        }
        const db = getFirestore();
        getDoc(doc(db, 'users', user.uid)).then((snap) => {
            const data = snap.data();
            const complete = !!(data?.profile?.firstName && data?.profile?.lastName && data?.profile?.email);
            setProfileComplete(complete);
            setChecked(true);
        }).catch(() => setChecked(true));
    }, [user]);

    if (isLoading || !checked) return null;
    if (!user) return <Redirect href="/(auth)/welcome-simple" />;
    if (!profileComplete) return <Redirect href="/(auth)/profile-setup" />;
    return <Redirect href="/(tabs)/home" />;
}
