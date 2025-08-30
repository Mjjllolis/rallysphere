// app/event/[id].tsx - Individual Event View Screen (Updated)
import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    ScrollView,
    StyleSheet,
    RefreshControl,
    Alert,
    Share,
    Dimensions,
    Image,
    ImageBackground,
} from 'react-native';
import {
    Card,
    Title,
    Paragraph,
    Chip,
    Button,
    useTheme,
    Avatar,
    IconButton,
    Divider,
    List,
    FAB,
} from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../_layout';
import { router, useLocalSearchParams } from 'expo-router';
import {
    getEvent,
    getClub,
    joinEvent,
    leaveEvent,
    getUserProfile,
    isClubAdmin,
    type Event,
    type Club,
    type UserProfile
} from '../../lib/firebase/firestore-functions';
import { eventStyles as styles } from '../../styles/eventStyles';

const { width } = Dimensions.get('window');

export default function EventDetailsScreen() {
    const { colors } = useTheme();
    const { user } = useAuth();
    const { id } = useLocalSearchParams<{ id: string }>();
    const [event, setEvent] = useState<Event | null>(null);
    const [club, setClub] = useState<Club | null>(null);
    const [participants, setParticipants] = useState<UserProfile[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);

    const loadEventData = async () => {
        if (!id) return;

        try {
            // Get event data
            const eventData = await getEvent(id);
            if (!eventData) {
                Alert.alert('Error', 'Event not found.');
                router.back();
                return;
            }
            setEvent(eventData);

            // Get club data
            const clubData = await getClub(eventData.clubId);
            setClub(clubData);

            // Get participant profiles
            const participantProfiles = await Promise.all(
                eventData.usersJoined.map(userId => getUserProfile(userId))
            );
            setParticipants(participantProfiles.filter(profile => profile !== null) as UserProfile[]);

        } catch (error) {
            console.error('Error loading event data:', error);
            Alert.alert('Error', 'Failed to load event data.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadEventData();
    }, [id]);

    const onRefresh = React.useCallback(() => {
        setRefreshing(true);
        loadEventData().finally(() => setRefreshing(false));
    }, [id]);

    const handleJoinEvent = async () => {
        if (!user || !event) return;

        // Check if event is full
        if (event.maxParticipants && event.usersJoined.length >= event.maxParticipants) {
            Alert.alert('Event Full', 'This event has reached its maximum capacity.');
            return;
        }

        setActionLoading(true);
        try {
            await joinEvent(event.id, user.uid);
            await loadEventData(); // Refresh data
            Alert.alert('Success!', 'You have joined the event successfully.');
        } catch (error) {
            console.error('Error joining event:', error);
            Alert.alert('Error', 'Failed to join event. Please try again.');
        } finally {
            setActionLoading(false);
        }
    };

    const handleLeaveEvent = async () => {
        if (!user || !event) return;

        Alert.alert(
            'Leave Event',
            'Are you sure you want to leave this event?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Leave',
                    style: 'destructive',
                    onPress: async () => {
                        setActionLoading(true);
                        try {
                            await leaveEvent(event.id, user.uid);
                            await loadEventData(); // Refresh data
                            Alert.alert('Left Event', 'You have left the event.');
                        } catch (error) {
                            console.error('Error leaving event:', error);
                            Alert.alert('Error', 'Failed to leave event. Please try again.');
                        } finally {
                            setActionLoading(false);
                        }
                    },
                },
            ]
        );
    };

    const handleShareEvent = async () => {
        if (!event) return;
        
        try {
            await Share.share({
                message: `Join me at ${event.title} on ${event.date.toDate().toLocaleDateString()}! 🎾\n\nLocation: ${event.location}\n${event.cost > 0 ? `Cost: $${(event.cost / 100).toFixed(2)}` : 'Free event'}\n\nJoin through RallySphere!`,
                title: event.title,
            });
        } catch (error) {
            console.error('Error sharing:', error);
        }
    };

    if (loading || !event || !club) {
        return (
            <View style={[styles.container, styles.center, { backgroundColor: colors.background }]}>
                <MaterialCommunityIcons
                    name="loading"
                    size={64}
                    color={colors.onSurfaceVariant}
                />
                <Text style={[styles.loadingText, { color: colors.onSurfaceVariant }]}>
                    Loading event...
                </Text>
            </View>
        );
    }

    const isJoined = user && event.usersJoined.includes(user.uid);
    const isEventCreator = user && event.createdBy === user.uid;
    const isClubAdminUser = user && club && (club.clubOwner === user.uid || club.clubAdmins.includes(user.uid));
    const isFull = event.maxParticipants && event.usersJoined.length >= event.maxParticipants;
    const isEventPast = event.date.toDate() < new Date();
    const canJoin = user && !isJoined && !isFull && !isEventPast && club.clubMembers.includes(user.uid);

    const getCategoryColor = (category: string) => {
        switch (category) {
            case 'tournament': return colors.primary;
            case 'training': return '#4CAF50';
            case 'championship': return '#FF9800';
            case 'social': return '#9C27B0';
            default: return colors.outline;
        }
    };

    const formatDateTime = (timestamp: any) => {
        const date = timestamp.toDate();
        return {
            date: date.toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
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
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <ScrollView
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                }
                showsVerticalScrollIndicator={false}
            >
                {/* Top Navigation with Back Button */}
                <View style={[styles.topNav, { backgroundColor: 'transparent' }]}>
                    <IconButton
                        icon="arrow-left"
                        size={20}
                        iconColor={colors.onSurface}
                        onPress={() => router.back()}
                        style={styles.backButton}
                        mode="contained-tonal"
                        containerColor={colors.surface}
                    />
                    <IconButton
                        icon="share-variant"
                        size={20}
                        iconColor={colors.onSurface}
                        onPress={handleShareEvent}
                        mode="contained-tonal"
                        containerColor={colors.surface}
                    />
                </View>

                {/* Event Image */}
                {event.eventImage && (
                    <View style={styles.imageContainer}>
                        <Image
                            source={{ uri: event.eventImage }}
                            style={styles.eventImage}
                            resizeMode="cover"
                        />
                    </View>
                )}

                {/* Event Header Card */}
                <Card style={[styles.card, { backgroundColor: colors.surface }]} mode="outlined">
                    <Card.Content style={styles.cardContent}>
                        <View style={styles.eventHeader}>
                            <View style={styles.eventTitleSection}>
                                <Title style={[styles.eventTitle, { color: colors.onSurface }]}>
                                    {event.title}
                                </Title>
                                <View style={styles.eventMeta}>
                                    <Chip
                                        mode="flat"
                                        textStyle={{ color: getCategoryColor(event.category) }}
                                        style={{
                                            backgroundColor: getCategoryColor(event.category) + '20',
                                        }}
                                        compact
                                    >
                                        {event.category.charAt(0).toUpperCase() + event.category.slice(1)}
                                    </Chip>
                                    {isEventPast && (
                                        <Chip
                                            mode="flat"
                                            textStyle={{ color: colors.onSurfaceVariant }}
                                            style={{ backgroundColor: colors.outline + '20' }}
                                            compact
                                        >
                                            Past Event
                                        </Chip>
                                    )}
                                    {isFull && (
                                        <Chip
                                            mode="flat"
                                            textStyle={{ color: colors.error }}
                                            style={{ backgroundColor: colors.error + '20' }}
                                            compact
                                        >
                                            Full
                                        </Chip>
                                    )}
                                </View>
                            </View>
                        </View>

                        {/* Club Info */}
                        <View style={styles.clubSection}>
                            <MaterialCommunityIcons
                                name="account-group"
                                size={16}
                                color={colors.onSurfaceVariant}
                            />
                            <Text
                                style={[styles.clubLink, { color: colors.primary }]}
                                onPress={() => router.push(`/club/${club.id}`)}
                            >
                                {club.clubName}
                            </Text>
                        </View>
                    </Card.Content>
                </Card>

                {/* Event Details */}
                <Card style={[styles.card, { backgroundColor: colors.surface }]} mode="outlined">
                    <Card.Content style={styles.cardContent}>
                        <Title style={[styles.sectionTitle, { color: colors.onSurface }]}>
                            Event Details
                        </Title>

                        <View style={styles.detailsGrid}>
                            {/* Date & Time */}
                            <View style={styles.detailRow}>
                                <MaterialCommunityIcons
                                    name="calendar"
                                    size={20}
                                    color={colors.primary}
                                />
                                <View style={styles.detailContent}>
                                    <Text style={[styles.detailLabel, { color: colors.onSurface }]}>
                                        Date & Time
                                    </Text>
                                    <Text style={[styles.detailText, { color: colors.onSurfaceVariant }]}>
                                        {eventDateTime.date}
                                    </Text>
                                    <Text style={[styles.detailText, { color: colors.onSurfaceVariant }]}>
                                        {eventDateTime.time}
                                    </Text>
                                </View>
                            </View>

                            {/* Location */}
                            <View style={styles.detailRow}>
                                <MaterialCommunityIcons
                                    name="map-marker"
                                    size={20}
                                    color={colors.primary}
                                />
                                <View style={styles.detailContent}>
                                    <Text style={[styles.detailLabel, { color: colors.onSurface }]}>
                                        Location
                                    </Text>
                                    <Text style={[styles.detailText, { color: colors.onSurfaceVariant }]}>
                                        {event.location}
                                    </Text>
                                </View>
                            </View>

                            {/* Cost */}
                            <View style={styles.detailRow}>
                                <MaterialCommunityIcons
                                    name="currency-usd"
                                    size={20}
                                    color={colors.primary}
                                />
                                <View style={styles.detailContent}>
                                    <Text style={[styles.detailLabel, { color: colors.onSurface }]}>
                                        Cost
                                    </Text>
                                    <Text style={[styles.detailText, { color: colors.onSurfaceVariant }]}>
                                        {event.cost > 0 ? `$${(event.cost / 100).toFixed(2)}` : 'Free'}
                                    </Text>
                                </View>
                            </View>

                            {/* Participants */}
                            <View style={styles.detailRow}>
                                <MaterialCommunityIcons
                                    name="account-multiple"
                                    size={20}
                                    color={colors.primary}
                                />
                                <View style={styles.detailContent}>
                                    <Text style={[styles.detailLabel, { color: colors.onSurface }]}>
                                        Participants
                                    </Text>
                                    <Text style={[styles.detailText, { color: colors.onSurfaceVariant }]}>
                                        {event.usersJoined.length}{event.maxParticipants ? `/${event.maxParticipants}` : ''} joined
                                    </Text>
                                </View>
                            </View>
                        </View>
                    </Card.Content>
                </Card>

                {/* Description */}
                {event.description && (
                    <Card style={[styles.card, { backgroundColor: colors.surface }]} mode="outlined">
                        <Card.Content style={styles.cardContent}>
                            <Title style={[styles.sectionTitle, { color: colors.onSurface }]}>
                                About This Event
                            </Title>
                            <Paragraph style={[styles.description, { color: colors.onSurfaceVariant }]}>
                                {event.description}
                            </Paragraph>
                        </Card.Content>
                    </Card>
                )}

                {/* Participants List */}
                {participants.length > 0 && (
                    <Card style={[styles.card, { backgroundColor: colors.surface }]} mode="outlined">
                        <Card.Content style={styles.cardContent}>
                            <Title style={[styles.sectionTitle, { color: colors.onSurface }]}>
                                Participants ({participants.length})
                            </Title>
                            
                            {participants.slice(0, 5).map((participant, index) => (
                                <List.Item
                                    key={participant.id}
                                    title={participant.displayName || participant.email.split('@')[0]}
                                    description={participant.email}
                                    left={() => (
                                        participant.avatar ? (
                                            <Avatar.Image size={40} source={{ uri: participant.avatar }} />
                                        ) : (
                                            <Avatar.Text
                                                size={40}
                                                label={(participant.displayName || participant.email).substring(0, 2).toUpperCase()}
                                                style={{ backgroundColor: colors.primary }}
                                            />
                                        )
                                    )}
                                    right={() => (
                                        participant.id === event.createdBy ? (
                                            <Chip mode="flat" compact style={{ backgroundColor: colors.primary + '20' }}>
                                                <Text style={{ color: colors.primary, fontSize: 12 }}>Organizer</Text>
                                            </Chip>
                                        ) : null
                                    )}
                                />
                            ))}
                            
                            {participants.length > 5 && (
                                <View style={styles.moreParticipants}>
                                    <Text style={[styles.moreText, { color: colors.onSurfaceVariant }]}>
                                        +{participants.length - 5} more participants
                                    </Text>
                                </View>
                            )}
                        </Card.Content>
                    </Card>
                )}

                {/* Action Buttons */}
                {!isEventPast && (
                    <Card style={[styles.card, { backgroundColor: colors.surface }]} mode="outlined">
                        <Card.Content style={styles.cardContent}>
                            <View style={styles.actionButtons}>
                                {canJoin && (
                                    <Button
                                        mode="contained"
                                        onPress={handleJoinEvent}
                                        loading={actionLoading}
                                        disabled={actionLoading}
                                        style={styles.actionButton}
                                        icon="account-plus"
                                    >
                                        {event.cost > 0 ? `Join ($${(event.cost / 100).toFixed(2)})` : 'Join Event'}
                                    </Button>
                                )}

                                {isJoined && (
                                    <Button
                                        mode="outlined"
                                        onPress={handleLeaveEvent}
                                        loading={actionLoading}
                                        disabled={actionLoading}
                                        style={styles.actionButton}
                                        textColor={colors.error}
                                        icon="account-minus"
                                    >
                                        Leave Event
                                    </Button>
                                )}

                                {(isEventCreator || isClubAdminUser) && (
                                    <Button
                                        mode="contained"
                                        onPress={() => router.push(`/event/${event.id}/manage`)}
                                        style={styles.actionButton}
                                        icon="cog"
                                    >
                                        Manage Event
                                    </Button>
                                )}

                                {!club.clubMembers.includes(user?.uid || '') && (
                                    <View style={styles.joinClubPrompt}>
                                        <Text style={[styles.promptText, { color: colors.onSurfaceVariant }]}>
                                            Join {club.clubName} to participate in events
                                        </Text>
                                        <Button
                                            mode="outlined"
                                            onPress={() => router.push(`/club/${club.id}`)}
                                            style={{ marginTop: 8 }}
                                        >
                                            View Club
                                        </Button>
                                    </View>
                                )}

                                {isFull && !isJoined && (
                                    <View style={styles.fullEventMessage}>
                                        <MaterialCommunityIcons
                                            name="account-alert"
                                            size={24}
                                            color={colors.onSurfaceVariant}
                                        />
                                        <Text style={[styles.fullEventText, { color: colors.onSurfaceVariant }]}>
                                            This event is full
                                        </Text>
                                    </View>
                                )}
                            </View>
                        </Card.Content>
                    </Card>
                )}

                <View style={{ height: 100 }} />
            </ScrollView>
        </View>
    );
}
