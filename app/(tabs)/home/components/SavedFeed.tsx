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

interface SavedFeedProps {
  isActive: boolean;
}

// Load 5 events initially
const INITIAL_LOAD = 5;
// Load 3 more when scrolling
const PAGINATION_SIZE = 3;

const SavedFeed = ({ isActive }: SavedFeedProps) => {
  const { user } = useAuth();
  const [allEvents, setAllEvents] = useState<Event[]>([]);
  const [displayedEvents, setDisplayedEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const hasLoadedRef = useRef(false);
  const wasActiveRef = useRef(false);

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50
  });

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0) {
      const index = viewableItems[0].index || 0;
      setActiveIndex(index);

      // Load more when approaching the end
      if (index >= displayedEvents.length - 2 && displayedEvents.length < allEvents.length) {
        loadMoreEvents();
      }
    }
  }).current;

  useEffect(() => {
    // Load check after mount
    if (!hasLoadedRef.current && user) {
      loadSavedEvents().then(() => {
        hasLoadedRef.current = true;
      });
    } else if (!user) {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    // Reload saved events when tab becomes active after being inactive
    if (isActive && user && hasLoadedRef.current && !wasActiveRef.current) {
      loadSavedEvents();
    }
    wasActiveRef.current = isActive;
  }, [isActive]);

  const loadSavedEvents = async () => {
    if (!user) return;

    // Show loading spinner on initial load only
    const isInitialLoad = !hasLoadedRef.current;
    if (isInitialLoad) {
      setLoading(true);
    }

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

        // Store all events and only display initial batch
        setAllEvents(fetchedEvents);
        setDisplayedEvents(fetchedEvents.slice(0, INITIAL_LOAD));
      } else {
        setAllEvents([]);
        setDisplayedEvents([]);
      }
    } catch (error) {
      console.error('Error loading saved events:', error);
      setAllEvents([]);
      setDisplayedEvents([]);
    } finally {
      if (isInitialLoad) {
        setLoading(false);
      }
    }
  };

  const loadMoreEvents = () => {
    if (loadingMore || displayedEvents.length >= allEvents.length) return;

    setLoadingMore(true);

    // Get next batch of events
    const currentLength = displayedEvents.length;
    const nextBatch = allEvents.slice(currentLength, currentLength + PAGINATION_SIZE);

    // Add to displayed events after a small delay
    setTimeout(() => {
      setDisplayedEvents(prev => [...prev, ...nextBatch]);
      setLoadingMore(false);
    }, 100);
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

  if (displayedEvents.length === 0 && !loading) {
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
        data={displayedEvents}
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
        maxToRenderPerBatch={2}
        windowSize={5}
        initialNumToRender={1}
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.loadingMoreContainer}>
              <ActivityIndicator size="small" color="#fff" />
            </View>
          ) : null
        }
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
  loadingMoreContainer: {
    height: SCREEN_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
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
