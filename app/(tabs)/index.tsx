// app/(tabs)/index.tsx - Updated Home Page
import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    ScrollView,
    StyleSheet,
    RefreshControl,
    Pressable
} from 'react-native';
import {
    Card,
    Title,
    Paragraph,
    Chip,
    Button,
    FAB,
    Searchbar,
    useTheme
} from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../_layout';
import { router } from 'expo-router';
import {
    subscribeToClubs,
    subscribeToEvents,
    joinClub,
    leaveClub,
    joinEvent,
    leaveEvent,
    isClubAdmin,
    type Club,
    type Event,
} from '../../lib/firebase/firestore-functions';

export default function HomePage() {
    const { colors } = useTheme();
    const { user } = useAuth();
    const [searchQuery, setSearchQuery] = useState('');
    const [refreshing, setRefreshing] = useState(false);
    const [activeTab, setActiveTab] = useState<'events' | 'clubs'>('events');
    const [clubs, setClubs] = useState<Club[]>([]);
    const [events, setEvents] = useState<Event[]>([]);
    const [loading, setLoading] = useState(true);

    // Subscribe to real-time updates
    useEffect(() => {
        const unsubscribeClubs = subscribeToClubs((clubsData: React.SetStateAction<Club[]>) => {
            setClubs(clubsData);
            setLoading(false);
        });

        const unsubscribeEvents = subscribeToEvents((eventsData: React.SetStateAction<Event[]>) => {
            setEvents(eventsData);
            setLoading(false);
        });

        return () => {
            unsubscribeClubs();
            unsubscribeEvents();
        };
    }, []);

    const onRefresh = React.useCallback(() => {
        setRefreshing(true);
        // The real-time listeners will automatically update the data
        setTimeout(() => setRefreshing(false), 1000);
    }, []);

    const filteredEvents = events.filter(event =>
        event.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        event.clubName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        event.location.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const filteredClubs = clubs.filter(club =>
        club.clubName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        club.sport.toLowerCase().includes(searchQuery.toLowerCase()) ||
        club.description.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const getCategoryColor = (category: string) => {
        switch (category) {
            case 'tournament': return colors.primary;
            case 'training': return '#4CAF50';
            case 'championship': return '#FF9800';
            case 'social': return '#9C27B0';
            default: return colors.outline;
        }
    };

    const handleJoinEvent = async (eventId: string) => {
        if (!user) return;
        try {
            await joinEvent(eventId, user.uid);
        } catch (error) {
            console.error('Error joining event:', error);
        }
    };

    const handleLeaveEvent = async (eventId: string) => {
        if (!user) return;
        try {
            await leaveEvent(eventId, user.uid);
        } catch (error) {
            console.error('Error leaving event:', error);
        }
    };

    const handleJoinClub = async (clubId: string) => {
        if (!user) return;
        try {
            await joinClub(clubId, user.uid);
        } catch (error) {
            console.error('Error joining club:', error);
        }
    };

    const handleLeaveClub = async (clubId: string) => {
        if (!user) return;
        try {
            await leaveClub(clubId, user.uid);
        } catch (error) {
            console.error('Error leaving club:', error);
        }
    };

    const EventCard = ({ event }: { event: Event }) => {
        const isJoined = user && event.usersJoined.includes(user.uid);
        const isFull = event.maxParticipants && event.usersJoined.length >= event.maxParticipants;

        return (
            <Card style={[styles.card, { backgroundColor: colors.surface }]} mode="outlined">
                <Card.Content>
                    <View style={styles.cardHeader}>
                        <Title style={[styles.cardTitle, { color: colors.onSurface }]}>
                            {event.title}
                        </Title>
                        <Chip
                            mode="outlined"
                            textStyle={{ color: getCategoryColor(event.category) }}
                            style={{ borderColor: getCategoryColor(event.category) }}
                        >
                            {event.category}
                        </Chip>
                    </View>

                    <Pressable onPress={() => router.push(`/club/${event.clubId}`)}>
                        <Paragraph style={{ color: colors.primary, marginBottom: 8 }}>
                            {event.clubName} →
                        </Paragraph>
                    </Pressable>

                    <View style={styles.eventDetails}>
                        <View style={styles.detailRow}>
                            <MaterialCommunityIcons
                                name="calendar"
                                size={16}
                                color={colors.onSurfaceVariant}
                            />
                            <Text style={[styles.detailText, { color: colors.onSurfaceVariant }]}>
                                {event.date.toDate().toLocaleDateString()} at {event.date.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </Text>
                        </View>

                        <View style={styles.detailRow}>
                            <MaterialCommunityIcons
                                name="map-marker"
                                size={16}
                                color={colors.onSurfaceVariant}
                            />
                            <Text style={[styles.detailText, { color: colors.onSurfaceVariant }]}>
                                {event.location}
                            </Text>
                        </View>

                        <View style={styles.detailRow}>
                            <MaterialCommunityIcons
                                name="account-multiple"
                                size={16}
                                color={colors.onSurfaceVariant}
                            />
                            <Text style={[styles.detailText, { color: colors.onSurfaceVariant }]}>
                                {event.usersJoined.length}{event.maxParticipants ? `/${event.maxParticipants}` : ''} players
                            </Text>
                        </View>

                        {event.cost > 0 && (
                            <View style={styles.detailRow}>
                                <MaterialCommunityIcons
                                    name="currency-usd"
                                    size={16}
                                    color={colors.onSurfaceVariant}
                                />
                                <Text style={[styles.detailText, { color: colors.onSurfaceVariant }]}>
                                    ${(event.cost / 100).toFixed(2)}
                                </Text>
                            </View>
                        )}
                    </View>
                </Card.Content>

                <Card.Actions>
                    <Button mode="outlined" onPress={() => router.push(`/event/${event.id}`)}>
                        View Details
                    </Button>
                    {isJoined ? (
                        <Button
                            mode="outlined"
                            onPress={() => handleLeaveEvent(event.id)}
                            textColor={colors.error}
                        >
                            Leave Event
                        </Button>
                    ) : (
                        <Button
                            mode="contained"
                            onPress={() => handleJoinEvent(event.id)}
                            disabled={!!isFull}
                        >
                            {isFull ? 'Full' : event.cost > 0 ? `Join ($${(event.cost / 100).toFixed(2)})` : 'Join Event'}
                        </Button>
                    )}
                </Card.Actions>
            </Card>
        );
    };

    const ClubCard = ({ club }: { club: Club }) => {
        const isJoined = user && club.clubMembers.includes(user.uid);
        const isAdmin = user && isClubAdmin(club, user.uid);

        return (
            <Card style={[styles.card, { backgroundColor: colors.surface }]} mode="outlined">
                <Card.Content>
                    <View style={styles.cardHeader}>
                        <Title style={[styles.cardTitle, { color: colors.onSurface }]}>
                            {club.clubName}
                        </Title>
                        {isJoined && (
                            <Chip mode="flat" style={{ backgroundColor: colors.primaryContainer }}>
                                {isAdmin ? 'Admin' : 'Joined'}
                            </Chip>
                        )}
                    </View>

                    <Paragraph style={{ color: colors.onSurfaceVariant, marginBottom: 8 }}>
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
                    </View>
                </Card.Content>

                <Card.Actions>
                    <Button mode="outlined" onPress={() => router.push(`/club/${club.id}`)}>
                        View Club
                    </Button>
                    {isJoined ? (
                        isAdmin ? (
                            <Button
                                mode="contained"
                                onPress={() => router.push(`/club/${club.id}/manage`)}
                                icon="cog"
                            >
                                Manage
                            </Button>
                        ) : (
                            <Button
                                mode="outlined"
                                onPress={() => handleLeaveClub(club.id)}
                                textColor={colors.error}
                            >
                                Leave
                            </Button>
                        )
                    ) : (
                        <Button
                            mode="contained"
                            onPress={() => handleJoinClub(club.id)}
                        >
                            Join Club
                        </Button>
                    )}
                </Card.Actions>
            </Card>
        );
    };

    const canCreateEvent = () => {
        if (!user) return false;
        // User can create event if they are admin/owner of any club
        return clubs.some(club => isClubAdmin(club, user.uid));
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            {/* Simplified Header */}
            <View style={[styles.header, { backgroundColor: colors.surface }]}>
                <Text style={[styles.title, { color: colors.onSurface }]}>
                    Home
                </Text>
            </View>

            {/* Search Bar */}
            <View style={styles.searchContainer}>
                <Searchbar
                    placeholder={`Search ${activeTab}...`}
                    onChangeText={setSearchQuery}
                    value={searchQuery}
                    style={{ backgroundColor: colors.surface }}
                />
            </View>

            {/* Tab Switcher */}
            <View style={styles.tabContainer}>
                <Pressable
                    style={[
                        styles.tab,
                        { backgroundColor: activeTab === 'events' ? colors.primary : colors.surface }
                    ]}
                    onPress={() => setActiveTab('events')}
                >
                    <Text style={{
                        color: activeTab === 'events' ? colors.onPrimary : colors.onSurface,
                        fontWeight: 'bold'
                    }}>
                        Events ({filteredEvents.length})
                    </Text>
                </Pressable>

                <Pressable
                    style={[
                        styles.tab,
                        { backgroundColor: activeTab === 'clubs' ? colors.primary : colors.surface }
                    ]}
                    onPress={() => setActiveTab('clubs')}
                >
                    <Text style={{
                        color: activeTab === 'clubs' ? colors.onPrimary : colors.onSurface,
                        fontWeight: 'bold'
                    }}>
                        Clubs ({filteredClubs.length})
                    </Text>
                </Pressable>
            </View>

            {/* Content */}
            <ScrollView
                style={styles.content}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                }
                showsVerticalScrollIndicator={false}
            >
                {loading ? (
                    <View style={styles.emptyState}>
                        <MaterialCommunityIcons
                            name="loading"
                            size={64}
                            color={colors.onSurfaceVariant}
                        />
                        <Text style={[styles.emptyText, { color: colors.onSurfaceVariant }]}>
                            Loading...
                        </Text>
                    </View>
                ) : activeTab === 'events' ? (
                    filteredEvents.length > 0 ? (
                        filteredEvents.map(event => (
                            <EventCard key={event.id} event={event} />
                        ))
                    ) : (
                        <View style={styles.emptyState}>
                            <MaterialCommunityIcons
                                name="calendar-blank"
                                size={64}
                                color={colors.onSurfaceVariant}
                            />
                            <Text style={[styles.emptyText, { color: colors.onSurfaceVariant }]}>
                                No events found
                            </Text>
                        </View>
                    )
                ) : (
                    filteredClubs.length > 0 ? (
                        filteredClubs.map(club => (
                            <ClubCard key={club.id} club={club} />
                        ))
                    ) : (
                        <View style={styles.emptyState}>
                            <MaterialCommunityIcons
                                name="account-group-outline"
                                size={64}
                                color={colors.onSurfaceVariant}
                            />
                            <Text style={[styles.emptyText, { color: colors.onSurfaceVariant }]}>
                                No clubs found
                            </Text>
                        </View>
                    )
                )}
            </ScrollView>

            {/* Floating Action Button - Only show create event if user can create */}
            {activeTab === 'events' && canCreateEvent() && (
                <FAB
                    icon="plus"
                    style={[styles.fab, { backgroundColor: colors.primary }]}
                    onPress={() => router.push('/create-event')}
                    label="Create Event"
                />
            )}

            {activeTab === 'clubs' && (
                <FAB
                    icon="plus"
                    style={[styles.fab, { backgroundColor: colors.primary }]}
                    onPress={() => router.push('/create-club')}
                    label="Create Club"
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
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
    },
    searchContainer: {
        padding: 16,
        paddingBottom: 8,
    },
    tabContainer: {
        flexDirection: 'row',
        marginHorizontal: 16,
        marginBottom: 16,
        borderRadius: 8,
        overflow: 'hidden',
    },
    tab: {
        flex: 1,
        padding: 12,
        alignItems: 'center',
        justifyContent: 'center',
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
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 8,
    },
    cardTitle: {
        fontSize: 18,
        flex: 1,
        marginRight: 8,
    },
    eventDetails: {
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
    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 64,
        gap: 16,
    },
    emptyText: {
        fontSize: 16,
        textAlign: 'center',
    },
    fab: {
        position: 'absolute',
        margin: 16,
        right: 0,
        bottom: 0,
    },
});
