// app/event/[id].tsx
import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Alert, Image, Linking, ImageBackground, Dimensions, TouchableOpacity, ActivityIndicator } from 'react-native';
import {
  Text,
  Button,
  Card,
  Chip,
  IconButton,
  Divider,
  useTheme,
  List,
  Surface,
  Menu
} from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../_layout';
import { getEventById, joinEvent, leaveEvent, getUserRallyCredits, getClub, getUserProfile } from '../../lib/firebase';
import type { Event, UserRallyCredits, UserProfile } from '../../lib/firebase';
import BackButton from '../../components/BackButton';
import PaymentSheet from '../../components/PaymentSheet';
import RallyCreditsPaidModal from '../../components/RallyCreditsPaidModal';

const { width } = Dimensions.get('window');

export default function EventDetailScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const { id } = useLocalSearchParams();
  const eventId = id as string;
  
  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [userCredits, setUserCredits] = useState<UserRallyCredits | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [paymentSheetVisible, setPaymentSheetVisible] = useState(false);
  const [showPayoutModal, setShowPayoutModal] = useState(false);
  const [payoutInfo, setPayoutInfo] = useState<{
    amount: number;
    clubId: string;
    clubName: string;
    isAlreadyMember: boolean;
  } | null>(null);
  const [attendeesData, setAttendeesData] = useState<Map<string, UserProfile>>(new Map());

  useEffect(() => {
    if (eventId) {
      loadEventData();
    }
  }, [eventId]);

  useEffect(() => {
    if (event?.attendees?.length) {
      loadAttendeesData(event.attendees);
    }
  }, [event?.attendees]);

  const loadAttendeesData = async (attendeeIds: string[]) => {
    const newData = new Map<string, UserProfile>();
    await Promise.all(
      attendeeIds.map(async (userId) => {
        if (!attendeesData.has(userId)) {
          try {
            const profile = await getUserProfile(userId);
            if (profile) {
              newData.set(userId, profile);
            }
          } catch (e) {
            console.error('Error loading attendee:', e);
          }
        } else {
          newData.set(userId, attendeesData.get(userId)!);
        }
      })
    );
    setAttendeesData(newData);
  };

  useEffect(() => {
    if (user && event) {
      loadUserCredits();
    }
  }, [user, event]);

  const loadUserCredits = async () => {
    if (!user || !event) return;

    try {
      const result = await getUserRallyCredits(user.uid);
      if (result.success && result.credits) {
        setUserCredits(result.credits);
      }
    } catch (error) {
      console.error('Error loading user credits:', error);
    }
  };

  const loadEventData = async () => {
    try {
      setLoading(true);

      // Load the specific event by ID
      const result = await getEventById(eventId);
      if (result.success && result.event) {
        setEvent(result.event);
      } else {
        Alert.alert('Error', 'Event not found');
        router.back();
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

    // If event has a ticket price, show native payment sheet
    if (event.ticketPrice && event.ticketPrice > 0) {
      setPaymentSheetVisible(true);
      return;
    }

    // Free event - join directly
    setActionLoading(true);
    try {
      const result = await joinEvent(event.id, user.uid);
      if (result.success) {
        if (result.waitlisted) {
          Alert.alert('Added to Waitlist!', 'You have been added to the waitlist for this event.');
        } else {
          // Check if event has Rally Credits payout
          if (event.rallyCreditsAwarded && event.rallyCreditsAwarded > 0) {
            // Check if user is already a club member
            const clubResult = await getClub(event.clubId);
            const isAlreadyMember = clubResult.success && clubResult.club?.members.includes(user.uid);

            setPayoutInfo({
              amount: event.rallyCreditsAwarded,
              clubId: event.clubId,
              clubName: event.clubName,
              isAlreadyMember: isAlreadyMember || false
            });
            setShowPayoutModal(true);
          } else {
            Alert.alert('Success!', 'You have joined the event!');
          }
        }
        await loadEventData(); // Refresh event data
        await loadUserCredits(); // Refresh user credits
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

  const handlePaymentSuccess = async () => {
    // Refresh event data after successful payment
    await loadEventData();
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
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text variant="bodyLarge" style={{ color: '#fff' }}>Loading...</Text>
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
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Hero Header */}
        <ImageBackground
          source={event.coverImage ? { uri: event.coverImage } : undefined}
          style={styles.heroImage}
          imageStyle={{ opacity: 0.8 }}
        >
          <LinearGradient
            colors={['rgba(0,0,0,0.3)', 'rgba(0,0,0,0.95)']}
            style={styles.heroGradient}
          >
            {/* Back Button and Menu */}
            <View style={styles.topControl}>
              <Surface style={styles.controlButton} elevation={2}>
                <IconButton
                  icon="arrow-left"
                  iconColor="#fff"
                  size={24}
                  onPress={() => router.back()}
                />
              </Surface>

              {/* Menu for additional options */}
              {user && (isAttending || isWaitlisted) && (
                <Menu
                  visible={menuVisible}
                  onDismiss={() => setMenuVisible(false)}
                  anchor={
                    <Surface style={styles.controlButton} elevation={2}>
                      <IconButton
                        icon="dots-vertical"
                        iconColor="#fff"
                        size={24}
                        onPress={() => setMenuVisible(true)}
                      />
                    </Surface>
                  }
                >
                  <Menu.Item
                    onPress={() => {
                      setMenuVisible(false);
                      handleLeaveEvent();
                    }}
                    title={isWaitlisted ? "Leave Waitlist" : "Leave Event"}
                    leadingIcon="exit-to-app"
                  />
                </Menu>
              )}
            </View>

            {/* Event Info Overlay */}
            <View style={styles.heroContent}>
              {/* Status Badges */}
              <View style={styles.statusBadges}>
                {isAttending && (
                  <Chip style={styles.statusChipAttending} textStyle={styles.statusChipText}>
                    Attending
                  </Chip>
                )}
                {isWaitlisted && (
                  <Chip style={styles.statusChipWaitlist} textStyle={styles.statusChipText}>
                    Waitlisted
                  </Chip>
                )}
                {isPast && (
                  <Chip style={styles.statusChipPast} textStyle={styles.statusChipText}>
                    Past Event
                  </Chip>
                )}
              </View>

              <Text variant="displaySmall" style={styles.heroTitle}>
                {event.title}
              </Text>

              <Text variant="titleMedium" style={styles.heroClubName}>
                by {event.clubName}
              </Text>

              {/* Quick Info */}
              <View style={styles.quickInfo}>
                <View style={styles.quickInfoItem}>
                  <IconButton icon="calendar" iconColor="#fff" size={20} />
                  <Text variant="bodyMedium" style={styles.quickInfoText}>
                    {formatDate(event.startDate).split(',')[0]}
                  </Text>
                </View>
                <View style={styles.quickInfoItem}>
                  <IconButton icon="clock" iconColor="#fff" size={20} />
                  <Text variant="bodyMedium" style={styles.quickInfoText}>
                    {formatTime(event.startDate)}
                  </Text>
                </View>
                <View style={styles.quickInfoItem}>
                  <IconButton icon="account-group" iconColor="#fff" size={20} />
                  <Text variant="bodyMedium" style={styles.quickInfoText}>
                    {event.attendees.length.toString()}{event.maxAttendees ? `/${event.maxAttendees.toString()}` : ''}
                  </Text>
                </View>
              </View>

              {/* Action Button */}
              {user && isUpcoming && !isCreator && (
                <TouchableOpacity
                  onPress={isAttending || isWaitlisted ? handleLeaveEvent : handleJoinEvent}
                  disabled={actionLoading || (!isAttending && !isWaitlisted && isFull)}
                  activeOpacity={0.8}
                  style={styles.heroActionButtonWrapper}
                >
                  <LinearGradient
                    colors={isAttending || isWaitlisted ? ['transparent', 'transparent'] : [theme.colors.primary, theme.colors.primary]}
                    style={[
                      styles.heroActionButton,
                      (isAttending || isWaitlisted) && styles.heroActionButtonOutlined,
                      (actionLoading || (!isAttending && !isWaitlisted && isFull)) && styles.heroActionButtonDisabled
                    ]}
                  >
                    {actionLoading ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.heroActionButtonText}>
                        {isWaitlisted
                          ? 'Leave Waitlist'
                          : isAttending
                          ? 'Leave Event'
                          : isFull
                          ? 'Event Full'
                          : event.ticketPrice && event.ticketPrice > 0
                          ? `Buy Ticket - $${event.ticketPrice.toString()}`
                          : 'Join Event'}
                      </Text>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              )}
            </View>
          </LinearGradient>
        </ImageBackground>

        {/* Content Section */}
        <View style={styles.content}>
          {/* Description */}
          <View style={styles.section}>
            <Text variant="titleLarge" style={styles.sectionTitle}>
              About This Event
            </Text>
            <Text variant="bodyLarge" style={styles.description}>
              {event.description}
            </Text>
          </View>

          {/* Event Details */}
          <View style={styles.section}>
            <Text variant="titleLarge" style={styles.sectionTitle}>
              Details
            </Text>

            <View style={styles.detailRow}>
              <IconButton icon="calendar" size={24} />
              <View style={styles.detailContent}>
                <Text variant="labelLarge">Date</Text>
                <Text variant="bodyMedium" style={styles.detailText}>
                  {formatDate(event.startDate)}
                </Text>
              </View>
            </View>

            <View style={styles.detailRow}>
              <IconButton icon="clock" size={24} />
              <View style={styles.detailContent}>
                <Text variant="labelLarge">Time</Text>
                <Text variant="bodyMedium" style={styles.detailText}>
                  {formatTime(event.startDate)} - {formatTime(event.endDate)}
                </Text>
              </View>
            </View>

            <View style={styles.detailRow}>
              <IconButton icon={event.isVirtual ? "video" : "map-marker"} size={24} />
              <View style={styles.detailContent}>
                <Text variant="labelLarge">Location</Text>
                <Text variant="bodyMedium" style={styles.detailText}>
                  {event.isVirtual ? 'Virtual Event' : event.location}
                </Text>
              </View>
              {event.isVirtual && event.virtualLink && isAttending && (
                <IconButton
                  icon="open-in-new"
                  size={20}
                  onPress={openVirtualLink}
                />
              )}
            </View>

            {event.ticketPrice > 0 && (
              <View style={styles.detailRow}>
                <IconButton icon="currency-usd" size={24} />
                <View style={styles.detailContent}>
                  <Text variant="labelLarge">Price</Text>
                  <Text variant="bodyMedium" style={styles.detailText}>
                    ${event.ticketPrice.toString()} {typeof event.currency === 'string' && event.currency.trim() !== '' ? event.currency : 'USD'}
                  </Text>
                </View>
              </View>
            )}

            {event.rallyCreditsAwarded > 0 && (
              <View style={styles.detailRow}>
                <IconButton icon="star-circle" size={24} iconColor="#FFD700" />
                <View style={styles.detailContent}>
                  <Text variant="labelLarge">Rally Credits Payout</Text>
                  <Text variant="bodyMedium" style={styles.detailText}>
                    +{event.rallyCreditsAwarded?.toString() || '0'} credits for joining
                  </Text>
                </View>
              </View>
            )}

            {user && userCredits && event.clubId && (
              <View style={styles.detailRow}>
                <IconButton icon="wallet" size={24} iconColor="#FFD700" />
                <View style={styles.detailContent}>
                  <Text variant="labelLarge">Your {event.clubName} Credits</Text>
                  <Text variant="bodyMedium" style={styles.detailText}>
                    {(userCredits.clubCredits?.[event.clubId] || 0).toString()} total credits
                  </Text>
                </View>
              </View>
            )}
          </View>

          {/* Attendee Info */}
          <View style={styles.statsContainer}>
            <View style={styles.statCard}>
              <Text variant="headlineSmall" style={styles.statNumber}>
                {event.attendees.length.toString()}
              </Text>
              <Text variant="bodyMedium" style={styles.statLabel}>
                Attending
              </Text>
            </View>

            {(event.maxAttendees ?? 0) > 0 && (
              <View style={styles.statCard}>
                <Text variant="headlineSmall" style={styles.statNumber}>
                  {(event.maxAttendees - event.attendees.length).toString()}
                </Text>
                <Text variant="bodyMedium" style={styles.statLabel}>
                  Spots Left
                </Text>
              </View>
            )}

            {event.waitlist.length > 0 && (
              <View style={styles.statCard}>
                <Text variant="headlineSmall" style={styles.statNumber}>
                  {event.waitlist.length.toString()}
                </Text>
                <Text variant="bodyMedium" style={styles.statLabel}>
                  Waitlisted
                </Text>
              </View>
            )}
          </View>

          {/* Virtual Event Link Card */}
          {event.isVirtual && event.virtualLink && isAttending && (
            <View style={styles.section}>
              <Card style={styles.virtualCard}>
                <Card.Content style={styles.virtualContent}>
                  <IconButton icon="video" size={48} iconColor={theme.colors.primary} />
                  <Text variant="titleLarge" style={styles.virtualTitle}>
                    Join Virtual Event
                  </Text>
                  <Button
                    mode="contained"
                    onPress={openVirtualLink}
                    icon="open-in-new"
                    style={styles.virtualButton}
                  >
                    Open Meeting Link
                  </Button>
                </Card.Content>
              </Card>
            </View>
          )}

          {/* Attendees List */}
          {event.attendees.length > 0 && (
            <View style={styles.section}>
              <Text variant="titleLarge" style={styles.sectionTitle}>
                Attendees ({event.attendees.length})
              </Text>
              <View style={styles.membersList}>
                {event.attendees.map((userId) => {
                  const attendee = attendeesData.get(userId);
                  const displayName = attendee
                    ? `${attendee.firstName || ''} ${attendee.lastName || ''}`.trim() || 'User'
                    : 'Loading...';
                  const initials = attendee
                    ? `${attendee.firstName?.[0] || ''}${attendee.lastName?.[0] || ''}`.toUpperCase() || '?'
                    : '?';

                  return (
                    <View key={userId} style={styles.memberRow}>
                      <View style={styles.memberInfo}>
                        {attendee?.avatar ? (
                          <Image
                            source={{ uri: attendee.avatar }}
                            style={styles.attendeeAvatar}
                          />
                        ) : (
                          <View style={styles.avatarCircle}>
                            <Text variant="labelLarge" style={styles.avatarText}>
                              {initials}
                            </Text>
                          </View>
                        )}
                        <Text variant="bodyLarge" style={styles.memberId} numberOfLines={1}>
                          {displayName}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {/* Tags */}
          {event.tags && event.tags.length > 0 && (
            <View style={styles.section}>
              <Text variant="titleLarge" style={styles.sectionTitle}>
                Tags
              </Text>
              <View style={styles.tagsGrid}>
                {event.tags.map((tag) => (
                  <Chip key={tag} style={styles.topicChip} mode="flat">
                    {tag}
                  </Chip>
                ))}
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Payment Sheet Modal */}
      {event && (
        <PaymentSheet
          visible={paymentSheetVisible}
          event={event}
          onDismiss={() => setPaymentSheetVisible(false)}
          onSuccess={handlePaymentSuccess}
        />
      )}

      {/* Rally Credits Payout Modal */}
      {payoutInfo && (
        <RallyCreditsPaidModal
          visible={showPayoutModal}
          onClose={() => setShowPayoutModal(false)}
          amount={payoutInfo.amount}
          clubId={payoutInfo.clubId}
          clubName={payoutInfo.clubName}
          isAlreadyMember={payoutInfo.isAlreadyMember}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 120,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroImage: {
    width: '100%',
    height: 450,
    backgroundColor: '#1a1a1a',
  },
  heroGradient: {
    flex: 1,
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingBottom: 32,
  },
  topControl: {
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  controlButton: {
    borderRadius: 25,
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignSelf: 'flex-start',
  },
  heroContent: {
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  statusBadges: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  statusChipAttending: {
    backgroundColor: 'rgba(76, 175, 80, 0.3)',
  },
  statusChipWaitlist: {
    backgroundColor: 'rgba(255, 193, 7, 0.3)',
  },
  statusChipPast: {
    backgroundColor: 'rgba(158, 158, 158, 0.3)',
  },
  statusChipText: {
    color: '#fff',
  },
  heroTitle: {
    color: '#fff',
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  heroClubName: {
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 20,
  },
  quickInfo: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 20,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  quickInfoItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  quickInfoText: {
    color: '#fff',
    marginLeft: -8,
  },
  heroActionButtonWrapper: {
    width: '100%',
    maxWidth: 300,
    alignSelf: 'center',
  },
  heroActionButton: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroActionButtonOutlined: {
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  heroActionButtonDisabled: {
    opacity: 0.5,
  },
  heroActionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  content: {
    flex: 1,
    backgroundColor: '#000000',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: -24,
    paddingTop: 24,
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 32,
  },
  sectionTitle: {
    fontWeight: 'bold',
    marginBottom: 16,
  },
  description: {
    lineHeight: 26,
    opacity: 0.9,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  detailContent: {
    flex: 1,
    marginLeft: -8,
  },
  detailText: {
    opacity: 0.8,
    marginTop: 4,
  },
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 32,
  },
  statCard: {
    flex: 1,
    padding: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(100,100,100,0.1)',
    alignItems: 'center',
  },
  statNumber: {
    fontWeight: 'bold',
    marginBottom: 4,
  },
  statLabel: {
    opacity: 0.7,
    fontSize: 12,
    textAlign: 'center',
  },
  virtualCard: {
    borderRadius: 16,
    elevation: 0,
  },
  virtualContent: {
    alignItems: 'center',
    padding: 24,
  },
  virtualTitle: {
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  virtualButton: {
    minWidth: 200,
  },
  tagsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  topicChip: {
    borderRadius: 20,
  },
  membersList: {
    gap: 0,
  },
  memberRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(128,128,128,0.2)',
    gap: 12,
  },
  memberInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  avatarCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#60A5FA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  attendeeAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  avatarText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  memberId: {
    flex: 1,
    fontSize: 14,
  },
});
