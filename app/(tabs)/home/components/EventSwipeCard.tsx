import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Image,
  Dimensions,
  TouchableOpacity,
  Pressable,
  Alert,
  Linking,
  Share,
  Platform
} from 'react-native';
import { Text, Chip, IconButton, useTheme } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import type { Event } from '../../../../lib/firebase';
import { useAuth } from '../../../_layout';
import { joinEvent, getEventById, bookmarkEvent, unbookmarkEvent, getUserBookmarks, likeEvent, unlikeEvent, getUserLikes } from '../../../../lib/firebase';
import { createCheckoutSession } from '../../../../lib/stripe';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

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

    // If event has a ticket price, redirect to Stripe Checkout
    if (event.ticketPrice && event.ticketPrice > 0) {
      setIsJoining(true);
      try {
        const result = await createCheckoutSession({
          eventId: event.id,
          ticketPrice: event.ticketPrice,
          currency: event.currency || 'usd',
        });

        if (result.success && result.checkoutUrl) {
          // Open Stripe Checkout in browser
          await Linking.openURL(result.checkoutUrl);
        } else {
          Alert.alert('Error', result.error || 'Failed to start payment process');
        }
      } catch (error) {
        console.error('Error starting checkout:', error);
        Alert.alert('Error', 'An unexpected error occurred');
      } finally {
        setIsJoining(false);
      }
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
    router.push(`/(tabs)/event-detail?id=${event.id}`);
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

  return (
    <Pressable
      style={styles.container}
      onPress={handleCardPress}
    >
      {/* Background Image/Video */}
      {event.coverImage ? (
        <Image
          source={{ uri: event.coverImage }}
          style={styles.media}
          resizeMode="cover"
        />
      ) : (
        <View style={[styles.media, { backgroundColor: theme.colors.surfaceVariant }]}>
          <Text variant="displaySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            {event.title.charAt(0)}
          </Text>
        </View>
      )}

      {/* Gradient Overlay */}
      <LinearGradient
        colors={['rgba(0,0,0,0.3)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.4)', 'rgba(0,0,0,0.8)']}
        locations={[0, 0.15, 0.5, 1]}
        style={styles.gradient}
      />

      {/* Top Section - Featured Badge */}
      {isFeatured && (
        <View style={styles.topSection}>
          <Chip
            icon="star"
            style={styles.featuredBadge}
            textStyle={styles.featuredText}
          >
            Featured
          </Chip>
        </View>
      )}

      {/* Bottom Section - Event Info */}
      <View style={styles.bottomSection}>
        <View style={styles.eventInfo}>
          <Text variant="headlineMedium" style={styles.title} numberOfLines={2}>
            {event.title}
          </Text>

          <Text variant="titleMedium" style={styles.clubName} numberOfLines={1}>
            by {event.clubName}
          </Text>

          <View style={styles.detailsRow}>
            <View style={styles.detailItem}>
              <IconButton icon="calendar" size={18} iconColor="#fff" style={styles.icon} />
              <Text variant="bodyMedium" style={styles.detailText}>
                {formatDate(event.startDate)}
              </Text>
            </View>

            <View style={styles.detailItem}>
              <IconButton icon="clock" size={18} iconColor="#fff" style={styles.icon} />
              <Text variant="bodyMedium" style={styles.detailText}>
                {formatTime(event.startDate)}
              </Text>
            </View>
          </View>

          <View style={styles.detailsRow}>
            <View style={styles.detailItem}>
              <IconButton
                icon={event.isVirtual ? "video" : "map-marker"}
                size={18}
                iconColor="#fff"
                style={styles.icon}
              />
              <Text variant="bodyMedium" style={styles.detailText} numberOfLines={1}>
                {event.isVirtual ? 'Virtual Event' : event.location}
              </Text>
            </View>
          </View>

          <View style={styles.detailsRow}>
            <View style={styles.detailItem}>
              <IconButton icon="account-group" size={18} iconColor="#fff" style={styles.icon} />
              <Text variant="bodyMedium" style={styles.detailText}>
                {event.attendees.length}{event.maxAttendees ? `/${event.maxAttendees}` : ''} attending
              </Text>
            </View>
          </View>

          {/* Status Chips */}
          <View style={styles.statusRow}>
            {isAttending && (
              <Chip
                icon="check-circle"
                style={styles.statusChip}
                textStyle={styles.statusText}
              >
                Attending
              </Chip>
            )}
            {isWaitlisted && (
              <Chip
                icon="clock"
                style={styles.waitlistChip}
                textStyle={styles.statusText}
              >
                Waitlisted
              </Chip>
            )}
          </View>
        </View>

        {/* Quick Action Button */}
        {user && !isAttending && !isWaitlisted && (
          <TouchableOpacity
            style={[
              styles.quickJoinButton,
              { backgroundColor: isFull ? theme.colors.surfaceVariant : theme.colors.primary }
            ]}
            onPress={handleQuickJoin}
            disabled={isJoining || isFull}
          >
            <Text
              variant="labelLarge"
              style={{
                color: isFull ? theme.colors.onSurfaceVariant : '#fff',
                fontWeight: 'bold'
              }}
            >
              {isJoining
                ? 'Joining...'
                : isFull
                  ? 'Full'
                  : event.ticketPrice
                    ? `Buy Ticket - $${event.ticketPrice}`
                    : 'Quick Join'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Right Side Actions */}
      <View style={styles.rightActions}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={handleLike}
          disabled={likeLoading}
        >
          <IconButton
            icon={isLiked ? "heart" : "heart-outline"}
            iconColor={isLiked ? "#FF4458" : "#fff"}
            size={28}
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
            size={28}
          />
          <Text style={styles.actionText}>Save</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={handleShare}
        >
          <IconButton icon="share-variant" iconColor="#fff" size={28} />
          <Text style={styles.actionText}>Share</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={handleCardPress}
        >
          <IconButton icon="information" iconColor="#fff" size={28} />
          <Text style={styles.actionText}>Info</Text>
        </TouchableOpacity>
      </View>

    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    backgroundColor: '#000',
  },
  media: {
    width: '100%',
    height: '100%',
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  gradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  topSection: {
    position: 'absolute',
    top: 120,
    left: 16,
    right: 16,
    zIndex: 2,
  },
  featuredBadge: {
    backgroundColor: '#FFD700',
    alignSelf: 'flex-start',
  },
  featuredText: {
    color: '#000',
    fontWeight: 'bold',
  },
  bottomSection: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 80,
    padding: 20,
    paddingBottom: 120,
    paddingTop: 140,
  },
  eventInfo: {
    gap: 8,
  },
  title: {
    color: '#fff',
    fontWeight: 'bold',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  clubName: {
    color: '#fff',
    opacity: 0.9,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  detailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 16,
    flex: 1,
  },
  icon: {
    margin: 0,
    padding: 0,
  },
  detailText: {
    color: '#fff',
    marginLeft: -8,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  statusRow: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 8,
  },
  statusChip: {
    backgroundColor: '#4CAF50',
  },
  waitlistChip: {
    backgroundColor: '#FF9800',
  },
  statusText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  quickJoinButton: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 25,
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  rightActions: {
    position: 'absolute',
    right: 8,
    bottom: 120,
    gap: 16,
  },
  actionButton: {
    alignItems: 'center',
  },
  actionText: {
    color: '#fff',
    fontSize: 12,
    marginTop: -8,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});
