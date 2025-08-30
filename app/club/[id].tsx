// app/club/[id].tsx - Individual Club Home Screen (Using External Styles)
import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    ScrollView,
    RefreshControl,
    ImageBackground,
    Dimensions,
} from 'react-native';
import {
    Card,
    Title,
    Paragraph,
    Chip,
    Button,
    useTheme,
    Avatar,
    Surface,
    IconButton,
} from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
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
import { clubStyles as styles } from '../../styles/clubStyles';

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
            await loadClubData();
        } catch (error) {
            console.error('Error joining club:', error);
        }
    };

    const handleLeaveClub = async () => {
        if (!user || !club) return;
        try {
            await leaveClub(club.id, user.uid);
            await loadClubData();
        } catch (error) {
            console.error('Error leaving club:', error);
        }
    };

    const handleJoinEvent = async (eventId: string) => {
        if (!user) return;
        try {
            await joinEvent(eventId, user.uid);
            await loadClubData();
        } catch (error) {
            console.error('Error joining event:', error);
        }
    };

    const handleLeaveEvent = async (eventId: string) => {
        if (!user) return;
        try {
            await leaveEvent(eventId, user.uid);
            await loadClubData();
        } catch (error) {
            console.error('Error leaving event:', error);
        }
    };

    if (loading || !club) {
        return (
            <View style={[styles.container, styles.center, { backgroundColor: colors.background }]}>
                <LinearGradient
                    colors={[colors.primary + '20', colors.background]}
                    style={styles.loadingGradient}
                >
                    <MaterialCommunityIcons
                        name="loading"
                        size={64}
                        color={colors.primary}
                    />
                    <Text style={[styles.loadingText, { color: colors.primary }]}>
                        Loading club...
                    </Text>
                </LinearGradient>
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
        const categoryColor = getCategoryColor(event.category);
        const isEventAdmin = user && (event.createdBy === user.uid || isAdmin);

        return (
            <Card style={[styles.eventCard, { backgroundColor: colors.surface }]} mode="outlined">
                <LinearGradient
                    colors={[categoryColor + '08', 'transparent']}
                    style={styles.eventCardGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                >
                    <Card.Content style={styles.eventCardContent}>
                        <View style={styles.cardHeader}>
                            <View style={styles.eventTitleContainer}>
                                <View style={styles.eventTitleRow}>
                                    <Title style={[styles.eventTitle, { color: colors.onSurface }]}>
                                        {event.title}
                                    </Title>
                                </View>
                                <View style={styles.eventSubInfo}>
                                    <MaterialCommunityIcons
                                        name="calendar-clock"
                                        size={14}
                                        color={colors.onSurfaceVariant}
                                    />
                                    <Text style={[styles.eventDate, { color: colors.onSurfaceVariant }]}>
                                        {event.date.toDate().toLocaleDateString('en-US', {
                                            month: 'short',
                                            day: 'numeric',
                                            hour: '2-digit',
                                            minute: '2-digit'
                                        })}
                                    </Text>
                                </View>
                            </View>
                            <Chip
                                mode="flat"
                                textStyle={{
                                    color: categoryColor,
                                    fontSize: 12,
                                    fontWeight: '600'
                                }}
                                style={{
                                    backgroundColor: categoryColor + '20',
                                    borderColor: categoryColor + '40',
                                    borderWidth: 1
                                }}
                                compact
                            >
                                {event.category.charAt(0).toUpperCase() + event.category.slice(1)}
                            </Chip>
                        </View>

                        <View style={styles.eventDetails}>
                            <View style={styles.detailRow}>
                                <MaterialCommunityIcons
                                    name="map-marker"
                                    size={16}
                                    color={colors.primary}
                                />
                                <Text style={[styles.detailText, { color: colors.onSurfaceVariant }]}>
                                    {event.location}
                                </Text>
                            </View>

                            <View style={styles.detailRow}>
                                <MaterialCommunityIcons
                                    name="account-multiple"
                                    size={16}
                                    color={colors.primary}
                                />
                                <Text style={[styles.detailText, { color: colors.onSurfaceVariant }]}>
                                    {event.usersJoined.length}{event.maxParticipants ? `/${event.maxParticipants}` : ''} participants
                                </Text>
                            </View>

                            {event.cost > 0 && (
                                <View style={styles.detailRow}>
                                    <MaterialCommunityIcons
                                        name="currency-usd"
                                        size={16}
                                        color={colors.primary}
                                    />
                                    <Text style={[styles.detailText, { color: colors.onSurfaceVariant }]}>
                                        ${(event.cost / 100).toFixed(2)}
                                    </Text>
                                </View>
                            )}
                        </View>
                    </Card.Content>

                    {!isPast && isJoined && (
                        <Card.Actions style={styles.eventCardActions}>
                            <Button
                                mode="outlined"
                                onPress={() => router.push(`/event/${event.id}`)}
                                style={styles.actionButton}
                                labelStyle={{ fontSize: 12 }}
                            >
                                View Details
                            </Button>
                            {isEventJoined ? (
                                <Button
                                    mode="outlined"
                                    onPress={() => handleLeaveEvent(event.id)}
                                    textColor={colors.error}
                                    style={styles.actionButton}
                                    labelStyle={{ fontSize: 12 }}
                                >
                                    Leave
                                </Button>
                            ) : (
                                <Button
                                    mode="contained"
                                    onPress={() => handleJoinEvent(event.id)}
                                    disabled={!!isFull}
                                    style={[styles.actionButton, { backgroundColor: categoryColor }]}
                                    labelStyle={{ fontSize: 12 }}
                                >
                                    {isFull ? 'Full' : event.cost > 0 ? `Join ($${(event.cost / 100).toFixed(2)})` : 'Join'}
                                </Button>
                            )}
                        </Card.Actions>
                    )}
                </LinearGradient>
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
                contentContainerStyle={{ paddingBottom: 120 }}
            >
                {/* Top Navigation with Back Button */}
                <View style={[styles.topNav, { backgroundColor: 'rgba(0,0,0,0.3)' }]}>
                    <IconButton
                        icon="arrow-left"
                        size={20}
                        iconColor={'white'}
                        onPress={() => router.back()}
                        style={styles.backButton}
                        mode="contained"
                        containerColor="rgba(0,0,0,0.5)"
                    />
                </View>

                {/* Enhanced Club Header */}
                <View style={styles.headerContainer}>
                    {club.clubHeader ? (
                        <ImageBackground
                            source={{ uri: club.clubHeader }}
                            style={styles.headerImage}
                            resizeMode="cover"
                        >
                            <LinearGradient
                                colors={['transparent', 'rgba(0,0,0,0.7)']}
                                style={styles.headerGradientOverlay}
                            >
                                <View style={styles.clubInfo}>
                                    <View style={styles.avatarContainer}>
                                        {club.clubLogo ? (
                                        <Avatar.Image 
                                        size={120} 
                                        source={{ uri: club.clubLogo }}
                                        style={styles.avatarShadow}
                                        />
                                        ) : (
                                        <Avatar.Text
                                        size={120}
                                        label={club.clubName.substring(0, 2).toUpperCase()}
                                        style={[styles.avatarShadow, { backgroundColor: colors.primary }]}
                                        labelStyle={{ fontSize: 32, fontWeight: 'bold' }}
                                        />
                                        )}
                                    </View>
                                    <View style={styles.clubDetails}>
                                        <Title style={[styles.clubName, { color: 'white' }]}>
                                            {club.clubName}
                                        </Title>
                                        <View style={styles.memberInfo}>
                                            <MaterialCommunityIcons
                                                name="account-multiple"
                                                size={16}
                                                color="rgba(255,255,255,0.9)"
                                            />
                                            <Text style={[styles.memberCount, { color: 'rgba(255,255,255,0.9)' }]}>
                                                {club.clubMembers.length} members
                                            </Text>
                                        </View>
                                    </View>
                                </View>
                            </LinearGradient>
                        </ImageBackground>
                    ) : (
                        <LinearGradient
                            colors={[colors.primary, colors.primary + 'CC']}
                            style={styles.headerNoImage}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                        >
                            <View style={styles.clubInfo}>
                                <View style={styles.avatarContainer}>
                                    {club.clubLogo ? (
                                    <Avatar.Image 
                                    size={120} 
                                    source={{ uri: club.clubLogo }}
                                    style={styles.avatarShadow}
                                    />
                                    ) : (
                                    <Avatar.Text
                                    size={120}
                                    label={club.clubName.substring(0, 2).toUpperCase()}
                                    style={[styles.avatarShadow, { backgroundColor: 'rgba(255,255,255,0.9)' }]}
                                    labelStyle={{ color: colors.primary, fontSize: 32, fontWeight: 'bold' }}
                                    />
                                    )}
                                </View>
                                <View style={styles.clubDetails}>
                                    <Title style={[styles.clubName, { color: colors.onPrimary }]}>
                                        {club.clubName}
                                    </Title>
                                    <View style={styles.memberInfo}>
                                        <MaterialCommunityIcons
                                            name="account-multiple"
                                            size={16}
                                            color={colors.onPrimary + 'CC'}
                                        />
                                        <Text style={[styles.memberCount, { color: colors.onPrimary + 'CC' }]}>
                                            {club.clubMembers.length} members
                                        </Text>
                                    </View>
                                </View>
                            </View>
                        </LinearGradient>
                    )}

                    {/* Enhanced Action Buttons */}
                    <View style={styles.actionButtonsContainer}>
                        <Surface style={styles.actionButtonsSurface} elevation={2}>
                            <View style={styles.surfaceContent}>
                                <LinearGradient
                                    colors={['rgba(255,255,255,0.95)', 'rgba(255,255,255,0.9)']}
                                    style={styles.actionButtonsGradient}
                                >
                                    {isJoined ? (
                                        <>
                                            {isAdmin && (
                                                <Button
                                                    mode="contained"
                                                    onPress={() => router.push(`/club/${club.id}/manage`)}
                                                    icon="cog"
                                                    style={[styles.primaryActionButton, { backgroundColor: colors.primary }]}
                                                    labelStyle={styles.actionButtonLabel}
                                                >
                                                    Manage Club
                                                </Button>
                                            )}
                                            <Button
                                                mode="outlined"
                                                onPress={handleLeaveClub}
                                                textColor={colors.error}
                                                style={[styles.secondaryActionButton, { borderColor: colors.error }]}
                                                labelStyle={styles.actionButtonLabel}
                                            >
                                                Leave Club
                                            </Button>
                                        </>
                                    ) : (
                                        <Button
                                            mode="contained"
                                            onPress={handleJoinClub}
                                            style={[styles.primaryActionButton, { backgroundColor: colors.primary }]}
                                            labelStyle={styles.actionButtonLabel}
                                            icon="account-plus"
                                        >
                                            Join Club
                                        </Button>
                                    )}
                                </LinearGradient>
                            </View>
                        </Surface>
                    </View>
                </View>

                {/* Enhanced Club Description */}
                <Card style={[styles.descriptionCard, { backgroundColor: colors.surface }]} mode="outlined">
                    <View style={styles.cardContentWrapper}>
                        <LinearGradient
                            colors={[colors.primary + '05', 'transparent']}
                            style={styles.cardGradient}
                        >
                            <Card.Content style={styles.descriptionContent}>
                                <View style={styles.sectionHeader}>
                                    <MaterialCommunityIcons
                                        name="information"
                                        size={24}
                                        color={colors.primary}
                                    />
                                    <Title style={[styles.sectionTitle, { color: colors.onSurface }]}>
                                        About This Club
                                    </Title>
                                </View>
                                <Paragraph style={[styles.description, { color: colors.onSurfaceVariant }]}>
                                    {club.description}
                                </Paragraph>
                            </Card.Content>
                        </LinearGradient>
                    </View>
                </Card>

                {/* Enhanced Upcoming Events Section */}
                {upcomingEvents.length > 0 && (
                    <>
                        <View style={styles.eventsHeader}>
                            <LinearGradient
                                colors={[colors.primary + '15', colors.primary + '05']}
                                style={styles.eventsHeaderGradient}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                            >
                                <View style={styles.eventsHeaderContent}>
                                    <MaterialCommunityIcons
                                        name="calendar-star"
                                        size={28}
                                        color={colors.primary}
                                    />
                                    <View>
                                        <Title style={[styles.eventsTitle, { color: colors.primary }]}>
                                            Upcoming Events
                                        </Title>
                                        <Text style={[styles.eventsCount, { color: colors.primary + 'AA' }]}>
                                            {upcomingEvents.length} event{upcomingEvents.length !== 1 ? 's' : ''} coming up
                                        </Text>
                                    </View>
                                </View>
                            </LinearGradient>
                        </View>
                        <View style={styles.eventsContainer}>
                            {upcomingEvents.map(event => (
                                <EventCard key={event.id} event={event} />
                            ))}
                        </View>
                    </>
                )}

                {/* Enhanced Past Events Section */}
                {pastEvents.length > 0 && (
                    <>
                        <View style={styles.eventsHeader}>
                            <LinearGradient
                                colors={[colors.onSurfaceVariant + '15', colors.onSurfaceVariant + '05']}
                                style={styles.eventsHeaderGradient}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                            >
                                <View style={styles.eventsHeaderContent}>
                                    <MaterialCommunityIcons
                                        name="history"
                                        size={28}
                                        color={colors.onSurfaceVariant}
                                    />
                                    <View>
                                        <Title style={[styles.eventsTitle, { color: colors.onSurfaceVariant }]}>
                                            Past Events
                                        </Title>
                                        <Text style={[styles.eventsCount, { color: colors.onSurfaceVariant + 'AA' }]}>
                                            {pastEvents.length} event{pastEvents.length !== 1 ? 's' : ''} completed
                                        </Text>
                                    </View>
                                </View>
                            </LinearGradient>
                        </View>
                        <View style={styles.eventsContainer}>
                            {pastEvents.slice(0, 3).map(event => (
                                <EventCard key={event.id} event={event} isPast />
                            ))}
                            {pastEvents.length > 3 && (
                                <Button
                                    mode="text"
                                    onPress={() => router.push(`/club/${club.id}/events`)}
                                    style={styles.viewAllButton}
                                    labelStyle={{ color: colors.primary }}
                                >
                                    View All Past Events ({pastEvents.length - 3} more)
                                </Button>
                            )}
                        </View>
                    </>
                )}

                {/* Enhanced Empty State */}
                {events.length === 0 && (
                    <Card style={[styles.emptyStateCard, { backgroundColor: colors.surface }]} mode="outlined">
                        <View style={styles.cardContentWrapper}>
                            <LinearGradient
                                colors={[colors.primary + '08', 'transparent']}
                                style={styles.emptyStateGradient}
                            >
                                <Card.Content style={styles.emptyStateContent}>
                                    <View style={[styles.emptyIconContainer, { backgroundColor: colors.primary + '10' }]}>
                                        <MaterialCommunityIcons
                                            name="calendar-plus"
                                            size={80}
                                            color={colors.primary}
                                        />
                                    </View>
                                    <Title style={[styles.emptyTitle, { color: colors.primary }]}>
                                        No Events Yet
                                    </Title>
                                    <Text style={[styles.emptyText, { color: colors.onSurfaceVariant }]}>
                                        This club hasn't scheduled any events yet. {isAdmin ? 'Create the first event to get started!' : 'Check back soon for upcoming events!'}
                                    </Text>
                                    {isAdmin && (
                                        <Button
                                            mode="contained"
                                            onPress={() => router.push(`/event/create?clubId=${club.id}`)}
                                            style={[styles.emptyActionButton, { backgroundColor: colors.primary }]}
                                            labelStyle={{ fontWeight: '600' }}
                                            icon="calendar-plus"
                                        >
                                            Create First Event
                                        </Button>
                                    )}
                                </Card.Content>
                            </LinearGradient>
                        </View>
                    </Card>
                )}
            </ScrollView>
        </View>
    );
}
