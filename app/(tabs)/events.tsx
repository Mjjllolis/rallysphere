// app/(tabs)/events.tsx - Events Tab Screen
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
    Searchbar,
    useTheme,
    SegmentedButtons
} from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../_layout';
import { router } from 'expo-router';
import {
    subscribeToEvents,
    joinEvent,
    leaveEvent,
    type Event
} from '../../lib/firebase/firestore-functions';

type FilterType = 'all' | 'upcoming' | 'joined' | 'past';

export default function EventsPage() {
    const { colors } = useTheme();
    const { user } = useAuth();
    const [searchQuery, setSearchQuery] = useState('');
    const [refreshing, setRefreshing] = useState(false);
    const [events, setEvents] = useState<Event[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<FilterType>('upcoming');

    // Subscribe to all events
    useEffect(() => {
        const unsubscribe = subscribeToEvents((eventsData) => {
            setEvents(eventsData);
            setLoading(false);
        });

        return unsubscribe;
    }, []);

    const onRefresh = React.useCallback(() => {
        setRefreshing(true);
        // The real-time listener will automatically update the data
        setTimeout(() => setRefreshing(false), 1000);
    }, []);

    // Filter events based on selected filter and search
    const getFilteredEvents = () => {
        const now = new Date();
        let filteredEvents = events;

        // Apply filter
        switch (filter) {
            case 'upcoming':
                filteredEvents = events.filter(event => event.date.toDate() > now);
                break;
            case 'past':
                filteredEvents = events.filter(event => event.date.toDate() <= now);
                break;
            case 'joined':
                filteredEvents = events.filter(event => user && event.usersJoined.includes(user.uid));
                break;
            case 'all':
            default:
                filteredEvents = events;
                break;
        }

        // Apply search
        if (searchQuery.trim()) {
            filteredEvents = filteredEvents.filter(event =>
                event.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                event.clubName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                event.location.toLowerCase().includes(searchQuery.toLowerCase())
            );
        }

        return filteredEvents;
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

    const getCategoryColor = (category: string) => {
        switch (category) {
            case 'tournament': return colors.primary;
            case 'training': return '#059669'; // Emerald
            case 'championship': return '#D97706'; // Amber
            case 'social': return '#7C3AED'; // Violet
            default: return colors.outline;
        }
    };

    const EventCard = ({ event }: { event: Event }) => {
        const isJoined = user && event.usersJoined.includes(user.uid);
        const isFull = event.maxParticipants && event.usersJoined.length >= event.maxParticipants;
        const isEventPast = event.date.toDate() < new Date();

        const formatDateTime = (timestamp: any) => {
            const date = timestamp.toDate();
            return {
                date: date.toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                }),
                time: date.toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                }),
            };
        };

        const eventDateTime = formatDateTime(event.date);

        return (
            <Card style={[styles.card, { backgroundColor: colors.surface }]} mode="outlined">
                {/* Event Header Image */}
                <View style={styles.eventImageContainer}>
                    <View style={[styles.eventImagePlaceholder, { backgroundColor: getCategoryColor(event.category) + '20' }]}>
                        <MaterialCommunityIcons
                            name={event.category === 'tournament' ? 'trophy' : 
                                  event.category === 'training' ? 'dumbbell' :
                                  event.category === 'social' ? 'account-group' : 'calendar'}
                            size={40}
                            color={getCategoryColor(event.category)}
                        />
                    </View>
                    <View style={[styles.eventTimeOverlay, { backgroundColor: colors.surface + 'F0' }]}>
                        <Text style={[styles.eventTimeText, { color: colors.onSurface }]}>
                            {eventDateTime.time}
                        </Text>
                    </View>
                </View>
                <Card.Content>
                    <View style={styles.cardHeader}>
                        <View style={styles.eventInfo}>
                            <Title style={[styles.eventTitle, { color: colors.onSurface }]}>
                                {event.title}
                            </Title>
                            <Text
                                style={[styles.clubName, { color: colors.primary }]}
                                onPress={() => router.push(`/club/${event.clubId}`)}
                            >
                                {event.clubName}
                            </Text>
                        </View>
                        <View style={styles.badges}>
                            <Chip
                                mode="flat"
                                textStyle={{ 
                                    color: getCategoryColor(event.category), 
                                    fontSize: 12,
                                    fontWeight: '600'
                                }}
                                style={{
                                    backgroundColor: getCategoryColor(event.category) + '15',
                                    height: 28
                                }}
                                compact
                            >
                                {event.category.charAt(0).toUpperCase() + event.category.slice(1)}
                            </Chip>
                            {isEventPast && (
                                <Chip
                                    mode="flat"
                                    textStyle={{ 
                                        color: colors.onSurfaceVariant, 
                                        fontSize: 12,
                                        fontWeight: '500'
                                    }}
                                    style={{ 
                                        backgroundColor: colors.outline + '15', 
                                        height: 28 
                                    }}
                                    compact
                                >
                                    Past
                                </Chip>
                            )}
                            {isFull && (
                                <Chip
                                    mode="flat"
                                    textStyle={{ 
                                        color: colors.error, 
                                        fontSize: 12,
                                        fontWeight: '600'
                                    }}
                                    style={{ 
                                        backgroundColor: colors.error + '15', 
                                        height: 28 
                                    }}
                                    compact
                                >
                                    Full
                                </Chip>
                            )}
                        </View>
                    </View>

                    <View style={styles.eventDetails}>
                        <View style={styles.detailRow}>
                            <MaterialCommunityIcons
                                name="calendar"
                                size={16}
                                color={colors.onSurfaceVariant}
                            />
                            <Text style={[styles.detailText, { color: colors.onSurfaceVariant }]}>
                                {eventDateTime.date}
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
                                {event.usersJoined.length}{event.maxParticipants ? `/${event.maxParticipants}` : ''} joined
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

                <Card.Actions style={styles.cardActions}>
                    <Button
                        mode="outlined"
                        onPress={() => router.push(`/event/${event.id}`)}
                        icon="eye"
                    >
                        View
                    </Button>

                    {!isEventPast && (
                        isJoined ? (
                            <Button
                                mode="text"
                                onPress={() => handleLeaveEvent(event.id)}
                                textColor={colors.error}
                                icon="account-minus"
                            >
                                Leave
                            </Button>
                        ) : (
                            <Button
                            mode="contained"
                            onPress={() => handleJoinEvent(event.id)}
                            disabled={!!isFull}
                            icon="account-plus"
                            >
                                            {isFull ? 'Full' : event.cost > 0 ? `Join (${(event.cost / 100).toFixed(2)})` : 'Join'}
                            </Button>
                        )
                    )}
                </Card.Actions>
            </Card>
        );
    };

    const filteredEvents = getFilteredEvents();

    const filterOptions = [
        { value: 'upcoming', label: 'Upcoming' },
        { value: 'joined', label: 'Joined' },
        { value: 'past', label: 'Past' },
        { value: 'all', label: 'All' },
    ];

    if (loading) {
        return (
            <View style={[styles.container, styles.center, { backgroundColor: colors.background }]}>
                <MaterialCommunityIcons
                    name="loading"
                    size={64}
                    color={colors.onSurfaceVariant}
                />
                <Text style={[styles.loadingText, { color: colors.onSurfaceVariant }]}>
                    Loading events...
                </Text>
            </View>
        );
    }

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            {/* Header */}
            <View style={[styles.header, { backgroundColor: colors.surface }]}>
                <Text style={[styles.title, { color: colors.onSurface }]}>
                    Events
                </Text>
                <Text style={[styles.subtitle, { color: colors.onSurfaceVariant }]}>
                    Discover and join events
                </Text>
            </View>

            {/* Search Bar */}
            <View style={styles.searchContainer}>
                <Searchbar
                    placeholder="Search events..."
                    onChangeText={setSearchQuery}
                    value={searchQuery}
                    style={{ backgroundColor: colors.surface }}
                />
            </View>

            {/* Filter Buttons */}
            <View style={styles.filterContainer}>
                <SegmentedButtons
                    value={filter}
                    onValueChange={(value) => setFilter(value as FilterType)}
                    buttons={filterOptions}
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
            contentContainerStyle={{ paddingBottom: 120 }}
            >
                {filteredEvents.length > 0 ? (
                    filteredEvents.map(event => (
                        <EventCard key={event.id} event={event} />
                    ))
                ) : searchQuery ? (
                    <View style={styles.emptyState}>
                        <MaterialCommunityIcons
                            name="magnify"
                            size={64}
                            color={colors.onSurfaceVariant}
                        />
                        <Text style={[styles.emptyText, { color: colors.onSurfaceVariant }]}>
                            No events match your search
                        </Text>
                        <Text style={[styles.emptySubtext, { color: colors.onSurfaceVariant }]}>
                            Try a different search term
                        </Text>
                    </View>
                ) : filter === 'joined' ? (
                    <View style={styles.emptyState}>
                        <MaterialCommunityIcons
                            name="calendar-account"
                            size={64}
                            color={colors.onSurfaceVariant}
                        />
                        <Text style={[styles.emptyText, { color: colors.onSurfaceVariant }]}>
                            You haven't joined any events yet
                        </Text>
                        <Text style={[styles.emptySubtext, { color: colors.onSurfaceVariant }]}>
                            Browse events to find something interesting
                        </Text>
                        <Button
                            mode="outlined"
                            onPress={() => setFilter('upcoming')}
                            style={{ marginTop: 16 }}
                        >
                            Browse Upcoming Events
                        </Button>
                    </View>
                ) : (
                    <View style={styles.emptyState}>
                        <MaterialCommunityIcons
                            name="calendar-blank"
                            size={64}
                            color={colors.onSurfaceVariant}
                        />
                        <Text style={[styles.emptyText, { color: colors.onSurfaceVariant }]}>
                            {filter === 'upcoming' ? 'No upcoming events' :
                             filter === 'past' ? 'No past events' : 'No events found'}
                        </Text>
                        <Text style={[styles.emptySubtext, { color: colors.onSurfaceVariant }]}>
                            Check back later or join a club to see events
                        </Text>
                    </View>
                )}
            </ScrollView>
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
    filterContainer: {
        paddingHorizontal: 16,
        paddingBottom: 16,
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
        marginBottom: 12,
    },
    eventInfo: {
        flex: 1,
        marginRight: 8,
    },
    eventTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 4,
    },
    clubName: {
        fontSize: 14,
        fontWeight: '500',
        textDecorationLine: 'underline',
    },
    badges: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 4,
        alignItems: 'flex-start',
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
    eventImageContainer: {
        height: 120,
        backgroundColor: '#f5f5f5',
        position: 'relative',
    },
    eventImagePlaceholder: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    eventTimeOverlay: {
        position: 'absolute',
        top: 12,
        right: 12,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
    },
    eventTimeText: {
        fontSize: 12,
        fontWeight: 'bold',
    },
});
