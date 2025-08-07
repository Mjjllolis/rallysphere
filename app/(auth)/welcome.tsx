// app/(auth)/welcome.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    View,
    KeyboardAvoidingView,
    Platform,
    ImageBackground,
    Image,
    StyleSheet,
    Text,
    Animated,
    Easing,
    UIManager,
    LayoutAnimation,
} from 'react-native';
import { TextInput, Button, Card, ActivityIndicator } from 'react-native-paper';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { auth, db } from '../../firebase/config';
import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    updateProfile,
    sendPasswordResetEmail,
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

// Assets (match filename case)
import BackgroundImg from '../../assets/Background.png';
import LogoImg from '../../assets/Logo.png';

type Mode = 'signin' | 'signup';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function WelcomeAuth() {
    const { r } = useLocalSearchParams<{ r?: 'player' | 'club' }>();
    const role = r === 'club' ? 'club' : 'player';

    const [mode, setMode] = useState<Mode>('signup');
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [pw, setPw] = useState('');
    const [showPw, setShowPw] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const router = useRouter();

    // Animations
    const scale = useRef(new Animated.Value(1)).current;
    const opacity = useRef(new Animated.Value(1)).current;

    const runModeAnim = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        Animated.parallel([
            Animated.sequence([
                Animated.timing(scale, { toValue: 0.98, duration: 120, easing: Easing.out(Easing.quad), useNativeDriver: true }),
                Animated.timing(scale, { toValue: 1, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true }),
            ]),
            Animated.sequence([
                Animated.timing(opacity, { toValue: 0.85, duration: 120, useNativeDriver: true }),
                Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
            ]),
        ]).start();
    };

    useEffect(() => {
        runModeAnim();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode]);

    const title = useMemo(() => (mode === 'signin' ? 'Welcome back' : 'Create your account'), [mode]);
    const cta = mode === 'signin' ? 'Sign In' : 'Sign Up';

    const onSubmit = async () => {
        setErr(null);
        setBusy(true);

        // gentle pulse while loading
        const pulse = Animated.loop(
            Animated.sequence([
                Animated.timing(scale, { toValue: 0.99, duration: 200, useNativeDriver: true }),
                Animated.timing(scale, { toValue: 1.0, duration: 200, useNativeDriver: true }),
            ])
        );
        pulse.start();

        try {
            if (mode === 'signin') {
                await signInWithEmailAndPassword(auth, email.trim(), pw);
            } else {
                const cred = await createUserWithEmailAndPassword(auth, email.trim(), pw);
                if (name) await updateProfile(cred.user, { displayName: name });
                await setDoc(doc(db, 'users', cred.user.uid), {
                    displayName: name || null,
                    email: cred.user.email,
                    role,
                    createdAt: serverTimestamp(),
                });
            }
            router.replace('/(tabs)');
        } catch (e: any) {
            setErr(e?.message ?? 'Something went wrong');
        } finally {
            pulse.stop();
            setBusy(false);
            scale.setValue(1);
        }
    };

    const onForgot = async () => {
        if (!email) return setErr('Enter your email first.');
        setErr(null);
        try {
            await sendPasswordResetEmail(auth, email.trim());
            setErr('Password reset sent. Check your inbox.');
        } catch (e: any) {
            setErr(e?.message ?? 'Could not send reset email');
        }
    };

    return (
        <ImageBackground source={BackgroundImg} style={styles.bg} resizeMode="cover">
            {/* 40% white overlay so only the background lightens */}
            <View style={styles.overlay} />

            <KeyboardAvoidingView style={styles.flex} behavior={Platform.select({ ios: 'padding', android: undefined })}>
                <View style={styles.container}>
                    {/* Logo */}
                    <View style={styles.logoContainer}>
                        <Image source={LogoImg} style={styles.logo} resizeMode="contain" />
                    </View>

                    {/* Animated Card */}
                    <Animated.View style={{ transform: [{ scale }], opacity }}>
                        <Card mode="elevated" style={styles.card}>
                            <Card.Content style={{ gap: 12 }}>
                                {/* Toggle */}
                                <View style={styles.toggleRow}>
                                    <Button
                                        mode={mode === 'signin' ? 'contained' : 'outlined'}
                                        onPress={() => setMode('signin')}
                                        style={{ flex: 1 }}
                                    >
                                        Sign In
                                    </Button>
                                    <Button
                                        mode={mode === 'signup' ? 'contained' : 'outlined'}
                                        onPress={() => setMode('signup')}
                                        style={{ flex: 1 }}
                                    >
                                        Sign Up
                                    </Button>
                                </View>

                                <Text style={styles.title}>{title}</Text>

                                {mode === 'signup' && (
                                    <TextInput
                                        label="Name"
                                        value={name}
                                        onChangeText={setName}
                                        autoCapitalize="words"
                                        mode="outlined"
                                    />
                                )}

                                <TextInput
                                    label="Email"
                                    value={email}
                                    onChangeText={setEmail}
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                    keyboardType="email-address"
                                    mode="outlined"
                                />

                                <TextInput
                                    label="Password"
                                    value={pw}
                                    onChangeText={setPw}
                                    secureTextEntry={!showPw}
                                    right={<TextInput.Icon icon={showPw ? 'eye-off' : 'eye'} onPress={() => setShowPw(s => !s)} />}
                                    mode="outlined"
                                />

                                {err ? <Text style={{ color: '#D14343' }}>{err}</Text> : null}

                                <Button mode="contained" onPress={onSubmit} loading={busy} disabled={busy} style={{ marginTop: 8 }}>
                                    {cta}
                                </Button>

                                {mode === 'signin' && (
                                    <Button mode="text" onPress={onForgot} disabled={busy}>
                                        Forgot password?
                                    </Button>
                                )}
                            </Card.Content>
                        </Card>

                        {/* Subtle loading indicator below card */}
                        {busy && (
                            <View style={{ alignItems: 'center', marginTop: 12 }}>
                                <ActivityIndicator animating size="small" />
                            </View>
                        )}
                    </Animated.View>

                    {/* Footer */}
                    <View style={{ alignItems: 'center', marginTop: 16 }}>
                        <Text style={{ opacity: 0.6 }}>By continuing you agree to our Terms & Privacy.</Text>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </ImageBackground>
    );
}

const styles = StyleSheet.create({
    flex: { flex: 1 },
    bg: { flex: 1 },
    // White at 40% opacity over the background image
    overlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(255,255,255,0.4)',
    },
    container: { flex: 1, padding: 24, justifyContent: 'center' },
    logoContainer: { alignItems: 'center', marginBottom: 24 },
    logo: { width: 200, height: 150 },
    card: { borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.95)', overflow: 'hidden' },
    toggleRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
    title: { fontSize: 20, fontWeight: '700', marginBottom: 4 },
});