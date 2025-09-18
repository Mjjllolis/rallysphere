// app/(auth)/welcome.tsx - Simplified Welcome Screen
import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Alert,
    ScrollView,
} from 'react-native';
import {
    TextInput,
    Button,
    Card,
    Title,
} from 'react-native-paper';
import { useRouter } from 'expo-router';
import { signUpWithEmail, signInWithEmail } from '../../lib/firebase';

type Mode = 'signin' | 'signup';

export default function Welcome() {
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
            Alert.alert('Error', error.message || 'Authentication failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <ScrollView style={styles.container}>
            <View style={styles.content}>
                <Title style={styles.title}>RallySphere</Title>
                
                <Card style={styles.card} mode="outlined">
                    <Card.Content>
                        <View style={styles.toggleContainer}>
                            <Button
                                mode={mode === 'signin' ? 'contained' : 'outlined'}
                                onPress={() => setMode('signin')}
                                style={styles.toggleButton}
                            >
                                Sign In
                            </Button>
                            <Button
                                mode={mode === 'signup' ? 'contained' : 'outlined'}
                                onPress={() => setMode('signup')}
                                style={styles.toggleButton}
                            >
                                Sign Up
                            </Button>
                        </View>

                        {mode === 'signup' && (
                            <TextInput
                                label="Full Name"
                                value={name}
                                onChangeText={setName}
                                mode="outlined"
                                style={styles.input}
                                autoCapitalize="words"
                            />
                        )}

                        <TextInput
                            label="Email"
                            value={email}
                            onChangeText={setEmail}
                            mode="outlined"
                            style={styles.input}
                            autoCapitalize="none"
                            keyboardType="email-address"
                        />

                        <TextInput
                            label="Password"
                            value={password}
                            onChangeText={setPassword}
                            mode="outlined"
                            style={styles.input}
                            secureTextEntry
                        />

                        <Button
                            mode="contained"
                            onPress={onSubmit}
                            loading={loading}
                            disabled={loading}
                            style={styles.submitButton}
                        >
                            {loading ? 'Loading...' : (mode === 'signin' ? 'Sign In' : 'Sign Up')}
                        </Button>
                    </Card.Content>
                </Card>
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
    card: {
        padding: 16,
    },
    toggleContainer: {
        flexDirection: 'row',
        marginBottom: 20,
        gap: 10,
    },
    toggleButton: {
        flex: 1,
    },
    input: {
        marginBottom: 16,
    },
    submitButton: {
        marginTop: 10,
    },
});
