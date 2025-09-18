// app/onboarding/index.tsx - Simplified Onboarding
import React from 'react';
import {
    View,
    Text,
    StyleSheet,
} from 'react-native';
import {
    Button,
    useTheme
} from 'react-native-paper';
import { router } from 'expo-router';

export default function OnboardingPage() {
    const { colors } = useTheme();

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={styles.content}>
                <Text style={[styles.title, { color: colors.onSurface }]}>
                    Welcome to RallySphere
                </Text>
                <Text style={[styles.message, { color: colors.onSurfaceVariant }]}>
                    Onboarding feature coming soon!
                </Text>
                <Button 
                    mode="contained" 
                    onPress={() => router.replace('/(tabs)')}
                    style={styles.button}
                >
                    Continue
                </Button>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    content: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        textAlign: 'center',
        marginBottom: 10,
    },
    message: {
        fontSize: 18,
        textAlign: 'center',
        marginBottom: 30,
    },
    button: {
        marginTop: 20,
    },
});
