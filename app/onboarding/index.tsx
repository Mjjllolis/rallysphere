import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';

export default function Onboarding() {
    return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 }}>
            <Text style={{ fontSize: 20 }}>I am a...</Text>

            <Pressable onPress={() => router.replace('/(tabs)/home')}>
                <Text style={{ fontSize: 24 }}>🏓 Player</Text>
            </Pressable>

            <Pressable onPress={() => router.replace('/(tabs)/home')}>
                <Text style={{ fontSize: 24 }}>🏟️ Club</Text>
            </Pressable>
        </View>
    );
}