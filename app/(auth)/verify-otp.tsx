import React, { useRef, useState, useEffect } from 'react';
import {
    View,
    StyleSheet,
    Alert,
    Animated,
    TouchableOpacity,
    TextInput as RNTextInput,
    KeyboardAvoidingView,
    Platform,
    ActivityIndicator,
    Text,
    Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import AuthBackground from '../../components/auth/AuthBackground';
import GlassCard from '../../components/auth/GlassCard';
import { confirmOTPCode } from '../../lib/firebase';

const OTP_LENGTH = 6;

export default function VerifyOTPScreen() {
    const { phone, redirectEventId } = useLocalSearchParams<{ phone: string; redirectEventId?: string }>();
    const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''));
    const [loading, setLoading] = useState(false);
    const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
    const inputs = useRef<(RNTextInput | null)[]>([]);

    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(40)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
            Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
        ]).start();
        // Auto-focus first input
        setTimeout(() => inputs.current[0]?.focus(), 300);
    }, []);

    const handleChange = (value: string, index: number) => {
        // Handle paste of full code
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
        if (digit && index < OTP_LENGTH - 1) {
            inputs.current[index + 1]?.focus();
        }
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
        try {
            const result = await confirmOTPCode(code);
            if (result.success) {
                if (result.isNewUser) {
                    router.replace({ pathname: '/(auth)/profile-setup', params: { redirectEventId } });
                } else if (redirectEventId) {
                    // Land on a clean Home first — dismissAll() drops the whole
                    // phone-auth/verify-otp stack so Back from the event never
                    // resurfaces the sign-in flow — then push the event on top
                    // of that clean stack so Back from there goes to Home.
                    router.dismissAll();
                    router.replace('/(tabs)/home');
                    router.push(`/event/${redirectEventId}`);
                } else {
                    router.replace('/(tabs)/home');
                }
            } else {
                Alert.alert('Invalid Code', result.error || 'The code you entered is incorrect.');
                setOtp(Array(OTP_LENGTH).fill(''));
                inputs.current[0]?.focus();
            }
        } finally {
            setLoading(false);
        }
    };

    const maskedPhone = phone
        ? phone.replace(/(\+\d{1,2})(\d+)(\d{4})/, '$1 ••••• $3')
        : '';

    const complete = otp.join('').length === OTP_LENGTH;
    const disabled = loading || !complete;

    return (
        <AuthBackground>
            <SafeAreaView style={styles.safeArea}>
                <KeyboardAvoidingView
                    style={styles.content}
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                >
                    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
                        <Image
                            source={require('../../assets/Logo.png')}
                            style={styles.logo}
                            resizeMode="contain"
                        />

                        <GlassCard contentStyle={styles.cardContent}>
                                <View style={styles.header}>
                                    <Text style={styles.title}>Verify Number</Text>
                                    <Text style={styles.description}>
                                        Enter the 6-digit code sent to{'\n'}
                                        <Text style={styles.phoneDisplay}>{maskedPhone}</Text>
                                    </Text>
                                </View>

                                <View style={styles.otpRow}>
                                    {otp.map((digit, index) => (
                                        <RNTextInput
                                            key={index}
                                            ref={(ref) => { inputs.current[index] = ref; }}
                                            style={[
                                                styles.otpBox,
                                                !!digit && styles.otpBoxFilled,
                                                focusedIndex === index && styles.otpBoxFocused,
                                            ]}
                                            value={digit}
                                            onChangeText={(v) => handleChange(v, index)}
                                            onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, index)}
                                            onFocus={() => setFocusedIndex(index)}
                                            onBlur={() => setFocusedIndex(null)}
                                            keyboardType="number-pad"
                                            textContentType={index === 0 ? 'oneTimeCode' : 'none'}
                                            maxLength={OTP_LENGTH}
                                            textAlign="center"
                                            selectionColor="#4F8CC9"
                                            selectTextOnFocus
                                        />
                                    ))}
                                </View>

                                <TouchableOpacity
                                    onPress={handleVerify}
                                    disabled={disabled}
                                    style={[styles.button, disabled && styles.buttonDisabled]}
                                    activeOpacity={0.8}
                                >
                                    <LinearGradient
                                        colors={disabled ? ['#3E6E9E', '#2F5081'] : ['#4F8CC9', '#3B64A1']}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 1, y: 1 }}
                                        style={styles.buttonGradient}
                                    >
                                        {loading ? (
                                            <ActivityIndicator color="#FFFFFF" />
                                        ) : (
                                            <Text style={styles.buttonText}>Verify</Text>
                                        )}
                                    </LinearGradient>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    onPress={() => router.back()}
                                    style={styles.backButton}
                                    disabled={loading}
                                >
                                    <Text style={styles.backText}>Wrong number? Go back</Text>
                                </TouchableOpacity>
                        </GlassCard>
                    </Animated.View>
                </KeyboardAvoidingView>
            </SafeAreaView>
        </AuthBackground>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
    },
    content: {
        flex: 1,
        paddingHorizontal: 20,
        justifyContent: 'center',
    },
    logo: {
        alignSelf: 'center',
        width: 180,
        height: 100,
        marginBottom: 24,
    },
    cardContent: {
        padding: 24,
        gap: 18,
    },
    header: {
        alignItems: 'center',
    },
    title: {
        fontSize: 22,
        fontWeight: '500',
        color: '#FFFFFF',
        marginBottom: 6,
        letterSpacing: 0.2,
    },
    description: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.85)',
        textAlign: 'center',
        lineHeight: 22,
    },
    phoneDisplay: {
        fontWeight: '700',
        color: '#FFFFFF',
    },
    otpRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 8,
    },
    otpBox: {
        flex: 1,
        height: 58,
        borderRadius: 14,
        borderWidth: 1.5,
        borderColor: 'rgba(255,255,255,0.2)',
        backgroundColor: 'rgba(255,255,255,0.1)',
        fontSize: 22,
        fontWeight: '500',
        color: '#FFFFFF',
    },
    otpBoxFilled: {
        borderColor: 'rgba(79,140,201,0.6)',
        backgroundColor: 'rgba(79,140,201,0.18)',
    },
    otpBoxFocused: {
        borderColor: 'rgba(79,140,201,0.9)',
        backgroundColor: 'rgba(255,255,255,0.15)',
    },
    button: {
        borderRadius: 16,
        overflow: 'hidden',
    },
    buttonDisabled: {
        opacity: 0.55,
    },
    buttonGradient: {
        paddingVertical: 16,
        paddingHorizontal: 24,
        alignItems: 'center',
        justifyContent: 'center',
    },
    buttonText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#FFFFFF',
        letterSpacing: 0.5,
    },
    backButton: {
        alignSelf: 'center',
        paddingVertical: 4,
    },
    backText: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 14,
        fontWeight: '500',
    },
});
