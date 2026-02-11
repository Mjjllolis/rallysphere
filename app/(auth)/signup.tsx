// app/(auth)/signup.tsx - Modern Create Account Screen
import React, { useState, useRef, useEffect } from 'react';
import { 
    View, 
    StyleSheet, 
    Alert, 
    Animated, 
    Dimensions, 
    TouchableOpacity,
    StatusBar,
    ScrollView 
} from 'react-native';
import {
    Text,
    TextInput,
    Button,
    Surface,
    useTheme
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { signUp, UserProfile } from '../../lib/firebase';

const { width, height } = Dimensions.get('window');

export default function SignupScreen() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [loading, setLoading] = useState(false);
    
    const theme = useTheme();
    
    // Animation values
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(50)).current;
    const scaleAnim = useRef(new Animated.Value(0.8)).current;

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

    const handleSignup = async () => {
        if (!email.trim() || !password.trim() || !firstName.trim() || !lastName.trim()) {
            Alert.alert('Error', 'Please fill in all fields');
            return;
        }

        if (password.length < 6) {
            Alert.alert('Error', 'Password must be at least 6 characters long');
            return;
        }

        setLoading(true);
        try {
            const profile: UserProfile = {
                firstName: firstName.trim(),
                lastName: lastName.trim()
            };

            const result = await signUp(email.trim(), password, profile);
            if (result.success) {
                Alert.alert('Success', 'Account created successfully!', [
                    { text: 'OK', onPress: () => router.replace('/(tabs)/home') }
                ]);
            } else {
                Alert.alert('Error', result.error || 'Signup failed');
            }
        } catch (error) {
            console.error('Signup error:', error);
            Alert.alert('Error', 'An unexpected error occurred');
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
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
                        styles.animatedContainer,
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
                        <Text style={styles.subtitle}>Create Account</Text>
                        <Text style={styles.description}>Join the community and start your journey!</Text>
                    </View>

                    {/* Main Card */}
                    <Surface style={styles.card} elevation={8}>
                        <View style={styles.formContainer}>
                            <View style={styles.nameRow}>
                                <TextInput
                                    label="First Name"
                                    value={firstName}
                                    onChangeText={setFirstName}
                                    mode="outlined"
                                    style={[styles.input, styles.halfInput]}
                                    left={<TextInput.Icon icon="account" />}
                                    textColor="#1a1a1a"
                                    outlineColor="rgba(0,0,0,0.3)"
                                    activeOutlineColor="#2C5282"
                                    theme={{ colors: { onSurfaceVariant: 'rgba(0,0,0,0.6)' } }}
                                />
                                <TextInput
                                    label="Last Name"
                                    value={lastName}
                                    onChangeText={setLastName}
                                    mode="outlined"
                                    style={[styles.input, styles.halfInput]}
                                    textColor="#1a1a1a"
                                    outlineColor="rgba(0,0,0,0.3)"
                                    activeOutlineColor="#2C5282"
                                    theme={{ colors: { onSurfaceVariant: 'rgba(0,0,0,0.6)' } }}
                                />
                            </View>

                            <TextInput
                                label="Email Address"
                                value={email}
                                onChangeText={setEmail}
                                mode="outlined"
                                keyboardType="email-address"
                                autoCapitalize="none"
                                style={styles.input}
                                left={<TextInput.Icon icon="email" />}
                                textColor="#1a1a1a"
                                outlineColor="rgba(0,0,0,0.3)"
                                activeOutlineColor="#2C5282"
                                theme={{ colors: { onSurfaceVariant: 'rgba(0,0,0,0.6)' } }}
                            />

                            <TextInput
                                label="Password"
                                value={password}
                                onChangeText={setPassword}
                                mode="outlined"
                                secureTextEntry
                                style={styles.input}
                                left={<TextInput.Icon icon="lock" />}
                                right={<TextInput.Affix text="6+ chars" />}
                                textColor="#1a1a1a"
                                outlineColor="rgba(0,0,0,0.3)"
                                activeOutlineColor="#2C5282"
                                theme={{ colors: { onSurfaceVariant: 'rgba(0,0,0,0.6)' } }}
                            />

                            <Button
                                mode="contained"
                                onPress={handleSignup}
                                loading={loading}
                                disabled={loading}
                                style={styles.submitButton}
                                contentStyle={styles.submitButtonContent}
                                labelStyle={styles.submitButtonLabel}
                            >
                                Create Account
                            </Button>
                        </View>
                    </Surface>

                    {/* Footer Links */}
                    <View style={styles.footer}>
                        <View style={styles.footerRow}>
                            <Text style={styles.footerText}>Already have an account? </Text>
                            <TouchableOpacity onPress={() => router.push('/(auth)/login')}>
                                <Text style={styles.footerLink}>Sign In</Text>
                            </TouchableOpacity>
                        </View>
                        
                        <TouchableOpacity 
                            onPress={() => router.back()}
                            style={styles.backButton}
                        >
                            <Text style={styles.backButtonText}>Back to Welcome</Text>
                        </TouchableOpacity>
                    </View>
                </Animated.View>
            </ScrollView>
        </SafeAreaView>
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
    animatedContainer: {
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
    subtitle: {
        fontSize: 28,
        fontWeight: 'bold',
        color: 'white',
        marginBottom: 8,
        textAlign: 'center',
    },
    description: {
        fontSize: 16,
        color: 'rgba(255,255,255,0.8)',
        textAlign: 'center',
    },
    card: {
        borderRadius: 24,
        padding: 32,
        marginBottom: 24,
        backgroundColor: 'white',
    },
    formContainer: {
        gap: 20,
    },
    nameRow: {
        flexDirection: 'row',
        gap: 12,
    },
    input: {
        backgroundColor: 'transparent',
    },
    halfInput: {
        flex: 1,
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
    footer: {
        alignItems: 'center',
        gap: 16,
    },
    footerRow: {
        flexDirection: 'row',
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
    backButton: {
        paddingVertical: 8,
    },
    backButtonText: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 14,
        textAlign: 'center',
    },
});
