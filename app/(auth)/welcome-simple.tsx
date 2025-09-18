// app/(auth)/welcome-simple.tsx
import React, { useState } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    Alert,
    ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { signUpWithEmail, signInWithEmail } from '../../lib/firebase';

type Mode = 'signin' | 'signup';

export default function SimpleWelcome() {
    const [mode, setMode] = useState<Mode>('signup');
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    
    const router = useRouter();

    const onSubmit = async () => {
        setLoading(true);
        try {
            if (mode === 'signin') {
                await signInWithEmail(email.trim(), password);
            } else {
                await signUpWithEmail(email.trim(), password);
            }
            router.replace('/(tabs)');
        } catch (error: any) {
            Alert.alert('Error', error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <ScrollView style={styles.container}>
            <View style={styles.content}>
                <Text style={styles.title}>RallySphere</Text>
                
                <View style={styles.toggleContainer}>
                    <TouchableOpacity
                        style={[styles.toggleButton, mode === 'signin' && styles.activeButton]}
                        onPress={() => setMode('signin')}
                    >
                        <Text style={[styles.toggleText, mode === 'signin' && styles.activeText]}>
                            Sign In
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.toggleButton, mode === 'signup' && styles.activeButton]}
                        onPress={() => setMode('signup')}
                    >
                        <Text style={[styles.toggleText, mode === 'signup' && styles.activeText]}>
                            Sign Up
                        </Text>
                    </TouchableOpacity>
                </View>

                {mode === 'signup' && (
                    <TextInput
                        style={styles.input}
                        placeholder="Full Name"
                        value={name}
                        onChangeText={setName}
                        autoCapitalize="words"
                    />
                )}

                <TextInput
                    style={styles.input}
                    placeholder="Email"
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                />

                <TextInput
                    style={styles.input}
                    placeholder="Password"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                />

                <TouchableOpacity
                    style={[styles.submitButton, loading && styles.disabledButton]}
                    onPress={onSubmit}
                    disabled={loading}
                >
                    <Text style={styles.submitText}>
                        {loading ? 'Loading...' : (mode === 'signin' ? 'Sign In' : 'Sign Up')}
                    </Text>
                </TouchableOpacity>
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F8FAFC',
    },
    content: {
        padding: 20,
        paddingTop: 100,
    },
    title: {
        fontSize: 32,
        fontWeight: 'bold',
        textAlign: 'center',
        marginBottom: 40,
        color: '#1B365D',
    },
    toggleContainer: {
        flexDirection: 'row',
        marginBottom: 30,
        backgroundColor: '#E2E8F0',
        borderRadius: 8,
        padding: 4,
    },
    toggleButton: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 6,
        alignItems: 'center',
    },
    activeButton: {
        backgroundColor: '#1B365D',
    },
    toggleText: {
        fontSize: 16,
        color: '#64748B',
    },
    activeText: {
        color: '#FFFFFF',
        fontWeight: '600',
    },
    input: {
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#E2E8F0',
        borderRadius: 8,
        paddingHorizontal: 16,
        paddingVertical: 12,
        fontSize: 16,
        marginBottom: 16,
    },
    submitButton: {
        backgroundColor: '#1B365D',
        paddingVertical: 16,
        borderRadius: 8,
        alignItems: 'center',
        marginTop: 10,
    },
    disabledButton: {
        opacity: 0.6,
    },
    submitText: {
        color: '#FFFFFF',
        fontSize: 18,
        fontWeight: '600',
    },
});
