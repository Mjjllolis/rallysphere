import React, { useRef, useState } from 'react';
import {
    View,
    StyleSheet,
    Alert,
    TouchableOpacity,
    TextInput,
    ActivityIndicator,
    Text,
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { FirebaseRecaptchaVerifierModal } from 'expo-firebase-recaptcha';
import GlassCard from './GlassCard';
import { sendPhoneVerification, app } from '../../lib/firebase';

type Props = {
    mode: 'signup' | 'signin';
    redirectEventId?: string;
    /** Label + handler for the dismiss affordance under the button. */
    onCancel: () => void;
    cancelLabel?: string;
};

const formatPhoneNumber = (raw: string) => {
    const digits = raw.replace(/\D/g, '');
    if (digits.startsWith('1') && digits.length === 11) return `+${digits}`;
    if (digits.length === 10) return `+1${digits}`;
    if (raw.startsWith('+')) return raw.replace(/[^\d+]/g, '');
    return `+${digits}`;
};

/** Formats digits as the user types: (555) 000-0000 */
const displayPhone = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 10);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
};

/**
 * The glass phone-entry card shared by the welcome-screen modal and the
 * standalone /(auth)/phone-auth route, so both entry points look identical.
 */
export default function PhoneAuthCard({ mode, redirectEventId, onCancel, cancelLabel = 'Cancel' }: Props) {
    const isSignUp = mode === 'signup';

    const [phone, setPhone] = useState('');
    const [loading, setLoading] = useState(false);
    const [isFocused, setIsFocused] = useState(false);

    const recaptchaVerifier = useRef<any>(null);

    const digits = phone.replace(/\D/g, '').length;
    const disabled = loading || digits < 10;

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
                router.push({ pathname: '/(auth)/verify-otp', params: { phone: formatted, redirectEventId } });
            } else {
                Alert.alert('Error', result.error || 'Failed to send code. Try again.');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <FirebaseRecaptchaVerifierModal
                ref={recaptchaVerifier}
                firebaseConfig={app.options}
                attemptInvisibleVerification
            />

            <GlassCard>
                    <View style={styles.header}>
                        <Text style={styles.title}>{isSignUp ? 'Create Account' : 'Welcome Back'}</Text>
                        <Text style={styles.description}>
                            {isSignUp
                                ? 'Enter your phone number to get started.'
                                : 'Enter your phone number to continue.'}
                        </Text>
                    </View>

                    <Text style={styles.label}>Phone Number</Text>

                    <View style={[styles.inputContainer, isFocused && styles.inputContainerFocused]}>
                        <Text style={styles.countryCode}>+1</Text>
                        <View style={styles.divider} />
                        <TextInput
                            value={displayPhone(phone)}
                            onChangeText={setPhone}
                            onFocus={() => setIsFocused(true)}
                            onBlur={() => setIsFocused(false)}
                            keyboardType="phone-pad"
                            textContentType="telephoneNumber"
                            autoComplete="tel"
                            placeholder="(555) 000-0000"
                            placeholderTextColor="rgba(255,255,255,0.4)"
                            style={styles.input}
                            maxLength={14}
                        />
                    </View>

                    <Text style={styles.hint}>We'll text you a 6-digit verification code.</Text>

                    <TouchableOpacity
                        onPress={handleSendCode}
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
                                <Text style={styles.buttonText}>Send Code</Text>
                            )}
                        </LinearGradient>
                    </TouchableOpacity>

                    <TouchableOpacity onPress={onCancel} style={styles.cancelButton} disabled={loading}>
                        <Text style={styles.cancelText}>{cancelLabel}</Text>
                    </TouchableOpacity>
            </GlassCard>
        </>
    );
}

const styles = StyleSheet.create({
    header: {
        alignItems: 'center',
        marginBottom: 4,
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
        lineHeight: 20,
    },
    label: {
        fontSize: 12,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.9)',
        letterSpacing: 0.5,
        textTransform: 'uppercase',
        marginBottom: 4,
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
    countryCode: {
        fontSize: 17,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.9)',
    },
    divider: {
        width: 1,
        height: 22,
        backgroundColor: 'rgba(255,255,255,0.25)',
        marginHorizontal: 12,
    },
    input: {
        flex: 1,
        fontSize: 17,
        fontWeight: '500',
        color: '#FFFFFF',
        paddingVertical: 14,
    },
    hint: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.6)',
        marginTop: -4,
        lineHeight: 18,
    },
    button: {
        marginTop: 4,
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
    cancelButton: {
        alignSelf: 'center',
        paddingVertical: 6,
    },
    cancelText: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 14,
        fontWeight: '500',
    },
});
