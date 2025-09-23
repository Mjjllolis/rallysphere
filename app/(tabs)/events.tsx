// app/(tabs)/events.tsx
import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Alert, RefreshControl } from 'react-native';
import { 
  Text, 
  useTheme,
  Searchbar,
  Button,
  Card,
  SegmentedButtons,
  IconButton
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuth } from '../_layout';
import { getEvents, joinEvent, leaveEvent, getClubs } from '../../lib/firebase';
import type { Event, Club } from '../../lib/firebase';
import EventCard from '../../components/EventCard';

const TIME_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
];

export default function EventsPage() {
  const theme = useTheme();
  const { user } = useAuth();
  
  const [activeTab, setActiveTab] = useState<'discover' | 'my-events'>('discover');
  const [allEvents, setAllEvents] = useState<Event[]>([]);
  const [myEvents, setMyEvents] = useState<Event[]>([]);
  const [filteredEvents, setFilteredEvents] = useState<Event[]>([]);
  const [userClubs, setUserClubs] = useState<Club[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [timeFilter, setTimeFilter] = useState('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  useEffect(() => {
    filterEvents();
  }, [allEvents, myEvents, searchQuery, timeFilter, activeTab]);

  const loadData = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      
      // Load user's clubs
      const clubsResult = await getClubs(user.uid);
      if (clubsResult.success) {
        setUserClubs(clubsResult.clubs);
      }
      
      // Load all public events for discover tab
      const eventsResult = await getEvents();
      if (eventsResult.success) {
        setAllEvents(eventsResult.events);
        
        // Filter events user is attending for my events tab
        const attendingEvents = eventsResult.events.filter(event => 
          event.attendees.includes(user.uid) || event.waitlist.includes(user.uid)
        );
        setMyEvents(attendingEvents);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const filterEvents = () => {
    let filtered = activeTab === 'discover' ? allEvents : myEvents;
    
    // Filter by time
    if (timeFilter !== 'all') {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekFromNow = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
      const monthFromNow = new Date(today.getFullYear(), today.getMonth() + 1, today.getDate());
      
      filtered = filtered.filter(event => {
        const eventDate = event.startDate.toDate ? event.startDate.toDate() : new Date(event.startDate);
        
        switch (timeFilter) {
          case 'today':
            return eventDate >= today && eventDate < new Date(today.getTime() + 24 * 60 * 60 * 1000);
          case 'week':
            return eventDate >= today && eventDate <= weekFromNow;
          case 'month':
            return eventDate >= today && eventDate <= monthFromNow;
          default:
            return true;
        }
      });
    }
    
    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(event => 
        event.title.toLowerCase().includes(query) ||
        event.description.toLowerCase().includes(query) ||
        event.clubName.toLowerCase().includes(query) ||
        event.location.toLowerCase().includes(query)
      );
    }
    
    // Sort by start date
    filtered.sort((a, b) => {
      const dateA = a.startDate.toDate ? a.startDate.toDate() : new Date(a.startDate);
      const dateB = b.startDate.toDate ? b.startDate.toDate() : new Date(b.startDate);
      return dateA.getTime() - dateB.getTime();
    });
    
    setFilteredEvents(filtered);
  };

  const handleJoinEvent = async (eventId: string) => {
    if (!user) return;
    
    setActionLoading(eventId);
    try {
      const result = await joinEvent(eventId, user.uid);
      if (result.success) {
        if (result.waitlisted) {
          Alert.alert('Added to Waitlist!', 'You have been added to the waitlist for this event.');
        } else {
          Alert.alert('Success!', 'You have joined the event!');
        }
        await loadData(); // Refresh events
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
                await loadData(); // Refresh events
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

  if (!user) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <View style={styles.emptyState}>
          <Text variant="headlineSmall">Please log in to view events</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.header}>
        <IconButton
          icon="arrow-left"
          size={24}
          onPress={() => router.back()}
          style={styles.backButton}
        />
        <Text variant="headlineMedium" style={[styles.title, { color: theme.colors.onSurface }]}>
          Events
        </Text>
        <View style={styles.spacer} />
      </View>
        
      {/* Tab Switcher */}
      <View style={styles.tabContainer}>
        <Button
          mode={activeTab === 'discover' ? 'contained' : 'outlined'}
          onPress={() => setActiveTab('discover')}
          style={styles.tabButton}
          compact
        >
          Discover
        </Button>
        <Button
          mode={activeTab === 'my-events' ? 'contained' : 'outlined'}
          onPress={() => setActiveTab('my-events')}
          style={styles.tabButton}
          compact
        >
          My Events ({myEvents.length})
        </Button>
      </View>

      <View style={styles.filtersContainer}>
        {/* Search Bar */}
        <Searchbar
          placeholder="Search events..."
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={styles.searchBar}
        />
        
        {/* Time Filter */}
        <SegmentedButtons
          value={timeFilter}
          onValueChange={setTimeFilter}
          buttons={TIME_FILTERS}
          style={styles.timeFilter}
        />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {filteredEvents.length > 0 ? (
          filteredEvents.map((event) => {
            const isAttending = event.attendees.includes(user.uid);
            const isWaitlisted = event.waitlist.includes(user.uid);
            
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
                {activeTab === 'my-events' ? 'No events yet' : 'No events found'}
              </Text>
              <Text variant="bodyMedium" style={styles.emptyText}>
                {activeTab === 'my-events' 
                  ? 'Join some events to get started!' 
                  : 'Try adjusting your search or filters'
                }
              </Text>
              {activeTab === 'my-events' && (
                <Button
                  mode="contained"
                  onPress={() => setActiveTab('discover')}
                  style={styles.discoverButton}
                >
                  Discover Events
                </Button>
              )}
            </Card.Content>
          </Card>
        )}
      </ScrollView>
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
    padding: 20,
    paddingBottom: 10,
  },
  backButton: {
    margin: 0,
  },
  spacer: {
    width: 40, // Same width as back button to center the title
  },
  title: {
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
  },
  tabContainer: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  tabButton: {
    flex: 1,
  },
  filtersContainer: {
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  searchBar: {
    marginBottom: 12,
  },
  timeFilter: {
    marginBottom: 12,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyCard: {
    margin: 20,
  },
  emptyContent: {
    alignItems: 'center',
    padding: 20,
  },
  emptyTitle: {
    marginBottom: 8,
    fontWeight: 'bold',
  },
  emptyText: {
    textAlign: 'center',
    marginBottom: 16,
    opacity: 0.7,
  },
  discoverButton: {
    marginTop: 8,
  },
});
