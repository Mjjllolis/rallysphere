// app/(tabs)/index.tsx - Simplified Home Page
import React from 'react';
import {
    View,
    Text,
    StyleSheet,
} from 'react-native';
import {
    useTheme
} from 'react-native-paper';
import { useAuth } from '../_layout';

export default function HomePage() {
    const { colors } = useTheme();
    const { user } = useAuth();

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={[styles.header, { backgroundColor: colors.surface }]}>
                <Text style={[styles.title, { color: colors.onSurface }]}>
                    RallySphere
                </Text>
                <Text style={[styles.subtitle, { color: colors.onSurfaceVariant }]}>
                    Welcome{user ? `, ${user.email}` : ''}!
                </Text>
            </View>
            <View style={styles.content}>
                <Text style={[styles.message, { color: colors.onSurface }]}>
                    Firebase authentication is working! 🎉
                </Text>
                <Text style={[styles.submessage, { color: colors.onSurfaceVariant }]}>
                    The app is now ready for further development.
                </Text>
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
        borderBottomLeftRadius: 24,
        borderBottomRightRadius: 24,
    },
    title: {
        fontSize: 32,
        fontWeight: '700',
        letterSpacing: -0.5,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 16,
        textAlign: 'center',
        marginTop: 8,
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
        marginBottom: 10,
    },
    submessage: {
        fontSize: 16,
        textAlign: 'center',
    },
});
