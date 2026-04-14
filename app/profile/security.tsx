// app/profile/security.tsx
import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    StyleSheet,
    ScrollView,
    Alert,
    TouchableOpacity,
    TextInput as RNTextInput,
} from 'react-native';
import {
    Text,
    Button,
    TextInput,
    useTheme,
    Surface,
    IconButton,
    ActivityIndicator,
    Divider,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { FirebaseRecaptchaVerifierModal } from 'expo-firebase-recaptcha';
import { useAuth } from '../_layout';
import {
    app,
    startMFAEnrollment,
    confirmMFAEnrollment,
    getMFAFactors,
    unenrollMFA,
    sendVerificationEmail,
    reloadCurrentUser,
    isEmailVerified,
} from '../../lib/firebase';
import type { MultiFactorInfo } from 'firebase/auth';

type Stage = 'idle' | 'enterPhone' | 'enterCode';

export default function SecurityScreen() {
    const theme = useTheme();
    const { user } = useAuth();

    const [factors, setFactors] = useState<MultiFactorInfo[]>([]);
    const [emailVerified, setEmailVerified] = useState<boolean>(isEmailVerified());
    const [loading, setLoading] = useState(false);
    const [resending, setResending] = useState(false);

    const [stage, setStage] = useState<Stage>('idle');
    const [phone, setPhone] = useState('');
    const [code, setCode] = useState('');

    const recaptchaVerifier = useRef<any>(null);

    useEffect(() => {
        refresh();
    }, [user]);

    const refresh = async () => {
        await reloadCurrentUser();
        setEmailVerified(isEmailVerified());
        setFactors(getMFAFactors());
    };

    const formatPhoneNumber = (raw: string) => {
        const digits = raw.replace(/\D/g, '');
        if (digits.startsWith('1') && digits.length === 11) return `+${digits}`;
        if (digits.length === 10) return `+1${digits}`;
        if (raw.startsWith('+')) return raw.replace(/[^\d+]/g, '');
        return `+${digits}`;
    };

    const handleResendVerification = async () => {
        setResending(true);
        const result = await sendVerificationEmail();
        setResending(false);
        if (result.success) {
            Alert.alert('Sent', 'Verification email sent. Check your inbox, then come back and tap "I verified".');
        } else {
            Alert.alert('Error', result.error || 'Could not send verification email.');
        }
    };

    const handleStartEnrollment = () => {
        if (!emailVerified) {
            Alert.alert('Verify Email First', 'You need to verify your email before enabling two-factor auth.');
            return;
        }
        setPhone('');
        setCode('');
        setStage('enterPhone');
    };

    const handleSendCode = async () => {
        const formatted = formatPhoneNumber(phone);
        if (formatted.length < 12) {
            Alert.alert('Invalid Number', 'Please enter a valid US phone number.');
            return;
        }
        setLoading(true);
        const result = await startMFAEnrollment(formatted, recaptchaVerifier.current);
        setLoading(false);
        if (result.success) {
            setStage('enterCode');
        } else {
            Alert.alert('Error', result.error || 'Failed to send code.');
        }
    };

    const handleConfirm = async () => {
        if (code.length < 6) {
            Alert.alert('Incomplete Code', 'Enter the 6-digit code.');
            return;
        }
        setLoading(true);
        const result = await confirmMFAEnrollment(code, 'Personal phone');
        setLoading(false);
        if (result.success) {
            Alert.alert('Enabled', 'Two-factor auth is now active on your account.');
            setStage('idle');
            setCode('');
            setPhone('');
            await refresh();
        } else {
            Alert.alert('Error', result.error || 'Failed to verify code.');
        }
    };

    const handleDisable = (factor: MultiFactorInfo) => {
        Alert.alert(
            'Disable Two-Factor Auth',
            'Are you sure? This reduces your account security.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Disable',
                    style: 'destructive',
                    onPress: async () => {
                        setLoading(true);
                        const result = await unenrollMFA(factor.uid);
                        setLoading(false);
                        if (result.success) {
                            await refresh();
                        } else {
                            Alert.alert('Error', result.error || 'Failed to disable.');
                        }
                    },
                },
            ],
        );
    };

    const hasMFA = factors.length > 0;

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
            <FirebaseRecaptchaVerifierModal
                ref={recaptchaVerifier}
                firebaseConfig={app.options}
                attemptInvisibleVerification
            />

            <View style={[styles.header, { borderBottomColor: theme.colors.outline }]}>
                <IconButton icon="arrow-left" size={24} onPress={() => router.back()} iconColor={theme.colors.onBackground} />
                <Text style={[styles.headerTitle, { color: theme.colors.onBackground }]}>Security</Text>
                <View style={{ width: 48 }} />
            </View>

            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                {/* Email Verification */}
                <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={1}>
                    <View style={styles.rowBetween}>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.cardTitle, { color: theme.colors.onSurface }]}>Email Verified</Text>
                            <Text style={[styles.cardDescription, { color: theme.colors.onSurfaceVariant }]}>
                                {user?.email || '—'}
                            </Text>
                        </View>
                        <Text style={[styles.statusPill, emailVerified ? styles.statusOk : styles.statusWarn]}>
                            {emailVerified ? 'Verified' : 'Not verified'}
                        </Text>
                    </View>
                    {!emailVerified && (
                        <View style={styles.actionRow}>
                            <Button
                                mode="outlined"
                                onPress={handleResendVerification}
                                loading={resending}
                                disabled={resending}
                                style={styles.actionButton}
                            >
                                Resend email
                            </Button>
                            <Button
                                mode="contained"
                                onPress={refresh}
                                style={styles.actionButton}
                            >
                                I verified
                            </Button>
                        </View>
                    )}
                </Surface>

                {/* Two-factor auth */}
                <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={1}>
                    <View style={styles.rowBetween}>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.cardTitle, { color: theme.colors.onSurface }]}>Two-Factor Auth</Text>
                            <Text style={[styles.cardDescription, { color: theme.colors.onSurfaceVariant }]}>
                                Require an SMS code in addition to your password at sign-in.
                            </Text>
                        </View>
                        <Text style={[styles.statusPill, hasMFA ? styles.statusOk : styles.statusIdle]}>
                            {hasMFA ? 'On' : 'Off'}
                        </Text>
                    </View>

                    {hasMFA && (
                        <>
                            <Divider style={styles.divider} />
                            {factors.map((f) => (
                                <View key={f.uid} style={styles.factorRow}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.factorName, { color: theme.colors.onSurface }]}>
                                            {f.displayName || 'Phone'}
                                        </Text>
                                        <Text style={[styles.factorMeta, { color: theme.colors.onSurfaceVariant }]}>
                                            {(f as any).phoneNumber || 'SMS second factor'}
                                        </Text>
                                    </View>
                                    <TouchableOpacity onPress={() => handleDisable(f)} disabled={loading}>
                                        <Text style={styles.disableText}>Disable</Text>
                                    </TouchableOpacity>
                                </View>
                            ))}
                        </>
                    )}

                    {!hasMFA && stage === 'idle' && (
                        <Button
                            mode="contained"
                            onPress={handleStartEnrollment}
                            style={styles.enableButton}
                            disabled={!emailVerified}
                        >
                            Enable two-factor auth
                        </Button>
                    )}

                    {stage === 'enterPhone' && (
                        <View style={styles.enrollBlock}>
                            <TextInput
                                label="Phone Number"
                                value={phone}
                                onChangeText={setPhone}
                                mode="outlined"
                                keyboardType="phone-pad"
                                placeholder="+1 (555) 000-0000"
                                style={styles.input}
                                left={<TextInput.Icon icon="phone" />}
                            />
                            <View style={styles.actionRow}>
                                <Button mode="outlined" onPress={() => setStage('idle')} style={styles.actionButton}>
                                    Cancel
                                </Button>
                                <Button
                                    mode="contained"
                                    onPress={handleSendCode}
                                    loading={loading}
                                    disabled={loading || phone.length < 10}
                                    style={styles.actionButton}
                                >
                                    Send code
                                </Button>
                            </View>
                        </View>
                    )}

                    {stage === 'enterCode' && (
                        <View style={styles.enrollBlock}>
                            <TextInput
                                label="6-digit Code"
                                value={code}
                                onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
                                mode="outlined"
                                keyboardType="number-pad"
                                maxLength={6}
                                style={styles.input}
                            />
                            <View style={styles.actionRow}>
                                <Button mode="outlined" onPress={() => setStage('enterPhone')} style={styles.actionButton}>
                                    Back
                                </Button>
                                <Button
                                    mode="contained"
                                    onPress={handleConfirm}
                                    loading={loading}
                                    disabled={loading || code.length < 6}
                                    style={styles.actionButton}
                                >
                                    Verify
                                </Button>
                            </View>
                        </View>
                    )}
                </Surface>

                {loading && (
                    <View style={styles.loadingOverlay}>
                        <ActivityIndicator size="small" />
                    </View>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 8,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    headerTitle: { fontSize: 18, fontWeight: '700' },
    content: { padding: 16, gap: 16 },
    card: { borderRadius: 16, padding: 20, gap: 12 },
    rowBetween: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    cardTitle: { fontSize: 16, fontWeight: '700' },
    cardDescription: { fontSize: 13, marginTop: 4, lineHeight: 18 },
    statusPill: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
        fontSize: 12,
        fontWeight: '700',
        overflow: 'hidden',
    },
    statusOk: { backgroundColor: '#DEF7EC', color: '#046C4E' },
    statusWarn: { backgroundColor: '#FEF3C7', color: '#92400E' },
    statusIdle: { backgroundColor: 'rgba(0,0,0,0.08)', color: '#333' },
    divider: { marginVertical: 8 },
    factorRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        gap: 12,
    },
    factorName: { fontSize: 14, fontWeight: '600' },
    factorMeta: { fontSize: 12, marginTop: 2 },
    disableText: { color: '#B91C1C', fontSize: 14, fontWeight: '600' },
    enableButton: { marginTop: 8, borderRadius: 12 },
    enrollBlock: { gap: 12, marginTop: 4 },
    input: { backgroundColor: 'transparent' },
    actionRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
    actionButton: { flex: 1, borderRadius: 12 },
    loadingOverlay: { padding: 16, alignItems: 'center' },
});
