import { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  FlatList,
  Dimensions,
  ViewToken,
  ActivityIndicator
} from 'react-native';
import { Stack } from 'expo-router';
import { Text } from 'react-native-paper';
import EventSwipeCard from './EventSwipeCard';
import { getUserBookmarks, getEventById } from '../../../../lib/firebase';
import type { Event } from '../../../../lib/firebase';
import { useAuth } from '../../../_layout';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const SavedFeed = () => {
  const { user } = useAuth();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50
  });

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0) {
      const index = viewableItems[0].index || 0;
      setActiveIndex(index);
    }
  }).current;

  useEffect(() => {
    if (user) {
      loadSavedEvents();
    } else {
      setLoading(false);
    }
  }, [user]);

  const loadSavedEvents = async () => {
    if (!user) return;

    setLoading(true);
    try {
      // Get user's bookmarked event IDs
      const bookmarksResult = await getUserBookmarks(user.uid);

      if (bookmarksResult.success && bookmarksResult.bookmarks.length > 0) {
        // Fetch all bookmarked events
        const eventPromises = bookmarksResult.bookmarks.map((eventId: string) =>
          getEventById(eventId)
        );

        const eventResults = await Promise.all(eventPromises);

        // Filter out any failed fetches and extract events
        const fetchedEvents = eventResults
          .filter(result => result.success && result.event)
          .map(result => result.event!);

        // Sort by start date (upcoming first)
        fetchedEvents.sort((a, b) => {
          const dateA = a.startDate?.toDate ? a.startDate.toDate() : new Date(a.startDate);
          const dateB = b.startDate?.toDate ? b.startDate.toDate() : new Date(b.startDate);
          return dateA.getTime() - dateB.getTime();
        });

        setEvents(fetchedEvents);
      } else {
        setEvents([]);
      }
    } catch (error) {
      console.error('Error loading saved events:', error);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  const renderItem = ({ item, index }: { item: Event; index: number }) => (
    <EventSwipeCard
      event={item}
      isActive={index === activeIndex}
      isFeatured={false}
    />
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator size="large" color="#fff" />
        <Text variant="bodyLarge" style={styles.loadingText}>
          Loading saved events...
        </Text>
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.emptyContainer}>
        <Stack.Screen options={{ headerShown: false }} />
        <Text variant="headlineSmall" style={styles.emptyTitle}>
          Sign In Required
        </Text>
        <Text variant="bodyMedium" style={styles.emptySubtitle}>
          Please sign in to view your saved events
        </Text>
      </View>
    );
  }

  if (events.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Stack.Screen options={{ headerShown: false }} />
        <Text variant="headlineSmall" style={styles.emptyTitle}>
          No Saved Events
        </Text>
        <Text variant="bodyMedium" style={styles.emptySubtitle}>
          Bookmark events to see them here
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <FlatList
        data={events}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        snapToInterval={SCREEN_HEIGHT}
        snapToAlignment="start"
        decelerationRate="fast"
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig.current}
        removeClippedSubviews
        maxToRenderPerBatch={3}
        windowSize={5}
      />
    </View>
  );
};

export default SavedFeed;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  loadingText: {
    marginTop: 16,
    color: '#fff',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
    padding: 20,
  },
  emptyTitle: {
    marginBottom: 8,
    color: '#fff',
  },
  emptySubtitle: {
    opacity: 0.7,
    textAlign: 'center',
    color: '#fff',
  },
});
