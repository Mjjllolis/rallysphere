import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Image,
  Dimensions,
  TouchableOpacity,
  Pressable,
  Alert,
  Share,
  Platform,
  Modal,
  Animated,
  ScrollView,
  TextInput,
  PanResponder,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Text, Chip, IconButton, useTheme } from 'react-native-paper';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import Svg, { Defs, Pattern as SvgPattern, Rect as SvgRect } from 'react-native-svg';
import type { Event } from '../../../../lib/firebase';
import { useAuth, useThemeToggle } from '../../../_layout';
import { joinEvent, getEventById, bookmarkEvent, unbookmarkEvent, getUserBookmarks, likeEvent, unlikeEvent, getUserLikes, getClub, storeWaiverSignature } from '../../../../lib/firebase';
import PaymentSheet from '../../../../components/PaymentSheet';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const ALBUM_WIDTH = SCREEN_WIDTH * 0.85;

// Pre-compute subtle dust specks tile
const DUST_TILE = 80;
const DUST_SPECKS = (() => {
  const specks: Array<{ x: number; y: number; size: number; opacity: number; color: string }> = [];
  const hash = (n: number) => ((Math.sin(n) * 43758.5453) % 1 + 1) % 1;

  for (let i = 0; i < 120; i++) {
    const x = Math.floor(hash(i * 13.37 + 7.1) * DUST_TILE);
    const y = Math.floor(hash(i * 7.91 + 3.3) * DUST_TILE);
    const size = 0.5 + hash(i * 5.17 + 11.9) * 1;
    specks.push({
      x,
      y,
      size,
      opacity: 0.015 + hash(i * 3.71 + 9.2) * 0.025,
      color: hash(i * 11.3) > 0.5 ? '#fff' : '#000',
    });
  }
  return specks;
})();

interface EventSwipeCardProps {
  event: Event;
  isActive: boolean;
  isFeatured?: boolean;
  onFeaturedClick?: () => void;
}

export default function EventSwipeCard({
  event: initialEvent,
  isActive,
  isFeatured = false,
  onFeaturedClick
}: EventSwipeCardProps) {
  const theme = useTheme();
  const { isDark } = useThemeToggle();
  const { user } = useAuth();
  const [event, setEvent] = useState(initialEvent);
  const [isJoining, setIsJoining] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [bookmarkLoading, setBookmarkLoading] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [likeLoading, setLikeLoading] = useState(false);
  const [paymentSheetVisible, setPaymentSheetVisible] = useState(false);

  // Waiver state
  const [waiverModalVisible, setWaiverModalVisible] = useState(false);
  const [waiverAgreed, setWaiverAgreed] = useState(false);
  const [waiverInitials, setWaiverInitials] = useState('');
  const [waiverScrolledToBottom, setWaiverScrolledToBottom] = useState(false);
  const waiverSheetAnim = useRef(new Animated.Value(Dimensions.get('window').height)).current;
  const waiverHintOpacity = useRef(new Animated.Value(1)).current;
  const waiverAgreementOpacity = useRef(new Animated.Value(0.4)).current;

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

  const showWaiverModal = () => {
    setWaiverAgreed(false);
    setWaiverInitials('');
    setWaiverScrolledToBottom(false);
    waiverHintOpacity.setValue(1);
    waiverAgreementOpacity.setValue(0.4);
    setWaiverModalVisible(true);
    Animated.timing(waiverSheetAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  const handleWaiverScroll = (e: any) => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    const isAtBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 20;
    if (isAtBottom && !waiverScrolledToBottom) {
      setWaiverScrolledToBottom(true);
    }
  };

  useEffect(() => {
    if (waiverScrolledToBottom) {
      Animated.parallel([
        Animated.timing(waiverHintOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
        Animated.timing(waiverAgreementOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]).start();
    }
  }, [waiverScrolledToBottom]);

  const waiverPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => gs.dy > 5,
      onPanResponderMove: (_, gs) => { if (gs.dy > 0) waiverSheetAnim.setValue(gs.dy); },
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > 100 || gs.vy > 0.5) {
          dismissWaiverModal();
        } else {
          Animated.spring(waiverSheetAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start();
        }
      },
    })
  ).current;

  const proceedAfterWaiver = () => {
    if (event.ticketPrice && event.ticketPrice > 0) {
      setPaymentSheetVisible(true);
    } else {
      joinFreeEvent();
    }
  };

  const joinFreeEvent = async () => {
    if (!user) return;
    setIsJoining(true);
    try {
      const result = await joinEvent(event.id, user.uid);
      if (result.success) {
        if (result.waitlisted) {
          Alert.alert('Added to Waitlist', 'You have been added to the waitlist');
        } else {
          Alert.alert('Joined!', 'You have joined this event');
        }
        await refreshEventData();
      } else {
        Alert.alert('Error', result.error || 'Failed to join event');
      }
    } catch (error) {
      Alert.alert('Error', 'An unexpected error occurred');
    } finally {
      setIsJoining(false);
    }
  };
  const [clubLogo, setClubLogo] = useState<string | undefined>(initialEvent.clubLogo);
  const [imageAspectRatio, setImageAspectRatio] = useState<number | null>(null);

  useEffect(() => {
    setEvent(initialEvent);
    setClubLogo(initialEvent.clubLogo);
  }, [initialEvent]);

  useEffect(() => {
    if (user) {
      loadBookmarkStatus();
      loadLikeStatus();
    }
  }, [user, event.id]);

  // Get cover image aspect ratio for proper rounded corners
  useEffect(() => {
    if (event.coverImage) {
      Image.getSize(event.coverImage, (w, h) => {
        setImageAspectRatio(w / h);
      }, () => {});
    }
  }, [event.coverImage]);

  // Fetch club logo if not present on event
  useEffect(() => {
    const fetchClubLogo = async () => {
      if (!clubLogo && event.clubId) {
        const result = await getClub(event.clubId);
        if (result.success && result.club?.logo) {
          setClubLogo(result.club.logo);
        }
      }
    };
    fetchClubLogo();
  }, [event.clubId, clubLogo]);

  const loadBookmarkStatus = async () => {
    if (!user) return;
    const result = await getUserBookmarks(user.uid);
    if (result.success) {
      setIsBookmarked(result.bookmarks.includes(event.id));
    }
  };

  const loadLikeStatus = async () => {
    if (!user) return;
    const result = await getUserLikes(user.uid);
    if (result.success) {
      setIsLiked(result.likes.includes(event.id));
    }
  };

  const refreshEventData = async () => {
    const result = await getEventById(event.id);
    if (result.success && result.event) {
      setEvent(result.event);
    }
  };

  const formatDate = (date: any) => {
    if (!date) return '';
    const eventDate = date.toDate ? date.toDate() : new Date(date);
    return eventDate.toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
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

  const handleQuickJoin = async () => {
    if (!user) {
      Alert.alert('Sign In Required', 'Please sign in to join events');
      return;
    }

    // If event has a waiver, show waiver modal first
    if (event.hasWaiver && event.waiverText) {
      showWaiverModal();
      return;
    }

    // No waiver - proceed directly
    if (event.ticketPrice && event.ticketPrice > 0) {
      setPaymentSheetVisible(true);
    } else {
      await joinFreeEvent();
    }
  };

  const handlePaymentSuccess = async () => {
    // Refresh event data after successful payment
    await refreshEventData();
  };

  const handleBookmark = async () => {
    if (!user) {
      Alert.alert('Sign In Required', 'Please sign in to bookmark events');
      return;
    }

    setBookmarkLoading(true);
    try {
      if (isBookmarked) {
        const result = await unbookmarkEvent(event.id, user.uid);
        if (result.success) {
          setIsBookmarked(false);
        } else {
          Alert.alert('Error', result.error || 'Failed to unbookmark event');
        }
      } else {
        const result = await bookmarkEvent(event.id, user.uid);
        if (result.success) {
          setIsBookmarked(true);
        } else {
          Alert.alert('Error', result.error || 'Failed to bookmark event');
        }
      }
    } catch (error) {
      // console.error('Error bookmarking event:', error);
      Alert.alert('Error', 'An unexpected error occurred');
    } finally {
      setBookmarkLoading(false);
    }
  };

  const handleLike = async () => {
    if (!user) {
      Alert.alert('Sign In Required', 'Please sign in to like events');
      return;
    }

    setLikeLoading(true);
    try {
      if (isLiked) {
        const result = await unlikeEvent(event.id, user.uid);
        if (result.success) {
          setIsLiked(false);
          // Refresh event data to update like count
          await refreshEventData();
        } else {
          Alert.alert('Error', result.error || 'Failed to unlike event');
        }
      } else {
        const result = await likeEvent(event.id, user.uid);
        if (result.success) {
          setIsLiked(true);
          // Refresh event data to update like count
          await refreshEventData();
        } else {
          Alert.alert('Error', result.error || 'Failed to like event');
        }
      }
    } catch (error) {
      // console.error('Error liking event:', error);
      Alert.alert('Error', 'An unexpected error occurred');
    } finally {
      setLikeLoading(false);
    }
  };

  const handleCardPress = () => {
    if (isFeatured && onFeaturedClick) {
      onFeaturedClick();
    }
    router.push(`/event/${event.id}`);
  };

  // Generate link with id
  const getShareUrl = () => {
    return `https://rallysphere.app/event/${event.id}`;
  };

  const handleShare = async () => {
    try {
      const shareUrl = getShareUrl();
      const message = Platform.OS === 'ios'
        ? `Check out this event: ${event.title} by ${event.clubName}`
        : `Check out this event: ${event.title} by ${event.clubName}\n\n${shareUrl}`;

      const result = await Share.share({
        message,
        url: shareUrl,
        title: event.title,
      });

      if (result.action === Share.sharedAction) {
        if (result.activityType) {
          // console.log('Shared via:', result.activityType); //works for IOS
        } else {
          // shared
          // console.log('Content shared'); //android we dont get type
        }
      } else if (result.action === Share.dismissedAction) {
        // dismissed
        // console.log('Share dismissed');
      }
    } catch (error) {
      // console.error('Error sharing:', error);
      Alert.alert('Error', 'Failed to share event');
    }
  };


  const isAttending = user ? event.attendees.includes(user.uid) : false;
  const isWaitlisted = user ? event.waitlist.includes(user.uid) : false;
  const isFull = event.maxAttendees && event.attendees.length >= event.maxAttendees;

  // Check if event is in the past
  const isPastEvent = event.startDate ?
    (event.startDate.toDate ? event.startDate.toDate() : new Date(event.startDate)) < new Date() :
    false;

  return (
    <Pressable
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      onPress={handleCardPress}
    >
      {/* Blurred Background Image - only in dark mode */}
      {isDark && event.coverImage ? (
        <ExpoImage
          source={{ uri: event.coverImage }}
          style={styles.blurredBackground}
          contentFit="cover"
          blurRadius={80}
          transition={200}
          cachePolicy="memory-disk"
          recyclingKey={event.coverImage}
        />
      ) : isDark ? (
        <View style={[styles.blurredBackground, { backgroundColor: theme.colors.surfaceVariant }]} />
      ) : null}

      {/* Gradient Overlay */}
      {isDark ? (
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.1)', 'rgba(0,0,0,0.3)', 'rgba(0,0,0,0.7)', 'rgba(0,0,0,0.95)', 'rgba(0,0,0,1)']}
          locations={[0, 0.3, 0.5, 0.7, 0.85, 1]}
          style={styles.gradientOverlay}
        />
      ) : (
        <LinearGradient
          colors={[
            'rgba(139, 92, 246, 0.3)',
            'rgba(96, 165, 250, 0.1)',
            'rgba(248, 250, 252, 0)',
          ]}
          locations={[0, 0.3, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      )}

      {/* Subtle dust texture overlay */}
      <Svg style={styles.grainOverlay} pointerEvents="none">
        <Defs>
          <SvgPattern id="dust" x="0" y="0" width={DUST_TILE} height={DUST_TILE} patternUnits="userSpaceOnUse">
            {DUST_SPECKS.map((speck, i) => (
              <SvgRect key={i} x={speck.x} y={speck.y} width={speck.size} height={speck.size} fill={speck.color} opacity={speck.opacity} rx={speck.size / 2} />
            ))}
          </SvgPattern>
        </Defs>
        <SvgRect x="0" y="0" width="100%" height="100%" fill="url(#dust)" />
      </Svg>

      {/* Main Cover Image - Maintains aspect ratio and centered */}
      <View style={styles.coverImageOuter}>
        {event.coverImage ? (
          <View style={[
            styles.coverImageWrapper,
            imageAspectRatio ? { aspectRatio: imageAspectRatio } : { flex: 1 }
          ]}>
            <ExpoImage
              source={{ uri: event.coverImage }}
              style={styles.coverImage}
              contentFit="cover"
              transition={200}
              cachePolicy="memory-disk"
              recyclingKey={event.coverImage}
            />
          </View>
        ) : (
          <View style={[styles.coverImageWrapper, styles.coverPlaceholder, { flex: 1, backgroundColor: theme.colors.surfaceVariant }]}>
            <Text variant="displayLarge" style={{ color: theme.colors.onSurfaceVariant }}>
              {event.title.charAt(0)}
            </Text>
          </View>
        )}
      </View>

      {/* Featured Badge */}
      {isFeatured && (
        <Chip
          icon="star"
          style={styles.featuredBadge}
          textStyle={styles.featuredText}
        >
          Featured
        </Chip>
      )}

      {/* Event Info at Bottom */}
      <View style={styles.bottomContent}>
        <View style={styles.eventInfo}>
          <Text variant="titleLarge" style={[styles.title, { color: theme.colors.onSurface }]} numberOfLines={1}>
            {event.title}
          </Text>

          <TouchableOpacity
            style={styles.clubRow}
            onPress={(e) => { e.stopPropagation(); router.push(`/club/${event.clubId}`); }}
            activeOpacity={0.7}
          >
            {clubLogo ? (
              <ExpoImage
                source={{ uri: clubLogo }}
                style={styles.clubLogo}
                contentFit="cover"
                transition={200}
                cachePolicy="memory-disk"
                recyclingKey={clubLogo}
                accessible={true}
                accessibilityLabel={`${event.clubName} logo`}
              />
            ) : (
              <View style={[styles.clubLogo, styles.clubLogoPlaceholder, { backgroundColor: theme.colors.surfaceVariant }]}>
                <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12, fontWeight: '600' }}>
                  {event.clubName.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <Text variant="bodyLarge" style={[styles.clubName, { color: theme.colors.onSurfaceVariant }]} numberOfLines={1}>
              {event.clubName}
            </Text>
            <IconButton icon="chevron-right" size={16} iconColor={theme.colors.onSurfaceVariant} style={{ margin: 0 }} />
          </TouchableOpacity>

          <View style={styles.compactDetailsRow}>
            <View style={styles.detailItem}>
              <IconButton icon="calendar" size={16} iconColor={theme.colors.onSurfaceVariant} style={styles.icon} />
              <Text style={[styles.detailText, { color: theme.colors.onSurfaceVariant }]}>
                {formatDate(event.startDate)}
              </Text>
            </View>
            <View style={styles.detailItem}>
              <IconButton icon="clock" size={16} iconColor={theme.colors.onSurfaceVariant} style={styles.icon} />
              <Text style={[styles.detailText, { color: theme.colors.onSurfaceVariant }]}>
                {formatTime(event.startDate)}
              </Text>
            </View>
            <View style={styles.detailItem}>
              <IconButton icon="account-group" size={16} iconColor={theme.colors.onSurfaceVariant} style={styles.icon} />
              <Text style={[styles.detailText, { color: theme.colors.onSurfaceVariant }]}>
                {event.attendees.length}{event.maxAttendees ? `/${event.maxAttendees}` : ''}
              </Text>
            </View>
          </View>

          {/* Action Buttons Row */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleLike}
              disabled={likeLoading}
            >
              <IconButton
                icon={isLiked ? "heart" : "heart-outline"}
                iconColor={isLiked ? "#FF4458" : theme.colors.onSurface}
                size={24}
                style={styles.actionIcon}
              />
              <Text style={[styles.actionText, { color: theme.colors.onSurface }]}>
                {event.likes && event.likes.length > 0 ? event.likes.length : 'Like'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleBookmark}
              disabled={bookmarkLoading}
            >
              <IconButton
                icon={isBookmarked ? "bookmark" : "bookmark-outline"}
                iconColor={isBookmarked ? "#FFD700" : theme.colors.onSurface}
                size={24}
                style={styles.actionIcon}
              />
              <Text style={[styles.actionText, { color: theme.colors.onSurface }]}>Save</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleShare}
            >
              <IconButton icon="share-variant" iconColor={theme.colors.onSurface} size={24} style={styles.actionIcon} />
              <Text style={[styles.actionText, { color: theme.colors.onSurface }]}>Share</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Bottom Join Button */}
        {user && (
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              if (!(isJoining || isFull || isPastEvent || isAttending || isWaitlisted)) {
                handleQuickJoin();
              }
            }}
            style={[
              styles.bottomJoinButton,
              { backgroundColor: isPastEvent ? theme.colors.surfaceDisabled : theme.colors.primary },
              isPastEvent && styles.bottomJoinButtonDisabled
            ]}
          >
            <Text
              variant="titleMedium"
              style={[
                styles.bottomJoinButtonText,
                { color: isPastEvent ? theme.colors.onSurfaceDisabled : theme.colors.onPrimary },
                isPastEvent && styles.bottomJoinButtonTextDisabled
              ]}
            >
              {isPastEvent
                ? 'Past Event'
                : isAttending
                  ? 'Attending'
                  : isWaitlisted
                    ? 'Waitlisted'
                    : isJoining
                      ? 'Joining...'
                      : isFull
                        ? 'Event Full'
                        : event.ticketPrice
                          ? `Join - $${event.ticketPrice}`
                          : 'Join Event'}
            </Text>
          </Pressable>
        )}
      </View>

      {/* Payment Sheet for paid events */}
      <PaymentSheet
        visible={paymentSheetVisible}
        event={event}
        onDismiss={() => setPaymentSheetVisible(false)}
        onSuccess={async () => {
          await refreshEventData();
        }}
      />

      {/* Waiver Modal */}
      <Modal
        visible={waiverModalVisible}
        transparent
        animationType="none"
        onRequestClose={dismissWaiverModal}
      >
        <Animated.View style={[
          waiverStyles.overlay,
          {
            opacity: waiverSheetAnim.interpolate({
              inputRange: [0, Dimensions.get('window').height],
              outputRange: [1, 0],
              extrapolate: 'clamp',
            }),
          }
        ]}>
          <Pressable style={waiverStyles.backdrop} onPress={dismissWaiverModal} />

          <Animated.View style={[
            waiverStyles.content,
            { backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF' },
            { transform: [{ translateY: waiverSheetAnim }] }
          ]}>
            <View {...waiverPanResponder.panHandlers} style={waiverStyles.handleArea}>
              <View style={[waiverStyles.handle, { backgroundColor: isDark ? 'rgba(255,255,255,0.3)' : '#E5E7EB' }]} />
            </View>

            <View style={waiverStyles.header}>
              <IconButton icon="file-document-outline" size={28} iconColor={isDark ? '#60A5FA' : '#1B365D'} />
              <Text style={[waiverStyles.title, { color: isDark ? '#FFFFFF' : '#1B365D' }]}>Event Waiver</Text>
            </View>

            <Text style={[waiverStyles.subtitle, { color: isDark ? 'rgba(255,255,255,0.7)' : '#6B7280' }]}>
              Please read and agree to the following terms before joining this event
            </Text>

            <ScrollView
              style={[waiverStyles.textContainer, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F9FAFB' }]}
              showsVerticalScrollIndicator
              persistentScrollbar
              nestedScrollEnabled
              onScroll={handleWaiverScroll}
              scrollEventThrottle={16}
              onContentSizeChange={(_, contentHeight) => {
                if (contentHeight <= 218 && !waiverScrolledToBottom) {
                  setWaiverScrolledToBottom(true);
                }
              }}
            >
              <Text style={[waiverStyles.text, { color: isDark ? 'rgba(255,255,255,0.9)' : '#374151' }]}>
                {event?.waiverText}
              </Text>
            </ScrollView>

            <Animated.Text style={[waiverStyles.scrollHint, { color: isDark ? 'rgba(255,255,255,0.5)' : '#9CA3AF', opacity: waiverHintOpacity }]}>
              ↓ Scroll to read entire waiver
            </Animated.Text>

            <Animated.View style={[
              waiverStyles.agreementSection,
              {
                backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F9FAFB',
                borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#E5E7EB',
                opacity: waiverAgreementOpacity,
              }
            ]}>
              <TouchableOpacity
                style={[
                  waiverStyles.checkboxRow,
                  {
                    backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F3F4F6',
                    borderColor: waiverAgreed ? (isDark ? '#60A5FA' : '#1B365D') : (isDark ? 'rgba(255,255,255,0.2)' : '#D1D5DB'),
                  }
                ]}
                onPress={() => waiverScrolledToBottom && setWaiverAgreed(!waiverAgreed)}
                disabled={!waiverScrolledToBottom}
              >
                <IconButton
                  icon={waiverAgreed ? "checkbox-marked" : "checkbox-blank-outline"}
                  size={24}
                  iconColor={waiverAgreed ? (isDark ? '#60A5FA' : '#1B365D') : (isDark ? 'rgba(255,255,255,0.5)' : '#9CA3AF')}
                  style={{ margin: 0 }}
                />
                <Text style={[waiverStyles.checkboxText, { color: isDark ? '#FFFFFF' : '#374151' }]}>
                  I have read and agree to the terms above
                </Text>
              </TouchableOpacity>

              <View style={waiverStyles.initialsRow}>
                <Text style={[waiverStyles.initialsLabel, { color: isDark ? 'rgba(255,255,255,0.7)' : '#6B7280' }]}>
                  Sign with your initials
                </Text>
                <TextInput
                  style={[
                    waiverStyles.initialsInput,
                    {
                      backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#FFFFFF',
                      borderColor: waiverInitials.length > 0 ? (isDark ? '#60A5FA' : '#1B365D') : (isDark ? 'rgba(255,255,255,0.2)' : '#D1D5DB'),
                      color: isDark ? '#FFFFFF' : '#1B365D',
                    }
                  ]}
                  value={waiverInitials}
                  onChangeText={(t) => waiverScrolledToBottom && setWaiverInitials(t)}
                  editable={waiverScrolledToBottom}
                  placeholder="AB"
                  placeholderTextColor={isDark ? 'rgba(255,255,255,0.3)' : '#9CA3AF'}
                  autoCapitalize="characters"
                  maxLength={4}
                />
              </View>
            </Animated.View>

            <View style={waiverStyles.buttonRow}>
              <TouchableOpacity
                style={[waiverStyles.cancelButton, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#F3F4F6' }]}
                onPress={dismissWaiverModal}
              >
                <Text style={[waiverStyles.cancelButtonText, { color: isDark ? 'rgba(255,255,255,0.8)' : '#6B7280' }]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  waiverStyles.confirmButton,
                  {
                    backgroundColor: (waiverAgreed && waiverInitials.length > 0)
                      ? (isDark ? '#60A5FA' : '#1B365D')
                      : (isDark ? 'rgba(255,255,255,0.1)' : '#D1D5DB'),
                  }
                ]}
                onPress={async () => {
                  if (event && user) {
                    const signResult = await storeWaiverSignature(event.id, user.uid, waiverInitials);
                    if (!signResult.success) {
                      Alert.alert('Error', 'Failed to record waiver signature. Please try again.');
                      return;
                    }
                  }
                  Animated.timing(waiverSheetAnim, {
                    toValue: Dimensions.get('window').height,
                    duration: 250,
                    useNativeDriver: true,
                  }).start(() => {
                    setWaiverModalVisible(false);
                    setWaiverInitials('');
                    setWaiverAgreed(false);
                    setWaiverScrolledToBottom(false);
                    proceedAfterWaiver();
                  });
                }}
                disabled={!waiverAgreed || waiverInitials.length === 0}
              >
                <Text style={[
                  waiverStyles.confirmButtonText,
                  {
                    color: (waiverAgreed && waiverInitials.length > 0)
                      ? '#FFFFFF'
                      : (isDark ? 'rgba(255,255,255,0.4)' : '#9CA3AF'),
                  }
                ]}>
                  Continue
                </Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </Animated.View>
      </Modal>
    </Pressable>
  );
}

const waiverStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.6)', justifyContent: 'flex-end' },
  backdrop: { flex: 1 },
  content: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 24, paddingBottom: 40, maxHeight: '80%' },
  handleArea: { paddingTop: 12, paddingBottom: 8, alignItems: 'center' },
  handle: { width: 40, height: 4, borderRadius: 2, marginBottom: 12 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  title: { fontSize: 22, fontWeight: '700' },
  subtitle: { fontSize: 14, marginBottom: 16, lineHeight: 20 },
  textContainer: { borderRadius: 12, padding: 16, minHeight: 110, maxHeight: 250, marginBottom: 8 },
  text: { fontSize: 14, lineHeight: 22 },
  scrollHint: { fontSize: 13, textAlign: 'center', marginBottom: 8, fontStyle: 'italic' },
  agreementSection: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 20 },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1 },
  checkboxText: { flex: 1, fontSize: 15, fontWeight: '500' },
  initialsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
  initialsLabel: { fontSize: 14, fontWeight: '500' },
  initialsInput: { width: 80, height: 44, borderRadius: 10, borderWidth: 1.5, textAlign: 'center', fontSize: 18, fontWeight: '700', letterSpacing: 2 },
  buttonRow: { flexDirection: 'row', gap: 12 },
  cancelButton: { flex: 1, paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  cancelButtonText: { fontSize: 16, fontWeight: '600' },
  confirmButton: { flex: 1, paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  confirmButtonText: { fontSize: 16, fontWeight: '600' },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: SCREEN_WIDTH,
    borderBottomLeftRadius: 25,
    borderBottomRightRadius: 25,
    overflow: 'hidden',
  },
  blurredBackground: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  gradientOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '100%',
  },
  grainOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  coverImageOuter: {
    width: '88%',
    position: 'absolute',
    alignSelf: 'center',
    top: '22%',
    bottom: '36%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  coverImageWrapper: {
    width: '100%',
    maxHeight: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 12,
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  coverPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  featuredBadge: {
    backgroundColor: '#FFD700',
    position: 'absolute',
    top: 60,
    alignSelf: 'center',
  },
  featuredText: {
    color: '#000',
    fontWeight: 'bold',
  },
  bottomContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 24,
    paddingBottom: 28,
    paddingTop: 8,
  },
  eventInfo: {
    alignItems: 'flex-start',
    gap: 2,
    marginBottom: 8,
  },
  title: {
    fontWeight: 'bold',
    textAlign: 'left',
  },
  clubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  clubLogo: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  clubLogoPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  clubName: {
    textAlign: 'left',
    flex: 1,
  },
  compactDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    flexWrap: 'wrap',
    marginTop: 2,
    marginBottom: 4,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 6,
  },
  icon: {
    margin: 0,
    padding: 0,
    width: 20,
    height: 20,
  },
  detailText: {
    marginLeft: -2,
    fontSize: 13,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginTop: 4,
    marginBottom: 6,
    gap: 8,
  },
  actionButton: {
    alignItems: 'center',
  },
  actionIcon: {
    margin: 0,
    padding: 0,
  },
  actionText: {
    fontSize: 12,
    marginTop: -4,
  },
  bottomJoinButton: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomJoinButtonDisabled: {
  },
  bottomJoinButtonText: {
    fontWeight: 'bold',
  },
  bottomJoinButtonTextDisabled: {
  },
});
