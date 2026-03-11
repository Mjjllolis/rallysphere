// app/event/[id].tsx
import React, { useState, useEffect, useRef, useCallback, useCallback } from 'react';
import { View, StyleSheet, ScrollView, Alert, Linking, Dimensions, TouchableOpacity, ActivityIndicator, Modal, Animated, TextInput, PanResponder, Pressable, Platform, Platform, RefreshControl } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import {
  Text,
  Button,
  Card,
  Chip,
  IconButton,
  useTheme
} from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { router, useLocalSearchParams, Stack, useFocusEffect } from 'expo-router';
import { useAuth, useThemeToggle } from '../_layout';
import { getEventById, joinEvent, getUserRallyCredits, getClub, getUserProfile, storeWaiverSignature, getWaiverSignature, deleteEvent } from '../../lib/firebase';
import type { Club } from '../../lib/firebase';
import { leaveEventWithRefund } from '../../lib/stripe';
import type { Event, UserRallyCredits, UserProfile } from '../../lib/firebase';
import BackButton from '../../components/BackButton';
import PaymentSheet from '../../components/PaymentSheet';
import RallyCreditsPaidModal from '../../components/RallyCreditsPaidModal';
import { generateAndShareWaiverPDF } from '../../lib/waiverPdf';
import { ScrollProvider, useScrollContext } from '../../contexts/ScrollContext';

const { width } = Dimensions.get('window');

// Waiver Modal Content Component (needs to be inside ScrollProvider to use scroll context)
function WaiverModalContent({
  event,
  theme,
  waiverScrolledToBottom,
  setWaiverScrolledToBottom,
  waiverAgreed,
  setWaiverAgreed,
  waiverInitials,
  setWaiverInitials,
  handleWaiverScroll,
  waiverHintOpacity,
  waiverAgreementOpacity,
  dismissWaiverModal,
  proceedWithJoin,
  user,
  waiverSheetAnim,
  setWaiverModalVisible,
}: {
  event: Event | null;
  theme: any;
  waiverScrolledToBottom: boolean;
  setWaiverScrolledToBottom: (val: boolean) => void;
  waiverAgreed: boolean;
  setWaiverAgreed: (val: boolean) => void;
  waiverInitials: string;
  setWaiverInitials: (val: string) => void;
  handleWaiverScroll: (event: any) => void;
  waiverHintOpacity: Animated.Value;
  waiverAgreementOpacity: Animated.Value;
  dismissWaiverModal: () => void;
  proceedWithJoin: () => void;
  user: any;
  waiverSheetAnim: Animated.Value;
  setWaiverModalVisible: (val: boolean) => void;
}) {
  const scrollContext = useScrollContext();
  const initialsInputContainerRef = useRef<View>(null);

  const handleInitialsFocus = useCallback(() => {
    if (scrollContext) {
      scrollContext.scrollToInput(initialsInputContainerRef);
    }
  }, [scrollContext]);

  return (
    <>
      <View style={styles.waiverModalHeader}>
        <IconButton
          icon="file-document-outline"
          size={28}
          iconColor={theme.dark ? '#60A5FA' : '#1B365D'}
        />
        <Text style={[
          styles.waiverModalTitle,
          { color: theme.dark ? '#FFFFFF' : '#1B365D' }
        ]}>Event Waiver</Text>
      </View>

      <Text style={[
        styles.waiverModalSubtitle,
        { color: theme.dark ? 'rgba(255,255,255,0.7)' : '#6B7280' }
      ]}>
        Please read and agree to the following terms before joining this event
      </Text>

      <ScrollView
        style={[
          styles.waiverTextContainer,
          { backgroundColor: theme.dark ? 'rgba(255,255,255,0.05)' : '#F9FAFB' }
        ]}
        contentContainerStyle={{ padding: 16, minHeight: 250 }}
        showsVerticalScrollIndicator
        persistentScrollbar
        nestedScrollEnabled
        onScroll={handleWaiverScroll}
        onContentSizeChange={(contentWidth, contentHeight) => {
          // Auto-unlock if content is short enough that it doesn't need scrolling
          if (contentHeight <= 250 && !waiverScrolledToBottom) {
            setWaiverScrolledToBottom(true);
          }
        }}
        onLayout={(e) => {
          // Trigger a scroll check immediately after layout
          const scrollView = e.nativeEvent.target as any;
          setTimeout(() => {
            handleWaiverScroll({
              nativeEvent: {
                layoutMeasurement: { height: 250 },
                contentOffset: { y: 0 },
                contentSize: { height: e.nativeEvent.layout.height }
              }
            });
          }, 100);
        }}
        scrollEventThrottle={16}
      >
        <Text style={[
          styles.waiverText,
          { color: theme.dark ? 'rgba(255,255,255,0.9)' : '#374151' }
        ]}>{event?.waiverText}</Text>
      </ScrollView>

      <Animated.Text style={[
        styles.waiverScrollHint,
        {
          color: theme.dark ? 'rgba(255,255,255,0.5)' : '#9CA3AF',
          opacity: waiverHintOpacity,
        }
      ]}>
        ↓ Scroll to read entire waiver
      </Animated.Text>

      <Animated.View style={[
        styles.waiverAgreementSection,
        {
          backgroundColor: theme.dark ? 'rgba(255,255,255,0.05)' : '#F9FAFB',
          borderColor: theme.dark ? 'rgba(255,255,255,0.1)' : '#E5E7EB',
          opacity: waiverAgreementOpacity,
        }
      ]}>
        <TouchableOpacity
          style={[
            styles.waiverCheckboxRow,
            {
              backgroundColor: theme.dark ? 'rgba(255,255,255,0.08)' : '#F3F4F6',
              borderColor: waiverAgreed
                ? (theme.dark ? '#60A5FA' : '#1B365D')
                : (theme.dark ? 'rgba(255,255,255,0.2)' : '#D1D5DB'),
            }
          ]}
          onPress={() => waiverScrolledToBottom && setWaiverAgreed(!waiverAgreed)}
          activeOpacity={waiverScrolledToBottom ? 0.7 : 1}
          disabled={!waiverScrolledToBottom}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: waiverAgreed, disabled: !waiverScrolledToBottom }}
          accessibilityLabel="I have read and agree to the terms above"
        >
          <IconButton
            icon={waiverAgreed ? "checkbox-marked" : "checkbox-blank-outline"}
            size={24}
            iconColor={waiverAgreed
              ? (theme.dark ? '#60A5FA' : '#1B365D')
              : (theme.dark ? 'rgba(255,255,255,0.5)' : '#9CA3AF')}
            style={{ margin: 0 }}
          />
          <Text style={[
            styles.waiverCheckboxText,
            { color: theme.dark ? '#FFFFFF' : '#374151' }
          ]}>
            I have read and agree to the terms above
          </Text>
        </TouchableOpacity>

        <View ref={initialsInputContainerRef} style={styles.waiverInitialsRow}>
          <Text style={[
            styles.waiverInitialsLabel,
            { color: theme.dark ? 'rgba(255,255,255,0.7)' : '#6B7280' }
          ]}>
            Sign with your initials
          </Text>
          <TextInput
            style={[
              styles.waiverInitialsInput,
              {
                backgroundColor: theme.dark ? 'rgba(255,255,255,0.1)' : '#FFFFFF',
                borderColor: waiverInitials.length > 0
                  ? (theme.dark ? '#60A5FA' : '#1B365D')
                  : (theme.dark ? 'rgba(255,255,255,0.2)' : '#D1D5DB'),
                color: theme.dark ? '#FFFFFF' : '#1B365D',
              }
            ]}
            value={waiverInitials}
            onChangeText={(text) => waiverScrolledToBottom && setWaiverInitials(text)}
            onFocus={handleInitialsFocus}
            editable={waiverScrolledToBottom}
            placeholder="AB"
            placeholderTextColor={theme.dark ? 'rgba(255,255,255,0.3)' : '#9CA3AF'}
            autoCapitalize="characters"
            maxLength={4}
          />
        </View>
      </Animated.View>

      <View style={styles.waiverButtonRow}>
        <TouchableOpacity
          style={[
            styles.waiverCancelButton,
            { backgroundColor: theme.dark ? 'rgba(255,255,255,0.1)' : '#F3F4F6' }
          ]}
          onPress={dismissWaiverModal}
        >
          <Text style={[
            styles.waiverCancelButtonText,
            { color: theme.dark ? 'rgba(255,255,255,0.8)' : '#6B7280' }
          ]}>Cancel</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.waiverConfirmButton,
            {
              backgroundColor: (waiverAgreed && waiverInitials.length > 0)
                ? (theme.dark ? '#60A5FA' : '#1B365D')
                : (theme.dark ? 'rgba(255,255,255,0.1)' : '#D1D5DB'),
            }
          ]}
          onPress={async () => {
            // IMPORTANT: Store waiver signature BEFORE joining the event
            // This ensures we have proof of agreement in the database
            if (event && user) {
              const signResult = await storeWaiverSignature(
                event.id,
                user.uid,
                waiverInitials
              );
              if (!signResult.success) {
                // If signature storage fails, stop here and don't join the event
                Alert.alert('Error', 'Failed to record waiver signature. Please try again.');
                return;
              }
            }

            // Signature stored successfully, now dismiss the modal with animation
            Animated.timing(waiverSheetAnim, {
              toValue: Dimensions.get('window').height, // Slide down off-screen
              duration: 250,
              useNativeDriver: true,
            }).start(() => {
              // After animation completes, reset all waiver-related state
              setWaiverInitials('');
              setWaiverAgreed(false);
              setWaiverScrolledToBottom(false);
              // Finally, proceed with joining the event (payment or free join)
              proceedWithJoin();
            });
          }}
          disabled={!waiverAgreed || waiverInitials.length === 0}
        >
          <Text style={[
            styles.waiverConfirmButtonText,
            {
              color: (waiverAgreed && waiverInitials.length > 0)
                ? '#FFFFFF'
                : (theme.dark ? 'rgba(255,255,255,0.4)' : '#9CA3AF'),
            }
          ]}>
            Continue
          </Text>
        </TouchableOpacity>
      </View>
    </>
  );
}

export default function EventDetailScreen() {
  const theme = useTheme();
  const { isDark } = useThemeToggle();
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
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [waiverModalVisible, setWaiverModalVisible] = useState(false);
  const [waiverAgreed, setWaiverAgreed] = useState(false);
  const [waiverInitials, setWaiverInitials] = useState('');
  const [waiverScrolledToBottom, setWaiverScrolledToBottom] = useState(false);
  const [signedWaiver, setSignedWaiver] = useState<{ initials: string; signedAt: Date } | null>(null);
  const [showSignedWaiverModal, setShowSignedWaiverModal] = useState(false);
  const [exportingPDF, setExportingPDF] = useState(false);
  const [clubLogo, setClubLogo] = useState<string | undefined>(undefined);
  const [club, setClub] = useState<Club | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const waiverSheetAnim = useRef(new Animated.Value(Dimensions.get('window').height)).current;
  const waiverHintOpacity = useRef(new Animated.Value(1)).current;
  const waiverAgreementOpacity = useRef(new Animated.Value(0.4)).current;
  const signedWaiverSheetAnim = useRef(new Animated.Value(Dimensions.get('window').height)).current;
  const cachedPdfUri = useRef<string | null>(null);
  const waiverScrollViewRef = useRef<ScrollView>(null);
  const currentWaiverScrollY = useRef(0);

  // Dismiss waiver modal with slide-down animation
  const dismissWaiverModal = () => {
    Animated.timing(waiverSheetAnim, {
      toValue: Dimensions.get('window').height,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      setWaiverModalVisible(false);
      setWaiverScrolledToBottom(false);
    });
  };

  // Check if user has scrolled to bottom of waiver text
  // This ensures users actually read the waiver before they can agree to it
  const handleWaiverScroll = (event: any) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    // layoutMeasurement.height = visible height of the ScrollView
    // contentOffset.y = how far down the user has scrolled
    // contentSize.height = total height of the content
    const paddingToBottom = 20; // Allow 20px of wiggle room
    const isAtBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - paddingToBottom;

    // Also check if content is short enough that scrolling isn't needed
    const contentFitsInView = contentSize.height <= layoutMeasurement.height;

    if ((isAtBottom || contentFitsInView) && !waiverScrolledToBottom) {
      setWaiverScrolledToBottom(true); // Unlock the agreement checkbox
    }
  };

  // Animate hint and agreement section when scrolled to bottom
  useEffect(() => {
    if (waiverScrolledToBottom) {
      Animated.parallel([
        Animated.timing(waiverHintOpacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(waiverAgreementOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      // Reset when modal reopens
      waiverHintOpacity.setValue(1);
      waiverAgreementOpacity.setValue(0.4);
    }
  }, [waiverScrolledToBottom]);

  // PanResponder for drag-to-dismiss on waiver modal
  // PanResponder handles touch gestures (like dragging) on the modal handle
  const waiverPanResponder = useRef(
    PanResponder.create({
      // Always capture the touch event when user starts touching
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only respond to downward drags (dy = delta y, positive = down)
        return gestureState.dy > 5;
      },
      onPanResponderMove: (_, gestureState) => {
        // Update animation value as user drags
        // Only allow dragging down (positive dy), not up
        if (gestureState.dy > 0) {
          waiverSheetAnim.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        // When user releases their finger, decide whether to dismiss or snap back
        // gestureState.dy = total distance dragged (px)
        // gestureState.vy = velocity (speed) of the drag
        if (gestureState.dy > 100 || gestureState.vy > 0.5) {
          dismissWaiverModal(); // User dragged far enough, dismiss the modal
        } else {
          // User didn't drag far enough, snap the modal back to its original position
          Animated.spring(waiverSheetAnim, {
            toValue: 0,
            useNativeDriver: true,
            tension: 65, // How stiff the spring is (higher = faster)
            friction: 11, // Resistance (higher = less bouncy)
          }).start();
        }
      },
    })
  ).current;

  useEffect(() => {
    if (eventId) {
      loadEventData();
    }
  }, [eventId]);

  // Silently refresh event data when screen regains focus (e.g. after editing)
  const hasLoadedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      // Reset menu state when returning from edit/other screens
      setMenuVisible(false);
      if (hasLoadedOnce.current && eventId) {
        loadEventData(true);
      }
      hasLoadedOnce.current = true;
    }, [eventId])
  );

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
            // console.error('Error loading attendee:', e);
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

  // Load user profile for display name in PDF
  useEffect(() => {
    const loadProfile = async () => {
      if (user) {
        const profile = await getUserProfile(user.uid);
        setUserProfile(profile);
      }
    };
    loadProfile();
  }, [user]);

  // Load signed waiver for attending users
  // This runs when the user or event changes and checks if they've already signed
  useEffect(() => {
    const loadSignedWaiver = async () => {
      // Only fetch if:
      // 1. User is logged in
      // 2. Event requires a waiver
      // 3. User is already an attendee (means they signed at some point)
      if (user && event?.hasWaiver && event.attendees.includes(user.uid)) {
        const result = await getWaiverSignature(event.id, user.uid);
        if (result.success && result.signature) {
          setSignedWaiver(result.signature); // Show "View Signed Waiver" button
        }
      }
    };
    loadSignedWaiver();
  }, [user, event]);

  // Animate waiver sheet slide up/down
  useEffect(() => {
    if (waiverModalVisible) {
      // Slide up
      Animated.spring(waiverSheetAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }).start();
    } else {
      // Reset to off-screen for next open
      waiverSheetAnim.setValue(Dimensions.get('window').height);
    }
  }, [waiverModalVisible]);

  // Animate signed waiver sheet slide up/down
  useEffect(() => {
    if (showSignedWaiverModal) {
      // Slide up
      Animated.spring(signedWaiverSheetAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }).start();
    } else {
      // Reset to off-screen for next open and clear PDF cache
      signedWaiverSheetAnim.setValue(Dimensions.get('window').height);
      cachedPdfUri.current = null;
    }
  }, [showSignedWaiverModal]);

  const loadUserCredits = async () => {
    if (!user || !event) return;

    try {
      const result = await getUserRallyCredits(user.uid);
      if (result.success && result.credits) {
        setUserCredits(result.credits);
      }
    } catch (error) {
      // console.error('Error loading user credits:', error);
    }
  };

  const loadEventData = async (silent = false) => {
    try {
      if (!silent) setLoading(true);

      // Load the specific event by ID
      const result = await getEventById(eventId);
      if (result.success && result.event) {
        setEvent(result.event);

        // Fetch club data for logo and admin check
        if (result.event.clubId) {
          const clubResult = await getClub(result.event.clubId);
          if (clubResult.success && clubResult.club) {
            setClub(clubResult.club);
            if (clubResult.club.logo) {
              setClubLogo(clubResult.club.logo);
            }
          }
        } else if (result.event.clubLogo) {
          setClubLogo(result.event.clubLogo);
        }
      } else if (!silent) {
        Alert.alert('Error', 'Event not found');
        router.back();
      }
    } catch (error) {
      // console.error('Error loading event data:', error);
      if (!silent) Alert.alert('Error', 'Failed to load event information');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const handleJoinEvent = async () => {
    if (!user || !event) return;

    // If event has a waiver, show waiver modal first
    if (event.hasWaiver && event.waiverText) {
      setWaiverAgreed(false);
      setWaiverModalVisible(true);
      return;
    }

    // Continue with normal join flow
    await proceedWithJoin();
  };

  const proceedWithJoin = async () => {
    if (!user || !event) return;

    // If event has a ticket price, show native payment sheet
    if (event.ticketPrice && event.ticketPrice > 0) {
      setPaymentSheetVisible(true);
      return;
    }

    // Free event - join directly
    setActionLoading(true);
    // console.log('[EventDetail] Joining free event:', event.id, 'clubId:', event.clubId, 'rallyCreditsAwarded:', event.rallyCreditsAwarded);
    try {
      const result = await joinEvent(event.id, user.uid);
      // console.log('[EventDetail] Join result:', result);
      if (result.success) {
        if (result.waitlisted) {
          Alert.alert('Added to Waitlist!', 'You have been added to the waitlist for this event.');
        } else {
          // Check if event has Rally Credits payout
          // console.log('[EventDetail] Checking for rally credits payout:', event.rallyCreditsAwarded);
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
      // console.error('Error joining event:', error);
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
              // console.error('Error leaving event:', error);
              Alert.alert('Error', 'An unexpected error occurred');
            } finally {
              setActionLoading(false);
            }
          }
        }
      ]
    );
  };

  const handleDeleteEvent = () => {
    if (!event) return;
    Alert.alert(
      'Delete Event',
      `Are you sure you want to delete "${event.title}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(true);
            try {
              const result = await deleteEvent(event.id);
              if (result.success) {
                Alert.alert('Deleted', 'Event has been deleted.', [
                  { text: 'OK', onPress: () => router.back() }
                ]);
              } else {
                Alert.alert('Error', result.error || 'Failed to delete event');
              }
            } catch (error) {
              // console.error('Error deleting event:', error);
              Alert.alert('Error', 'An unexpected error occurred');
            } finally {
              setActionLoading(false);
            }
          }
        }
      ]
    );
  };

  const handleEditEvent = () => {
    if (!event) return;
    router.push(`/event/edit?eventId=${event.id}`);
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
        {/* set slide animation here too so it applies even before data loads */}
        <Stack.Screen options={{ headerShown: false, animation: 'slide_from_right', gestureEnabled: true, gestureDirection: 'horizontal' }} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.onSurface} />
          <Text variant="bodyLarge" style={{ color: theme.colors.onSurface, marginTop: 16 }}>Loading...</Text>
        </View>
      </View>
    );
  }

  const isAttending = user ? event.attendees.includes(user.uid) : false;
  const isWaitlisted = user ? event.waitlist.includes(user.uid) : false;
  const isUpcoming = event.startDate && new Date(event.startDate.toDate ? event.startDate.toDate() : event.startDate) > new Date();
  const isPast = event.endDate && new Date(event.endDate.toDate ? event.endDate.toDate() : event.endDate) < new Date();
  const isCreator = user && event.createdBy === user.uid;
  const isClubAdmin = user && club && (club.admins.includes(user.uid) || club.owner === user.uid);
  const canManageEvent = isCreator || isClubAdmin;
  const isFull = event.maxAttendees && event.attendees.length >= event.maxAttendees;

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* slide in from right, swipe to go back */}
      <Stack.Screen options={{ headerShown: false, animation: 'slide_from_right', gestureEnabled: true, gestureDirection: 'horizontal' }} />
      {/* Full-screen blurred background image */}
      {event.coverImage && (
        <ExpoImage
          source={{ uri: event.coverImage }}
          style={styles.backgroundImage}
          blurRadius={80}
          transition={200}
          cachePolicy="memory-disk"
        />
      )}
      {/* Gradient overlay for better readability */}
      <LinearGradient
        colors={isDark ? ['rgba(15,15,35,0.3)', 'rgba(15,15,35,0.85)', 'rgba(10,10,25,0.95)'] : ['rgba(255,255,255,0.3)', 'rgba(255,255,255,0.85)', 'rgba(245,245,245,0.95)']}
        style={styles.backgroundOverlay}
      />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await loadEventData(true); setRefreshing(false); }} tintColor={theme.colors.onSurface} />}>
        {/* Hero Section with Cover Image and Content */}
        <View style={styles.heroSection}>
          {/* Full Cover Image */}
          <ExpoImage
            source={event.coverImage ? { uri: event.coverImage } : require('../../assets/Background.png')}
            style={styles.coverImage}
            contentFit="cover"
            transition={200}
            cachePolicy="memory-disk"
          />

          {/* Gradient overlay for text readability */}
          <LinearGradient
            colors={isDark ? ['transparent', 'transparent', 'rgba(15,15,35,0.6)', 'rgba(15,15,35,0.95)'] : ['transparent', 'transparent', 'rgba(255,255,255,0.6)', 'rgba(255,255,255,0.95)']}
            locations={[0, 0.5, 0.8, 1]}
            style={styles.heroUnifiedGradient}
          />

          {/* Back Button and Menu - floating at top */}
          <View style={styles.topControl}>
            <BlurView intensity={40} tint={isDark ? "dark" : "light"} style={styles.controlButtonBlur}>
              <IconButton
                icon="arrow-left"
                iconColor={theme.colors.onSurface}
                size={24}
                onPress={() => router.back()}
              />
            </BlurView>

            {/* Menu for additional options */}
            {user && (isAttending || isWaitlisted || canManageEvent) && (
              <View>
                <TouchableOpacity onPress={() => setMenuVisible(prev => !prev)} activeOpacity={0.7}>
                  <BlurView intensity={40} tint={isDark ? "dark" : "light"} style={styles.controlButtonBlur}>
                    <IconButton
                      icon="dots-vertical"
                      iconColor={theme.colors.onSurface}
                      size={24}
                    />
                  </BlurView>
                </TouchableOpacity>

                {menuVisible && (
                  <View style={[styles.customMenu, { backgroundColor: isDark ? 'rgba(30,41,59,0.95)' : 'rgba(255,255,255,0.95)', borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }]}>
                    {canManageEvent && (
                      <TouchableOpacity
                        style={styles.customMenuItem}
                        onPress={() => { setMenuVisible(false); handleEditEvent(); }}
                      >
                        <IconButton icon="pencil" size={18} iconColor={theme.colors.onSurface} style={{ margin: 0 }} />
                        <Text style={[styles.customMenuText, { color: theme.colors.onSurface }]}>Edit Event</Text>
                      </TouchableOpacity>
                    )}
                    {(isAttending || isWaitlisted) && (
                      <TouchableOpacity
                        style={styles.customMenuItem}
                        onPress={() => { setMenuVisible(false); handleLeaveEvent(); }}
                      >
                        <IconButton icon="exit-to-app" size={18} iconColor={theme.colors.onSurface} style={{ margin: 0 }} />
                        <Text style={[styles.customMenuText, { color: theme.colors.onSurface }]}>{isWaitlisted ? 'Leave Waitlist' : 'Leave Event'}</Text>
                      </TouchableOpacity>
                    )}
                    {canManageEvent && (
                      <TouchableOpacity
                        style={styles.customMenuItem}
                        onPress={() => { setMenuVisible(false); handleDeleteEvent(); }}
                      >
                        <IconButton icon="delete" size={18} iconColor="#EF4444" style={{ margin: 0 }} />
                        <Text style={[styles.customMenuText, { color: '#EF4444' }]}>Delete Event</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
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

            <Text variant="headlineMedium" style={[styles.heroTitle, { color: theme.colors.onSurface }]}>
              {event.title}
            </Text>

            <TouchableOpacity
              onPress={() => router.push(`/club/${event.clubId}`)}
              style={styles.clubHeader}
              accessibilityRole="button"
              accessibilityLabel={`View ${event.clubName} club page`}
            >
              {clubLogo ? (
                <ExpoImage
                  source={{ uri: clubLogo }}
                  style={styles.clubHeaderLogo}
                  contentFit="cover"
                  transition={200}
                  cachePolicy="memory-disk"
                  accessible={true}
                  accessibilityLabel={`${event.clubName} logo`}
                />
              ) : (
                <View style={[styles.clubHeaderLogo, styles.clubHeaderLogoPlaceholder, { backgroundColor: theme.colors.surfaceVariant }]}>
                  <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 14, fontWeight: '600' }}>
                    {event.clubName.charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
              <Text variant="titleMedium" style={[styles.heroClubName, { color: theme.colors.onSurfaceVariant }]}>
                by {event.clubName}
              </Text>
              <IconButton icon="chevron-right" size={18} iconColor={theme.colors.onSurfaceVariant} style={{ margin: 0 }} />
            </TouchableOpacity>

            {/* Quick Info Row */}
            <View style={styles.quickInfo}>
              <View style={styles.quickInfoItem}>
                <IconButton icon="calendar" iconColor={theme.colors.onSurface} size={18} style={styles.quickInfoIcon} />
                <Text variant="bodyMedium" style={[styles.quickInfoText, { color: theme.colors.onSurfaceVariant }]}>
                  {formatDate(event.startDate).split(',')[0]}
                </Text>
              </View>
              <View style={styles.quickInfoItem}>
                <IconButton icon="clock" iconColor={theme.colors.onSurface} size={18} style={styles.quickInfoIcon} />
                <Text variant="bodyMedium" style={[styles.quickInfoText, { color: theme.colors.onSurfaceVariant }]}>
                  {formatTime(event.startDate)}
                </Text>
              </View>
              <View style={styles.quickInfoItem}>
                <IconButton icon="account-group" iconColor={theme.colors.onSurface} size={18} style={styles.quickInfoIcon} />
                <Text variant="bodyMedium" style={[styles.quickInfoText, { color: theme.colors.onSurfaceVariant }]}>
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
            <Text variant="titleLarge" style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
              About This Event
            </Text>
            <Text variant="bodyLarge" style={[styles.description, { color: theme.colors.onSurfaceVariant }]}>
              {event.description}
            </Text>
          </View>

          {/* Event Details */}
          <View style={styles.section}>
            <Text variant="titleLarge" style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
              Details
            </Text>

            <View style={[styles.detailRow, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', borderColor: theme.colors.outline }]}>
              <IconButton icon="calendar" size={24} />
              <View style={styles.detailContent}>
                <Text variant="labelLarge">Date</Text>
                <Text variant="bodyMedium" style={[styles.detailText, { color: theme.colors.onSurfaceVariant }]}>
                  {formatDate(event.startDate)}
                </Text>
              </View>
            </View>

            <View style={[styles.detailRow, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', borderColor: theme.colors.outline }]}>
              <IconButton icon="clock" size={24} />
              <View style={styles.detailContent}>
                <Text variant="labelLarge">Time</Text>
                <Text variant="bodyMedium" style={[styles.detailText, { color: theme.colors.onSurfaceVariant }]}>
                  {formatTime(event.startDate)} - {formatTime(event.endDate)}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              activeOpacity={event.isVirtual ? 1 : 0.7}
              onPress={() => {
                if (event.isVirtual) return;
                const address = encodeURIComponent(event.location);
                const url = Platform.select({
                  ios: `maps:0,0?q=${address}`,
                  android: `geo:0,0?q=${address}`,
                }) || `https://www.google.com/maps/search/?api=1&query=${address}`;
                Linking.openURL(url);
              }}
            >
              <View style={[styles.detailRow, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', borderColor: theme.colors.outline }]}>
                <IconButton icon={event.isVirtual ? "video" : "map-marker"} size={24} />
                <View style={styles.detailContent}>
                  <Text variant="labelLarge">Location</Text>
                  <Text variant="bodyMedium" style={[styles.detailText, { color: event.isVirtual ? theme.colors.onSurfaceVariant : '#60A5FA' }]}>
                    {event.isVirtual ? 'Virtual Event' : event.location}
                  </Text>
                </View>
                {event.isVirtual && event.virtualLink && isAttending ? (
                  <IconButton
                    icon="open-in-new"
                    size={20}
                    onPress={openVirtualLink}
                  />
                ) : !event.isVirtual ? (
                  <IconButton icon="open-in-new" size={20} iconColor="#60A5FA" />
                ) : null}
              </View>
            </TouchableOpacity>

            {event.ticketPrice > 0 && (
              <View style={[styles.detailRow, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', borderColor: theme.colors.outline }]}>
                <IconButton icon="currency-usd" size={24} />
                <View style={styles.detailContent}>
                  <Text variant="labelLarge">Price</Text>
                  <Text variant="bodyMedium" style={[styles.detailText, { color: theme.colors.onSurfaceVariant }]}>
                    ${event.ticketPrice.toString()} {typeof event.currency === 'string' && event.currency.trim() !== '' ? event.currency : 'USD'}
                  </Text>
                </View>
              </View>
            )}

            {event.rallyCreditsAwarded > 0 && (
              <View style={[styles.detailRow, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', borderColor: theme.colors.outline }]}>
                <IconButton icon="star-circle" size={24} iconColor="#FFD700" />
                <View style={styles.detailContent}>
                  <Text variant="labelLarge">Rally Credits Payout</Text>
                  <Text variant="bodyMedium" style={[styles.detailText, { color: theme.colors.onSurfaceVariant }]}>
                    +{event.rallyCreditsAwarded?.toString() || '0'} credits for joining
                  </Text>
                </View>
              </View>
            )}

            {user && userCredits && event.clubId && (
              <View style={[styles.detailRow, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', borderColor: theme.colors.outline }]}>
                <IconButton icon="wallet" size={24} iconColor="#FFD700" />
                <View style={styles.detailContent}>
                  <Text variant="labelLarge">Your {event.clubName} Credits</Text>
                  <Text variant="bodyMedium" style={[styles.detailText, { color: theme.colors.onSurfaceVariant }]}>
                    {(userCredits.clubCredits?.[event.clubId] || 0).toString()} total credits
                  </Text>
                </View>
              </View>
            )}

            {/* Show "View Signed Waiver" for attending users who signed */}
            {isAttending && event.hasWaiver && signedWaiver && (
              <TouchableOpacity
                style={[styles.detailRow, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', borderColor: theme.colors.outline }]}
                onPress={() => setShowSignedWaiverModal(true)}
                activeOpacity={0.7}
              >
                <IconButton icon="file-document-check" size={24} iconColor="#10B981" />
                <View style={styles.detailContent}>
                  <Text variant="labelLarge">Event Waiver</Text>
                  <Text variant="bodyMedium" style={[styles.detailText, { color: '#10B981' }]}>
                    Signed {signedWaiver.signedAt.toLocaleDateString()} - Tap to view
                  </Text>
                </View>
                <IconButton icon="chevron-right" size={20} iconColor={theme.colors.onSurfaceDisabled} style={{ margin: 0 }} />
              </TouchableOpacity>
            )}
          </View>

          {/* Attendee Info */}
          <View style={styles.statsContainer}>
            <View style={[styles.statCard, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)', borderColor: theme.colors.outline }]}>
              <Text variant="headlineSmall" style={[styles.statNumber, { color: theme.colors.onSurface }]}>
                {event.attendees.length.toString()}
              </Text>
              <Text variant="bodyMedium" style={[styles.statLabel, { color: theme.colors.onSurfaceVariant }]}>
                Attending
              </Text>
            </View>

            {(event.maxAttendees ?? 0) > 0 && (
              <View style={[styles.statCard, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)', borderColor: theme.colors.outline }]}>
                <Text variant="headlineSmall" style={[styles.statNumber, { color: theme.colors.onSurface }]}>
                  {(event.maxAttendees - event.attendees.length).toString()}
                </Text>
                <Text variant="bodyMedium" style={[styles.statLabel, { color: theme.colors.onSurfaceVariant }]}>
                  Spots Left
                </Text>
              </View>
            )}

            {event.waitlist.length > 0 && (
              <View style={[styles.statCard, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)', borderColor: theme.colors.outline }]}>
                <Text variant="headlineSmall" style={[styles.statNumber, { color: theme.colors.onSurface }]}>
                  {event.waitlist.length.toString()}
                </Text>
                <Text variant="bodyMedium" style={[styles.statLabel, { color: theme.colors.onSurfaceVariant }]}>
                  Waitlisted
                </Text>
              </View>
            )}
          </View>

          {/* Virtual Event Link Card */}
          {event.isVirtual && event.virtualLink && isAttending && (
            <View style={styles.section}>
              <Card style={[styles.virtualCard, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)', borderColor: theme.colors.outline }]}>
                <Card.Content style={styles.virtualContent}>
                  <IconButton icon="video" size={48} iconColor={theme.colors.primary} />
                  <Text variant="titleLarge" style={[styles.virtualTitle, { color: theme.colors.onSurface }]}>
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
              <Text variant="titleLarge" style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
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
                      style={[styles.memberRow, { borderBottomColor: theme.colors.outline }]}
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
                          <ExpoImage
                            source={{ uri: attendee.avatar }}
                            style={styles.attendeeAvatar}
                            transition={200}
                            cachePolicy="memory-disk"
                          />
                        ) : (
                          <View style={[styles.avatarCircle, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.1)' }]}>
                            <Text variant="labelLarge" style={[styles.avatarText, { color: theme.colors.onSurface }]}>
                              {initials}
                            </Text>
                          </View>
                        )}
                        <Text variant="bodyLarge" style={[styles.memberId, { color: theme.colors.onSurface }]} numberOfLines={1}>
                          {displayName}
                        </Text>
                      </View>
                      {/* little arrow so people know it's tappable */}
                      <IconButton icon="chevron-right" size={20} iconColor={theme.colors.onSurfaceDisabled} style={{ margin: 0 }} />
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Tags */}
          {event.tags && event.tags.length > 0 && (
            <View style={styles.section}>
              <Text variant="titleLarge" style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
                Tags
              </Text>
              <View style={styles.tagsGrid}>
                {event.tags.map((tag) => (
                  <Chip key={tag} style={[styles.topicChip, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)', borderColor: theme.colors.outline }]} mode="flat">
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

      {/* Signed Waiver View Modal */}
      <Modal
        visible={showSignedWaiverModal}
        transparent
        animationType="none"
        onRequestClose={() => setShowSignedWaiverModal(false)}
      >
        <Animated.View style={[
          styles.waiverModalOverlay,
          {
            opacity: signedWaiverSheetAnim.interpolate({
              inputRange: [0, Dimensions.get('window').height],
              outputRange: [1, 0],
              extrapolate: 'clamp',
            }),
          }
        ]}>
          {/* Tap outside to dismiss */}
          <Pressable style={styles.waiverModalBackdrop} onPress={() => setShowSignedWaiverModal(false)} />

          <Animated.View style={[
            styles.signedWaiverModalContent,
            { backgroundColor: theme.dark ? '#1C1C1E' : '#FFFFFF' },
            { transform: [{ translateY: signedWaiverSheetAnim }] }
          ]}>
            {/* Header */}
            <View style={styles.signedWaiverHeader}>
              <View style={styles.signedWaiverTitleRow}>
                <IconButton icon="file-document-check" size={28} iconColor="#10B981" style={{ margin: 0 }} />
                <Text style={[styles.signedWaiverTitle, { color: theme.colors.onSurface }]}>
                  Signed Waiver
                </Text>
              </View>
              <IconButton
                icon="close"
                size={24}
                iconColor={theme.colors.onSurfaceVariant}
                onPress={() => setShowSignedWaiverModal(false)}
                style={{ margin: 0 }}
              />
            </View>

            {/* Formatted Waiver Document */}
            <ScrollView style={styles.signedWaiverScroll} showsVerticalScrollIndicator>
              {/* Event Title */}
              <View style={[
                styles.signedWaiverEventHeader,
                {
                  backgroundColor: theme.dark ? 'rgba(139, 92, 246, 0.1)' : '#F0F4F8',
                  borderColor: theme.dark ? 'rgba(139, 92, 246, 0.3)' : '#D1D9E6'
                }
              ]}>
                <Text style={[styles.signedWaiverEventTitle, { color: theme.colors.onSurface }]}>
                  {event?.title}
                </Text>
              </View>

              {/* Terms & Conditions Section */}
              <View style={styles.signedWaiverSection}>
                <Text style={[styles.signedWaiverSectionHeader, { color: theme.dark ? '#8B5CF6' : '#1B365D' }]}>
                  TERMS & CONDITIONS
                </Text>
                <View style={[
                  styles.signedWaiverContentBox,
                  {
                    backgroundColor: theme.dark ? 'rgba(255,255,255,0.03)' : '#F9FAFB',
                    borderLeftColor: theme.dark ? '#8B5CF6' : '#1B365D'
                  }
                ]}>
                  <Text style={[styles.signedWaiverBodyText, { color: theme.colors.onSurface }]}>
                    {event?.waiverText}
                  </Text>
                </View>
              </View>

              {/* Electronic Signature Section */}
              <View style={styles.signedWaiverSection}>
                <Text style={[styles.signedWaiverSectionHeader, { color: theme.dark ? '#8B5CF6' : '#1B365D' }]}>
                  ELECTRONIC SIGNATURE
                </Text>
                <View style={[
                  styles.signedWaiverSignatureBox,
                  {
                    backgroundColor: theme.dark ? 'rgba(139, 92, 246, 0.08)' : '#F0F4F8',
                    borderColor: theme.dark ? 'rgba(139, 92, 246, 0.2)' : '#D1D9E6'
                  }
                ]}>
                  <View style={styles.signedWaiverSigRow}>
                    <Text style={[styles.signedWaiverSigLabel, { color: theme.colors.onSurfaceVariant }]}>
                      Full Name
                    </Text>
                    <Text style={[styles.signedWaiverSigValue, { color: theme.colors.onSurface }]}>
                      {userProfile?.displayName ||
                       (userProfile?.firstName || userProfile?.lastName
                         ? `${userProfile?.firstName || ''} ${userProfile?.lastName || ''}`.trim()
                         : user?.email)}
                    </Text>
                  </View>
                  <View style={[styles.signedWaiverSigDivider, { backgroundColor: theme.dark ? 'rgba(255,255,255,0.1)' : '#E5E7EB' }]} />

                  <View style={styles.signedWaiverSigRow}>
                    <Text style={[styles.signedWaiverSigLabel, { color: theme.colors.onSurfaceVariant }]}>
                      Email Address
                    </Text>
                    <Text style={[styles.signedWaiverSigValue, { color: theme.colors.onSurface }]}>
                      {user?.email}
                    </Text>
                  </View>
                  <View style={[styles.signedWaiverSigDivider, { backgroundColor: theme.dark ? 'rgba(255,255,255,0.1)' : '#E5E7EB' }]} />

                  <View style={styles.signedWaiverSigRow}>
                    <Text style={[styles.signedWaiverSigLabel, { color: theme.colors.onSurfaceVariant }]}>
                      Initials
                    </Text>
                    <Text style={[styles.signedWaiverInitials, { color: theme.dark ? '#8B5CF6' : '#1B365D' }]}>
                      {signedWaiver?.initials}
                    </Text>
                  </View>
                  <View style={[styles.signedWaiverSigDivider, { backgroundColor: theme.dark ? 'rgba(255,255,255,0.1)' : '#E5E7EB' }]} />

                  <View style={styles.signedWaiverSigRow}>
                    <Text style={[styles.signedWaiverSigLabel, { color: theme.colors.onSurfaceVariant }]}>
                      Date & Time
                    </Text>
                    <Text style={[styles.signedWaiverSigValue, { color: theme.colors.onSurface }]}>
                      {signedWaiver?.signedAt.toLocaleDateString([], {
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric',
                      })}{'\n'}
                      {signedWaiver?.signedAt.toLocaleTimeString([], {
                        hour: 'numeric',
                        minute: '2-digit'
                      })}
                    </Text>
                  </View>
                </View>
              </View>
            </ScrollView>

            {/* Action Buttons */}
            <View style={styles.signedWaiverActions}>
              <TouchableOpacity
                style={[
                  styles.signedWaiverShareButton,
                  { backgroundColor: theme.dark ? '#60A5FA' : '#1B365D' }
                ]}
                onPress={async () => {
                  // Prevent multiple taps while generating
                  if (exportingPDF || !event || !user || !signedWaiver) return;

                  setExportingPDF(true);

                  try {
                    // Get display name from user profile
                    let displayName = user.email || 'User';
                    if (userProfile) {
                      if (userProfile.displayName) {
                        displayName = userProfile.displayName;
                      } else if (userProfile.firstName || userProfile.lastName) {
                        displayName = `${userProfile.firstName || ''} ${userProfile.lastName || ''}`.trim();
                      }
                    }

                    // Check if we have a cached PDF and it still exists
                    if (cachedPdfUri.current) {
                      // Try to share the cached PDF first
                      try {
                        const result = await generateAndShareWaiverPDF({
                          eventTitle: event.title,
                          waiverText: event.waiverText || '',
                          signerName: displayName,
                          signerEmail: user.email || '',
                          initials: signedWaiver.initials,
                          signedAt: signedWaiver.signedAt,
                          cachedUri: cachedPdfUri.current,
                        });

                        if (result.success) {
                          setExportingPDF(false);
                          return;
                        }
                        // If cached failed, regenerate below
                      } catch (e) {
                        // Cache failed, regenerate
                        cachedPdfUri.current = null;
                      }
                    }

                    // Generate new PDF and cache it
                    const result = await generateAndShareWaiverPDF({
                      eventTitle: event.title,
                      waiverText: event.waiverText || '',
                      signerName: displayName,
                      signerEmail: user.email || '',
                      initials: signedWaiver.initials,
                      signedAt: signedWaiver.signedAt,
                    });

                    if (result.success && result.uri) {
                      cachedPdfUri.current = result.uri;
                    } else if (!result.success) {
                      Alert.alert('Error', `Failed to generate PDF: ${result.error}`);
                    }
                  } finally {
                    setExportingPDF(false);
                  }
                }}
                activeOpacity={0.8}
              >
                <IconButton icon="file-pdf-box" size={20} iconColor="#FFFFFF" style={{ margin: 0 }} />
                <Text style={styles.signedWaiverShareText}>Export PDF</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.signedWaiverCloseButton,
                  { backgroundColor: theme.dark ? 'rgba(255,255,255,0.1)' : '#F3F4F6' }
                ]}
                onPress={() => setShowSignedWaiverModal(false)}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.signedWaiverCloseText,
                  { color: theme.dark ? 'rgba(255,255,255,0.8)' : '#6B7280' }
                ]}>Close</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </Animated.View>
      </Modal>

      {/* Waiver Modal */}
      <Modal
        visible={waiverModalVisible}
        transparent
        animationType="none"
        onRequestClose={dismissWaiverModal}
      >
        <Animated.View style={[
          styles.waiverModalOverlay,
          {
            opacity: waiverSheetAnim.interpolate({
              inputRange: [0, Dimensions.get('window').height],
              outputRange: [1, 0],
              extrapolate: 'clamp',
            }),
          }
        ]}>
          {/* Tap outside to dismiss */}
          <Pressable style={styles.waiverModalBackdrop} onPress={dismissWaiverModal} />

          <Animated.View style={[
            styles.waiverModalContent,
            { backgroundColor: theme.dark ? '#1C1C1E' : '#FFFFFF' },
            { transform: [{ translateY: waiverSheetAnim }] }
          ]}>
            {/* Draggable handle area */}
            <View {...waiverPanResponder.panHandlers} style={styles.waiverHandleArea}>
              <View style={[
                styles.waiverModalHandle,
                { backgroundColor: theme.dark ? 'rgba(255,255,255,0.3)' : '#E5E7EB' }
              ]} />
            </View>

            <ScrollProvider scrollViewRef={waiverScrollViewRef} currentScrollY={currentWaiverScrollY}>
              <ScrollView
                ref={waiverScrollViewRef}
                style={{ flex: 1 }}
                contentContainerStyle={{ flexGrow: 1 }}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                bounces={false}
                onScroll={(e) => {
                  currentWaiverScrollY.current = e.nativeEvent.contentOffset.y;
                }}
                scrollEventThrottle={16}
                onContentSizeChange={(contentWidth, contentHeight) => {
                // If content fits without scrolling (5 lines or less), auto-unlock agreement
                // maxHeight is 250, padding is 32 (16 top + 16 bottom)
                if (contentHeight <= 250 - 32 && !waiverScrolledToBottom) {
                  setWaiverScrolledToBottom(true);
                }
              }}
            >
                <WaiverModalContent
                  event={event}
                  theme={theme}
                  waiverScrolledToBottom={waiverScrolledToBottom}
                  setWaiverScrolledToBottom={setWaiverScrolledToBottom}
                  waiverAgreed={waiverAgreed}
                  setWaiverAgreed={setWaiverAgreed}
                  waiverInitials={waiverInitials}
                  setWaiverInitials={setWaiverInitials}
                  handleWaiverScroll={handleWaiverScroll}
                  waiverHintOpacity={waiverHintOpacity}
                  waiverAgreementOpacity={waiverAgreementOpacity}
                  dismissWaiverModal={dismissWaiverModal}
                  proceedWithJoin={proceedWithJoin}
                  user={user}
                  waiverSheetAnim={waiverSheetAnim}
                  setWaiverModalVisible={setWaiverModalVisible}
                />
              </ScrollView>
            </ScrollProvider>
          </Animated.View>
        </Animated.View>
      </Modal>

      {/* Floating Action Button */}
      {user && isUpcoming && (
        <TouchableOpacity
          onPress={isAttending || isWaitlisted ? handleLeaveEvent : handleJoinEvent}
          disabled={actionLoading || (!isAttending && !isWaitlisted && !!isFull)}
          activeOpacity={0.8}
          style={styles.floatingButtonWrapper}
        >
          <LinearGradient
            colors={isAttending || isWaitlisted
              ? (isDark ? ['rgba(255,255,255,0.15)', 'rgba(255,255,255,0.08)'] : ['rgba(0,0,0,0.1)', 'rgba(0,0,0,0.05)'])
              : (isDark ? ['rgba(255,255,255,0.25)', 'rgba(255,255,255,0.15)'] : ['rgba(0,0,0,0.15)', 'rgba(0,0,0,0.1)'])}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[
              styles.floatingButton,
              (isAttending || isWaitlisted) && [styles.floatingButtonOutlined, { borderColor: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.2)' }],
              (actionLoading || (!isAttending && !isWaitlisted && !!isFull)) && styles.floatingButtonDisabled
            ]}
          >
            {actionLoading ? (
              <ActivityIndicator color={theme.colors.onSurface} size="small" />
            ) : (
              <Text style={[styles.floatingButtonText, { color: theme.colors.onSurface }]}>
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
  customMenu: {
    position: 'absolute',
    top: 54,
    right: 0,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    minWidth: 180,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  customMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 4,
  },
  customMenuText: {
    fontSize: 15,
    fontWeight: '500',
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
    fontWeight: '600',
  },
  statusChipTextDark: {
    fontWeight: '600',
  },
  heroTitle: {
    fontWeight: 'bold',
    marginBottom: 4,
  },
  clubHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  clubHeaderLogo: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  clubHeaderLogoPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroClubName: {
    flex: 1,
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
  },
  heroActionButtonDisabled: {
    opacity: 0.5,
  },
  heroActionButtonText: {
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
  },
  description: {
    lineHeight: 26,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
  },
  detailContent: {
    flex: 1,
    marginLeft: -8,
  },
  detailText: {
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
    alignItems: 'center',
    borderWidth: 1,
  },
  statNumber: {
    fontWeight: 'bold',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    textAlign: 'center',
  },
  virtualCard: {
    borderRadius: 16,
    elevation: 0,
    borderWidth: 1,
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
    borderWidth: 1,
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
    justifyContent: 'center',
    alignItems: 'center',
  },
  attendeeAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  avatarText: {
    fontWeight: 'bold',
  },
  memberId: {
    flex: 1,
    fontSize: 14,
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
  },
  floatingButtonDisabled: {
    opacity: 0.5,
  },
  floatingButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  waiverModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  waiverModalBackdrop: {
    flex: 1,
  },
  waiverModalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingBottom: 40,
    height: '80%',
  },
  waiverHandleArea: {
    paddingTop: 12,
    paddingBottom: 8,
    alignItems: 'center',
  },
  waiverModalHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#E5E7EB',
    borderRadius: 2,
    marginBottom: 12,
  },
  waiverModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  waiverModalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1B365D',
  },
  waiverModalSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 16,
    lineHeight: 20,
  },
  waiverTextContainer: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    minHeight: 110, // At least 5 lines (5 * 22 lineHeight)
    maxHeight: 250,
    marginBottom: 8,
  },
  waiverText: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 22,
  },
  waiverScrollHint: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 8,
    fontStyle: 'italic',
  },
  waiverAgreementSection: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 20,
  },
  waiverCheckboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  waiverCheckboxText: {
    flex: 1,
    fontSize: 15,
    color: '#374151',
    fontWeight: '500',
  },
  waiverInitialsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  waiverInitialsLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  waiverInitialsInput: {
    width: 80,
    height: 44,
    borderRadius: 10,
    borderWidth: 1.5,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 2,
  },
  waiverButtonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  waiverCancelButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
  },
  waiverCancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },
  waiverConfirmButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: '#1B365D',
    alignItems: 'center',
  },
  waiverConfirmButtonDisabled: {
    backgroundColor: '#D1D5DB',
  },
  waiverConfirmButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  waiverConfirmButtonTextDisabled: {
    color: '#9CA3AF',
  },
  // Signed Waiver Modal Styles
  signedWaiverModalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
    maxHeight: '85%',
  },
  signedWaiverHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  signedWaiverTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  signedWaiverTitle: {
    fontSize: 22,
    fontWeight: '700',
  },
  signedWaiverScroll: {
    flexGrow: 0,
    marginBottom: 20,
  },
  signedWaiverEventHeader: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
  },
  signedWaiverEventTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  signedWaiverSection: {
    marginBottom: 24,
  },
  signedWaiverSectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 12,
  },
  signedWaiverContentBox: {
    borderRadius: 8,
    padding: 16,
    borderLeftWidth: 3,
  },
  signedWaiverBodyText: {
    fontSize: 14,
    lineHeight: 22,
  },
  signedWaiverSignatureBox: {
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
  },
  signedWaiverSigRow: {
    paddingVertical: 12,
  },
  signedWaiverSigLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  signedWaiverSigValue: {
    fontSize: 15,
    fontWeight: '600',
  },
  signedWaiverInitials: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 3,
  },
  signedWaiverSigDivider: {
    height: 1,
    marginVertical: 0,
  },
  signedWaiverActions: {
    flexDirection: 'row',
    gap: 12,
  },
  signedWaiverShareButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 4,
  },
  signedWaiverShareText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  signedWaiverCloseButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
  },
  signedWaiverCloseText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
