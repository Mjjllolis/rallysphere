// app/profile/blocked-users.tsx
//
// Review and undo blocks. Play's UGC policy expects blocking to be reversible
// and visible to the user who applied it, not a one-way door.
import React, { useState, useCallback } from 'react';
import {
    View,
    StyleSheet,
    ScrollView,
    Alert,
} from 'react-native';
import {
    Text,
    Button,
    useTheme,
    Surface,
    IconButton,
    ActivityIndicator,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { getUserProfile } from '../../lib/firebase';
import type { UserProfile } from '../../lib/firebase';
import { getBlockedUserIds, unblockUser } from '../../lib/moderation';

interface BlockedEntry {
    uid: string;
    profile: UserProfile | null;
}

export default function BlockedUsersScreen() {
    const theme = useTheme();

    const [entries, setEntries] = useState<BlockedEntry[] | null>(null);
    const [pendingUid, setPendingUid] = useState<string | null>(null);

    const load = useCallback(async () => {
        const ids = await getBlockedUserIds();
        // A blocked account may since have been deleted — keep the row so the
        // block is still undoable, just without a name to show.
        const resolved = await Promise.all(
            ids.map(async (uid) => ({ uid, profile: await getUserProfile(uid).catch(() => null) })),
        );
        setEntries(resolved);
    }, []);

    useFocusEffect(
        useCallback(() => {
            load();
        }, [load]),
    );

    const displayName = (entry: BlockedEntry) => {
        const p = entry.profile;
        if (!p) return 'Unavailable account';
        const full = [p.firstName, p.lastName].filter(Boolean).join(' ').trim();
        return p.displayName || full || 'RallySphere user';
    };

    const handleUnblock = (entry: BlockedEntry) => {
        Alert.alert(
            'Unblock this person?',
            `${displayName(entry)}'s events and clubs will show up in your feeds again.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Unblock',
                    onPress: async () => {
                        setPendingUid(entry.uid);
                        const result = await unblockUser(entry.uid);
                        setPendingUid(null);
                        if (result.success) {
                            setEntries((prev) => (prev ?? []).filter((e) => e.uid !== entry.uid));
                        } else {
                            Alert.alert('Error', result.error ?? 'Could not unblock this person.');
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
                <Text style={[styles.headerTitle, { color: theme.colors.onBackground }]}>Blocked Users</Text>
                <View style={{ width: 48 }} />
            </View>

            <ScrollView contentContainerStyle={styles.content}>
                {entries === null ? (
                    <View style={styles.centered}>
                        <ActivityIndicator />
                    </View>
                ) : entries.length === 0 ? (
                    <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={1}>
                        <Text style={[styles.cardTitle, { color: theme.colors.onSurface }]}>No one is blocked</Text>
                        <Text style={[styles.paragraph, { color: theme.colors.onSurfaceVariant }]}>
                            When you block someone, their events and clubs stop appearing in
                            your feeds. They're never told that you blocked them, and you can
                            undo it here at any time.
                        </Text>
                    </Surface>
                ) : (
                    <>
                        <Text style={[styles.intro, { color: theme.colors.onSurfaceVariant }]}>
                            These people's events and clubs are hidden from your feeds. They
                            aren't told that you blocked them.
                        </Text>
                        {entries.map((entry) => (
                            <Surface
                                key={entry.uid}
                                style={[styles.row, { backgroundColor: theme.colors.surface }]}
                                elevation={1}
                            >
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.name, { color: theme.colors.onSurface }]}>
                                        {displayName(entry)}
                                    </Text>
                                    {entry.profile?.university ? (
                                        <Text style={[styles.sub, { color: theme.colors.onSurfaceVariant }]}>
                                            {entry.profile.university}
                                        </Text>
                                    ) : null}
                                </View>
                                <Button
                                    mode="outlined"
                                    compact
                                    loading={pendingUid === entry.uid}
                                    disabled={pendingUid === entry.uid}
                                    onPress={() => handleUnblock(entry)}
                                >
                                    Unblock
                                </Button>
                            </Surface>
                        ))}
                    </>
                )}
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
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    headerTitle: { fontSize: 18, fontWeight: '600' },
    content: { padding: 16, gap: 12 },
    centered: { paddingVertical: 48, alignItems: 'center' },
    card: { borderRadius: 16, padding: 20 },
    cardTitle: { fontSize: 17, fontWeight: '600', marginBottom: 8 },
    paragraph: { fontSize: 14, lineHeight: 20 },
    intro: { fontSize: 13, lineHeight: 19, marginBottom: 4 },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderRadius: 14,
        paddingVertical: 14,
        paddingHorizontal: 16,
    },
    name: { fontSize: 15, fontWeight: '600' },
    sub: { fontSize: 13, marginTop: 2 },
});
