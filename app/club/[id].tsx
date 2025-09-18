// app/club/[id].tsx - Simplified Club Page
import React from 'react';
import {
    View,
    Text,
    StyleSheet,
} from 'react-native';
import {
    Button,
    useTheme,
    IconButton
} from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';

export default function ClubPage() {
    const { colors } = useTheme();
    const { id } = useLocalSearchParams<{ id: string }>();

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={[styles.header, { backgroundColor: colors.surface }]}>
                <IconButton
                    icon="arrow-left"
                    size={24}
                    iconColor={colors.onSurface}
                    onPress={() => router.back()}
                />
                <Text style={[styles.title, { color: colors.onSurface }]}>
                    Club Details
                </Text>
            </View>
            <View style={styles.content}>
                <Text style={[styles.message, { color: colors.onSurface }]}>
                    Club details feature coming soon!
                </Text>
                <Text style={[styles.submessage, { color: colors.onSurfaceVariant }]}>
                    Club ID: {id}
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
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        paddingTop: 60,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        marginLeft: 16,
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
