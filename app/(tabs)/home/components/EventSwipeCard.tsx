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
import type { Event } from '../../../../lib/firebase';
import { useAuth } from '../../../_layout';
import { joinEvent, getEventById, bookmarkEvent, unbookmarkEvent, getUserBookmarks, likeEvent, unlikeEvent, getUserLikes } from '../../../../lib/firebase';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const ALBUM_WIDTH = SCREEN_WIDTH * 0.85;

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
      style={styles.container}
      onPress={handleCardPress}
    >
      {/* Blurred Background Image */}
      {event.coverImage ? (
        <Image
          source={{ uri: event.coverImage }}
          style={styles.blurredBackground}
          resizeMode="cover"
          blurRadius={25}
        />
      ) : (
        <View style={[styles.blurredBackground, { backgroundColor: theme.colors.surfaceVariant }]} />
      )}

      {/* Gradient Overlay - Light at top, pushing darkness down to bottom */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.1)', 'rgba(0,0,0,0.3)', 'rgba(0,0,0,0.7)', 'rgba(0,0,0,0.95)', 'rgba(0,0,0,1)']}
        locations={[0, 0.3, 0.5, 0.7, 0.85, 1]}
        style={styles.gradientOverlay}
      />

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
          <Text variant="titleMedium" style={styles.title} numberOfLines={1}>
            {event.title}
          </Text>

          <Text variant="bodyMedium" style={styles.clubName} numberOfLines={1}>
            {event.clubName}
          </Text>

          <View style={styles.compactDetailsRow}>
            <View style={styles.detailItem}>
              <IconButton icon="calendar" size={14} iconColor="rgba(255,255,255,0.8)" style={styles.icon} />
              <Text style={styles.detailText}>
                {formatDate(event.startDate)}
              </Text>
            </View>
            <View style={styles.detailItem}>
              <IconButton icon="clock" size={14} iconColor="rgba(255,255,255,0.8)" style={styles.icon} />
              <Text style={styles.detailText}>
                {formatTime(event.startDate)}
              </Text>
            </View>
            <View style={styles.detailItem}>
              <IconButton icon="account-group" size={14} iconColor="rgba(255,255,255,0.8)" style={styles.icon} />
              <Text style={styles.detailText}>
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
                iconColor={isLiked ? "#FF4458" : "#fff"}
                size={20}
                style={styles.actionIcon}
              />
              <Text style={styles.actionText}>
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
                iconColor={isBookmarked ? "#FFD700" : "#fff"}
                size={20}
                style={styles.actionIcon}
              />
              <Text style={styles.actionText}>Save</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleShare}
            >
              <IconButton icon="share-variant" iconColor="#fff" size={20} style={styles.actionIcon} />
              <Text style={styles.actionText}>Share</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Bottom Join Button */}
        {user && (
          <TouchableOpacity
            style={[
              styles.bottomJoinButton,
              isPastEvent && styles.bottomJoinButtonDisabled
            ]}
            onPress={handleQuickJoin}
            disabled={isJoining || isFull || isPastEvent || isAttending || isWaitlisted}
          >
            <Text
              variant="titleMedium"
              style={[
                styles.bottomJoinButtonText,
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
    backgroundColor: '#000',
    borderRadius: 25,
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
  coverImageContainer: {
    width: '88%',
    height: '58%',
    position: 'absolute',
    alignSelf: 'center',
    top: '8%',
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
    color: '#fff',
    fontWeight: 'bold',
    textAlign: 'left',
  },
  clubName: {
    color: 'rgba(255,255,255,0.75)',
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
    color: 'rgba(255,255,255,0.8)',
    marginLeft: -2,
    fontSize: 11,
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
    color: '#fff',
    fontSize: 10,
    marginTop: -4,
  },
  bottomJoinButton: {
    backgroundColor: '#fff',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomJoinButtonDisabled: {
    backgroundColor: '#555',
  },
  bottomJoinButtonText: {
    color: '#000',
    fontWeight: 'bold',
  },
  bottomJoinButtonTextDisabled: {
    color: '#999',
  },
});
