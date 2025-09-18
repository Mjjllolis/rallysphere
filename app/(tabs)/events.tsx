// app/(tabs)/events.tsx - Simplified Events Page
import React from 'react';
import {
    View,
    Text,
    StyleSheet,
} from 'react-native';
import {
    useTheme
} from 'react-native-paper';

export default function EventsPage() {
    const { colors } = useTheme();

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={[styles.header, { backgroundColor: colors.surface }]}>
                <Text style={[styles.title, { color: colors.onSurface }]}>
                    Events
                </Text>
            </View>
            <View style={styles.content}>
                <Text style={[styles.message, { color: colors.onSurface }]}>
                    Events feature coming soon!
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
    },
});
