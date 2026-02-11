// app/event/[id].tsx
import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Alert, Image, Linking, Dimensions, TouchableOpacity, ActivityIndicator } from 'react-native';
import {
  Text,
  Button,
  Card,
  Chip,
  IconButton,
  useTheme,
  Menu
} from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../_layout';
import { getEventById, joinEvent, getUserRallyCredits, getClub, getUserProfile } from '../../lib/firebase';
import { leaveEventWithRefund } from '../../lib/stripe';
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
    console.log('[EventDetail] Joining free event:', event.id, 'clubId:', event.clubId, 'rallyCreditsAwarded:', event.rallyCreditsAwarded);
    try {
      const result = await joinEvent(event.id, user.uid);
      console.log('[EventDetail] Join result:', result);
      if (result.success) {
        if (result.waitlisted) {
          Alert.alert('Added to Waitlist!', 'You have been added to the waitlist for this event.');
        } else {
          // Check if event has Rally Credits payout
          console.log('[EventDetail] Checking for rally credits payout:', event.rallyCreditsAwarded);
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
    await loadUserCredits();

    // Show Rally Credits payout modal if event awards credits
    if (event?.rallyCreditsAwarded && event.rallyCreditsAwarded > 0) {
      // Check if user is already a club member
      const clubResult = await getClub(event.clubId);
      const isAlreadyMember = clubResult.success && clubResult.club?.members.includes(user?.uid || '');

      setPayoutInfo({
        amount: event.rallyCreditsAwarded,
        clubId: event.clubId,
        clubName: event.clubName,
        isAlreadyMember: isAlreadyMember || false
      });
      setShowPayoutModal(true);
    }
  };

  const handleLeaveEvent = async () => {
    if (!user || !event) return;

    // Build confirmation message based on whether it's a paid event
    const isPaidEvent = event.ticketPrice && event.ticketPrice > 0;
    const hasCredits = event.rallyCreditsAwarded && event.rallyCreditsAwarded > 0;

    let message = 'Are you sure you want to leave this event?';
    if (isPaidEvent || hasCredits) {
      const parts = [];
      if (isPaidEvent) {
        parts.push(`You will be refunded $${event.ticketPrice.toFixed(2)}`);
      }
      if (hasCredits) {
        parts.push(`${event.rallyCreditsAwarded} Rally Credits will be forfeited`);
      }
      message = `${message}\n\n${parts.join('\n')}`;
    }

    Alert.alert(
      'Leave Event',
      message,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(true);
            try {
              const result = await leaveEventWithRefund(event.id);
              if (result.success) {
                let successMessage = 'You have left the event.';
                if (result.refundProcessed && result.refundAmount) {
                  successMessage += `\n\nRefunded: $${result.refundAmount.toFixed(2)}`;
                }
                if (result.creditsForfeited && result.creditsForfeited > 0) {
                  successMessage += `\n${result.creditsForfeited} Rally Credits forfeited.`;
                }
                Alert.alert('Success', successMessage);
                await loadEventData(); // Refresh event data
                await loadUserCredits(); // Refresh credits
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
          <ActivityIndicator size="large" color="#fff" />
          <Text variant="bodyLarge" style={{ color: '#fff', marginTop: 16 }}>Loading...</Text>
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
      {/* Full-screen blurred background image */}
      {event.coverImage && (
        <Image
          source={{ uri: event.coverImage }}
          style={styles.backgroundImage}
          blurRadius={50}
        />
      )}
      {/* Gradient overlay for better readability */}
      <LinearGradient
        colors={['rgba(15,15,35,0.3)', 'rgba(15,15,35,0.85)', 'rgba(10,10,25,0.95)']}
        style={styles.backgroundOverlay}
      />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Hero Section with Cover Image and Content */}
        <View style={styles.heroSection}>
          {/* Full Cover Image */}
          <Image
            source={event.coverImage ? { uri: event.coverImage } : require('../../assets/Background.png')}
            style={styles.coverImage}
            resizeMode="cover"
          />

          {/* Gradient overlay for text readability */}
          <LinearGradient
            colors={['transparent', 'transparent', 'rgba(15,15,35,0.6)', 'rgba(15,15,35,0.95)']}
            locations={[0, 0.5, 0.8, 1]}
            style={styles.heroUnifiedGradient}
          />

          {/* Back Button and Menu - floating at top */}
          <View style={styles.topControl}>
            <BlurView intensity={40} tint="dark" style={styles.controlButtonBlur}>
              <IconButton
                icon="arrow-left"
                iconColor="#fff"
                size={24}
                onPress={() => router.back()}
              />
            </BlurView>

            {/* Menu for additional options */}
            {user && (isAttending || isWaitlisted) && (
              <Menu
                visible={menuVisible}
                onDismiss={() => setMenuVisible(false)}
                anchor={
                  <BlurView intensity={40} tint="dark" style={styles.controlButtonBlur}>
                    <IconButton
                      icon="dots-vertical"
                      iconColor="#fff"
                      size={24}
                      onPress={() => setMenuVisible(true)}
                    />
                  </BlurView>
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

          {/* Event Info Content */}
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

            <Text variant="headlineMedium" style={styles.heroTitle}>
              {event.title}
            </Text>

            <Text variant="titleMedium" style={styles.heroClubName}>
              by {event.clubName}
            </Text>

            {/* Quick Info Row */}
            <View style={styles.quickInfo}>
              <View style={styles.quickInfoItem}>
                <IconButton icon="calendar" iconColor="#fff" size={18} style={styles.quickInfoIcon} />
                <Text variant="bodyMedium" style={styles.quickInfoText}>
                  {formatDate(event.startDate).split(',')[0]}
                </Text>
              </View>
              <View style={styles.quickInfoItem}>
                <IconButton icon="clock" iconColor="#fff" size={18} style={styles.quickInfoIcon} />
                <Text variant="bodyMedium" style={styles.quickInfoText}>
                  {formatTime(event.startDate)}
                </Text>
              </View>
              <View style={styles.quickInfoItem}>
                <IconButton icon="account-group" iconColor="#fff" size={18} style={styles.quickInfoIcon} />
                <Text variant="bodyMedium" style={styles.quickInfoText}>
                  {event.attendees.length.toString()}{event.maxAttendees ? `/${event.maxAttendees.toString()}` : ''}
                </Text>
              </View>
            </View>
          </View>

        </View>

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
                    // tap the row to see this person's public profile
                    // we pass the name + avatar we already have so the screen renders instantly
                    <TouchableOpacity
                      key={userId}
                      style={styles.memberRow}
                      onPress={() => router.push({
                        pathname: `/user/${userId}` as any,
                        params: {
                          firstName: attendee?.firstName || '',
                          lastName: attendee?.lastName || '',
                          avatar: attendee?.avatar || '',
                        },
                      })}
                      activeOpacity={0.7}
                    >
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
                      {/* little arrow so people know it's tappable */}
                      <IconButton icon="chevron-right" size={20} iconColor="rgba(255,255,255,0.4)" style={{ margin: 0 }} />
                    </TouchableOpacity>
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

      {/* Floating Action Button */}
      {user && isUpcoming && (
        <TouchableOpacity
          onPress={isAttending || isWaitlisted ? handleLeaveEvent : handleJoinEvent}
          disabled={actionLoading || (!isAttending && !isWaitlisted && !!isFull)}
          activeOpacity={0.8}
          style={styles.floatingButtonWrapper}
        >
          <LinearGradient
            colors={isAttending || isWaitlisted ? ['rgba(255,255,255,0.15)', 'rgba(255,255,255,0.08)'] : ['rgba(255,255,255,0.25)', 'rgba(255,255,255,0.15)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[
              styles.floatingButton,
              (isAttending || isWaitlisted) && styles.floatingButtonOutlined,
              (actionLoading || (!isAttending && !isWaitlisted && !!isFull)) && styles.floatingButtonDisabled
            ]}
          >
            {actionLoading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.floatingButtonText}>
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
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f23',
  },
  backgroundImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  backgroundOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
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
  heroSection: {
    height: 600,
    position: 'relative',
  },
  coverImage: {
    width: '100%',
    height: 600,
  },
  heroGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '100%',
  },
  topControl: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10,
  },
  heroUnifiedGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 600,
    zIndex: 1,
  },
  mirroredFooter: {
    position: 'relative',
    overflow: 'hidden',
    marginTop: 0,
    height: 180,
  },
  mirroredImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    width: '100%',
    height: 600,
    transform: [{ scaleY: -1 }, { translateY: 600 }],
  },
  mirroredTopGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 100,
  },
  mirroredBottomGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 100,
  },
  controlButton: {
    borderRadius: 25,
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignSelf: 'flex-start',
  },
  controlButtonBlur: {
    borderRadius: 25,
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  heroContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 24,
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 2,
  },
  statusBadges: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  statusChipAttending: {
    backgroundColor: 'rgba(52, 211, 153, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.5)',
  },
  statusChipWaitlist: {
    backgroundColor: 'rgba(251, 191, 36, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.5)',
  },
  statusChipPast: {
    backgroundColor: 'rgba(148, 163, 184, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.5)',
  },
  statusChipText: {
    color: '#fff',
    fontWeight: '600',
  },
  statusChipTextDark: {
    color: '#1e293b',
    fontWeight: '600',
  },
  heroTitle: {
    color: '#fff',
    fontWeight: 'bold',
    marginBottom: 4,
  },
  heroClubName: {
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 16,
  },
  quickInfo: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  quickInfoItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  quickInfoIcon: {
    margin: 0,
  },
  quickInfoText: {
    color: 'rgba(255,255,255,0.8)',
    marginLeft: -8,
  },
  heroActionButtonWrapper: {
    width: '100%',
  },
  heroActionButton: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#ec4899',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  heroActionButtonOutlined: {
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.3)',
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
  heroActionButtonTextOutlined: {
    color: '#a78bfa',
  },
  content: {
    flex: 1,
    paddingTop: 24,
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 32,
  },
  sectionTitle: {
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#fff',
  },
  description: {
    lineHeight: 26,
    color: 'rgba(255,255,255,0.8)',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  detailContent: {
    flex: 1,
    marginLeft: -8,
  },
  detailText: {
    color: 'rgba(255,255,255,0.6)',
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
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  statNumber: {
    fontWeight: 'bold',
    marginBottom: 4,
    color: '#fff',
  },
  statLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    textAlign: 'center',
  },
  virtualCard: {
    borderRadius: 16,
    elevation: 0,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  virtualContent: {
    alignItems: 'center',
    padding: 24,
  },
  virtualTitle: {
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
    color: '#fff',
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
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
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
    borderBottomColor: 'rgba(255,255,255,0.08)',
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
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
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
    color: '#fff',
  },
  floatingButtonWrapper: {
    position: 'absolute',
    bottom: 32,
    right: 20,
    zIndex: 100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
  },
  floatingButton: {
    paddingVertical: 16,
    paddingHorizontal: 28,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingButtonOutlined: {
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  floatingButtonDisabled: {
    opacity: 0.5,
  },
  floatingButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
});
