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
  Platform
} from 'react-native';
import { Text, Chip, IconButton, useTheme } from 'react-native-paper';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import Svg, { Defs, Pattern as SvgPattern, Rect as SvgRect } from 'react-native-svg';
import type { Event } from '../../../../lib/firebase';
import { useAuth, useThemeToggle } from '../../../_layout';
import { joinEvent, getEventById, bookmarkEvent, unbookmarkEvent, getUserBookmarks, likeEvent, unlikeEvent, getUserLikes } from '../../../../lib/firebase';

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

  useEffect(() => {
    setEvent(initialEvent);
  }, [initialEvent]);

  useEffect(() => {
    if (user) {
      loadBookmarkStatus();
      loadLikeStatus();
    }
  }, [user, event.id]);

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

    // If event has a ticket price, show native payment sheet
    if (event.ticketPrice && event.ticketPrice > 0) {
      setPaymentSheetVisible(true);
      return;
    }

    // Free event - join directly
    setIsJoining(true);
    try {
      const result = await joinEvent(event.id, user.uid);
      if (result.success) {
        if (result.waitlisted) {
          Alert.alert('Added to Waitlist', 'You have been added to the waitlist');
        } else {
          Alert.alert('Joined!', 'You have joined this event');
        }
        // Refresh event data to show updated attendee status
        await refreshEventData();
      } else {
        Alert.alert('Error', result.error || 'Failed to join event');
      }
    } catch (error) {
      console.error('Error joining event:', error);
      Alert.alert('Error', 'An unexpected error occurred');
    } finally {
      setIsJoining(false);
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
      console.error('Error bookmarking event:', error);
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
      console.error('Error liking event:', error);
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
          console.log('Shared via:', result.activityType); //works for IOS
        } else {
          // shared
          console.log('Content shared'); //android we dont get type
        }
      } else if (result.action === Share.dismissedAction) {
        // dismissed
        console.log('Share dismissed');
      }
    } catch (error) {
      console.error('Error sharing:', error);
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
        <Image
          source={{ uri: event.coverImage }}
          style={styles.blurredBackground}
          resizeMode="cover"
          blurRadius={25}
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
      <View style={styles.coverImageContainer}>
        {event.coverImage ? (
          <Image
            source={{ uri: event.coverImage }}
            style={styles.coverImage}
            resizeMode="contain"
          />
        ) : (
          <View style={[styles.coverImage, styles.coverPlaceholder, { backgroundColor: theme.colors.surfaceVariant }]}>
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

          <Text variant="bodyLarge" style={[styles.clubName, { color: theme.colors.onSurfaceVariant }]} numberOfLines={1}>
            {event.clubName}
          </Text>

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
          <TouchableOpacity
            style={[
              styles.bottomJoinButton,
              { backgroundColor: isPastEvent ? theme.colors.surfaceDisabled : theme.colors.primary },
              isPastEvent && styles.bottomJoinButtonDisabled
            ]}
            onPress={handleQuickJoin}
            disabled={isJoining || isFull || isPastEvent || isAttending || isWaitlisted}
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
          </TouchableOpacity>
        )}
      </View>
    </Pressable>
  );
}

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
  coverImageContainer: {
    width: '88%',
    position: 'absolute',
    alignSelf: 'center',
    top: '22%',
    bottom: '36%',
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
  clubName: {
    textAlign: 'left',
    marginBottom: 2,
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
