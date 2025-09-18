// app/(tabs)/profile.tsx - Simplified Profile Page
import React from 'react';
import {
    View,
    Text,
    StyleSheet,
} from 'react-native';
import {
    Button,
    useTheme
} from 'react-native-paper';
import { useAuth } from '../_layout';
import { signOutUser } from '../../lib/firebase';
import { router } from 'expo-router';

export default function ProfilePage() {
    const { colors } = useTheme();
    const { user } = useAuth();

    const handleSignOut = async () => {
        try {
            await signOutUser();
            router.replace('/');
        } catch (error) {
            console.error('Sign out error:', error);
        }
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={[styles.header, { backgroundColor: colors.surface }]}>
                <Text style={[styles.title, { color: colors.onSurface }]}>
                    Profile
                </Text>
            </View>
            <View style={styles.content}>
                <Text style={[styles.message, { color: colors.onSurface }]}>
                    {user ? `Welcome, ${user.email}!` : 'Not signed in'}
                </Text>
                
                <Button 
                    mode="contained" 
                    onPress={handleSignOut}
                    style={styles.signOutButton}
                >
                    Sign Out
                </Button>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        padding: 24,
        paddingTop: 64,
        elevation: 3,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
    },
    content: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    message: {
        fontSize: 18,
        textAlign: 'center',
        marginBottom: 20,
    },
    signOutButton: {
        marginTop: 20,
    },
});
