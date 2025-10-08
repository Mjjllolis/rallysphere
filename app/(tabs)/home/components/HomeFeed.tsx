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

const HomeFeed = () => {
  const [events, setEvents] = useState<EventWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50
  });

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0) {
      const index = viewableItems[0].index || 0;
      setActiveIndex(index);

      // Track featured event impression
      const event = events[index];
      if (event?.isFeatured && event.featuredId) {
        trackFeaturedImpression(event.featuredId);
      }
    }
  }).current;

  useEffect(() => {
    loadEvents();
  }, []);

  const loadEvents = async () => {
    setLoading(true);
    try {
      // Get all public events
      const eventsResult = await getAllEvents(false);

      if (eventsResult.success) {
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
        const allEvents = eventsResult.events;
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

        setEvents(mergedEvents);
      }
    } catch (error) {
      console.error('Error loading events:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderItem = ({ item, index }: { item: EventWithMeta; index: number }) => (
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

  if (events.length === 0) {
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

export default HomeFeed;

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
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
    padding: 20,
  },
});