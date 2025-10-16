import React, { useState, useEffect } from 'react';
import { StyleSheet, View, ScrollView, RefreshControl, Alert } from 'react-native';
import { Text, Button, useTheme, IconButton, Card, Chip, Searchbar } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../_layout';
import { getEvents, joinEvent, leaveEvent } from '../../../lib/firebase';
import type { Event } from '../../../lib/firebase';
import EventCard from '../../../components/EventCard';
import PaymentSheet from '../../../components/PaymentSheet';

export default function EventsScreen() {
  const theme = useTheme();
  const { user } = useAuth();

  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [activeTab, setActiveTab] = useState<'upcoming' | 'past' | 'my-events'>('upcoming');
  const [allEvents, setAllEvents] = useState<Event[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<Event[]>([]);
  const [pastEvents, setPastEvents] = useState<Event[]>([]);
  const [myEvents, setMyEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [paymentSheetVisible, setPaymentSheetVisible] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);

  useEffect(() => {
    loadEvents();
  }, [user]);

  const loadEvents = async () => {
    try {
      setLoading(true);
      const result = await getEvents();

      if (result.success) {
        const now = new Date();
        const upcoming = result.events.filter(event => {
          const eventDate = event.startDate?.toDate ? event.startDate.toDate() : new Date(event.startDate);
          return eventDate >= now;
        });

        const past = result.events.filter(event => {
          const eventDate = event.endDate?.toDate ? event.endDate.toDate() : new Date(event.endDate);
          return eventDate < now;
        });

        const userEvents = user ? result.events.filter(event =>
          event.attendees.includes(user.uid) || event.waitlist.includes(user.uid)
        ) : [];

        setAllEvents(result.events);
        setUpcomingEvents(upcoming);
        setPastEvents(past);
        setMyEvents(userEvents);
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

    // Find the event
    const event = allEvents.find(e => e.id === eventId);
    if (!event) {
      Alert.alert('Error', 'Event not found');
      return;
    }

    // If event has a ticket price, show payment sheet
    if (event.ticketPrice && event.ticketPrice > 0) {
      setSelectedEvent(event);
      setPaymentSheetVisible(true);
      return;
    }

    // Otherwise, join event directly (free event)
    setActionLoading(eventId);
    try {
      const result = await joinEvent(eventId, user.uid);
      if (result.success) {
        Alert.alert('Success!', result.waitlisted ? 'You have been added to the waitlist!' : 'You have joined the event!');
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
    // Reload events to reflect the updated attendee list
    await loadEvents();
  };

  const handleLeaveEvent = async (eventId: string) => {
    if (!user) return;

    Alert.alert(
      'Leave Event',
      'Are you sure you want to leave this event?',
      [
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
          }
        }
      ]
    );
  };

  const filterEvents = (events: Event[]) => {
    if (!searchQuery) return events;
    const query = searchQuery.toLowerCase();
    return events.filter(event =>
      event.title.toLowerCase().includes(query) ||
      event.description.toLowerCase().includes(query) ||
      event.clubName.toLowerCase().includes(query) ||
      (event.tags && event.tags.some(tag => tag.toLowerCase().includes(query)))
    );
  };

  const getCurrentEvents = () => {
    switch (activeTab) {
      case 'upcoming':
        return filterEvents(upcomingEvents);
      case 'past':
        return filterEvents(pastEvents);
      case 'my-events':
        return filterEvents(myEvents);
      default:
        return [];
    }
  };

  const displayEvents = getCurrentEvents();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.header}>
        <Text variant="headlineMedium" style={[styles.title, { color: theme.colors.onSurface }]}>
          Events
        </Text>

        <View style={styles.headerIcons}>
          <IconButton
            icon={viewMode === 'list' ? 'calendar' : 'view-list'}
            size={24}
            onPress={() => setViewMode(viewMode === 'list' ? 'calendar' : 'list')}
          />
        </View>
      </View>

      <View style={styles.tabsWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsRow}
        >
          <Chip
            selected={activeTab === 'upcoming'}
            onPress={() => setActiveTab('upcoming')}
            style={styles.tab}
            showSelectedOverlay
          >
            Upcoming ({upcomingEvents.length})
          </Chip>
          <Chip
            selected={activeTab === 'past'}
            onPress={() => setActiveTab('past')}
            style={styles.tab}
            showSelectedOverlay
          >
            Past ({pastEvents.length})
          </Chip>
          <Chip
            selected={activeTab === 'my-events'}
            onPress={() => setActiveTab('my-events')}
            style={styles.tab}
            showSelectedOverlay
          >
            My Events ({myEvents.length})
          </Chip>
        </ScrollView>
      </View>

      <View style={styles.searchContainer}>
        <Searchbar
          placeholder="Search events..."
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={styles.searchBar}
        />
      </View>

      {viewMode === 'list' ? (
        <ScrollView
          style={styles.scrollView}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {displayEvents.length > 0 ? (
            displayEvents.map((event) => {
              const isAttending = user && event.attendees.includes(user.uid);
              const isWaitlisted = user && event.waitlist.includes(user.uid);

              return (
                <EventCard
                  key={event.id}
                  event={event}
                  isAttending={isAttending}
                  isWaitlisted={isWaitlisted}
                  onJoin={handleJoinEvent}
                  onLeave={handleLeaveEvent}
                  loading={actionLoading === event.id}
                />
              );
            })
          ) : (
            <Card style={styles.emptyCard}>
              <Card.Content style={styles.emptyContent}>
                <Text variant="titleMedium" style={styles.emptyTitle}>
                  No events found
                </Text>
                <Text variant="bodyMedium" style={styles.emptyText}>
                  {activeTab === 'my-events'
                    ? 'Join some events to see them here!'
                    : searchQuery
                    ? 'Try adjusting your search'
                    : 'Check back later for new events'}
                </Text>
              </Card.Content>
            </Card>
          )}
        </ScrollView>
      ) : (
        <View style={styles.calendarContainer}>
          <Card style={styles.calendarPlaceholder}>
            <Card.Content style={styles.emptyContent}>
              <MaterialCommunityIcons name="calendar-month" size={64} color={theme.colors.primary} />
              <Text variant="titleMedium" style={styles.emptyTitle}>
                Calendar View
              </Text>
              <Text variant="bodyMedium" style={styles.emptyText}>
                Calendar view coming soon!
              </Text>
            </Card.Content>
          </Card>
        </View>
      )}

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
    </SafeAreaView>
  );
}


const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 10,
  },
  title: {
    fontWeight: 'bold',
  },
  headerIcons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tabsWrapper: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  tabsRow: {
    paddingRight: 20,
  },
  tab: {
    marginRight: 8,
  },
  searchContainer: {
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  searchBar: {
    elevation: 1,
  },
  scrollView: {
    flex: 1,
  },
  calendarContainer: {
    flex: 1,
    padding: 20,
  },
  calendarPlaceholder: {
    flex: 1,
    justifyContent: 'center',
  },
  emptyCard: {
    margin: 20,
  },
  emptyContent: {
    alignItems: 'center',
    padding: 20,
  },
  emptyTitle: {
    marginTop: 16,
    marginBottom: 8,
    fontWeight: 'bold',
  },
  emptyText: {
    textAlign: 'center',
    opacity: 0.7,
  },
});
