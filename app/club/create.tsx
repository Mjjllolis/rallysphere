// app/club/create.tsx - Simplified Club Creation
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
import { router } from 'expo-router';

export default function CreateClubPage() {
    const { colors } = useTheme();

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
                    Create Club
                </Text>
            </View>
            <View style={styles.content}>
                <Text style={[styles.message, { color: colors.onSurface }]}>
                    Club creation feature coming soon!
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
    },
});
