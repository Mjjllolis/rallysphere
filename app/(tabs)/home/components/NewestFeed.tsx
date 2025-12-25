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
import { getAllEvents } from '../../../../lib/firebase';
import type { Event } from '../../../../lib/firebase';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface NewestFeedProps {
  isActive: boolean;
}

// Load 5 events initially
const INITIAL_LOAD = 5;
// Load 3 more when scrolling
const PAGINATION_SIZE = 3;

const NewestFeed = ({ isActive }: NewestFeedProps) => {
  const [allEvents, setAllEvents] = useState<Event[]>([]);
  const [displayedEvents, setDisplayedEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const hasLoadedRef = useRef(false);

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
        // Sort by createdAt (newest first)
        const sortedEvents = [...eventsResult.events].sort((a, b) => {
          const dateA = a.createdAt?.toDate?.() || new Date(0);
          const dateB = b.createdAt?.toDate?.() || new Date(0);
          return dateB.getTime() - dateA.getTime();
        });

        // Store all events and only display initial batch
        setAllEvents(sortedEvents);
        setDisplayedEvents(sortedEvents.slice(0, INITIAL_LOAD));
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

export default NewestFeed;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
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
