// app/(auth)/signup.tsx
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
import { signUpWithEmail } from '../../lib/firebase';

type Role = 'player' | 'club';
type Params = { r?: Role };

export default function SignUp() {
    const { colors } = useTheme();
    const { r } = useLocalSearchParams<Params>();
    const role: Role = r === 'club' ? 'club' : 'player';

    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState({
        name: '',
        email: '',
        password: ''
    });

    const router = useRouter();

    // Validation functions
    const validateName = (name: string) => {
        if (!name.trim()) return 'Name is required';
        if (name.trim().length < 2) return 'Name must be at least 2 characters';
        return '';
    };

    const validateEmail = (email: string) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!email.trim()) return 'Email is required';
        if (!emailRegex.test(email.trim())) return 'Please enter a valid email';
        return '';
    };

    const validatePassword = (password: string) => {
        if (!password) return 'Password is required';
        if (password.length < 6) return 'Password must be at least 6 characters';
        return '';
    };

    const validateForm = () => {
        const newErrors = {
            name: validateName(name),
            email: validateEmail(email),
            password: validatePassword(password)
        };

        setErrors(newErrors);
        return !Object.values(newErrors).some(error => error !== '');
    };

    const onSignUp = async () => {
        if (!validateForm()) return;

        setLoading(true);
        try {
            // Create auth user
            await signUpWithEmail(email.trim(), password);
            
            // Navigate to main app
            router.replace('/(tabs)');
        } catch (error: any) {
            console.error('Sign up error:', error);
            
            let errorMessage = 'Failed to create account. Please try again.';
            if (error.code === 'auth/email-already-in-use') {
                errorMessage = 'An account with this email already exists. Please sign in instead.';
            } else if (error.code === 'auth/invalid-email') {
                errorMessage = 'Invalid email address.';
            } else if (error.code === 'auth/operation-not-allowed') {
                errorMessage = 'Email/password accounts are not enabled.';
            } else if (error.code === 'auth/weak-password') {
                errorMessage = 'Password is too weak. Please choose a stronger password.';
            } else if (error.code === 'auth/network-request-failed') {
                errorMessage = 'Network error. Please check your connection.';
            }

            Alert.alert('Sign Up Failed', errorMessage, [{ text: 'OK' }]);
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
                        Create Account
                    </Title>
                    <Text style={[styles.subtitle, { color: colors.onSurfaceVariant }]}>
                        Join RallySphere and start connecting with sports clubs
                    </Text>

                    {/* Name Input */}
                    <View style={styles.inputContainer}>
                        <TextInput
                            label="Full Name *"
                            value={name}
                            onChangeText={(text) => {
                                setName(text);
                                setErrors(prev => ({ ...prev, name: validateName(text) }));
                            }}
                            mode="outlined"
                            autoCapitalize="words"
                            autoComplete="name"
                            error={!!errors.name}
                            style={styles.input}
                        />
                        {errors.name ? (
                            <HelperText type="error" visible={!!errors.name}>
                                {errors.name}
                            </HelperText>
                        ) : null}
                    </View>

                    {/* Email Input */}
                    <View style={styles.inputContainer}>
                        <TextInput
                            label="Email Address *"
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
                            label="Password *"
                            value={password}
                            onChangeText={(text) => {
                                setPassword(text);
                                setErrors(prev => ({ ...prev, password: validatePassword(text) }));
                            }}
                            mode="outlined"
                            secureTextEntry
                            autoComplete="password-new"
                            error={!!errors.password}
                            style={styles.input}
                        />
                        {errors.password ? (
                            <HelperText type="error" visible={!!errors.password}>
                                {errors.password}
                            </HelperText>
                        ) : null}
                    </View>

                    {/* Sign Up Button */}
                    <Button
                        mode="contained"
                        onPress={onSignUp}
                        loading={loading}
                        disabled={loading}
                        style={styles.button}
                        contentStyle={styles.buttonContent}
                    >
                        {loading ? 'Creating Account...' : 'Create Account'}
                    </Button>

                    {/* Login Link */}
                    <View style={styles.loginContainer}>
                        <Text style={[styles.loginText, { color: colors.onSurfaceVariant }]}>
                            Already have an account?{' '}
                        </Text>
                        <Link
                            href={{ pathname: '/(auth)/login', params: { r: role } }}
                            style={[styles.loginLink, { color: colors.primary }]}
                        >
                            Sign In
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
    loginContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 16,
    },
    loginText: {
        fontSize: 16,
    },
    loginLink: {
        fontSize: 16,
        fontWeight: 'bold',
    },
});
