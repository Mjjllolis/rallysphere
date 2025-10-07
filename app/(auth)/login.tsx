// app/(auth)/login.tsx - Modern Sign In Screen
import React, { useState, useRef, useEffect } from 'react';
import { 
    View, 
    StyleSheet, 
    Alert, 
    Animated, 
    Dimensions, 
    TouchableOpacity,
    StatusBar 
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
import { signIn } from '../../lib/firebase';
import { Video } from 'expo-av';

const { width, height } = Dimensions.get('window');

export default function LoginScreen() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
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

    const handleLogin = async () => {
        if (!email.trim() || !password.trim()) {
            Alert.alert('Error', 'Please fill in all fields');
            return;
        }

        setLoading(true);
        try {
            const result = await signIn(email.trim(), password);
            if (result.success) {
                router.replace('/(tabs)');
            } else {
                Alert.alert('Login Failed', result.error || 'Invalid email or password');
            }
        } catch (error) {
            console.error('Login error:', error);
            Alert.alert('Error', 'An unexpected error occurred');
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor="#2C5282" />
            
            {/* Gradient Background
            <LinearGradient
                colors={['#2C5282', '#2A4B7C', '#1A365D']}
                style={styles.background}
            >
                Decorative Elements
                <View style={styles.decorativeCircle1} />
                <View style={styles.decorativeCircle2} />
                <View style={styles.decorativeCircle3} />
            </LinearGradient> */}
            {/* Gradient Background */}
    <View style={styles.background}>

    {/* Base black background */}
    <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'black' }]} />
        <Video
                source={require('../../assets/BGSignIn.mp4')}
                style={[StyleSheet.absoluteFill, styles.video]}
                resizeMode="cover"
                shouldPlay
                isLooping
                isMuted
              />
    </View>


            <View style={styles.content}>
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
                        <Text style={styles.subtitle}>Sign In</Text>
                        <Text style={styles.description}>Welcome back! Please sign in to continue.</Text>
                    </View>

                    {/* Main Card */}
                    <Surface style={styles.card}>
                        <View style={styles.formContainer}>
                            <TextInput
                                label="Email Address"
                                value={email}
                                onChangeText={setEmail}
                                mode="outlined"
                                keyboardType="email-address"
                                autoCapitalize="none"
                                style={styles.input}
                                left={<TextInput.Icon icon="email" />}
                            />

                            <TextInput
                                label="Password"
                                value={password}
                                onChangeText={setPassword}
                                mode="outlined"
                                secureTextEntry
                                style={styles.input}
                                left={<TextInput.Icon icon="lock" />}
                            />

                            <Button
                                mode="contained"
                                onPress={handleLogin}
                                loading={loading}
                                disabled={loading}
                                style={styles.submitButton}
                                contentStyle={styles.submitButtonContent}
                                labelStyle={styles.submitButtonLabel}
                            >
                                Sign In
                            </Button>
                        </View>
                    </Surface>

                    {/* Footer Links */}
                    <View style={styles.footer}>
                        <View style={styles.footerRow}>
                            <Text style={styles.footerText}>Don't have an account? </Text>
                            <TouchableOpacity onPress={() => router.push('/(auth)/signup')}>
                                <Text style={styles.footerLink}>Sign Up</Text>
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
            </View>
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
    content: {
        flex: 1,
        padding: 24,
        justifyContent: 'center',
    },
    animatedContainer: {
        flex: 1,
        justifyContent: 'center',
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
    spot: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    opacity: 1,
    },

});
