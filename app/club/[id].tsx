// app/club/[id].tsx - Individual Club Home Screen
import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    ScrollView,
    StyleSheet,
    RefreshControl,
    Image,
    ImageBackground,
    Dimensions
} from 'react-native';
import {
    Card,
    Title,
    Paragraph,
    Chip,
    Button,
    FAB,
    useTheme,
    Avatar,
    Divider
} from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../_layout';
import { router, useLocalSearchParams } from 'expo-router';
import {
    getClub,
    getClubEvents,
    joinClub,
    leaveClub,
    joinEvent,
    leaveEvent,
    isClubAdmin,
    type Club,
    type Event
} from '../../lib/firebase/firestore-functions';

const { width } = Dimensions.get('window');

export default function ClubHomePage() {
    const { colors } = useTheme();
    const { user } = useAuth();
    const { id } = useLocalSearchParams<{ id: string }>();
    const [club, setClub] = useState<Club | null>(null);
    const [events, setEvents] = useState<Event[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const loadClubData = async () => {
        if (!id) return;

        try {
            const [clubData, eventsData] = await Promise.all([
                getClub(id),
                getClubEvents(id)
            ]);

            setClub(clubData);
            setEvents(eventsData);
        } catch (error) {
            console.error('Error loading club data:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadClubData();
    }, [id]);

    const onRefresh = React.useCallback(() => {
        setRefreshing(true);
        loadClubData().finally(() => setRefreshing(false));
    }, [id]);

    const handleJoinClub = async () => {
        if (!user || !club) return;
        try {
            await joinClub(club.id, user.uid);
            await loadClubData(); // Refresh data
        } catch (error) {
            console.error('Error joining club:', error);
        }
    };

    const handleLeaveClub = async () => {
        if (!user || !club) return;
        try {
            await leaveClub(club.id, user.uid);
            await loadClubData(); // Refresh data
        } catch (error) {
            console.error('Error leaving club:', error);
        }
    };

    const handleJoinEvent = async (eventId: string) => {
        if (!user) return;
        try {
            await joinEvent(eventId, user.uid);
            await loadClubData(); // Refresh data
        } catch (error) {
            console.error('Error joining event:', error);
        }
    };

    const handleLeaveEvent = async (eventId: string) => {
        if (!user) return;
        try {
            await leaveEvent(eventId, user.uid);
            await loadClubData(); // Refresh data
        } catch (error) {
            console.error('Error leaving event:', error);
        }
    };

    if (loading || !club) {
        return (
            <View style={[styles.container, styles.center, { backgroundColor: colors.background }]}>
                <MaterialCommunityIcons
                    name="loading"
                    size={64}
                    color={colors.onSurfaceVariant}
                />
                <Text style={[styles.loadingText, { color: colors.onSurfaceVariant }]}>
                    Loading club...
                </Text>
            </View>
        );
    }

    const isJoined = user && club.clubMembers.includes(user.uid);
    const isAdmin = user && isClubAdmin(club, user.uid);
    const upcomingEvents = events.filter(event => event.date.toDate() > new Date());
    const pastEvents = events.filter(event => event.date.toDate() <= new Date());

    const getCategoryColor = (category: string) => {
        switch (category) {
            case 'tournament': return colors.primary;
            case 'training': return '#4CAF50';
            case 'championship': return '#FF9800';
            case 'social': return '#9C27B0';
            default: return colors.outline;
        }
    };

    const EventCard = ({ event, isPast = false }: { event: Event; isPast?: boolean }) => {
        const isEventJoined = user && event.usersJoined.includes(user.uid);
        const isFull = event.maxParticipants && event.usersJoined.length >= event.maxParticipants;

        return (
            <Card style={[styles.eventCard, { backgroundColor: colors.surface }]} mode="outlined">
                <Card.Content>
                    <View style={styles.cardHeader}>
                        <Title style={[styles.eventTitle, { color: colors.onSurface }]}>
                            {event.title}
                        </Title>
                        <Chip
                            mode="outlined"
                            textStyle={{ color: getCategoryColor(event.category) }}
                            style={{ borderColor: getCategoryColor(event.category) }}
                            compact
                        >
                            {event.category}
                        </Chip>
                    </View>

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

                {!isPast && isJoined && (
                    <Card.Actions>
                        <Button mode="outlined" onPress={() => router.push(`/event/${event.id}`)}>
                            View Details
                        </Button>
                        {isEventJoined ? (
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
                )}
            </Card>
        );
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <ScrollView
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                }
                showsVerticalScrollIndicator={false}
            >
                {/* Club Header with Cover Image */}
                <View style={styles.headerContainer}>
                    {club.clubHeader ? (
                        <ImageBackground
                            source={{ uri: club.clubHeader }}
                            style={styles.headerImage}
                            resizeMode="cover"
                        >
                            <View style={[styles.headerOverlay, { backgroundColor: `${colors.surface}E6` }]}>
                                <View style={styles.clubInfo}>
                                    {club.clubLogo ? (
                                        <Avatar.Image size={80} source={{ uri: club.clubLogo }} />
                                    ) : (
                                        <Avatar.Text
                                            size={80}
                                            label={club.clubName.substring(0, 2).toUpperCase()}
                                            style={{ backgroundColor: colors.primary }}
                                        />
                                    )}
                                    <View style={styles.clubDetails}>
                                        <Title style={[styles.clubName, { color: colors.onSurface }]}>
                                            {club.clubName}
                                        </Title>
                                        <Text style={[styles.clubSport, { color: colors.onSurfaceVariant }]}>
                                            {club.sport}
                                        </Text>
                                        <Text style={[styles.memberCount, { color: colors.onSurfaceVariant }]}>
                                            {club.clubMembers.length} members
                                        </Text>
                                    </View>
                                </View>
                            </View>
                        </ImageBackground>
                    ) : (
                        <View style={[styles.headerNoImage, { backgroundColor: colors.primary }]}>
                            <View style={styles.clubInfo}>
                                {club.clubLogo ? (
                                    <Avatar.Image size={80} source={{ uri: club.clubLogo }} />
                                ) : (
                                    <Avatar.Text
                                        size={80}
                                        label={club.clubName.substring(0, 2).toUpperCase()}
                                        style={{ backgroundColor: colors.surface }}
                                        labelStyle={{ color: colors.primary }}
                                    />
                                )}
                                <View style={styles.clubDetails}>
                                    <Title style={[styles.clubName, { color: colors.onPrimary }]}>
                                        {club.clubName}
                                    </Title>
                                    <Text style={[styles.clubSport, { color: colors.onPrimary }]}>
                                        {club.sport}
                                    </Text>
                                    <Text style={[styles.memberCount, { color: colors.onPrimary }]}>
                                        {club.clubMembers.length} members
                                    </Text>
                                </View>
                            </View>
                        </View>
                    )}

                    {/* Action Buttons */}
                    <View style={styles.actionButtons}>
                        {isJoined ? (
                            <>
                                {isAdmin && (
                                    <Button
                                        mode="contained"
                                        onPress={() => router.push(`/club/${club.id}/manage`)}
                                        icon="cog"
                                        style={styles.actionButton}
                                    >
                                        Manage Club
                                    </Button>
                                )}
                                <Button
                                    mode="outlined"
                                    onPress={handleLeaveClub}
                                    textColor={colors.error}
                                    style={styles.actionButton}
                                >
                                    Leave Club
                                </Button>
                            </>
                        ) : (
                            <Button
                                mode="contained"
                                onPress={handleJoinClub}
                                style={styles.actionButton}
                            >
                                Join Club
                            </Button>
                        )}
                    </View>
                </View>

                {/* Club Description */}
                <Card style={[styles.card, { backgroundColor: colors.surface }]} mode="outlined">
                    <Card.Content>
                        <Title style={[styles.sectionTitle, { color: colors.onSurface }]}>
                            About
                        </Title>
                        <Paragraph style={{ color: colors.onSurfaceVariant }}>
                            {club.description}
                        </Paragraph>
                    </Card.Content>
                </Card>

                {/* Upcoming Events */}
                {upcomingEvents.length > 0 && (
                    <>
                        <View style={styles.sectionHeader}>
                            <Title style={[styles.sectionTitle, { color: colors.onSurface }]}>
                                Upcoming Events ({upcomingEvents.length})
                            </Title>
                        </View>
                        {upcomingEvents.map(event => (
                            <EventCard key={event.id} event={event} />
                        ))}
                    </>
                )}

                {/* Past Events */}
                {pastEvents.length > 0 && (
                    <>
                        <View style={styles.sectionHeader}>
                            <Title style={[styles.sectionTitle, { color: colors.onSurfaceVariant }]}>
                                Past Events ({pastEvents.length})
                            </Title>
                        </View>
                        {pastEvents.slice(0, 3).map(event => (
                            <EventCard key={event.id} event={event} isPast />
                        ))}
                        {pastEvents.length > 3 && (
                            <Button
                                mode="text"
                                onPress={() => router.push(`/club/${club.id}/events`)}
                                style={styles.viewAllButton}
                            >
                                View All Past Events
                            </Button>
                        )}
                    </>
                )}

                {/* Empty State */}
                {events.length === 0 && (
                    <View style={styles.emptyState}>
                        <MaterialCommunityIcons
                            name="calendar-blank"
                            size={64}
                            color={colors.onSurfaceVariant}
                        />
                        <Text style={[styles.emptyText, { color: colors.onSurfaceVariant }]}>
                            No events yet
                        </Text>
                        {isAdmin && (
                            <Button
                                mode="outlined"
                                onPress={() => router.push(`/create-event?clubId=${club.id}`)}
                                style={{ marginTop: 16 }}
                            >
                                Create First Event
                            </Button>
                        )}
                    </View>
                )}

                <View style={{ height: 100 }} />
            </ScrollView>

            {/* Floating Action Button for Admins */}
            {isAdmin && (
                <FAB
                    icon="plus"
                    style={[styles.fab, { backgroundColor: colors.primary }]}
                    onPress={() => router.push(`/create-event?clubId=${club.id}`)}
                    label="Create Event"
                />
            )}
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
    headerContainer: {
        marginBottom: 16,
    },
    headerImage: {
        width: width,
        height: 200,
        justifyContent: 'flex-end',
    },
    headerNoImage: {
        width: width,
        height: 200,
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerOverlay: {
        padding: 20,
    },
    clubInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
    },
    clubDetails: {
        flex: 1,
    },
    clubName: {
        fontSize: 24,
        fontWeight: 'bold',
    },
    clubSport: {
        fontSize: 16,
        marginBottom: 4,
    },
    memberCount: {
        fontSize: 14,
    },
    actionButtons: {
        flexDirection: 'row',
        padding: 16,
        gap: 12,
    },
    actionButton: {
        flex: 1,
    },
    card: {
        marginHorizontal: 16,
        marginBottom: 16,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
    },
    sectionHeader: {
        paddingHorizontal: 16,
        paddingBottom: 8,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
    },
    eventCard: {
        marginHorizontal: 16,
        marginBottom: 12,
        elevation: 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 8,
    },
    eventTitle: {
        fontSize: 16,
        flex: 1,
        marginRight: 8,
    },
    eventDetails: {
        gap: 6,
    },
    detailRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    detailText: {
        fontSize: 14,
    },
    viewAllButton: {
        marginHorizontal: 16,
        marginBottom: 16,
    },
    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 48,
        paddingHorizontal: 32,
        gap: 12,
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
