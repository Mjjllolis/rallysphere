import React, { useState, useEffect, useMemo } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  RefreshControl,
  Alert,
  TouchableOpacity,
  Image,
  Dimensions,
} from 'react-native';
import { Text, IconButton, Searchbar, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { router } from 'expo-router';
import { useAuth, useThemeToggle } from '../../_layout';
import { getEvents, joinEvent, leaveEvent, getClubs, joinClub, leaveClub, subscribeToClubs } from '../../../lib/firebase';
import type { Event, Club } from '../../../lib/firebase';
import PaymentSheet from '../../../components/PaymentSheet';
import CreateScreen from '../../../components/CreateScreen';
import JoinClubModal from '../../../components/JoinClubModal';
import RallyCreditsDisplay from '../../../components/RallyCreditsDisplay';

const { width } = Dimensions.get('window');
const FEATURED_CARD_WIDTH = width * 0.75;
const FEATURED_CARD_HEIGHT = 220;

export default function EventsScreen() {
  const theme = useTheme();
  const { isDark } = useThemeToggle();
  const { user } = useAuth();

  const [contentType, setContentType] = useState<'events' | 'clubs'>('events');
  const [menuVisible, setMenuVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<'upcoming' | 'my-events'>('upcoming');
  const [allEvents, setAllEvents] = useState<Event[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<Event[]>([]);
  const [myEvents, setMyEvents] = useState<Event[]>([]);
  const [featuredEvents, setFeaturedEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [paymentSheetVisible, setPaymentSheetVisible] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [createModalVisible, setCreateModalVisible] = useState(false);

  // Clubs state
  const [myClubs, setMyClubs] = useState<Club[]>([]);
  const [discoverClubs, setDiscoverClubs] = useState<Club[]>([]);
  const [filteredClubs, setFilteredClubs] = useState<Club[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [joinModalVisible, setJoinModalVisible] = useState(false);
  const [selectedClub, setSelectedClub] = useState<Club | null>(null);

  const availableCategories = useMemo(() => {
    const cats = [...new Set(discoverClubs.map(club => club.category).filter(Boolean))].sort();
    return ['All', ...cats];
  }, [discoverClubs]);

  useEffect(() => {
    if (contentType === 'events') {
      loadEvents();
    } else {
      loadClubs();
    }
  }, [user, contentType]);

  useEffect(() => {
    if (user && contentType === 'clubs') {
      // Set up real-time listener for user's clubs
      const unsubscribe = subscribeToClubs(user.uid, (clubs) => {
        setMyClubs(clubs);
      });
      return unsubscribe;
    }
  }, [user, contentType]);

  useEffect(() => {
    if (contentType === 'clubs') {
      // Reset category if it no longer exists
      if (selectedCategory !== 'All' && !availableCategories.includes(selectedCategory)) {
        setSelectedCategory('All');
      }
      filterClubs();
    }
  }, [discoverClubs, searchQuery, selectedCategory, availableCategories, contentType]);

  const loadEvents = async () => {
    try {
      setLoading(true);
      const result = await getEvents();

      if (result.success) {
        const now = new Date();
        const upcoming = result.events.filter((event) => {
          const eventDate = event.startDate?.toDate
            ? event.startDate.toDate()
            : new Date(event.startDate);
          return eventDate >= now;
        });

        const userEvents = user
          ? result.events.filter(
              (event) =>
                event.attendees.includes(user.uid) ||
                event.waitlist.includes(user.uid)
            )
          : [];

        // Featured events: upcoming with images, sorted by attendees
        const featured = upcoming
          .filter((event) => event.coverImage)
          .sort((a, b) => b.attendees.length - a.attendees.length)
          .slice(0, 5);

        setAllEvents(result.events);
        setUpcomingEvents(upcoming);
        setMyEvents(userEvents);
        setFeaturedEvents(featured);
      }
    } catch (error) {
      // console.error('Error loading events:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    if (contentType === 'events') {
      await loadEvents();
    } else {
      await loadClubs();
    }
    setRefreshing(false);
  };

  const loadClubs = async () => {
    if (!user) return;

    try {
      setLoading(true);

      // Load user's clubs
      const myClubsResult = await getClubs(user.uid);
      if (myClubsResult.success) {
        setMyClubs(myClubsResult.clubs);
      }

      // Load public clubs for discovery
      const discoverResult = await getClubs();
      if (discoverResult.success) {
        // Filter out clubs user is already a member of
        const userClubIds = myClubsResult.clubs.map(club => club.id);
        const availableClubs = discoverResult.clubs.filter(club => !userClubIds.includes(club.id));
        setDiscoverClubs(availableClubs);
      }
    } catch (error) {
      // console.error('Error loading clubs:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterClubs = () => {
    let filtered = discoverClubs;

    // Filter by category
    if (selectedCategory !== 'All') {
      filtered = filtered.filter(club => club.category === selectedCategory);
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(club =>
        club.name.toLowerCase().includes(query) ||
        club.description.toLowerCase().includes(query) ||
        club.category.toLowerCase().includes(query) ||
        (club.tags && club.tags.some(tag => tag.toLowerCase().includes(query)))
      );
    }

    setFilteredClubs(filtered);
  };

  const handleJoinEvent = async (eventId: string) => {
    if (!user) {
      Alert.alert('Error', 'Please log in to join events');
      return;
    }

    const event = allEvents.find((e) => e.id === eventId);
    if (!event) {
      Alert.alert('Error', 'Event not found');
      return;
    }

    if (event.ticketPrice && event.ticketPrice > 0) {
      setSelectedEvent(event);
      setPaymentSheetVisible(true);
      return;
    }

    setActionLoading(eventId);
    try {
      const result = await joinEvent(eventId, user.uid);
      if (result.success) {
        Alert.alert(
          'Success!',
          result.waitlisted
            ? 'You have been added to the waitlist!'
            : 'You have joined the event!'
        );
        await loadEvents();
      } else {
        Alert.alert('Error', result.error || 'Failed to join event');
      }
    } catch (error) {
      // console.error('Error joining event:', error);
      Alert.alert('Error', 'An unexpected error occurred');
    } finally {
      setActionLoading(null);
    }
  };

  const handlePaymentSuccess = async () => {
    await loadEvents();
  };

  const handleLeaveEvent = async (eventId: string) => {
    if (!user) return;

    Alert.alert('Leave Event', 'Are you sure you want to leave this event?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          setActionLoading(eventId);
          try {
            const result = await leaveEvent(eventId, user.uid);
            if (result.success) {
              Alert.alert('Success', 'You have left the event');
              await loadEvents();
            } else {
              Alert.alert('Error', result.error || 'Failed to leave event');
            }
          } catch (error) {
            // console.error('Error leaving event:', error);
            Alert.alert('Error', 'An unexpected error occurred');
          } finally {
            setActionLoading(null);
          }
        },
      },
    ]);
  };

  const handleJoinClubAction = async (clubId: string, message?: string) => {
    if (!user) return;

    setActionLoading(clubId);
    try {
      const result = await joinClub(clubId, user.uid, user.email || '', user.displayName || '', message);
      if (result.success) {
        if (result.approved) {
          Alert.alert('Success!', 'You have joined the club!');
          await loadClubs();
        } else {
          Alert.alert('Request Sent!', 'Your join request has been sent to the club admins.');
        }
      } else {
        Alert.alert('Error', result.error || 'Failed to join club');
      }
    } catch (error) {
      // console.error('Error joining club:', error);
      Alert.alert('Error', 'An unexpected error occurred');
    } finally {
      setActionLoading(null);
    }
  };

  const handleLeaveClubAction = async (clubId: string) => {
    if (!user) return;

    Alert.alert(
      'Leave Club',
      'Are you sure you want to leave this club?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(clubId);
            try {
              const result = await leaveClub(clubId, user.uid);
              if (result.success) {
                Alert.alert('Success', 'You have left the club');
                await loadClubs();
              } else {
                Alert.alert('Error', result.error || 'Failed to leave club');
              }
            } catch (error) {
              // console.error('Error leaving club:', error);
              Alert.alert('Error', 'An unexpected error occurred');
            } finally {
              setActionLoading(null);
            }
          }
        }
      ]
    );
  };

  const openJoinModal = (club: Club) => {
    setSelectedClub(club);
    setJoinModalVisible(true);
  };

  const handleJoinFromModal = async (message: string) => {
    if (selectedClub) {
      await handleJoinClubAction(selectedClub.id, message);
    }
  };

  const getUserClubRole = (club: Club): string => {
    if (!user) return 'Member';
    if (club.owner === user.uid || club.createdBy === user.uid) return 'Owner';
    if (club.admins.includes(user.uid)) return 'Admin';
    if (club.subscribers?.includes(user.uid)) return 'Subscriber';
    return 'Member';
  };

  const getRoleBadgeStyle = (role: string) => {
    switch (role) {
      case 'Owner': return styles.ownerBadge;
      case 'Admin': return styles.adminBadge;
      case 'Subscriber': return styles.subscriberBadge;
      default: return styles.memberBadge;
    }
  };

  const filterEvents = (events: Event[]) => {
    if (!searchQuery) return events;
    const query = searchQuery.toLowerCase();
    return events.filter(
      (event) =>
        event.title.toLowerCase().includes(query) ||
        event.description.toLowerCase().includes(query) ||
        event.clubName.toLowerCase().includes(query) ||
        (event.tags && event.tags.some((tag) => tag.toLowerCase().includes(query)))
    );
  };

  const formatDate = (date: any) => {
    if (!date) return '';
    const eventDate = date.toDate ? date.toDate() : new Date(date);
    return eventDate.toLocaleDateString([], {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatTime = (date: any) => {
    if (!date) return '';
    const eventDate = date.toDate ? date.toDate() : new Date(date);
    return eventDate.toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const getCurrentEvents = () => {
    return activeTab === 'upcoming'
      ? filterEvents(upcomingEvents)
      : filterEvents(myEvents);
  };

  const displayEvents = getCurrentEvents();

  const renderClubCard = (club: Club, isJoined: boolean) => {
    const role = getUserClubRole(club);
    return (
      <TouchableOpacity
        key={club.id}
        style={styles.clubCard}
        onPress={() => router.push(`/club/${club.id}`)}
        activeOpacity={0.9}
      >
        <BlurView intensity={20} tint={isDark ? "dark" : "light"} style={[styles.clubCardBlur, { borderColor: theme.colors.outline }]}>
          <View style={styles.clubCardContent}>
            {/* Left: Club Logo/Image */}
            {club.logo || club.coverImage ? (
              <Image
                source={{ uri: club.logo || club.coverImage }}
                style={styles.clubImage}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.clubImagePlaceholder}>
                <LinearGradient
                  colors={['#1B365D', '#60A5FA']}
                  style={styles.clubImageGradient}
                >
                  <Ionicons name="people" size={32} color="#fff" />
                </LinearGradient>
              </View>
            )}

            {/* Right: Club Details */}
            <View style={styles.clubDetails}>
              <View style={styles.clubHeader}>
                <View style={{ flex: 1 }}>
                  <View style={styles.clubTitleRow}>
                    <Text style={[styles.clubTitle, { color: theme.colors.onSurface }]} numberOfLines={1}>
                      {club.name}
                    </Text>
                    {club.isPro && (
                      <Ionicons name="star" size={16} color="#FFD700" style={{ marginLeft: 6 }} />
                    )}
                  </View>
                  <Text style={styles.clubCategory} numberOfLines={1}>
                    {club.category}
                  </Text>
                </View>

                <View style={styles.badgesColumn}>
                  {isJoined && (
                    <View style={[styles.memberBadge, getRoleBadgeStyle(role)]}>
                      <Text style={[
                        styles.memberBadgeText,
                        role === 'Owner' && { color: '#FFD700' },
                        role === 'Admin' && { color: '#60A5FA' },
                        role === 'Subscriber' && { color: '#4CAF50' },
                      ]}>{role}</Text>
                    </View>
                  )}
                  {isJoined && user && (
                    <RallyCreditsDisplay
                      userId={user.uid}
                      clubId={club.id}
                      compact
                    />
                  )}
                </View>
              </View>

              <Text style={[styles.clubDescription, { color: theme.colors.onSurfaceVariant }]} numberOfLines={2}>
                {club.description}
              </Text>

              <View style={styles.clubFooter}>
                <View style={styles.clubMetaRow}>
                  <Ionicons name="people-outline" size={14} color="#60A5FA" />
                  <Text style={styles.clubMetaText}>
                    {club.members.length} {club.members.length === 1 ? 'member' : 'members'}
                  </Text>
                </View>

                {!club.isPublic && (
                  <View style={styles.privateIndicator}>
                    <Ionicons name="lock-closed-outline" size={12} color={theme.colors.onSurfaceVariant} />
                    <Text style={[styles.privateText, { color: theme.colors.onSurfaceVariant }]}>Private</Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        </BlurView>
      </TouchableOpacity>
    );
  };

  const renderFeaturedCard = (event: Event) => {
    const isAttending = user && event.attendees.includes(user.uid);
    const isWaitlisted = user && event.waitlist.includes(user.uid);

    return (
      <TouchableOpacity
        key={event.id}
        style={styles.featuredCard}
        onPress={() => router.push(`/event/${event.id}`)}
        activeOpacity={0.9}
      >
        <BlurView intensity={20} tint={isDark ? "dark" : "light"} style={[styles.featuredCardBlur, { borderColor: theme.colors.outline }]}>
          {/* Event Image */}
          {event.coverImage && (
            <Image
              source={{ uri: event.coverImage }}
              style={styles.featuredImage}
              resizeMode="cover"
            />
          )}

          {/* Gradient Overlay */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.4)', 'rgba(0,0,0,0.9)']}
            style={styles.featuredGradient}
          />

          {/* Content */}
          <View style={styles.featuredContent}>
            {/* Top badges */}
            <View style={styles.featuredBadges}>
              {isAttending && (
                <View style={styles.attendingBadge}>
                  <Text style={styles.attendingBadgeText}>Attending</Text>
                </View>
              )}
              <View style={event.ticketPrice > 0 ? styles.priceBadge : styles.freeBadge}>
                <Text style={styles.priceBadgeText}>
                  {event.ticketPrice > 0 ? `$${event.ticketPrice}` : 'Free Admission'}
                </Text>
              </View>
            </View>

            {/* Event Info */}
            <View style={styles.featuredInfo}>
              <Text style={styles.featuredDate}>
                {formatDate(event.startDate)} • {formatTime(event.startDate)}
              </Text>
              <Text style={styles.featuredTitle} numberOfLines={2}>
                {event.title}
              </Text>
              <Text style={styles.featuredClub} numberOfLines={1}>
                by {event.clubName}
              </Text>
              <View style={styles.featuredFooter}>
                <View style={styles.featuredLocation}>
                  <Ionicons
                    name={event.isVirtual ? 'globe-outline' : 'location-outline'}
                    size={14}
                    color="rgba(255,255,255,0.7)"
                  />
                  <Text style={[styles.featuredLocationText]} numberOfLines={1}>
                    {event.isVirtual ? 'Virtual' : event.location}
                  </Text>
                </View>
                <View style={styles.featuredAttendees}>
                  <Ionicons name="people-outline" size={14} color="rgba(255,255,255,0.7)" />
                  <Text style={styles.featuredAttendeesText}>
                    {event.attendees.length}
                    {event.maxAttendees ? `/${event.maxAttendees}` : ''}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </BlurView>
      </TouchableOpacity>
    );
  };

  const renderEventCard = (event: Event) => {
    const isAttending = user && event.attendees.includes(user.uid);
    const isWaitlisted = user && event.waitlist.includes(user.uid);
    const isUpcoming =
      event.startDate &&
      new Date(event.startDate.toDate ? event.startDate.toDate() : event.startDate) >
        new Date();

    return (
      <TouchableOpacity
        key={event.id}
        style={styles.eventCard}
        onPress={() => router.push(`/event/${event.id}`)}
        activeOpacity={0.9}
      >
        <BlurView intensity={20} tint={isDark ? "dark" : "light"} style={[styles.eventCardBlur, { borderColor: theme.colors.outline }]}>
          <View style={styles.eventCardContent}>
            {/* Left: Event image or date badge */}
            {event.coverImage ? (
              <Image
                source={{ uri: event.coverImage }}
                style={styles.eventThumbnail}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.eventDateBadge}>
                <Text style={styles.eventDateMonth}>
                  {formatDate(event.startDate).split(' ')[1]}
                </Text>
                <Text style={[styles.eventDateDay, { color: theme.colors.onSurface }]}>
                  {formatDate(event.startDate).split(' ')[2]}
                </Text>
              </View>
            )}

            {/* Right: Event details */}
            <View style={styles.eventDetails}>
              <View style={styles.eventHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.eventTitle, { color: theme.colors.onSurface }]} numberOfLines={1}>
                    {event.title}
                  </Text>
                  <Text style={styles.eventClub} numberOfLines={1}>
                    {event.clubName}
                  </Text>
                </View>

                {isAttending && (
                  <View style={styles.smallAttendingBadge}>
                    <Text style={styles.smallAttendingText}>Going</Text>
                  </View>
                )}
              </View>

              <View style={styles.eventMeta}>
                <View style={styles.eventMetaRow}>
                  <Ionicons name="time-outline" size={14} color={theme.colors.onSurfaceVariant} />
                  <Text style={[styles.eventMetaText, { color: theme.colors.onSurfaceVariant }]}>
                    {formatDate(event.startDate)} • {formatTime(event.startDate)}
                  </Text>
                </View>
                <View style={styles.eventMetaRow}>
                  <Ionicons
                    name={event.isVirtual ? 'globe-outline' : 'location-outline'}
                    size={14}
                    color={theme.colors.onSurfaceVariant}
                  />
                  <Text style={[styles.eventMetaText, { color: theme.colors.onSurfaceVariant }]} numberOfLines={1}>
                    {event.isVirtual ? 'Virtual' : event.location}
                  </Text>
                </View>
              </View>

              <View style={styles.eventFooter}>
                <View style={styles.eventAttendeesRow}>
                  <Ionicons name="people-outline" size={14} color="#60A5FA" />
                  <Text style={styles.eventAttendeesText}>
                    {event.attendees.length}
                    {event.maxAttendees ? `/${event.maxAttendees}` : ''} going
                  </Text>
                </View>

                <Text style={event.ticketPrice > 0 ? styles.eventPrice : styles.eventFree}>
                  {event.ticketPrice > 0 ? `$${event.ticketPrice}` : 'Free'}
                </Text>
              </View>
            </View>
          </View>
        </BlurView>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Background */}
      <View style={StyleSheet.absoluteFill}>
        <View style={[styles.blackBackground, { backgroundColor: theme.colors.background }]} />
      </View>

      {/* Subtle Gradient Overlay */}
      <LinearGradient
        colors={[
          'rgba(139, 92, 246, 0.3)',
          'rgba(96, 165, 250, 0.1)',
          isDark ? 'rgba(0, 0, 0, 0)' : 'rgba(248, 250, 252, 0)',
        ]}
        locations={[0, 0.3, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          {/* Title with Dropdown */}
          <View style={styles.headerTitleRow}>
            <TouchableOpacity
              onPress={() => setMenuVisible(!menuVisible)}
              style={styles.titleButton}
              activeOpacity={0.7}
            >
              <Text style={[styles.headerTitle, { color: theme.colors.onSurface }]}>
                {contentType === 'events' ? 'Events' : 'Clubs'}
              </Text>
              <IconButton
                icon={menuVisible ? "chevron-up" : "chevron-down"}
                iconColor={theme.colors.onSurface}
                size={28}
                style={{ margin: 0, marginLeft: -4 }}
              />
            </TouchableOpacity>

            {/* Dropdown Menu */}
            {menuVisible && (
              <View style={[styles.dropdownMenu, {
                backgroundColor: isDark ? 'rgba(30,41,59,0.95)' : 'rgba(255,255,255,0.95)',
                borderColor: theme.colors.outline
              }]}>
                <TouchableOpacity
                  style={styles.dropdownItem}
                  onPress={() => {
                    setContentType('events');
                    setMenuVisible(false);
                  }}
                >
                  <IconButton icon="calendar-month" size={20} iconColor={theme.colors.onSurface} style={{ margin: 0 }} />
                  <Text style={[styles.dropdownText, { color: theme.colors.onSurface }]}>Events</Text>
                  {contentType === 'events' && (
                    <IconButton icon="check" size={20} iconColor="#60A5FA" style={{ margin: 0, marginLeft: 'auto' }} />
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.dropdownItem}
                  onPress={() => {
                    setContentType('clubs');
                    setMenuVisible(false);
                  }}
                >
                  <IconButton icon="account-group" size={20} iconColor={theme.colors.onSurface} style={{ margin: 0 }} />
                  <Text style={[styles.dropdownText, { color: theme.colors.onSurface }]}>Clubs</Text>
                  {contentType === 'clubs' && (
                    <IconButton icon="check" size={20} iconColor="#60A5FA" style={{ margin: 0, marginLeft: 'auto' }} />
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Tab Switcher with Create Button */}
          <View style={styles.tabContainer}>
            <View style={styles.tabsWrapper}>
              {contentType === 'events' ? (
                <>
                  <TouchableOpacity
                    style={[styles.tab, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', borderColor: theme.colors.outline }, activeTab === 'upcoming' && styles.tabActive]}
                    onPress={() => setActiveTab('upcoming')}
                  >
                    <IconButton
                      icon={activeTab === 'upcoming' ? 'calendar' : 'calendar-outline'}
                      iconColor={activeTab === 'upcoming' ? '#fff' : theme.colors.onSurfaceVariant}
                      size={18}
                      style={{ margin: 0 }}
                    />
                    <Text
                      style={[
                        styles.tabText,
                        { color: theme.colors.onSurfaceVariant },
                        activeTab === 'upcoming' && styles.tabTextActive,
                      ]}
                    >
                      Upcoming
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.tab, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', borderColor: theme.colors.outline }, activeTab === 'my-events' && styles.tabActive]}
                    onPress={() => setActiveTab('my-events')}
                  >
                    <IconButton
                      icon={activeTab === 'my-events' ? 'ticket' : 'ticket-outline'}
                      iconColor={activeTab === 'my-events' ? '#fff' : theme.colors.onSurfaceVariant}
                      size={18}
                      style={{ margin: 0 }}
                    />
                    <Text
                      style={[
                        styles.tabText,
                        { color: theme.colors.onSurfaceVariant },
                        activeTab === 'my-events' && styles.tabTextActive,
                      ]}
                    >
                      My Events
                    </Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <TouchableOpacity
                    style={[styles.tab, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', borderColor: theme.colors.outline }, activeTab === 'upcoming' && styles.tabActive]}
                    onPress={() => setActiveTab('upcoming')}
                  >
                    <IconButton
                      icon={activeTab === 'upcoming' ? 'account-group' : 'account-group-outline'}
                      iconColor={activeTab === 'upcoming' ? '#fff' : theme.colors.onSurfaceVariant}
                      size={18}
                      style={{ margin: 0 }}
                    />
                    <Text
                      style={[
                        styles.tabText,
                        { color: theme.colors.onSurfaceVariant },
                        activeTab === 'upcoming' && styles.tabTextActive,
                      ]}
                    >
                      My Clubs
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.tab, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', borderColor: theme.colors.outline }, activeTab === 'my-events' && styles.tabActive]}
                    onPress={() => setActiveTab('my-events')}
                  >
                    <IconButton
                      icon={activeTab === 'my-events' ? 'compass' : 'compass-outline'}
                      iconColor={activeTab === 'my-events' ? '#fff' : theme.colors.onSurfaceVariant}
                      size={18}
                      style={{ margin: 0 }}
                    />
                    <Text
                      style={[
                        styles.tabText,
                        { color: theme.colors.onSurfaceVariant },
                        activeTab === 'my-events' && styles.tabTextActive,
                      ]}
                    >
                      Discover
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </View>

            {/* Create Button */}
            <TouchableOpacity
              onPress={() => setCreateModalVisible(true)}
              activeOpacity={0.7}
            >
              <BlurView intensity={20} tint={isDark ? "dark" : "light"} style={[styles.createButton, { borderColor: theme.colors.outline }]}>
                <IconButton
                  icon="plus"
                  iconColor="#60A5FA"
                  size={18}
                  style={{ margin: 0 }}
                />
              </BlurView>
            </TouchableOpacity>
          </View>
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <BlurView intensity={20} tint={isDark ? "dark" : "light"} style={[styles.searchBarContainer, { borderColor: theme.colors.outline }]}>
            <Searchbar
              placeholder={contentType === 'events' ? "Search events..." : "Search clubs..."}
              onChangeText={setSearchQuery}
              value={searchQuery}
              style={styles.searchBar}
              iconColor={theme.colors.onSurfaceVariant}
              placeholderTextColor={theme.colors.onSurfaceDisabled}
              inputStyle={{ color: theme.colors.onSurface }}
            />
          </BlurView>
        </View>

        {/* Category Filter - Only show for clubs discover tab */}
        {contentType === 'clubs' && activeTab === 'my-events' && availableCategories.length > 2 && (
          <View style={styles.categoryContainer}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoryContent}
            >
              {availableCategories.map((category) => (
                <TouchableOpacity
                  key={category}
                  onPress={() => setSelectedCategory(category)}
                  activeOpacity={0.7}
                >
                  <BlurView
                    intensity={selectedCategory === category ? 30 : 15}
                    tint={isDark ? "dark" : "light"}
                    style={[
                      styles.categoryChip,
                      { borderColor: theme.colors.outline },
                      selectedCategory === category && styles.categoryChipSelected
                    ]}
                  >
                    <Text
                      style={[
                        styles.categoryText,
                        { color: theme.colors.onSurfaceVariant },
                        selectedCategory === category && styles.categoryTextSelected
                      ]}
                    >
                      {category}
                    </Text>
                  </BlurView>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.colors.onSurface}
            />
          }
        >
          {contentType === 'events' ? (
            <>
              {/* Featured Carousel - Only show on Upcoming tab */}
              {activeTab === 'upcoming' && featuredEvents.length > 0 && (
                <View style={styles.featuredSection}>
                  <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Featured Events</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.featuredCarousel}
                    decelerationRate="fast"
                    snapToInterval={FEATURED_CARD_WIDTH + 16}
                    snapToAlignment="start"
                  >
                    {featuredEvents.map((event) => renderFeaturedCard(event))}
                  </ScrollView>
                </View>
              )}

              {/* Events List */}
              <View style={styles.eventsSection}>
                <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
                  {activeTab === 'upcoming' ? 'All Events' : 'Your Events'}
                </Text>

                {displayEvents.length > 0 ? (
                  displayEvents.map((event) => renderEventCard(event))
                ) : (
                  <BlurView intensity={20} tint={isDark ? "dark" : "light"} style={[styles.emptyCard, { borderColor: theme.colors.outline }]}>
                    <View style={styles.emptyContent}>
                      <IconButton
                        icon="calendar-blank-outline"
                        size={64}
                        iconColor={theme.colors.onSurfaceDisabled}
                      />
                      <Text style={[styles.emptyTitle, { color: theme.colors.onSurface }]}>No events found</Text>
                      <Text style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}>
                        {activeTab === 'my-events'
                          ? 'Join some events to see them here!'
                          : searchQuery
                          ? 'Try adjusting your search'
                          : 'Check back later for new events'}
                      </Text>
                    </View>
                  </BlurView>
                )}
              </View>
            </>
          ) : (
            <>
              {/* Clubs List */}
              <View style={styles.eventsSection}>
                {activeTab === 'upcoming' ? (
                  myClubs.length > 0 ? (
                    myClubs.map((club) => renderClubCard(club, true))
                  ) : (
                    <BlurView intensity={20} tint={isDark ? "dark" : "light"} style={[styles.emptyCard, { borderColor: theme.colors.outline }]}>
                      <View style={styles.emptyContent}>
                        <IconButton icon="account-group-outline" size={64} iconColor={theme.colors.onSurfaceDisabled} />
                        <Text style={[styles.emptyTitle, { color: theme.colors.onSurface }]}>No clubs yet</Text>
                        <Text style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}>
                          Join some clubs to get started!
                        </Text>
                      </View>
                    </BlurView>
                  )
                ) : (
                  filteredClubs.length > 0 ? (
                    filteredClubs.map((club) => renderClubCard(club, false))
                  ) : (
                    <BlurView intensity={20} tint={isDark ? "dark" : "light"} style={[styles.emptyCard, { borderColor: theme.colors.outline }]}>
                      <View style={styles.emptyContent}>
                        <IconButton icon="magnify" size={64} iconColor={theme.colors.onSurfaceDisabled} />
                        <Text style={[styles.emptyTitle, { color: theme.colors.onSurface }]}>No clubs found</Text>
                        <Text style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}>
                          Try adjusting your search or filters
                        </Text>
                      </View>
                    </BlurView>
                  )
                )}
              </View>
            </>
          )}
        </ScrollView>
      </SafeAreaView>

      {selectedEvent && (
        <PaymentSheet
          visible={paymentSheetVisible}
          event={selectedEvent}
          onDismiss={() => {
            setPaymentSheetVisible(false);
            setSelectedEvent(null);
          }}
          onSuccess={handlePaymentSuccess}
        />
      )}

      <JoinClubModal
        visible={joinModalVisible}
        onDismiss={() => setJoinModalVisible(false)}
        onJoin={handleJoinFromModal}
        clubName={selectedClub?.name || ''}
        requiresApproval={!selectedClub?.isPublic}
        loading={selectedClub ? actionLoading === selectedClub.id : false}
      />

      <CreateScreen
        visible={createModalVisible}
        onClose={() => {
          setCreateModalVisible(false);
          if (contentType === 'events') {
            loadEvents();
          } else {
            loadClubs();
          }
        }}
        initialType={contentType === 'events' ? 'Event' : 'Club'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  blackBackground: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  headerTitleRow: {
    position: 'relative',
    marginBottom: 4,
  },
  titleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '700',
  },
  dropdownMenu: {
    position: 'absolute',
    top: 48,
    left: 0,
    minWidth: 200,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 1000,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 8,
  },
  dropdownText: {
    fontSize: 16,
    fontWeight: '600',
  },
  tabContainer: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  tabsWrapper: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 6,
  },
  tabActive: {
    backgroundColor: '#8B5CF6',
    borderColor: '#8B5CF6',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#ffffff',
  },
  createButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  searchBarContainer: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
  },
  searchBar: {
    backgroundColor: 'transparent',
    elevation: 0,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  featuredSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 16,
    marginLeft: 16,
  },
  featuredCarousel: {
    paddingLeft: 16,
    paddingRight: 16,
    gap: 16,
  },
  featuredCard: {
    width: FEATURED_CARD_WIDTH,
    height: FEATURED_CARD_HEIGHT,
    borderRadius: 16,
    overflow: 'hidden',
  },
  featuredCardBlur: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    position: 'relative',
  },
  featuredImage: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  featuredGradient: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  featuredContent: {
    flex: 1,
    padding: 16,
    justifyContent: 'space-between',
  },
  featuredBadges: {
    flexDirection: 'row',
    gap: 8,
  },
  attendingBadge: {
    backgroundColor: 'rgba(34, 197, 94, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  attendingBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  priceBadge: {
    backgroundColor: 'rgba(139, 92, 246, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  freeBadge: {
    backgroundColor: 'rgba(34, 197, 94, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  priceBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  featuredInfo: {
    gap: 6,
  },
  featuredDate: {
    fontSize: 12,
    fontWeight: '600',
    color: '#60A5FA',
    letterSpacing: 0.5,
  },
  featuredTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#ffffff',  // Always white on image overlay
    lineHeight: 28,
  },
  featuredClub: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
  },
  featuredFooter: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 4,
  },
  featuredLocation: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  featuredLocationText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '500',
  },
  featuredAttendees: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  featuredAttendeesText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '500',
  },
  eventsSection: {
    paddingHorizontal: 16,
  },
  eventCard: {
    marginBottom: 12,
    borderRadius: 16,
    overflow: 'hidden',
  },
  eventCardBlur: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
  },
  eventCardContent: {
    flexDirection: 'row',
    padding: 12,
    gap: 12,
  },
  eventThumbnail: {
    width: 90,
    height: 90,
    borderRadius: 12,
  },
  eventDateBadge: {
    width: 90,
    height: 90,
    borderRadius: 12,
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    borderWidth: 2,
    borderColor: '#8B5CF6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  eventDateMonth: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8B5CF6',
    letterSpacing: 1,
  },
  eventDateDay: {
    fontSize: 28,
    fontWeight: '800',
  },
  eventDetails: {
    flex: 1,
    gap: 8,
  },
  eventHeader: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  eventClub: {
    fontSize: 13,
    fontWeight: '600',
    color: '#60A5FA',
    marginTop: 2,
  },
  smallAttendingBadge: {
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#22C55E',
  },
  smallAttendingText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#22C55E',
  },
  eventMeta: {
    gap: 4,
  },
  eventMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  eventMetaText: {
    fontSize: 12,
    flex: 1,
  },
  eventFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  eventAttendeesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  eventAttendeesText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#60A5FA',
  },
  eventPrice: {
    fontSize: 14,
    fontWeight: '800',
    color: '#8B5CF6',
  },
  eventFree: {
    fontSize: 13,
    fontWeight: '700',
    color: '#22C55E',
  },
  emptyCard: {
    marginTop: 40,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
  },
  emptyContent: {
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
  },
  // Club styles
  clubCard: {
    marginBottom: 12,
    borderRadius: 16,
    overflow: 'hidden',
  },
  clubCardBlur: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
  },
  clubCardContent: {
    flexDirection: 'row',
    padding: 12,
    gap: 12,
  },
  clubImage: {
    width: 100,
    height: 100,
    borderRadius: 12,
  },
  clubImagePlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 12,
    overflow: 'hidden',
  },
  clubImageGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  clubDetails: {
    flex: 1,
    gap: 8,
  },
  clubHeader: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  badgesColumn: {
    gap: 6,
    alignItems: 'flex-end',
    minWidth: 80,
  },
  clubTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  clubTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  clubCategory: {
    fontSize: 13,
    fontWeight: '600',
    color: '#60A5FA',
    marginTop: 2,
  },
  memberBadge: {
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#22C55E',
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  memberBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#22C55E',
  },
  ownerBadge: {
    backgroundColor: 'rgba(255, 215, 0, 0.2)',
    borderColor: '#FFD700',
  },
  adminBadge: {
    backgroundColor: 'rgba(96, 165, 250, 0.2)',
    borderColor: '#60A5FA',
  },
  subscriberBadge: {
    backgroundColor: 'rgba(76, 175, 80, 0.2)',
    borderColor: '#4CAF50',
  },
  clubDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
  clubFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  clubMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  clubMetaText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#60A5FA',
  },
  privateIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  privateText: {
    fontSize: 11,
    fontWeight: '600',
  },
  categoryContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  categoryContent: {
    gap: 8,
    paddingRight: 16,
  },
  categoryChip: {
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  categoryChipSelected: {
    borderColor: '#60A5FA',
  },
  categoryText: {
    fontSize: 13,
    fontWeight: '600',
  },
  categoryTextSelected: {
    color: '#ffffff',
  },
});
