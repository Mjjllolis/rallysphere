import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  View,
  FlatList,
  Dimensions,
  ViewToken,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Stack } from 'expo-router';
import { Text, useTheme, IconButton } from 'react-native-paper';
import * as Location from 'expo-location';
import EventSwipeCard from './EventSwipeCard';
import { getAllEvents } from '../../../../lib/firebase';
import type { Event } from '../../../../lib/firebase';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const INITIAL_LOAD = 5;
const PAGINATION_SIZE = 3;

function getDistanceMiles(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
    Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

interface LocalFeedProps {
  isActive: boolean;
  radiusMiles: number;
}

const LocalFeed = ({ isActive, radiusMiles }: LocalFeedProps) => {
  const theme = useTheme();
  const [allEvents, setAllEvents] = useState<Event[]>([]);
  const [filteredEvents, setFilteredEvents] = useState<Event[]>([]);
  const [displayedEvents, setDisplayedEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [containerHeight, setContainerHeight] = useState(SCREEN_HEIGHT);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const hasLoadedRef = useRef(false);

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 });
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0) {
      setActiveIndex(viewableItems[0].index || 0);
    }
  }).current;

  // Get user location
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationError('Location permission is needed to show nearby events.');
        setLoading(false);
        return;
      }
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setUserLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      } catch {
        setLocationError('Could not get your location. Please try again.');
        setLoading(false);
      }
    })();
  }, []);

  // Load events once we have location
  useEffect(() => {
    if (userLocation && !hasLoadedRef.current) {
      loadEvents();
      hasLoadedRef.current = true;
    }
  }, [userLocation]);

  // Re-filter when radius changes
  useEffect(() => {
    if (userLocation && allEvents.length > 0) {
      filterByDistance(allEvents, userLocation, radiusMiles);
    }
  }, [radiusMiles]);

  // Load more on scroll
  useEffect(() => {
    if (activeIndex >= displayedEvents.length - 2 && displayedEvents.length < filteredEvents.length && !loadingMore) {
      loadMoreEvents();
    }
  }, [activeIndex, displayedEvents.length, filteredEvents.length]);

  const filterByDistance = useCallback((events: Event[], loc: { latitude: number; longitude: number }, radius: number) => {
    // console.log(`[LocalFeed] Filtering ${events.length} events within ${radius} mi of`, loc);
    events.forEach(e => {
      if (!e.locationCoords) {
        // console.log(`[LocalFeed] Event "${e.title}" has no coords`);
      } else {
        const dist = getDistanceMiles(loc.latitude, loc.longitude, e.locationCoords.latitude, e.locationCoords.longitude);
        // console.log(`[LocalFeed] Event "${e.title}" is ${dist.toFixed(1)} mi away`);
      }
    });
    const nearby = events.filter(event => {
      if (!event.locationCoords) return false;
      const dist = getDistanceMiles(
        loc.latitude, loc.longitude,
        event.locationCoords.latitude, event.locationCoords.longitude
      );
      return dist <= radius;
    });
    // console.log(`[LocalFeed] ${nearby.length} events within range`);
    setFilteredEvents(nearby);
    setDisplayedEvents(nearby.slice(0, INITIAL_LOAD));
    setActiveIndex(0);
  }, []);

  const loadEvents = async () => {
    setLoading(true);
    try {
      const result = await getAllEvents(false);
      if (result.success) {
        const now = new Date();
        const upcoming = result.events.filter(event => {
          if (!event.startDate) return true;
          const d = event.startDate.toDate ? event.startDate.toDate() : new Date(event.startDate);
          return d >= now;
        });
        setAllEvents(upcoming);
        if (userLocation) {
          filterByDistance(upcoming, userLocation, radiusMiles);
        }
      }
    } catch (error) {
      // console.error('Error loading local events:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadEvents();
    setRefreshing(false);
  };

  const loadMoreEvents = () => {
    if (loadingMore || displayedEvents.length >= filteredEvents.length) return;
    setLoadingMore(true);
    const next = filteredEvents.slice(displayedEvents.length, displayedEvents.length + PAGINATION_SIZE);
    setTimeout(() => {
      setDisplayedEvents(prev => [...prev, ...next]);
      setLoadingMore(false);
    }, 100);
  };

  const renderItem = ({ item, index }: { item: Event; index: number }) => (
    <View style={{ height: containerHeight, paddingBottom: 16 }}>
      <EventSwipeCard event={item} isActive={index === activeIndex} />
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.centeredContainer, { backgroundColor: theme.colors.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator size="large" color={theme.colors.onSurface} />
        <Text variant="bodyLarge" style={{ marginTop: 16, color: theme.colors.onSurface }}>
          Finding nearby events...
        </Text>
      </View>
    );
  }

  if (locationError) {
    return (
      <View style={[styles.centeredContainer, { backgroundColor: theme.colors.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <IconButton icon="map-marker-off" size={48} iconColor={theme.colors.onSurfaceDisabled} />
        <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center', paddingHorizontal: 32, marginTop: 8 }}>
          {locationError}
        </Text>
      </View>
    );
  }

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      onLayout={(e) => setContainerHeight(e.nativeEvent.layout.height)}
    >
      <Stack.Screen options={{ headerShown: false }} />

      {displayedEvents.length === 0 ? (
        <View style={styles.centeredContainer}>
          <IconButton icon="map-marker-question" size={48} iconColor={theme.colors.onSurfaceDisabled} />
          <Text variant="headlineSmall" style={{ marginBottom: 8, color: theme.colors.onSurface }}>
            No Nearby Events
          </Text>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center', paddingHorizontal: 32 }}>
            No events found within {radiusMiles} miles. Try increasing the distance.
          </Text>
        </View>
      ) : (
        <FlatList
          data={displayedEvents}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.onSurface} />}
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
              <View style={[styles.loadingMoreContainer, { backgroundColor: theme.colors.background }]}>
                <ActivityIndicator size="small" color={theme.colors.onSurface} />
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
};

export default LocalFeed;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingMoreContainer: {
    height: 100,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
