import React, { useState, useEffect } from 'react';
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
import { Text, IconButton, Searchbar } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { router } from 'expo-router';
import { useAuth } from '../../_layout';
import { getEvents, joinEvent, leaveEvent } from '../../../lib/firebase';
import type { Event } from '../../../lib/firebase';
import PaymentSheet from '../../../components/PaymentSheet';
import CreateScreen from '../../../components/CreateScreen';

const { width } = Dimensions.get('window');
const FEATURED_CARD_WIDTH = width * 0.75;
const FEATURED_CARD_HEIGHT = 220;

export default function EventsScreen() {
  const { user } = useAuth();

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

  useEffect(() => {
    loadEvents();
  }, [user]);

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
      console.error('Error loading events:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadEvents();
    setRefreshing(false);
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
      console.error('Error joining event:', error);
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
            console.error('Error leaving event:', error);
            Alert.alert('Error', 'An unexpected error occurred');
          } finally {
            setActionLoading(null);
          }
        },
      },
    ]);
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
        <BlurView intensity={20} tint="dark" style={styles.featuredCardBlur}>
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
                  <Text style={styles.featuredLocationText} numberOfLines={1}>
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
        <BlurView intensity={20} tint="dark" style={styles.eventCardBlur}>
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
                <Text style={styles.eventDateDay}>
                  {formatDate(event.startDate).split(' ')[2]}
                </Text>
              </View>
            )}

            {/* Right: Event details */}
            <View style={styles.eventDetails}>
              <View style={styles.eventHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.eventTitle} numberOfLines={1}>
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
                  <Ionicons name="time-outline" size={14} color="rgba(255,255,255,0.6)" />
                  <Text style={styles.eventMetaText}>
                    {formatDate(event.startDate)} • {formatTime(event.startDate)}
                  </Text>
                </View>
                <View style={styles.eventMetaRow}>
                  <Ionicons
                    name={event.isVirtual ? 'globe-outline' : 'location-outline'}
                    size={14}
                    color="rgba(255,255,255,0.6)"
                  />
                  <Text style={styles.eventMetaText} numberOfLines={1}>
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
    <View style={styles.container}>
      {/* Black Background */}
      <View style={StyleSheet.absoluteFill}>
        <View style={styles.blackBackground} />
      </View>

      {/* Subtle Gradient Overlay */}
      <LinearGradient
        colors={[
          'rgba(139, 92, 246, 0.3)',
          'rgba(96, 165, 250, 0.1)',
          'rgba(0, 0, 0, 0)',
        ]}
        locations={[0, 0.3, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Events</Text>

          {/* Tab Switcher with Create Button */}
          <View style={styles.tabContainer}>
            <View style={styles.tabsWrapper}>
              <TouchableOpacity
                style={[styles.tab, activeTab === 'upcoming' && styles.tabActive]}
                onPress={() => setActiveTab('upcoming')}
              >
                <IconButton
                  icon={activeTab === 'upcoming' ? 'calendar' : 'calendar-outline'}
                  iconColor={activeTab === 'upcoming' ? '#fff' : 'rgba(255,255,255,0.6)'}
                  size={18}
                  style={{ margin: 0 }}
                />
                <Text
                  style={[
                    styles.tabText,
                    activeTab === 'upcoming' && styles.tabTextActive,
                  ]}
                >
                  Upcoming
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.tab, activeTab === 'my-events' && styles.tabActive]}
                onPress={() => setActiveTab('my-events')}
              >
                <IconButton
                  icon={activeTab === 'my-events' ? 'ticket' : 'ticket-outline'}
                  iconColor={activeTab === 'my-events' ? '#fff' : 'rgba(255,255,255,0.6)'}
                  size={18}
                  style={{ margin: 0 }}
                />
                <Text
                  style={[
                    styles.tabText,
                    activeTab === 'my-events' && styles.tabTextActive,
                  ]}
                >
                  My Events
                </Text>
              </TouchableOpacity>
            </View>

            {/* Create Button */}
            <TouchableOpacity
              onPress={() => setCreateModalVisible(true)}
              activeOpacity={0.7}
            >
              <BlurView intensity={20} tint="dark" style={styles.createButton}>
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
          <BlurView intensity={20} tint="dark" style={styles.searchBarContainer}>
            <Searchbar
              placeholder="Search events..."
              onChangeText={setSearchQuery}
              value={searchQuery}
              style={styles.searchBar}
              iconColor="rgba(255,255,255,0.7)"
              placeholderTextColor="rgba(255,255,255,0.5)"
              inputStyle={{ color: '#fff' }}
            />
          </BlurView>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#fff"
            />
          }
        >
          {/* Featured Carousel - Only show on Upcoming tab */}
          {activeTab === 'upcoming' && featuredEvents.length > 0 && (
            <View style={styles.featuredSection}>
              <Text style={styles.sectionTitle}>Featured Events</Text>
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
            <Text style={styles.sectionTitle}>
              {activeTab === 'upcoming' ? 'All Events' : 'Your Events'}
            </Text>

            {displayEvents.length > 0 ? (
              displayEvents.map((event) => renderEventCard(event))
            ) : (
              <BlurView intensity={20} tint="dark" style={styles.emptyCard}>
                <View style={styles.emptyContent}>
                  <IconButton
                    icon="calendar-blank-outline"
                    size={64}
                    iconColor="rgba(255,255,255,0.5)"
                  />
                  <Text style={styles.emptyTitle}>No events found</Text>
                  <Text style={styles.emptyText}>
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

      <CreateScreen
        visible={createModalVisible}
        onClose={() => {
          setCreateModalVisible(false);
          loadEvents();
        }}
        initialType="Event"
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
    backgroundColor: '#000000',
  },
  safeArea: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 4,
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
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    gap: 6,
  },
  tabActive: {
    backgroundColor: '#8B5CF6',
    borderColor: '#8B5CF6',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
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
    borderColor: 'rgba(255,255,255,0.1)',
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
    borderColor: 'rgba(255,255,255,0.1)',
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
    color: '#ffffff',
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
    borderColor: 'rgba(255,255,255,0.1)',
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
    color: '#ffffff',
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
    borderColor: 'rgba(255,255,255,0.1)',
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
    color: '#ffffff',
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
    color: '#ffffff',
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
    color: 'rgba(255,255,255,0.6)',
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
    borderColor: 'rgba(255,255,255,0.1)',
  },
  emptyContent: {
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.6)',
  },
});
