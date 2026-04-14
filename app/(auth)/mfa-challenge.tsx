import React, { useRef, useState, useEffect } from 'react';
import {
    View,
    StyleSheet,
    Alert,
    Animated,
    TouchableOpacity,
    StatusBar,
    TextInput as RNTextInput,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { Text, Button, Surface } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { FirebaseRecaptchaVerifierModal } from 'expo-firebase-recaptcha';
import {
    app,
    sendMFASignInCode,
    confirmMFASignIn,
    getPendingMFAHint,
    clearPendingMFA,
} from '../../lib/firebase';

const OTP_LENGTH = 6;

export default function MFAChallengeScreen() {
    const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''));
    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(true);
    const [hintPhone, setHintPhone] = useState<string | null>(null);
    const inputs = useRef<(RNTextInput | null)[]>([]);
    const recaptchaVerifier = useRef<any>(null);

    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(40)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
            Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
        ]).start();

        const hint = getPendingMFAHint();
        if (!hint) {
            Alert.alert('Session expired', 'Please sign in again.', [
                { text: 'OK', onPress: () => router.replace('/(auth)/login') },
            ]);
            return;
        }
        setHintPhone(hint.phoneNumber ?? null);
        setTimeout(() => sendCode(), 400);
    }, []);

    const sendCode = async () => {
        setSending(true);
        const result = await sendMFASignInCode(recaptchaVerifier.current);
        setSending(false);
        if (!result.success) {
            Alert.alert('Error', result.error || 'Failed to send code.');
        } else {
            setTimeout(() => inputs.current[0]?.focus(), 200);
        }
    };

    const handleChange = (value: string, index: number) => {
        if (value.length > 1) {
            const digits = value.replace(/\D/g, '').slice(0, OTP_LENGTH);
            const newOtp = [...otp];
            for (let i = 0; i < digits.length; i++) newOtp[i] = digits[i];
            setOtp(newOtp);
            inputs.current[Math.min(digits.length, OTP_LENGTH - 1)]?.focus();
            return;
        }
        const digit = value.replace(/\D/g, '');
        const newOtp = [...otp];
        newOtp[index] = digit;
        setOtp(newOtp);
        if (digit && index < OTP_LENGTH - 1) inputs.current[index + 1]?.focus();
    };

    const handleKeyPress = (key: string, index: number) => {
        if (key === 'Backspace' && !otp[index] && index > 0) {
            inputs.current[index - 1]?.focus();
            const newOtp = [...otp];
            newOtp[index - 1] = '';
            setOtp(newOtp);
        }
    };

    const handleVerify = async () => {
        const code = otp.join('');
        if (code.length < OTP_LENGTH) {
            Alert.alert('Incomplete Code', 'Please enter all 6 digits.');
            return;
        }
        setLoading(true);
        const result = await confirmMFASignIn(code);
        setLoading(false);
        if (result.success) {
            router.replace('/');
        } else {
            Alert.alert('Invalid Code', result.error || 'The code you entered is incorrect.');
            setOtp(Array(OTP_LENGTH).fill(''));
            inputs.current[0]?.focus();
        }
    };

    const handleCancel = () => {
        clearPendingMFA();
        router.replace('/(auth)/login');
    };

    const masked = hintPhone
        ? hintPhone.replace(/(\+\d{1,2})(\d+)(\d{4})/, '$1 ••••• $3')
        : 'your enrolled phone';

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
                        <Text style={styles.title}>Two-Factor Auth</Text>
                        <Text style={styles.description}>
                            Enter the 6-digit code we sent to{'\n'}
                            <Text style={styles.phoneDisplay}>{masked}</Text>
                        </Text>
                    </View>

                    <Surface style={styles.card} elevation={8}>
                        <View style={styles.otpRow}>
                            {otp.map((digit, index) => (
                                <RNTextInput
                                    key={index}
                                    ref={(ref) => { inputs.current[index] = ref; }}
                                    style={[styles.otpBox, digit ? styles.otpBoxFilled : null]}
                                    value={digit}
                                    onChangeText={(v) => handleChange(v, index)}
                                    onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, index)}
                                    keyboardType="number-pad"
                                    maxLength={OTP_LENGTH}
                                    textAlign="center"
                                    selectTextOnFocus
                                    editable={!sending && !loading}
                                />
                            ))}
                        </View>

                        <Button
                            mode="contained"
                            onPress={handleVerify}
                            loading={loading}
                            disabled={loading || sending || otp.join('').length < OTP_LENGTH}
                            style={styles.button}
                            contentStyle={styles.buttonContent}
                            labelStyle={styles.buttonLabel}
                        >
                            Verify
                        </Button>

                        <TouchableOpacity onPress={sendCode} disabled={sending || loading} style={styles.resendButton}>
                            <Text style={styles.resendText}>
                                {sending ? 'Sending code...' : 'Resend code'}
                            </Text>
                        </TouchableOpacity>
                    </Surface>

                    <View style={styles.footer}>
                        <TouchableOpacity onPress={handleCancel} style={styles.backButton}>
                            <Text style={styles.backText}>Cancel and sign in again</Text>
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
    title: { fontSize: 32, fontWeight: 'bold', color: 'white', marginBottom: 12 },
    description: { fontSize: 16, color: 'rgba(255,255,255,0.8)', textAlign: 'center', lineHeight: 24 },
    phoneDisplay: { fontWeight: '700', color: 'white' },
    card: { borderRadius: 24, padding: 28, backgroundColor: 'white', gap: 20 },
    otpRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
    otpBox: {
        flex: 1,
        height: 56,
        borderRadius: 12,
        borderWidth: 1.5,
        borderColor: 'rgba(0,0,0,0.2)',
        fontSize: 24,
        fontWeight: '700',
        color: '#1a1a1a',
        backgroundColor: '#f8f8f8',
    },
    otpBoxFilled: { borderColor: '#2C5282', backgroundColor: '#EBF4FF' },
    button: { borderRadius: 12, backgroundColor: '#2C5282' },
    buttonContent: { paddingVertical: 10 },
    buttonLabel: { fontSize: 16, fontWeight: '600' },
    resendButton: { alignSelf: 'center', paddingVertical: 8 },
    resendText: { color: '#2C5282', fontSize: 14, fontWeight: '600' },
    footer: { alignItems: 'center', marginTop: 24 },
    backButton: { paddingVertical: 8 },
    backText: { color: 'rgba(255,255,255,0.6)', fontSize: 14 },
});
