import React, { useState, useRef, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Alert,
    ScrollView,
    Animated,
    Dimensions,
    TouchableOpacity,
    StatusBar,
} from 'react-native';
import {
    TextInput,
    Button,
    Card,
    useTheme,
    Surface,
} from 'react-native-paper';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { signUpWithEmail, signInWithEmail } from '../../lib/firebase';

const { width, height } = Dimensions.get('window');

type Mode = 'signin' | 'signup';

export default function Welcome() {
    const [mode, setMode] = useState<Mode>('signin');
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    
    const theme = useTheme();
    const router = useRouter();
    
    // Animation values
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(50)).current;
    const scaleAnim = useRef(new Animated.Value(0.8)).current;
    const toggleSlideAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        // Entrance animations
        Animated.parallel([
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 1000,
                useNativeDriver: true,
            }),
            Animated.timing(slideAnim, {
                toValue: 0,
                duration: 800,
                useNativeDriver: true,
            }),
            Animated.timing(scaleAnim, {
                toValue: 1,
                duration: 600,
                useNativeDriver: true,
            }),
        ]).start();
    }, []);

    const animateToggle = (newMode: Mode) => {
        const toValue = newMode === 'signup' ? 1 : 0;
        
        Animated.spring(toggleSlideAnim, {
            toValue,
            useNativeDriver: false,
            tension: 100,
            friction: 8,
        }).start();
        
        setMode(newMode);
    };

    const onSubmit = async () => {
        if (!email.trim() || !password.trim()) {
            Alert.alert('Error', 'Please fill in all fields');
            return;
        }

        if (mode === 'signup' && !name.trim()) {
            Alert.alert('Error', 'Please enter your full name');
            return;
        }

        setLoading(true);
        try {
            if (mode === 'signin') {
                await signInWithEmail(email.trim(), password);
            } else {
                await signUpWithEmail(email.trim(), password);
            }
            router.replace('/(tabs)');
        } catch (error: any) {
            Alert.alert('Error', error.message || 'Authentication failed');
        } finally {
            setLoading(false);
        }
    };

    const toggleButtonTranslateX = toggleSlideAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, width * 0.4],
    });

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor="#2C5282" />
            
            {/* Gradient Background */}
            <LinearGradient
                colors={['#2C5282', '#2A4B7C', '#1A365D']}
                style={styles.background}
            >
                {/* Decorative Elements */}
                <View style={styles.decorativeCircle1} />
                <View style={styles.decorativeCircle2} />
                <View style={styles.decorativeCircle3} />
            </LinearGradient>

            <ScrollView 
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                <Animated.View 
                    style={[
                        styles.content,
                        {
                            opacity: fadeAnim,
                            transform: [
                                { translateY: slideAnim },
                                { scale: scaleAnim }
                            ]
                        }
                    ]}
                >
                    {/* Logo/Title Section */}
                    <View style={styles.logoSection}>
                        <Text style={styles.logoText}>RallySphere</Text>
                        <Text style={styles.tagline}>
                            {mode === 'signin' ? 'Welcome back!' : 'Join the community'}
                        </Text>
                    </View>

                    {/* Main Card */}
                    <Surface style={styles.card} elevation={8}>
                        {/* Custom Toggle */}
                        <View style={styles.toggleContainer}>
                            <View style={styles.toggleBackground}>
                                <Animated.View 
                                    style={[
                                        styles.toggleIndicator,
                                        {
                                            transform: [{ translateX: toggleButtonTranslateX }]
                                        }
                                    ]}
                                />
                                <TouchableOpacity
                                    style={styles.toggleOption}
                                    onPress={() => animateToggle('signin')}
                                    activeOpacity={0.7}
                                >
                                    <Text style={[
                                        styles.toggleText,
                                        mode === 'signin' && styles.toggleTextActive
                                    ]}>
                                        Sign In
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={styles.toggleOption}
                                    onPress={() => animateToggle('signup')}
                                    activeOpacity={0.7}
                                >
                                    <Text style={[
                                        styles.toggleText,
                                        mode === 'signup' && styles.toggleTextActive
                                    ]}>
                                        Sign Up
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* Form Fields */}
                        <View style={styles.formContainer}>
                            {mode === 'signup' && (
                                <Animated.View style={{ opacity: fadeAnim }}>
                                    <TextInput
                                        label="Full Name"
                                        value={name}
                                        onChangeText={setName}
                                        mode="outlined"
                                        style={styles.input}
                                        autoCapitalize="words"
                                        left={<TextInput.Icon icon="account" />}
                                    />
                                </Animated.View>
                            )}

                            <TextInput
                                label="Email Address"
                                value={email}
                                onChangeText={setEmail}
                                mode="outlined"
                                style={styles.input}
                                autoCapitalize="none"
                                keyboardType="email-address"
                                left={<TextInput.Icon icon="email" />}
                            />

                            <TextInput
                                label="Password"
                                value={password}
                                onChangeText={setPassword}
                                mode="outlined"
                                style={styles.input}
                                secureTextEntry
                                left={<TextInput.Icon icon="lock" />}
                            />

                            <Button
                                mode="contained"
                                onPress={onSubmit}
                                loading={loading}
                                disabled={loading}
                                style={styles.submitButton}
                                contentStyle={styles.submitButtonContent}
                                labelStyle={styles.submitButtonLabel}
                            >
                                {mode === 'signin' ? 'Sign In' : 'Create Account'}
                            </Button>

                            {/* Legal Links */}
                            <View style={styles.legalContainer}>
                                <Text style={styles.legalText}>
                                    By continuing, you agree to our
                                </Text>
                                <View style={styles.legalLinks}>
                                    <TouchableOpacity onPress={() => router.push('/legal/terms')}>
                                        <Text style={styles.legalLink}>Terms of Use</Text>
                                    </TouchableOpacity>
                                    <Text style={styles.legalSeparator}> • </Text>
                                    <TouchableOpacity onPress={() => router.push('/legal/privacy')}>
                                        <Text style={styles.legalLink}>Privacy Policy</Text>
                                    </TouchableOpacity>
                                    <Text style={styles.legalSeparator}> • </Text>
                                    <TouchableOpacity onPress={() => router.push('/legal/cookies')}>
                                        <Text style={styles.legalLink}>Cookie Policy</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </View>
                    </Surface>

                    {/* Footer */}
                    <View style={styles.footer}>
                        <Text style={styles.footerText}>
                            {mode === 'signin' 
                                ? "Don't have an account? " 
                                : "Already have an account? "
                            }
                        </Text>
                        <TouchableOpacity 
                            onPress={() => animateToggle(mode === 'signin' ? 'signup' : 'signin')}
                        >
                            <Text style={styles.footerLink}>
                                {mode === 'signin' ? 'Sign Up' : 'Sign In'}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </Animated.View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    background: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
    },
    decorativeCircle1: {
        position: 'absolute',
        width: 200,
        height: 200,
        borderRadius: 100,
        backgroundColor: 'rgba(255,255,255,0.05)',
        top: -50,
        right: -50,
    },
    decorativeCircle2: {
        position: 'absolute',
        width: 150,
        height: 150,
        borderRadius: 75,
        backgroundColor: 'rgba(255,255,255,0.03)',
        bottom: -30,
        left: -30,
    },
    decorativeCircle3: {
        position: 'absolute',
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: 'rgba(255,255,255,0.08)',
        top: height * 0.3,
        left: -20,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
        justifyContent: 'center',
        paddingVertical: 40,
    },
    content: {
        padding: 24,
        justifyContent: 'center',
        minHeight: height * 0.8,
    },
    logoSection: {
        alignItems: 'center',
        marginBottom: 48,
    },
    logoText: {
        fontSize: 36,
        fontWeight: 'bold',
        color: 'white',
        marginBottom: 8,
        textAlign: 'center',
    },
    tagline: {
        fontSize: 18,
        color: 'rgba(255,255,255,0.8)',
        textAlign: 'center',
    },
    card: {
        borderRadius: 24,
        padding: 32,
        marginBottom: 24,
        backgroundColor: 'white',
    },
    toggleContainer: {
        marginBottom: 32,
    },
    toggleBackground: {
        backgroundColor: '#F1F5F9',
        borderRadius: 12,
        padding: 4,
        flexDirection: 'row',
        position: 'relative',
    },
    toggleIndicator: {
        position: 'absolute',
        top: 4,
        left: 4,
        width: width * 0.4 - 20,
        height: 44,
        backgroundColor: '#2C5282',
        borderRadius: 8,
        zIndex: 1,
    },
    toggleOption: {
        flex: 1,
        paddingVertical: 12,
        alignItems: 'center',
        zIndex: 2,
    },
    toggleText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#64748B',
    },
    toggleTextActive: {
        color: 'white',
    },
    formContainer: {
        gap: 20,
    },
    input: {
        backgroundColor: 'transparent',
    },
    submitButton: {
        marginTop: 8,
        borderRadius: 12,
        backgroundColor: '#2C5282',
    },
    submitButtonContent: {
        paddingVertical: 12,
    },
    submitButtonLabel: {
        fontSize: 16,
        fontWeight: '600',
    },
    legalContainer: {
        marginTop: 16,
        alignItems: 'center',
    },
    legalText: {
        fontSize: 12,
        color: '#64748B',
        marginBottom: 6,
        textAlign: 'center',
    },
    legalLinks: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        justifyContent: 'center',
    },
    legalLink: {
        fontSize: 12,
        color: '#2C5282',
        fontWeight: '600',
        textDecorationLine: 'underline',
    },
    legalSeparator: {
        fontSize: 12,
        color: '#64748B',
    },
    footer: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
    },
    footerText: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 16,
    },
    footerLink: {
        color: 'white',
        fontSize: 16,
        fontWeight: '600',
    },
});
