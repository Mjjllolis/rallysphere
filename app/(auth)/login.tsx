// app/(auth)/login.tsx
import React, { useState } from 'react';
import { View, StyleSheet, Alert, ScrollView } from 'react-native';
import {
    TextInput,
    Button,
    Text,
    useTheme,
    Card,
    Title,
    HelperText
} from 'react-native-paper';
import { useLocalSearchParams, useRouter, Link } from 'expo-router';
import { emailSignIn } from '../../lib/firebase/auth';
import { getUserProfile, createUserProfile } from '../../lib/firebase/firestore-functions';
import { auth } from '../../lib/firebase/config';

type Role = 'player' | 'club';
type Params = { r?: Role };

export default function Login() {
    const { colors } = useTheme();
    const { r } = useLocalSearchParams<Params>();
    const role: Role = r === 'club' ? 'club' : 'player';

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState({
        email: '',
        password: ''
    });

    const router = useRouter();

    // Validation functions
    const validateEmail = (email: string) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!email.trim()) return 'Email is required';
        if (!emailRegex.test(email.trim())) return 'Please enter a valid email';
        return '';
    };

    const validatePassword = (password: string) => {
        if (!password) return 'Password is required';
        return '';
    };

    const validateForm = () => {
        const newErrors = {
            email: validateEmail(email),
            password: validatePassword(password)
        };

        setErrors(newErrors);
        return !Object.values(newErrors).some(error => error !== '');
    };

    const onLogin = async () => {
        if (!validateForm()) return;

        setLoading(true);
        try {
            // 1) Sign in user
            const userCredential = await emailSignIn(email.trim(), password);
            const user = userCredential.user;

            // 2) Check if user profile exists, create if not (for existing users)
            const userProfile = await getUserProfile(user.uid);
            if (!userProfile) {
                // Create basic profile for existing users
                await createUserProfile({
                    id: user.uid,
                    email: user.email!,
                    displayName: user.displayName || '',
                    joinedClubs: [],
                    eventsAttended: []
                });
            }

            // 3) Navigate to main app
            router.replace('/(tabs)');
        } catch (error: any) {
            console.error('Login error:', error);

            let errorMessage = 'Login failed. Please try again.';
            if (error.code === 'auth/user-not-found') {
                errorMessage = 'No account found with this email address.';
            } else if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
                errorMessage = 'Incorrect password.';
            } else if (error.code === 'auth/invalid-email') {
                errorMessage = 'Invalid email address.';
            } else if (error.code === 'auth/user-disabled') {
                errorMessage = 'This account has been disabled.';
            } else if (error.code === 'auth/too-many-requests') {
                errorMessage = 'Too many failed attempts. Please try again later.';
            } else if (error.code === 'auth/network-request-failed') {
                errorMessage = 'Network error. Please check your connection.';
            }

            Alert.alert('Login Failed', errorMessage, [{ text: 'OK' }]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <ScrollView
            style={[styles.container, { backgroundColor: colors.background }]}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
        >
            <Card style={[styles.card, { backgroundColor: colors.surface }]} mode="outlined">
                <Card.Content style={styles.cardContent}>
                    <Title style={[styles.title, { color: colors.onSurface }]}>
                        Welcome Back
                    </Title>
                    <Text style={[styles.subtitle, { color: colors.onSurfaceVariant }]}>
                        Sign in to your RallySphere account
                    </Text>

                    {/* Email Input */}
                    <View style={styles.inputContainer}>
                        <TextInput
                            label="Email Address"
                            value={email}
                            onChangeText={(text) => {
                                setEmail(text);
                                setErrors(prev => ({ ...prev, email: validateEmail(text) }));
                            }}
                            mode="outlined"
                            autoCapitalize="none"
                            keyboardType="email-address"
                            autoComplete="email"
                            error={!!errors.email}
                            style={styles.input}
                        />
                        {errors.email ? (
                            <HelperText type="error" visible={!!errors.email}>
                                {errors.email}
                            </HelperText>
                        ) : null}
                    </View>

                    {/* Password Input */}
                    <View style={styles.inputContainer}>
                        <TextInput
                            label="Password"
                            value={password}
                            onChangeText={(text) => {
                                setPassword(text);
                                setErrors(prev => ({ ...prev, password: validatePassword(text) }));
                            }}
                            mode="outlined"
                            secureTextEntry
                            autoComplete="password"
                            error={!!errors.password}
                            style={styles.input}
                        />
                        {errors.password ? (
                            <HelperText type="error" visible={!!errors.password}>
                                {errors.password}
                            </HelperText>
                        ) : null}
                    </View>

                    {/* Login Button */}
                    <Button
                        mode="contained"
                        onPress={onLogin}
                        loading={loading}
                        disabled={loading}
                        style={styles.button}
                        contentStyle={styles.buttonContent}
                    >
                        {loading ? 'Signing In...' : 'Sign In'}
                    </Button>

                    {/* Forgot Password Link */}
                    <View style={styles.forgotContainer}>
                        <Text style={[styles.forgotText, { color: colors.primary }]}>
                            Forgot Password?
                        </Text>
                    </View>

                    {/* Sign Up Link */}
                    <View style={styles.signUpContainer}>
                        <Text style={[styles.signUpText, { color: colors.onSurfaceVariant }]}>
                            Don't have an account?{' '}
                        </Text>
                        <Link
                            href={{ pathname: '/(auth)/signup', params: { r: role } }}
                            style={[styles.signUpLink, { color: colors.primary }]}
                        >
                            Create Account
                        </Link>
                    </View>
                </Card.Content>
            </Card>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    content: {
        flexGrow: 1,
        justifyContent: 'center',
        padding: 20,
    },
    card: {
        elevation: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
    },
    cardContent: {
        gap: 16,
        paddingVertical: 24,
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        textAlign: 'center',
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 16,
        textAlign: 'center',
        marginBottom: 24,
        lineHeight: 22,
    },
    inputContainer: {
        marginBottom: 8,
    },
    input: {
        backgroundColor: 'transparent',
    },
    button: {
        marginTop: 16,
        marginBottom: 8,
    },
    buttonContent: {
        paddingVertical: 8,
    },
    forgotContainer: {
        alignItems: 'center',
        marginTop: 8,
        marginBottom: 16,
    },
    forgotText: {
        fontSize: 16,
        fontWeight: '500',
    },
    signUpContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 16,
    },
    signUpText: {
        fontSize: 16,
    },
    signUpLink: {
        fontSize: 16,
        fontWeight: 'bold',
    },
});
