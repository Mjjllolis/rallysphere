import React, { useState, useEffect, useRef } from 'react';
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
import { getAllEvents, trackFeaturedImpression, getActiveFeaturedEvents } from '../../../../lib/firebase';
import type { Event, FeaturedEvent } from '../../../../lib/firebase';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface EventWithMeta extends Event {
  isFeatured?: boolean;
  featuredId?: string;
}

interface HomeFeedProps {
  feedType: 'editors-pick' | 'for-you' | 'following';
  isActive: boolean;
}

// Load 5 events initially
const INITIAL_LOAD = 5;
// Load 3 more when scrolling
const PAGINATION_SIZE = 3;

const HomeFeed = ({ feedType, isActive }: HomeFeedProps) => {
  const [allEvents, setAllEvents] = useState<EventWithMeta[]>([]);
  const [displayedEvents, setDisplayedEvents] = useState<EventWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [containerHeight, setContainerHeight] = useState(SCREEN_HEIGHT);
  const hasLoadedRef = useRef(false);

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50
  });

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0) {
      const index = viewableItems[0].index || 0;
      setActiveIndex(index);
    }
  }).current;

  // Handle loading more events and tracking impressions separately
  useEffect(() => {
    // Track featured event impression
    const event = displayedEvents[activeIndex];
    if (event?.isFeatured && event.featuredId) {
      trackFeaturedImpression(event.featuredId);
    }

    // Load more when approaching the end
    if (activeIndex >= displayedEvents.length - 2 && displayedEvents.length < allEvents.length && !loadingMore) {
      loadMoreEvents();
    }
  }, [activeIndex, displayedEvents.length, allEvents.length]);

  useEffect(() => {
    // Ensure load once its mounted
    if (!hasLoadedRef.current) {
      loadEvents();
      hasLoadedRef.current = true;
    }
  }, []);

  const loadEvents = async () => {
    setLoading(true);
    try {
      // Get all public events
      const eventsResult = await getAllEvents(false);

      if (eventsResult.success) {
        // Filter out past events
        const now = new Date();
        const upcomingEvents = eventsResult.events.filter(event => {
          if (!event.startDate) return true; // Include events without a start date
          const eventDate = event.startDate.toDate ? event.startDate.toDate() : new Date(event.startDate);
          return eventDate >= now;
        });

        // Get featured events
        const featuredResult = await getActiveFeaturedEvents('home_feed');
        const featuredEventIds = featuredResult.success
          ? new Set(featuredResult.featured.map(f => f.eventId))
          : new Set();

        // Create a map of featured event IDs
        const featuredMap = new Map<string, FeaturedEvent>();
        if (featuredResult.success) {
          featuredResult.featured.forEach(f => featuredMap.set(f.eventId, f));
        }

        // Mark events as featured and interleave them
        const allEvents = upcomingEvents;
        const featuredEvents: EventWithMeta[] = [];
        const regularEvents: EventWithMeta[] = [];

        allEvents.forEach(event => {
          if (featuredEventIds.has(event.id)) {
            const featuredData = featuredMap.get(event.id);
            featuredEvents.push({
              ...event,
              isFeatured: true,
              featuredId: featuredData?.id
            });
          } else {
            regularEvents.push(event);
          }
        });

        // Interleave: every 3rd event is featured (if available)
        const mergedEvents: EventWithMeta[] = [];
        let featuredIndex = 0;

        regularEvents.forEach((event, index) => {
          mergedEvents.push(event);
          if ((index + 1) % 3 === 0 && featuredIndex < featuredEvents.length) {
            mergedEvents.push(featuredEvents[featuredIndex]);
            featuredIndex++;
          }
        });

        // Add remaining featured events
        while (featuredIndex < featuredEvents.length) {
          mergedEvents.push(featuredEvents[featuredIndex]);
          featuredIndex++;
        }

        // Store all events and only display initial batch
        setAllEvents(mergedEvents);
        setDisplayedEvents(mergedEvents.slice(0, INITIAL_LOAD));
      }
    } catch (error) {
      console.error('Error loading events:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMoreEvents = () => {
    if (loadingMore || displayedEvents.length >= allEvents.length) return;

    setLoadingMore(true);

    // Get next batch of events
    const currentLength = displayedEvents.length;
    const nextBatch = allEvents.slice(currentLength, currentLength + PAGINATION_SIZE);

    // Add to displayed events after a small delay to show loading
    setTimeout(() => {
      setDisplayedEvents(prev => [...prev, ...nextBatch]);
      setLoadingMore(false);
    }, 100);
  };

  const renderItem = ({ item, index }: { item: EventWithMeta; index: number }) => (
    <View style={{ height: containerHeight, paddingBottom: 16 }}>
      <EventSwipeCard
        event={item}
        isActive={index === activeIndex}
        isFeatured={item.isFeatured}
        onFeaturedClick={() => {
          // Track click when user interacts with featured event
          if (item.featuredId) {
            // trackFeaturedClick will be called in EventSwipeCard when user clicks
          }
        }}
      />
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator size="large" />
        <Text variant="bodyLarge" style={{ marginTop: 16 }}>
          Loading events...
        </Text>
      </View>
    );
  }

  if (displayedEvents.length === 0 && !loading) {
    return (
      <View style={styles.emptyContainer}>
        <Stack.Screen options={{ headerShown: false }} />
        <Text variant="headlineSmall" style={{ marginBottom: 8 }}>
          No Events Yet
        </Text>
        <Text variant="bodyMedium" style={{ opacity: 0.7, textAlign: 'center' }}>
          Check back later for upcoming events
        </Text>
      </View>
    );
  }

  return (
    <View
      style={styles.container}
      onLayout={(event) => {
        const { height } = event.nativeEvent.layout;
        setContainerHeight(height);
      }}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <FlatList
        data={displayedEvents}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        snapToInterval={containerHeight}
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

export default HomeFeed;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  loadingMoreContainer: {
    height: 100,
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
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
    padding: 20,
  },
});