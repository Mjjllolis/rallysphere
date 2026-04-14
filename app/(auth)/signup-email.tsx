import React, { useState, useRef, useEffect } from 'react';
import {
    View,
    StyleSheet,
    Alert,
    Animated,
    TouchableOpacity,
    StatusBar,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { Text, TextInput, Button, Surface } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { signUpWithEmail } from '../../lib/firebase';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignupEmailScreen() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [loading, setLoading] = useState(false);

    const player = useVideoPlayer(require('../../assets/BGSignIn.mp4'), (player) => {
        player.loop = true;
        player.muted = true;
        player.play();
    });

    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(40)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
            Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
        ]).start();
    }, []);

    const handleSignup = async () => {
        const e = email.trim();
        if (!EMAIL_RE.test(e)) {
            Alert.alert('Invalid Email', 'Please enter a valid email address.');
            return;
        }
        if (password.length < 8) {
            Alert.alert('Weak Password', 'Password must be at least 8 characters.');
            return;
        }
        if (password !== confirm) {
            Alert.alert('Passwords Don’t Match', 'Please re-enter the same password.');
            return;
        }

        setLoading(true);
        try {
            const result = await signUpWithEmail(e, password);
            if (result.success) {
                router.replace('/(auth)/profile-setup');
            } else {
                Alert.alert('Signup Failed', result.error || 'Unable to create account.');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="light-content" />
            <View style={StyleSheet.absoluteFill}>
                <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'black' }]} />
                <VideoView
                    player={player}
                    style={StyleSheet.absoluteFill}
                    contentFit="cover"
                    nativeControls={false}
                />
            </View>

            <KeyboardAvoidingView
                style={styles.content}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
                    <View style={styles.header}>
                        <Text style={styles.title}>RallySphere</Text>
                        <Text style={styles.subtitle}>Create Account</Text>
                        <Text style={styles.description}>Sign up with your email address.</Text>
                    </View>

                    <Surface style={styles.card} elevation={8}>
                        <TextInput
                            label="Email Address"
                            value={email}
                            onChangeText={setEmail}
                            mode="outlined"
                            keyboardType="email-address"
                            autoCapitalize="none"
                            autoComplete="email"
                            style={styles.input}
                            textColor="#1a1a1a"
                            outlineColor="rgba(0,0,0,0.2)"
                            activeOutlineColor="#2C5282"
                            theme={{ colors: { onSurfaceVariant: 'rgba(0,0,0,0.5)' } }}
                        />
                        <TextInput
                            label="Password"
                            value={password}
                            onChangeText={setPassword}
                            mode="outlined"
                            secureTextEntry
                            autoComplete="new-password"
                            style={styles.input}
                            textColor="#1a1a1a"
                            outlineColor="rgba(0,0,0,0.2)"
                            activeOutlineColor="#2C5282"
                            theme={{ colors: { onSurfaceVariant: 'rgba(0,0,0,0.5)' } }}
                        />
                        <TextInput
                            label="Confirm Password"
                            value={confirm}
                            onChangeText={setConfirm}
                            mode="outlined"
                            secureTextEntry
                            autoComplete="new-password"
                            style={styles.input}
                            textColor="#1a1a1a"
                            outlineColor="rgba(0,0,0,0.2)"
                            activeOutlineColor="#2C5282"
                            theme={{ colors: { onSurfaceVariant: 'rgba(0,0,0,0.5)' } }}
                        />
                        <Text style={styles.hint}>
                            We’ll send a verification email so you can enable two-factor auth.
                        </Text>
                        <Button
                            mode="contained"
                            onPress={handleSignup}
                            loading={loading}
                            disabled={loading}
                            style={styles.button}
                            contentStyle={styles.buttonContent}
                            labelStyle={styles.buttonLabel}
                        >
                            Create Account
                        </Button>
                    </Surface>

                    <View style={styles.footer}>
                        <TouchableOpacity onPress={() => router.back()}>
                            <Text style={styles.backText}>Back</Text>
                        </TouchableOpacity>
                    </View>
                </Animated.View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    content: { flex: 1, padding: 24, justifyContent: 'center' },
    header: { alignItems: 'center', marginBottom: 32 },
    title: { fontSize: 36, fontWeight: 'bold', color: 'white', marginBottom: 8 },
    subtitle: { fontSize: 26, fontWeight: 'bold', color: 'white', marginBottom: 8 },
    description: { fontSize: 16, color: 'rgba(255,255,255,0.8)' },
    card: { borderRadius: 24, padding: 28, backgroundColor: 'white', gap: 14 },
    input: { backgroundColor: 'white' },
    hint: { fontSize: 12, color: 'rgba(0,0,0,0.5)', marginTop: -2 },
    button: { marginTop: 4, borderRadius: 12, backgroundColor: '#2C5282' },
    buttonContent: { paddingVertical: 10 },
    buttonLabel: { fontSize: 16, fontWeight: '600' },
    footer: { alignItems: 'center', marginTop: 24 },
    backText: { color: 'rgba(255,255,255,0.6)', fontSize: 14 },
});
