import React, { useRef, useState, useEffect } from 'react';
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
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { FirebaseRecaptchaVerifierModal } from 'expo-firebase-recaptcha';
import { sendPhoneVerification, app } from '../../lib/firebase';

export default function PhoneAuthScreen() {
    const { mode } = useLocalSearchParams<{ mode?: string }>();
    const isSignUp = mode !== 'signin';

    const [phone, setPhone] = useState('');
    const [loading, setLoading] = useState(false);

    const recaptchaVerifier = useRef<any>(null);

    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(40)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
            Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
        ]).start();
    }, []);

    const formatPhoneNumber = (raw: string) => {
        // Strip non-digits
        const digits = raw.replace(/\D/g, '');
        // Ensure E.164 format with +1 prefix if no country code entered
        if (digits.startsWith('1') && digits.length === 11) return `+${digits}`;
        if (digits.length === 10) return `+1${digits}`;
        if (raw.startsWith('+')) return raw.replace(/[^\d+]/g, '');
        return `+${digits}`;
    };

    const handleSendCode = async () => {
        const formatted = formatPhoneNumber(phone);
        if (formatted.length < 12) {
            Alert.alert('Invalid Number', 'Please enter a valid US phone number.');
            return;
        }

        setLoading(true);
        try {
            const result = await sendPhoneVerification(formatted, recaptchaVerifier.current);
            if (result.success) {
                router.push({ pathname: '/(auth)/verify-otp', params: { phone: formatted } });
            } else {
                Alert.alert('Error', result.error || 'Failed to send code. Try again.');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="light-content" />
            <LinearGradient colors={['#2C5282', '#1A365D']} style={StyleSheet.absoluteFill} />

            <FirebaseRecaptchaVerifierModal
                ref={recaptchaVerifier}
                firebaseConfig={app.options}
                attemptInvisibleVerification
            />

            <KeyboardAvoidingView
                style={styles.content}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
                    <View style={styles.header}>
                        <Text style={styles.title}>RallySphere</Text>
                        <Text style={styles.subtitle}>{isSignUp ? 'Create Account' : 'Welcome Back'}</Text>
                        <Text style={styles.description}>Enter your phone number to continue.</Text>
                    </View>

                    <Surface style={styles.card} elevation={8}>
                        <Text style={styles.label}>Phone Number</Text>
                        <TextInput
                            value={phone}
                            onChangeText={setPhone}
                            mode="outlined"
                            keyboardType="phone-pad"
                            placeholder="+1 (555) 000-0000"
                            style={styles.input}
                            textColor="#1a1a1a"
                            outlineColor="rgba(0,0,0,0.2)"
                            activeOutlineColor="#2C5282"
                            theme={{ colors: { onSurfaceVariant: 'rgba(0,0,0,0.5)' } }}
                            left={<TextInput.Icon icon="phone" color="#2C5282" />}
                        />
                        <Text style={styles.hint}>We'll send you a verification code via SMS.</Text>

                        <Button
                            mode="contained"
                            onPress={handleSendCode}
                            loading={loading}
                            disabled={loading || phone.length < 10}
                            style={styles.button}
                            contentStyle={styles.buttonContent}
                            labelStyle={styles.buttonLabel}
                        >
                            Send Code
                        </Button>
                    </Surface>

                    <View style={styles.footer}>
                        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                            <Text style={styles.backText}>Back to Welcome</Text>
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
    header: { alignItems: 'center', marginBottom: 40 },
    title: { fontSize: 36, fontWeight: 'bold', color: 'white', marginBottom: 8 },
    subtitle: { fontSize: 26, fontWeight: 'bold', color: 'white', marginBottom: 8 },
    description: { fontSize: 16, color: 'rgba(255,255,255,0.8)', textAlign: 'center' },
    card: { borderRadius: 24, padding: 28, backgroundColor: 'white', gap: 12 },
    label: { fontSize: 14, fontWeight: '600', color: '#444', marginBottom: 4 },
    input: { backgroundColor: 'white' },
    hint: { fontSize: 12, color: 'rgba(0,0,0,0.45)', marginTop: -4 },
    button: { marginTop: 8, borderRadius: 12, backgroundColor: '#2C5282' },
    buttonContent: { paddingVertical: 10 },
    buttonLabel: { fontSize: 16, fontWeight: '600' },
    footer: { alignItems: 'center', marginTop: 24 },
    backButton: { paddingVertical: 8 },
    backText: { color: 'rgba(255,255,255,0.6)', fontSize: 14 },
});
