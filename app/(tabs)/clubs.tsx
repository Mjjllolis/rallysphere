// app/(tabs)/clubs.tsx - Updated with Firebase integration
import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    ScrollView,
    StyleSheet,
    RefreshControl
} from 'react-native';
import {
    Card,
    Title,
    Paragraph,
    Chip,
    Button,
    FAB,
    Searchbar,
    useTheme,
    Badge
} from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../_layout';
import { router } from 'expo-router';
import {
    subscribeToUserClubs,
    getClubEvents,
    leaveClub,
    isClubAdmin,
    type Club
} from '../../lib/firebase/firestore-functions';

// If the file does not exist, create it at ../../firebase/firestore.ts and export the required functions/types.
// Example (../../firebase/firestore.ts):
// export const subscribeToUserClubs = ...;
// export const getClubEvents = ...;
// export const leaveClub = ...;
// export const isClubAdmin = ...;
// export type Club = ...;

export default function ClubsPage() {
    const { colors } = useTheme();
    const { user } = useAuth();
    const [searchQuery, setSearchQuery] = useState('');
    const [refreshing, setRefreshing] = useState(false);
    const [clubs, setClubs] = useState<Club[]>([]);
    const [loading, setLoading] = useState(true);

    // Subscribe to user's clubs
    useEffect(() => {
        if (!user) return;

        const unsubscribe = subscribeToUserClubs(user.uid, (clubsData: React.SetStateAction<Club[]>) => {
            setClubs(clubsData);
            setLoading(false);
        });

        return unsubscribe;
    }, [user]);

    const onRefresh = React.useCallback(() => {
        setRefreshing(true);
        // The real-time listener will automatically update the data
        setTimeout(() => setRefreshing(false), 1000);
    }, []);

    const filteredClubs = clubs.filter(club =>
        club.clubName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        club.sport.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const getRoleColor = (club: Club) => {
        if (!user) return colors.outline;
        if (club.clubOwner === user.uid) return colors.primary;
        if (club.clubAdmins.includes(user.uid)) return '#FF9800';
        return '#4CAF50';
    };

    const getUserRole = (club: Club) => {
        if (!user) return 'member';
        if (club.clubOwner === user.uid) return 'owner';
        if (club.clubAdmins.includes(user.uid)) return 'admin';
        return 'member';
    };

    const handleLeaveClub = async (clubId: string) => {
        if (!user) return;
        try {
            await leaveClub(clubId, user.uid);
        } catch (error) {
            console.error('Error leaving club:', error);
        }
    };

    const ClubCard = ({ club }: { club: Club }) => {
        const role = getUserRole(club);
        const isAdmin = user && isClubAdmin(club, user.uid);

        return (
            <Card style={[styles.card, { backgroundColor: colors.surface }]} mode="outlined">
                <Card.Content>
                    <View style={styles.cardHeader}>
                        <View style={styles.clubInfo}>
                            <Title style={[styles.cardTitle, { color: colors.onSurface }]}>
                                {club.clubName}
                            </Title>
                            <View style={styles.badges}>
                                <Chip
                                    mode="flat"
                                    textStyle={{ color: getRoleColor(club), fontSize: 12 }}
                                    style={{
                                        backgroundColor: getRoleColor(club) + '20',
                                        height: 24
                                    }}
                                >
                                    {role.toUpperCase()}
                                </Chip>
                            </View>
                        </View>
                    </View>

                    <Paragraph style={{ color: colors.onSurfaceVariant, marginBottom: 12 }}>
                        {club.description}
                    </Paragraph>

                    <View style={styles.clubDetails}>
                        <View style={styles.detailRow}>
                            <MaterialCommunityIcons
                                name="tennis-ball"
                                size={16}
                                color={colors.onSurfaceVariant}
                            />
                            <Text style={[styles.detailText, { color: colors.onSurfaceVariant }]}>
                                {club.sport}
                            </Text>
                        </View>

                        <View style={styles.detailRow}>
                            <MaterialCommunityIcons
                                name="account-multiple"
                                size={16}
                                color={colors.onSurfaceVariant}
                            />
                            <Text style={[styles.detailText, { color: colors.onSurfaceVariant }]}>
                                {club.clubMembers.length} members
                            </Text>
                        </View>

                        <View style={styles.detailRow}>
                            <MaterialCommunityIcons
                                name="calendar-clock"
                                size={16}
                                color={colors.onSurfaceVariant}
                            />
                            <Text style={[styles.detailText, { color: colors.onSurfaceVariant }]}>
                                Joined {club.createdAt.toDate().toLocaleDateString()}
                            </Text>
                        </View>
                    </View>
                </Card.Content>

                <Card.Actions style={styles.cardActions}>
                    <Button
                        mode="outlined"
                        onPress={() => router.push(`/club/${club.id}`)}
                        icon="eye"
                    >
                        View
                    </Button>

                    {isAdmin && (
                        <Button
                            mode="contained"
                            onPress={() => router.push(`/club/${club.id}/manage`)}
                            icon="cog"
                        >
                            Manage
                        </Button>
                    )}

                    {role === 'member' && (
                        <Button
                            mode="text"
                            onPress={() => handleLeaveClub(club.id)}
                            icon="exit-to-app"
                            textColor={colors.error}
                        >
                            Leave
                        </Button>
                    )}
                </Card.Actions>
            </Card>
        );
    };

    if (loading) {
        return (
            <View style={[styles.container, styles.center, { backgroundColor: colors.background }]}>
                <MaterialCommunityIcons
                    name="loading"
                    size={64}
                    color={colors.onSurfaceVariant}
                />
                <Text style={[styles.loadingText, { color: colors.onSurfaceVariant }]}>
                    Loading your clubs...
                </Text>
            </View>
        );
    }

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            {/* Header */}
            <View style={[styles.header, { backgroundColor: colors.surface }]}>
                <Text style={[styles.title, { color: colors.onSurface }]}>
                    My Clubs
                </Text>
                <Text style={[styles.subtitle, { color: colors.onSurfaceVariant }]}>
                    {filteredClubs.length} club{filteredClubs.length !== 1 ? 's' : ''}
                </Text>
            </View>

            {/* Search Bar */}
            <View style={styles.searchContainer}>
                <Searchbar
                    placeholder="Search your clubs..."
                    onChangeText={setSearchQuery}
                    value={searchQuery}
                    style={{ backgroundColor: colors.surface }}
                />
            </View>

            {/* Content */}
            <ScrollView
                style={styles.content}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                }
                showsVerticalScrollIndicator={false}
            >
                {filteredClubs.length > 0 ? (
                    filteredClubs.map(club => (
                        <ClubCard key={club.id} club={club} />
                    ))
                ) : searchQuery ? (
                    <View style={styles.emptyState}>
                        <MaterialCommunityIcons
                            name="magnify"
                            size={64}
                            color={colors.onSurfaceVariant}
                        />
                        <Text style={[styles.emptyText, { color: colors.onSurfaceVariant }]}>
                            No clubs match your search
                        </Text>
                        <Text style={[styles.emptySubtext, { color: colors.onSurfaceVariant }]}>
                            Try a different search term
                        </Text>
                    </View>
                ) : (
                    <View style={styles.emptyState}>
                        <MaterialCommunityIcons
                            name="account-group-outline"
                            size={64}
                            color={colors.onSurfaceVariant}
                        />
                        <Text style={[styles.emptyText, { color: colors.onSurfaceVariant }]}>
                            You haven't joined any clubs yet
                        </Text>
                        <Text style={[styles.emptySubtext, { color: colors.onSurfaceVariant }]}>
                            Discover clubs on the Home tab or create your own
                        </Text>
                        <Button
                            mode="outlined"
                            onPress={() => router.push('/(tabs)')}
                            style={{ marginTop: 16 }}
                        >
                            Browse Clubs
                        </Button>
                    </View>
                )}

                <View style={{ height: 100 }} />
            </ScrollView>

            {/* Floating Action Button */}
            <FAB
                icon="plus"
                style={[styles.fab, { backgroundColor: colors.primary }]}
                onPress={() => router.push('/create-club')}
                label="Create Club"
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    center: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 16,
        fontSize: 16,
    },
    header: {
        padding: 20,
        paddingTop: 60,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        marginBottom: 4,
    },
    subtitle: {
        fontSize: 16,
    },
    searchContainer: {
        padding: 16,
        paddingBottom: 8,
    },
    content: {
        flex: 1,
        paddingHorizontal: 16,
    },
    card: {
        marginBottom: 16,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
    },
    cardHeader: {
        marginBottom: 8,
    },
    clubInfo: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    cardTitle: {
        fontSize: 18,
        flex: 1,
        marginRight: 8,
    },
    badges: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    clubDetails: {
        gap: 8,
    },
    detailRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    detailText: {
        fontSize: 14,
    },
    cardActions: {
        justifyContent: 'flex-end',
        gap: 8,
    },
    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 64,
        gap: 12,
        paddingHorizontal: 32,
    },
    emptyText: {
        fontSize: 18,
        fontWeight: 'bold',
        textAlign: 'center',
    },
    emptySubtext: {
        fontSize: 14,
        textAlign: 'center',
        lineHeight: 20,
    },
    fab: {
        position: 'absolute',
        margin: 16,
        right: 0,
        bottom: 0,
    },
});
