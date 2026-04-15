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
    TextInput,
    ActivityIndicator,
    Text,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useVideoPlayer, VideoView } from 'expo-video';
import { FirebaseRecaptchaVerifierModal } from 'expo-firebase-recaptcha';
import { sendPhoneVerification, app } from '../../lib/firebase';

export default function PhoneAuthScreen() {
    const { mode } = useLocalSearchParams<{ mode?: string }>();
    const isSignUp = mode !== 'signin';

    const [phone, setPhone] = useState('');
    const [loading, setLoading] = useState(false);
    const [isFocused, setIsFocused] = useState(false);

    const recaptchaVerifier = useRef<any>(null);

    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(40)).current;

    const player = useVideoPlayer(require('../../assets/RSGrad30fps.mp4'), (player) => {
        player.loop = true;
        player.muted = true;
        player.play();
    });

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
            Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
        ]).start();
    }, []);

    const formatPhoneNumber = (raw: string) => {
        // Remove everything except numbers
        const digits = raw.replace(/\D/g, '');
        // Add +1 to make it a US phone number
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

    const handleDevBypass = () => {
        // For testing: skip phone verification step
        const testPhone = '+10000000000';
        router.push({ pathname: '/(auth)/verify-otp', params: { phone: testPhone } });
    };

    // Sign-in screen uses video background, sign-up uses simple gradient
    if (!isSignUp) {
        return (
            <View style={styles.container}>
                <StatusBar barStyle="light-content" />

                {/* Video covers the bottom part of the screen */}
                <View style={styles.videoContainer}>
                    <VideoView
                        player={player}
                        style={styles.video}
                        contentFit="cover"
                        nativeControls={false}
                    />
                </View>

                {/* Dark overlay to make text easier to read */}
                <LinearGradient
                    colors={['rgba(0,0,0,0.7)', 'rgba(0,0,0,0.4)', 'transparent']}
                    locations={[0, 0.5, 1]}
                    style={StyleSheet.absoluteFill}
                    pointerEvents="none"
                />

                <SafeAreaView style={styles.safeArea}>
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
                            {/* App name and welcome message */}
                            <View style={styles.header}>
                                <Text style={styles.title}>RallySphere</Text>
                                <Text style={styles.subtitle}>Welcome Back</Text>
                                <Text style={styles.description}>Enter your phone number to continue.</Text>
                            </View>

                            {/* Card with blurred glass effect */}
                            <BlurView intensity={60} tint="dark" style={styles.glassCard}>
                                <LinearGradient
                                    colors={['rgba(255,255,255,0.18)', 'rgba(255,255,255,0.08)']}
                                    style={styles.glassGradient}
                                >
                                    <Text style={styles.label}>Phone Number</Text>

                                    {/* Phone number input with icon */}
                                    <View style={[
                                        styles.inputContainer,
                                        isFocused && styles.inputContainerFocused
                                    ]}>
                                        <Text style={styles.phoneIcon}>📱</Text>
                                        <TextInput
                                            value={phone}
                                            onChangeText={setPhone}
                                            onFocus={() => setIsFocused(true)}
                                            onBlur={() => setIsFocused(false)}
                                            keyboardType="phone-pad"
                                            placeholder="+1 (555) 000-0000"
                                            placeholderTextColor="rgba(255,255,255,0.4)"
                                            style={styles.input}
                                        />
                                    </View>

                                    <Text style={styles.hint}>We'll send you a verification code via SMS.</Text>

                                    {/* Button to send verification code */}
                                    <TouchableOpacity
                                        onPress={handleSendCode}
                                        disabled={loading || phone.length < 10}
                                        style={[
                                            styles.button,
                                            (loading || phone.length < 10) && styles.buttonDisabled
                                        ]}
                                        activeOpacity={0.8}
                                    >
                                        <LinearGradient
                                            colors={
                                                loading || phone.length < 10
                                                    ? ['rgba(79,140,201,0.5)', 'rgba(59,100,161,0.5)']
                                                    : ['#4F8CC9', '#3B64A1']
                                            }
                                            start={{ x: 0, y: 0 }}
                                            end={{ x: 1, y: 1 }}
                                            style={styles.buttonGradient}
                                        >
                                            {loading ? (
                                                <ActivityIndicator color="#FFFFFF" />
                                            ) : (
                                                <Text style={styles.buttonText}>Send Code</Text>
                                            )}
                                        </LinearGradient>
                                    </TouchableOpacity>
                                </LinearGradient>
                            </BlurView>

                            {/* Back button */}
                            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                                <Text style={styles.backText}>← Back to Welcome</Text>
                            </TouchableOpacity>
                        </Animated.View>
                    </KeyboardAvoidingView>
                </SafeAreaView>
            </View>
        );
    }

    // Sign-up screen with simple gradient background
    return (
        <SafeAreaView style={styles.containerOriginal}>
            <StatusBar barStyle="light-content" />
            <LinearGradient colors={['#6366f1', '#8b5cf6', '#1a1a2e']} style={StyleSheet.absoluteFill} />

            {/* Button for testing (skips verification) */}
            <TouchableOpacity onPress={handleDevBypass} style={styles.devBypassButton}>
                <Text style={styles.devBypassText}>Skip (dev)</Text>
            </TouchableOpacity>

            <FirebaseRecaptchaVerifierModal
                ref={recaptchaVerifier}
                firebaseConfig={app.options}
                attemptInvisibleVerification
            />

            <KeyboardAvoidingView
                style={styles.contentOriginal}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
                    <View style={styles.headerOriginal}>
                        <Text style={styles.titleOriginal}>RallySphere</Text>
                        <Text style={styles.subtitleOriginal}>Create Account</Text>
                        <Text style={styles.descriptionOriginal}>Enter your phone number to continue.</Text>
                    </View>

                    <View style={styles.cardOriginal}>
                        <Text style={styles.labelOriginal}>Phone Number</Text>
                        <View style={[
                            styles.inputContainer,
                            isFocused && styles.inputContainerFocused
                        ]}>
                            <Text style={styles.phoneIcon}>📱</Text>
                            <TextInput
                                value={phone}
                                onChangeText={setPhone}
                                onFocus={() => setIsFocused(true)}
                                onBlur={() => setIsFocused(false)}
                                keyboardType="phone-pad"
                                placeholder="+1 (555) 000-0000"
                                placeholderTextColor="rgba(255,255,255,0.4)"
                                style={styles.input}
                            />
                        </View>
                        <Text style={styles.hintOriginal}>We'll send you a verification code via SMS.</Text>

                        <TouchableOpacity
                            onPress={handleSendCode}
                            disabled={loading || phone.length < 10}
                            style={[
                                styles.button,
                                (loading || phone.length < 10) && styles.buttonDisabled
                            ]}
                            activeOpacity={0.8}
                        >
                            <LinearGradient
                                colors={
                                    loading || phone.length < 10
                                        ? ['rgba(79,140,201,0.5)', 'rgba(59,100,161,0.5)']
                                        : ['#4F8CC9', '#3B64A1']
                                }
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={styles.buttonGradient}
                            >
                                {loading ? (
                                    <ActivityIndicator color="#FFFFFF" />
                                ) : (
                                    <Text style={styles.buttonText}>Send Code</Text>
                                )}
                            </LinearGradient>
                        </TouchableOpacity>
                    </View>

                    <View style={styles.footerOriginal}>
                        <TouchableOpacity onPress={() => router.back()} style={styles.backButtonOriginal}>
                            <Text style={styles.backTextOriginal}>Back to Welcome</Text>
                        </TouchableOpacity>
                    </View>
                </Animated.View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    // Sign-in screen styles
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    videoContainer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: '70%',
    },
    video: {
        width: '100%',
        height: '100%',
    },
    safeArea: {
        flex: 1,
    },
    content: {
        flex: 1,
        paddingHorizontal: 24,
        justifyContent: 'center',
    },
    backButton: {
        alignSelf: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
        marginTop: 8,
    },
    backText: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 14,
        fontWeight: '500',
        textAlign: 'center',
    },
    header: {
        alignItems: 'center',
        marginBottom: 32,
    },
    title: {
        fontSize: 32,
        fontWeight: 'bold',
        color: 'white',
        marginBottom: 6,
        textShadowColor: 'rgba(0,0,0,0.3)',
        textShadowOffset: { width: 0, height: 2 },
        textShadowRadius: 4,
    },
    subtitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: 'white',
        marginBottom: 6,
        textShadowColor: 'rgba(0,0,0,0.3)',
        textShadowOffset: { width: 0, height: 2 },
        textShadowRadius: 4,
    },
    description: {
        fontSize: 15,
        color: 'rgba(255,255,255,0.85)',
        textAlign: 'center',
        lineHeight: 20,
    },
    glassCard: {
        borderRadius: 28,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
    },
    glassGradient: {
        padding: 28,
        gap: 14,
    },
    label: {
        fontSize: 14,
        fontWeight: '700',
        color: 'rgba(255,255,255,0.9)',
        letterSpacing: 0.5,
        textTransform: 'uppercase',
        marginBottom: 8,
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 16,
        borderWidth: 1.5,
        borderColor: 'rgba(255,255,255,0.2)',
        paddingHorizontal: 16,
        paddingVertical: 4,
    },
    inputContainerFocused: {
        borderColor: 'rgba(79,140,201,0.8)',
        backgroundColor: 'rgba(255,255,255,0.15)',
    },
    phoneIcon: {
        fontSize: 20,
        marginRight: 12,
    },
    input: {
        flex: 1,
        fontSize: 17,
        fontWeight: '500',
        color: 'white',
        paddingVertical: 14,
    },
    hint: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.6)',
        marginTop: -4,
        lineHeight: 18,
    },
    button: {
        marginTop: 12,
        borderRadius: 16,
        overflow: 'hidden',
    },
    buttonDisabled: {
        opacity: 0.5,
    },
    buttonGradient: {
        paddingVertical: 16,
        paddingHorizontal: 24,
        alignItems: 'center',
        justifyContent: 'center',
    },
    buttonText: {
        fontSize: 17,
        fontWeight: '700',
        color: 'white',
        letterSpacing: 0.5,
    },

    // Sign-up screen styles
    containerOriginal: {
        flex: 1,
    },
    contentOriginal: {
        flex: 1,
        padding: 24,
        justifyContent: 'center',
    },
    headerOriginal: {
        alignItems: 'center',
        marginBottom: 40,
    },
    titleOriginal: {
        fontSize: 36,
        fontWeight: 'bold',
        color: 'white',
        marginBottom: 8,
    },
    subtitleOriginal: {
        fontSize: 26,
        fontWeight: 'bold',
        color: 'white',
        marginBottom: 8,
    },
    descriptionOriginal: {
        fontSize: 16,
        color: 'rgba(255,255,255,0.8)',
        textAlign: 'center',
    },
    cardOriginal: {
        borderRadius: 24,
        padding: 28,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
        gap: 12,
    },
    labelOriginal: {
        fontSize: 14,
        fontWeight: '700',
        color: 'rgba(255,255,255,0.9)',
        letterSpacing: 0.5,
        textTransform: 'uppercase',
        marginBottom: 4,
    },
    hintOriginal: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.6)',
        marginTop: -4,
    },
    footerOriginal: {
        alignItems: 'center',
        marginTop: 24,
    },
    backButtonOriginal: {
        paddingVertical: 8,
    },
    backTextOriginal: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 14,
    },
    devBypassButton: {
        position: 'absolute',
        top: 60,
        right: 20,
        zIndex: 10,
    },
    devBypassText: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 12,
        textDecorationLine: 'underline',
    },
});
