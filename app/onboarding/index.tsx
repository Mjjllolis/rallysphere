// app/onboarding/index.tsx
import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../../lib/firebase/auth';
import { getUserProfile, createUserProfile } from '../../lib/firebase/firestore-functions';

type Role = 'player' | 'club';

export default function Onboarding() {
    // If already logged in, skip straight to home
    useEffect(() => {
        const sub = onAuthStateChanged(auth, (user) => {
            if (user) {
                router.replace('/(tabs)');
            }
        });
        return sub;
    }, []);

    // Handle selection and send role param to Welcome screen
    const handleSelect = (role: Role) => {
        router.replace({ pathname: '/(auth)/welcome', params: { r: role } });
    };

    return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 }}>
            <Text style={{ fontSize: 20 }}>I am a...</Text>

            <Pressable onPress={() => handleSelect('player')}>
                <Text style={{ fontSize: 24 }}>🏓 Player</Text>
            </Pressable>

            <Pressable onPress={() => handleSelect('club')}>
                <Text style={{ fontSize: 24 }}>🏟️ Club</Text>
            </Pressable>
        </View>
    );
}