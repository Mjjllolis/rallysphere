// app/profile/delete-account.tsx
import React, { useState, useEffect } from 'react';
import {
    View,
    StyleSheet,
    ScrollView,
    Alert,
    TouchableOpacity,
} from 'react-native';
import {
    Text,
    Button,
    TextInput,
    useTheme,
    Surface,
    IconButton,
    ActivityIndicator,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { getOwnedClubs, deleteAccount, logout } from '../../lib/firebase';

const CONFIRM_PHRASE = 'DELETE';

export default function DeleteAccountScreen() {
    const theme = useTheme();

    const [ownedClubs, setOwnedClubs] = useState<Array<{ id: string; name: string }> | null>(null);
    const [confirmInput, setConfirmInput] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const clubs = await getOwnedClubs();
                setOwnedClubs(clubs);
            } catch {
                setOwnedClubs([]);
            }
        })();
    }, []);

    const handleDelete = async () => {
        if (confirmInput.trim() !== CONFIRM_PHRASE) {
            Alert.alert('Confirmation Required', `Type ${CONFIRM_PHRASE} exactly to proceed.`);
            return;
        }

        const clubWarning = ownedClubs && ownedClubs.length > 0
            ? `\n\nThis will also delete ${ownedClubs.length} club${ownedClubs.length === 1 ? '' : 's'} you own and all their events.`
            : '';

        Alert.alert(
            'Delete account?',
            `This permanently removes your profile, phone sign-in, and all your data. This cannot be undone.${clubWarning}`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete forever',
                    style: 'destructive',
                    onPress: async () => {
                        setLoading(true);
                        const result = await deleteAccount();
                        setLoading(false);

                        if (result.success) {
                            // Navigate away — onAuthStateChanged will clear the user.
                            router.replace('/(auth)/welcome-simple');
                        } else if (result.error?.includes('requires-recent-login')) {
                            Alert.alert(
                                'Sign in required',
                                'For security, sign out and sign back in with phone, then try again.',
                                [
                                    { text: 'Cancel', style: 'cancel' },
                                    {
                                        text: 'Sign out',
                                        onPress: async () => {
                                            await logout();
                                            router.replace('/(auth)/welcome-simple');
                                        },
                                    },
                                ]
                            );
                        } else {
                            Alert.alert('Error', result.error || 'Failed to delete account.');
                        }
                    },
                },
            ],
        );
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
            <View style={[styles.header, { borderBottomColor: theme.colors.outline }]}>
                <IconButton icon="arrow-left" size={24} onPress={() => router.back()} iconColor={theme.colors.onBackground} />
                <Text style={[styles.headerTitle, { color: theme.colors.onBackground }]}>Delete Account</Text>
                <View style={{ width: 48 }} />
            </View>

            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={1}>
                    <Text style={[styles.cardTitle, { color: theme.colors.error }]}>Danger zone</Text>
                    <Text style={[styles.paragraph, { color: theme.colors.onSurface }]}>
                        Deleting your account is permanent. You will lose:
                    </Text>
                    <View style={styles.bulletList}>
                        <Text style={[styles.bullet, { color: theme.colors.onSurfaceVariant }]}>• Your profile and photo</Text>
                        <Text style={[styles.bullet, { color: theme.colors.onSurfaceVariant }]}>• Phone sign-in access</Text>
                        <Text style={[styles.bullet, { color: theme.colors.onSurfaceVariant }]}>• Saved addresses and order history</Text>
                        <Text style={[styles.bullet, { color: theme.colors.onSurfaceVariant }]}>• Memberships in any clubs</Text>
                    </View>
                </Surface>

                {ownedClubs === null ? (
                    <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={1}>
                        <ActivityIndicator size="small" />
                    </Surface>
                ) : ownedClubs.length > 0 ? (
                    <Surface style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.error, borderWidth: 1 }]} elevation={1}>
                        <Text style={[styles.cardTitle, { color: theme.colors.error }]}>
                            Clubs you own ({ownedClubs.length})
                        </Text>
                        <Text style={[styles.paragraph, { color: theme.colors.onSurface }]}>
                            These will also be permanently deleted along with all their events.
                            Members and subscribers will lose access.
                        </Text>
                        <View style={styles.bulletList}>
                            {ownedClubs.map((c) => (
                                <Text key={c.id} style={[styles.bullet, { color: theme.colors.onSurface }]}>
                                    • {c.name}
                                </Text>
                            ))}
                        </View>
                        <Text style={[styles.paragraph, { color: theme.colors.onSurfaceVariant, fontStyle: 'italic', fontSize: 13 }]}>
                            Tip: if you want to keep these clubs running, transfer ownership
                            to another admin before deleting your account (not yet available in-app — contact support).
                        </Text>
                    </Surface>
                ) : null}

                <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={1}>
                    <Text style={[styles.cardTitle, { color: theme.colors.onSurface }]}>
                        Confirm deletion
                    </Text>
                    <Text style={[styles.paragraph, { color: theme.colors.onSurfaceVariant }]}>
                        Type <Text style={{ fontWeight: '700', color: theme.colors.error }}>{CONFIRM_PHRASE}</Text> to confirm.
                    </Text>
                    <TextInput
                        value={confirmInput}
                        onChangeText={setConfirmInput}
                        mode="outlined"
                        autoCapitalize="characters"
                        autoCorrect={false}
                        style={styles.input}
                    />
                    <Button
                        mode="contained"
                        onPress={handleDelete}
                        loading={loading}
                        disabled={loading || confirmInput.trim() !== CONFIRM_PHRASE}
                        buttonColor={theme.colors.error}
                        textColor="#FFFFFF"
                        style={styles.deleteButton}
                    >
                        Delete my account
                    </Button>
                    <TouchableOpacity onPress={() => router.back()} disabled={loading} style={styles.cancelButton}>
                        <Text style={[styles.cancelText, { color: theme.colors.primary }]}>Cancel</Text>
                    </TouchableOpacity>
                </Surface>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 8,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    headerTitle: { fontSize: 18, fontWeight: '700' },
    content: { padding: 16, gap: 16 },
    card: { borderRadius: 16, padding: 20, gap: 12 },
    cardTitle: { fontSize: 16, fontWeight: '700' },
    paragraph: { fontSize: 14, lineHeight: 20 },
    bulletList: { gap: 4 },
    bullet: { fontSize: 14, lineHeight: 20 },
    input: { backgroundColor: 'transparent' },
    deleteButton: { borderRadius: 12, marginTop: 4 },
    cancelButton: { alignSelf: 'center', paddingVertical: 8, marginTop: 4 },
    cancelText: { fontSize: 14, fontWeight: '600' },
});
