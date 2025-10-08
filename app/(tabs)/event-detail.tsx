// app/event/[id].tsx
import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Alert, Image, Linking } from 'react-native';
import {
  Text,
  Button,
  Card,
  Chip,
  IconButton,
  Divider,
  useTheme,
  List
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../_layout';
import { getEvents, joinEvent, leaveEvent } from '../../lib/firebase';
import type { Event } from '../../lib/firebase';
import BackButton from '../../components/BackButton';

export default function EventDetailScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const { id } = useLocalSearchParams();
  const eventId = id as string;
  
  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (eventId) {
      loadEventData();
    }
  }, [eventId]);

  const loadEventData = async () => {
    try {
      setLoading(true);
      
      // Load all events and find the specific one
      const eventsResult = await getEvents();
      if (eventsResult.success) {
        const foundEvent = eventsResult.events.find(e => e.id === eventId);
        if (foundEvent) {
          setEvent(foundEvent);
        } else {
          Alert.alert('Error', 'Event not found');
          router.back();
        }
      }
    } catch (error) {
      console.error('Error loading event data:', error);
      Alert.alert('Error', 'Failed to load event information');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinEvent = async () => {
    if (!user || !event) return;
    
    setActionLoading(true);
    try {
      const result = await joinEvent(event.id, user.uid);
      if (result.success) {
        if (result.waitlisted) {
          Alert.alert('Added to Waitlist!', 'You have been added to the waitlist for this event.');
        } else {
          Alert.alert('Success!', 'You have joined the event!');
        }
        await loadEventData(); // Refresh event data
      } else {
        Alert.alert('Error', result.error || 'Failed to join event');
      }
    } catch (error) {
      console.error('Error joining event:', error);
      Alert.alert('Error', 'An unexpected error occurred');
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
              const result = await leaveEvent(event.id, user.uid);
              if (result.success) {
                Alert.alert('Success', 'You have left the event');
                await loadEventData(); // Refresh event data
              } else {
                Alert.alert('Error', result.error || 'Failed to leave event');
              }
            } catch (error) {
              console.error('Error leaving event:', error);
              Alert.alert('Error', 'An unexpected error occurred');
            } finally {
              setActionLoading(false);
            }
          }
        }
      ]
    );
  };

  const openVirtualLink = () => {
    if (event?.virtualLink) {
      Linking.openURL(event.virtualLink);
    }
  };

  const formatDate = (date: any) => {
    if (!date) return '';
    const eventDate = date.toDate ? date.toDate() : new Date(date);
    return eventDate.toLocaleDateString([], { 
      weekday: 'long',
      year: 'numeric',
      month: 'long', 
      day: 'numeric'
    });
  };

  const formatTime = (date: any) => {
    if (!date) return '';
    const eventDate = date.toDate ? date.toDate() : new Date(date);
    return eventDate.toLocaleTimeString([], { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true
    });
  };

  if (loading || !event) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <View style={styles.loadingContainer}>
          <Text variant="bodyLarge">Loading...</Text>
        </View>
      </View>
    );
  }

  const isAttending = user ? event.attendees.includes(user.uid) : false;
  const isWaitlisted = user ? event.waitlist.includes(user.uid) : false;
  const isUpcoming = event.startDate && new Date(event.startDate.toDate ? event.startDate.toDate() : event.startDate) > new Date();
  const isPast = event.endDate && new Date(event.endDate.toDate ? event.endDate.toDate() : event.endDate) < new Date();
  const isCreator = user && event.createdBy === user.uid;
  const isFull = event.maxAttendees && event.attendees.length >= event.maxAttendees;

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Cover Image with Back Button */}
        {event.coverImage && (
          <View style={styles.coverImageContainer}>
            <Image source={{ uri: event.coverImage }} style={styles.coverImage} />
            <View style={styles.backButtonContainer}>
              <BackButton />
            </View>
          </View>
        )}

        {/* Back Button (if no cover image) */}
        {!event.coverImage && (
          <View style={styles.backButtonContainer}>
            <BackButton color="#1B365D" backgroundColor="rgba(27, 54, 93, 0.1)" />
          </View>
        )}

        {/* Event Header */}
        <Card style={styles.headerCard}>
          <Card.Content style={styles.headerContent}>
            <View style={styles.statusRow}>
              {isAttending && (
                <Chip style={[styles.statusChip, { backgroundColor: theme.colors.primary + '20' }]}>
                  <Text style={{ color: theme.colors.primary }}>Attending</Text>
                </Chip>
              )}
              {isWaitlisted && (
                <Chip style={[styles.statusChip, { backgroundColor: theme.colors.tertiary + '20' }]}>
                  <Text style={{ color: theme.colors.tertiary }}>Waitlisted</Text>
                </Chip>
              )}
              {isPast && (
                <Chip style={[styles.statusChip, { backgroundColor: theme.colors.outline + '20' }]}>
                  <Text style={{ color: theme.colors.outline }}>Past Event</Text>
                </Chip>
              )}
            </View>

            <Text variant="headlineMedium" style={styles.eventTitle}>
              {event.title}
            </Text>

            <Text variant="titleMedium" style={[styles.clubName, { color: theme.colors.primary }]}>
              by {event.clubName}
            </Text>

            <Text variant="bodyLarge" style={styles.description}>
              {event.description}
            </Text>

            {/* Action Buttons */}
            {user && isUpcoming && !isCreator && (
              <View style={styles.actionButtons}>
                {isAttending || isWaitlisted ? (
                  <Button
                    mode="outlined"
                    onPress={handleLeaveEvent}
                    loading={actionLoading}
                    style={styles.actionButton}
                  >
                    {isWaitlisted ? 'Leave Waitlist' : 'Leave Event'}
                  </Button>
                ) : (
                  <Button
                    mode="contained"
                    onPress={handleJoinEvent}
                    loading={actionLoading}
                    disabled={isFull}
                    style={styles.actionButton}
                  >
                    {isFull ? 'Event Full' : 'Join Event'}
                  </Button>
                )}
              </View>
            )}
          </Card.Content>
        </Card>

        {/* Event Details */}
        <Card style={styles.detailsCard}>
          <Card.Content style={styles.detailsContent}>
            <Text variant="titleLarge" style={styles.sectionTitle}>
              Event Details
            </Text>

            <List.Item
              title="Date"
              description={formatDate(event.startDate)}
              left={props => <List.Icon {...props} icon="calendar" />}
            />

            <List.Item
              title="Time"
              description={`${formatTime(event.startDate)} - ${formatTime(event.endDate)}`}
              left={props => <List.Icon {...props} icon="clock" />}
            />

            <List.Item
              title="Location"
              description={event.isVirtual ? 'Virtual Event' : event.location}
              left={props => <List.Icon {...props} icon={event.isVirtual ? "video" : "map-marker"} />}
              right={event.isVirtual && event.virtualLink && isAttending ? 
                () => (
                  <IconButton
                    icon="open-in-new"
                    onPress={openVirtualLink}
                  />
                ) : undefined
              }
            />

            <List.Item
              title="Attendees"
              description={`${event.attendees.length}${event.maxAttendees ? ` / ${event.maxAttendees}` : ''} attending`}
              left={props => <List.Icon {...props} icon="account-group" />}
            />

            {event.waitlist.length > 0 && (
              <List.Item
                title="Waitlist"
                description={`${event.waitlist.length} people waiting`}
                left={props => <List.Icon {...props} icon="account-clock" />}
              />
            )}

            {event.ticketPrice && (
              <List.Item
                title="Price"
                description={`$${event.ticketPrice} ${event.currency || 'USD'}`}
                left={props => <List.Icon {...props} icon="currency-usd" />}
              />
            )}

            {event.requiresApproval && (
              <List.Item
                title="Approval Required"
                description="Attendance requires approval from organizers"
                left={props => <List.Icon {...props} icon="shield-check" />}
              />
            )}
          </Card.Content>
        </Card>

        {/* Virtual Event Link */}
        {event.isVirtual && event.virtualLink && isAttending && (
          <Card style={styles.virtualCard}>
            <Card.Content style={styles.virtualContent}>
              <Text variant="titleMedium" style={styles.virtualTitle}>
                Join Virtual Event
              </Text>
              <Text variant="bodyMedium" style={styles.virtualDescription}>
                Click the button below to join the virtual event
              </Text>
              <Button
                mode="contained"
                onPress={openVirtualLink}
                icon="video"
                style={styles.virtualButton}
              >
                Join Event
              </Button>
            </Card.Content>
          </Card>
        )}

        {/* Tags */}
        {event.tags && event.tags.length > 0 && (
          <Card style={styles.tagsCard}>
            <Card.Content style={styles.tagsContent}>
              <Text variant="titleMedium" style={styles.sectionTitle}>
                Tags
              </Text>
              <View style={styles.tags}>
                {event.tags.map((tag) => (
                  <Chip key={tag} style={styles.tag}>
                    {tag}
                  </Chip>
                ))}
              </View>
            </Card.Content>
          </Card>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  coverImageContainer: {
    position: 'relative',
  },
  coverImage: {
    width: '100%',
    height: 200,
  },
  backButtonContainer: {
    position: 'absolute',
    top: 50,
    left: 16,
    zIndex: 10,
  },
  headerCard: {
    margin: 16,
    marginTop: -40,
    zIndex: 1,
  },
  headerContent: {
    padding: 20,
  },
  statusRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  statusChip: {
    marginRight: 8,
  },
  eventTitle: {
    fontWeight: 'bold',
    marginBottom: 8,
  },
  clubName: {
    fontWeight: '600',
    marginBottom: 16,
  },
  description: {
    marginBottom: 20,
    lineHeight: 24,
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  actionButton: {
    flex: 1,
  },
  detailsCard: {
    margin: 16,
    marginTop: 8,
  },
  detailsContent: {
    padding: 20,
  },
  sectionTitle: {
    fontWeight: 'bold',
    marginBottom: 16,
  },
  virtualCard: {
    margin: 16,
    marginTop: 8,
    backgroundColor: '#E3F2FD',
  },
  virtualContent: {
    padding: 20,
    alignItems: 'center',
  },
  virtualTitle: {
    fontWeight: 'bold',
    marginBottom: 8,
  },
  virtualDescription: {
    textAlign: 'center',
    marginBottom: 16,
    opacity: 0.8,
  },
  virtualButton: {
    minWidth: 150,
  },
  tagsCard: {
    margin: 16,
    marginTop: 8,
    marginBottom: 32,
  },
  tagsContent: {
    padding: 20,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  tag: {
    marginRight: 8,
    marginBottom: 8,
  },
});
