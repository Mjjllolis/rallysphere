// app/club/[id]/event-checkin.tsx - Event Check-in Admin Screen
import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  Alert,
} from 'react-native';
import {
  Text,
  IconButton,
  ActivityIndicator,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../_layout';
import {
  getClub,
  getEvents,
  getEventAttendees,
  checkInAttendee,
} from '../../../lib/firebase';
import type { Club, Event } from '../../../lib/firebase';

interface Attendee {
  userId: string;
  displayName: string;
  email: string;
  photoURL: string | null;
  profileEmoji: string | null;
  isCheckedIn: boolean;
}

export default function EventCheckinScreen() {
  const { user } = useAuth();
  const { id, eventId: initialEventId } = useLocalSearchParams();
  const clubId = id as string;

  const [club, setClub] = useState<Club | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingAttendees, setLoadingAttendees] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [checkingIn, setCheckingIn] = useState<string | null>(null);
  const [checkedInCount, setCheckedInCount] = useState(0);

  useEffect(() => {
    loadInitialData();
  }, [clubId]);

  useEffect(() => {
    if (selectedEvent) {
      loadAttendees(selectedEvent.id);
    }
  }, [selectedEvent]);

  const loadInitialData = async () => {
    try {
      setLoading(true);

      const clubResult = await getClub(clubId);
      if (clubResult.success && clubResult.club) {
        setClub(clubResult.club);

        if (user && !clubResult.club.admins.includes(user.uid)) {
          Alert.alert('Access Denied', 'You must be an admin to access this page');
          router.back();
          return;
        }
      } else {
        router.back();
        return;
      }

      // Load club events
      const eventsResult = await getEvents(clubId);
      if (eventsResult.success && eventsResult.events) {
        // Sort by start date, most recent first
        const sortedEvents = eventsResult.events.sort((a, b) => {
          const dateA = a.startDate?.toDate?.() || new Date(0);
          const dateB = b.startDate?.toDate?.() || new Date(0);
          return dateB.getTime() - dateA.getTime();
        });
        setEvents(sortedEvents);

        // Auto-select event if provided in URL or select first event
        if (initialEventId) {
          const event = sortedEvents.find(e => e.id === initialEventId);
          if (event) setSelectedEvent(event);
        } else if (sortedEvents.length > 0) {
          setSelectedEvent(sortedEvents[0]);
        }
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAttendees = async (eventId: string) => {
    try {
      setLoadingAttendees(true);
      const result = await getEventAttendees(eventId);
      if (result.success) {
        setAttendees(result.attendees);
        setCheckedInCount(result.checkedInCount || 0);
      }
    } catch (error) {
      console.error('Error loading attendees:', error);
    } finally {
      setLoadingAttendees(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    if (selectedEvent) {
      await loadAttendees(selectedEvent.id);
    }
    setRefreshing(false);
  };

  const handleCheckIn = async (attendee: Attendee) => {
    if (!selectedEvent || attendee.isCheckedIn) return;

    setCheckingIn(attendee.userId);
    try {
      const result = await checkInAttendee(selectedEvent.id, attendee.userId);
      if (result.success) {
        // Update local state
        setAttendees(prev =>
          prev.map(a =>
            a.userId === attendee.userId ? { ...a, isCheckedIn: true } : a
          )
        );
        setCheckedInCount(prev => prev + 1);

        // Show success with credits info if applicable
        if (selectedEvent.rallyCreditsAwarded && selectedEvent.rallyCreditsAwarded > 0) {
          Alert.alert(
            'Checked In!',
            `${attendee.displayName} has been checked in and awarded ${selectedEvent.rallyCreditsAwarded} Rally Credits.`
          );
        } else {
          Alert.alert('Checked In!', `${attendee.displayName} has been checked in.`);
        }
      } else {
        Alert.alert('Error', result.error || 'Failed to check in attendee');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'An error occurred');
    } finally {
      setCheckingIn(null);
    }
  };

  const filteredAttendees = attendees.filter(
    a =>
      a.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatEventDate = (event: Event) => {
    const date = event.startDate?.toDate?.();
    if (!date) return '';
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={StyleSheet.absoluteFill}>
          <View style={styles.blackBackground} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#fff" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={StyleSheet.absoluteFill}>
        <View style={styles.blackBackground} />
      </View>

      <LinearGradient
        colors={['rgba(27, 54, 93, 0.3)', 'rgba(96, 165, 250, 0.1)', 'rgba(0, 0, 0, 0)']}
        locations={[0, 0.3, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <BlurView intensity={40} tint="dark" style={styles.backButtonBlur}>
              <IconButton icon="arrow-left" size={24} iconColor="#fff" />
            </BlurView>
          </TouchableOpacity>
          <View style={styles.headerInfo}>
            <Text style={styles.headerTitle}>Event Check-in</Text>
            <Text style={styles.headerSubtitle}>{club?.name}</Text>
          </View>
        </View>

        {/* Event Selector */}
        <View style={styles.eventSelectorContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.eventSelectorScroll}
          >
            {events.map(event => (
              <TouchableOpacity
                key={event.id}
                onPress={() => setSelectedEvent(event)}
                style={[
                  styles.eventChip,
                  selectedEvent?.id === event.id && styles.eventChipSelected,
                ]}
              >
                <Text
                  style={[
                    styles.eventChipText,
                    selectedEvent?.id === event.id && styles.eventChipTextSelected,
                  ]}
                  numberOfLines={1}
                >
                  {event.title}
                </Text>
                <Text style={styles.eventChipDate}>{formatEventDate(event)}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {selectedEvent ? (
          <>
            {/* Stats Bar */}
            <View style={styles.statsBar}>
              <BlurView intensity={20} tint="dark" style={styles.statsBarBlur}>
                <View style={styles.statsBarContent}>
                  <View style={styles.statItem}>
                    <Text style={styles.statNumber}>{attendees.length}</Text>
                    <Text style={styles.statLabel}>Attendees</Text>
                  </View>
                  <View style={styles.statDivider} />
                  <View style={styles.statItem}>
                    <Text style={styles.statNumberGreen}>{checkedInCount}</Text>
                    <Text style={styles.statLabel}>Checked In</Text>
                  </View>
                  <View style={styles.statDivider} />
                  <View style={styles.statItem}>
                    <Text style={styles.statNumberOrange}>
                      {attendees.length - checkedInCount}
                    </Text>
                    <Text style={styles.statLabel}>Remaining</Text>
                  </View>
                  {selectedEvent.rallyCreditsAwarded && selectedEvent.rallyCreditsAwarded > 0 && (
                    <>
                      <View style={styles.statDivider} />
                      <View style={styles.statItem}>
                        <Text style={styles.statNumberGold}>
                          {selectedEvent.rallyCreditsAwarded}
                        </Text>
                        <Text style={styles.statLabel}>Credits/Person</Text>
                      </View>
                    </>
                  )}
                </View>
              </BlurView>
            </View>

            {/* Search Bar */}
            <View style={styles.searchContainer}>
              <BlurView intensity={20} tint="dark" style={styles.searchBlur}>
                <IconButton icon="magnify" size={20} iconColor="rgba(255,255,255,0.5)" />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search attendees..."
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery('')}>
                    <IconButton icon="close" size={18} iconColor="rgba(255,255,255,0.5)" />
                  </TouchableOpacity>
                )}
              </BlurView>
            </View>

            {/* Attendees List */}
            <ScrollView
              contentContainerStyle={styles.scrollContent}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />
              }
            >
              {loadingAttendees ? (
                <View style={styles.loadingAttendees}>
                  <ActivityIndicator size="small" color="#fff" />
                  <Text style={styles.loadingText}>Loading attendees...</Text>
                </View>
              ) : filteredAttendees.length === 0 ? (
                <View style={styles.emptyState}>
                  <IconButton icon="account-group" size={48} iconColor="rgba(255,255,255,0.3)" />
                  <Text style={styles.emptyText}>
                    {searchQuery ? 'No attendees match your search' : 'No attendees yet'}
                  </Text>
                </View>
              ) : (
                filteredAttendees.map(attendee => (
                  <TouchableOpacity
                    key={attendee.userId}
                    onPress={() => handleCheckIn(attendee)}
                    disabled={attendee.isCheckedIn || checkingIn === attendee.userId}
                    activeOpacity={0.7}
                  >
                    <BlurView intensity={20} tint="dark" style={styles.attendeeCard}>
                      <View style={styles.attendeeCardInner}>
                        {/* Avatar */}
                        <View
                          style={[
                            styles.avatar,
                            attendee.isCheckedIn && styles.avatarCheckedIn,
                          ]}
                        >
                          {attendee.profileEmoji ? (
                            <Text style={styles.avatarEmoji}>{attendee.profileEmoji}</Text>
                          ) : (
                            <Text style={styles.avatarText}>
                              {attendee.displayName.charAt(0).toUpperCase()}
                            </Text>
                          )}
                        </View>

                        {/* Info */}
                        <View style={styles.attendeeInfo}>
                          <Text style={styles.attendeeName}>{attendee.displayName}</Text>
                          <Text style={styles.attendeeEmail}>{attendee.email}</Text>
                        </View>

                        {/* Status/Action */}
                        {checkingIn === attendee.userId ? (
                          <ActivityIndicator size="small" color="#60A5FA" />
                        ) : attendee.isCheckedIn ? (
                          <View style={styles.checkedInBadge}>
                            <IconButton icon="check" size={16} iconColor="#10B981" />
                            <Text style={styles.checkedInText}>Checked In</Text>
                          </View>
                        ) : (
                          <View style={styles.checkInButton}>
                            <Text style={styles.checkInButtonText}>Check In</Text>
                          </View>
                        )}
                      </View>
                    </BlurView>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </>
        ) : (
          <View style={styles.emptyState}>
            <IconButton icon="calendar-blank" size={48} iconColor="rgba(255,255,255,0.3)" />
            <Text style={styles.emptyText}>No events to check in</Text>
          </View>
        )}
      </SafeAreaView>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  backButton: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  backButtonBlur: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerInfo: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#ffffff',
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
  },
  eventSelectorContainer: {
    paddingVertical: 8,
  },
  eventSelectorScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  eventChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginRight: 8,
  },
  eventChipSelected: {
    backgroundColor: '#60A5FA',
  },
  eventChipText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    fontWeight: '600',
    maxWidth: 150,
  },
  eventChipTextSelected: {
    color: '#fff',
  },
  eventChipDate: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    marginTop: 2,
  },
  statsBar: {
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  statsBarBlur: {
    borderRadius: 16,
  },
  statsBarContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 8,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: '#60A5FA',
  },
  statNumberGreen: {
    fontSize: 24,
    fontWeight: '700',
    color: '#10B981',
  },
  statNumberOrange: {
    fontSize: 24,
    fontWeight: '700',
    color: '#F59E0B',
  },
  statNumberGold: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFD700',
  },
  statLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  searchContainer: {
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  searchBlur: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 8,
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    paddingVertical: 12,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  loadingAttendees: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 32,
  },
  loadingText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 16,
    marginTop: 8,
  },
  attendeeCard: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  attendeeCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(96, 165, 250, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarCheckedIn: {
    backgroundColor: 'rgba(16, 185, 129, 0.3)',
  },
  avatarEmoji: {
    fontSize: 24,
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  attendeeInfo: {
    flex: 1,
  },
  attendeeName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  attendeeEmail: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 2,
  },
  checkedInBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  checkedInText: {
    color: '#10B981',
    fontSize: 12,
    fontWeight: '600',
  },
  checkInButton: {
    backgroundColor: '#60A5FA',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  checkInButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
