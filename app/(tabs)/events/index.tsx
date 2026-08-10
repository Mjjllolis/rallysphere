// app/(tabs)/events/index.tsx — Discover (events + clubs, with cross-search)
import React, { useState, useEffect, useMemo } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Pressable,
  Dimensions,
  TextInput,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Text, useTheme, IconButton } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { router } from 'expo-router';
import { useAuth, useThemeToggle } from '../../_layout';
import { getEvents, getClubs } from '../../../lib/firebase';
import type { Event, Club } from '../../../lib/firebase';
import DiscoverFilterPanel, { DiscoverFilters } from '../../../components/DiscoverFilterPanel';
import { getDistanceMiles } from '../../../lib/location';

const { width } = Dimensions.get('window');
const FEATURED_CARD_WIDTH = width * 0.75;
const FEATURED_CARD_HEIGHT = 220;

type Filter = 'all' | 'events' | 'clubs';

export default function DiscoverScreen() {
  const theme = useTheme();
  const { isDark } = useThemeToggle();
  const { user } = useAuth();
  const accent = isDark ? '#8B5CF6' : '#A78BFA';

  const [events, setEvents] = useState<Event[]>([]);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [filterPanelVisible, setFilterPanelVisible] = useState(false);
  const [filters, setFilters] = useState<DiscoverFilters>({
    price: 'all',
    dateRange: 'any',
    sortBy: 'soonest',
    showVirtual: false,
    location: null,
  });

  const defaultFilters: DiscoverFilters = {
    price: 'all',
    dateRange: 'any',
    sortBy: 'soonest',
    showVirtual: false,
    location: null,
  };

  const hasActiveFilters =
    filters.price !== 'all' ||
    filters.dateRange !== 'any' ||
    filters.sortBy !== 'soonest' ||
    filters.showVirtual ||
    !!filters.location;

  useEffect(() => {
    load();
  }, [user]);

  const load = async () => {
    try {
      setLoading(true);
      const [eventsResult, clubsResult] = await Promise.all([
        getEvents(),
        getClubs(),
      ]);

      if (eventsResult.success) {
        const now = new Date();
        const upcoming = eventsResult.events.filter((event: Event) => {
          const d = event.startDate?.toDate
            ? event.startDate.toDate()
            : new Date(event.startDate as any);
          return d >= now;
        });
        setEvents(upcoming);
      }
      if (clubsResult.success) {
        setClubs(clubsResult.clubs.filter((c: Club) => c.isPublic !== false));
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  // ----- filtering -----
  const q = searchQuery.trim().toLowerCase();

  const filteredEvents = useMemo(() => {
    let result = [...events];

    // Search query filter
    if (q) {
      result = result.filter(
        (e) =>
          e.title?.toLowerCase().includes(q) ||
          e.description?.toLowerCase().includes(q) ||
          e.clubName?.toLowerCase().includes(q) ||
          e.location?.toLowerCase().includes(q) ||
          (e.tags && e.tags.some((t) => t.toLowerCase().includes(q)))
      );
    }

    // Price filter
    if (filters.price === 'free') {
      result = result.filter((e) => !e.ticketPrice || e.ticketPrice === 0);
    } else if (filters.price === 'paid') {
      result = result.filter((e) => e.ticketPrice && e.ticketPrice > 0);
    }

    // Date range filter
    const now = new Date();
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const monthEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    if (filters.dateRange === 'today') {
      result = result.filter((e) => {
        const d = e.startDate?.toDate ? e.startDate.toDate() : new Date(e.startDate as any);
        return d <= todayEnd;
      });
    } else if (filters.dateRange === 'week') {
      result = result.filter((e) => {
        const d = e.startDate?.toDate ? e.startDate.toDate() : new Date(e.startDate as any);
        return d <= weekEnd;
      });
    } else if (filters.dateRange === 'month') {
      result = result.filter((e) => {
        const d = e.startDate?.toDate ? e.startDate.toDate() : new Date(e.startDate as any);
        return d <= monthEnd;
      });
    }

    // Virtual filter
    if (filters.showVirtual) {
      result = result.filter((e) => e.isVirtual);
    }

    // Location filter
    if (filters.location) {
      const { latitude, longitude, radiusMiles } = filters.location;
      result = result.filter((e) => {
        if (!e.locationCoords) return false;
        return getDistanceMiles(latitude, longitude, e.locationCoords.latitude, e.locationCoords.longitude) <= radiusMiles;
      });
    }

    // Sort
    if (filters.sortBy === 'soonest') {
      result.sort((a, b) => {
        const dateA = a.startDate?.toDate ? a.startDate.toDate() : new Date(a.startDate as any);
        const dateB = b.startDate?.toDate ? b.startDate.toDate() : new Date(b.startDate as any);
        return dateA.getTime() - dateB.getTime();
      });
    } else if (filters.sortBy === 'popular') {
      result.sort((a, b) => (b.attendeeCount ?? b.attendees?.length ?? 0) - (a.attendeeCount ?? a.attendees?.length ?? 0));
    } else if (filters.sortBy === 'newest') {
      result.sort((a, b) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(0);
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(0);
        return dateB.getTime() - dateA.getTime();
      });
    }

    return result;
  }, [events, q, filters]);

  const filteredClubs = useMemo(() => {
    let result = [...clubs];

    if (q) {
      result = result.filter(
        (c) =>
          c.name?.toLowerCase().includes(q) ||
          c.description?.toLowerCase().includes(q) ||
          c.category?.toLowerCase().includes(q)
      );
    }

    // Location filter — same city/radius as events. Only clubs with a saved
    // address (set via the edit-club screen, which geocodes it on save) have
    // locationCoords; clubs without one are excluded, same as unlocated events.
    if (filters.location) {
      const { latitude, longitude, radiusMiles } = filters.location;
      result = result
        .filter((c) => !!c.locationCoords)
        .filter((c) => getDistanceMiles(latitude, longitude, c.locationCoords!.latitude, c.locationCoords!.longitude) <= radiusMiles)
        .sort(
          (a, b) =>
            getDistanceMiles(latitude, longitude, a.locationCoords!.latitude, a.locationCoords!.longitude) -
            getDistanceMiles(latitude, longitude, b.locationCoords!.latitude, b.locationCoords!.longitude)
        );
    }

    return result;
  }, [clubs, q, filters.location]);

  const featuredEvents = useMemo(
    () =>
      [...filteredEvents]
        .filter((e) => e.coverImage)
        .sort((a, b) => (b.attendeeCount ?? b.attendees?.length ?? 0) - (a.attendeeCount ?? a.attendees?.length ?? 0))
        .slice(0, 5),
    [filteredEvents]
  );

  const featuredClubs = useMemo(() => {
    const withImage = filteredClubs.filter((c) => c.logo || c.coverImage);
    if (filters.location) {
      // Already sorted nearest-first by filteredClubs when a location filter is active
      return withImage.slice(0, 5);
    }
    return [...withImage].sort((a, b) => (b.members?.length || 0) - (a.members?.length || 0)).slice(0, 5);
  }, [filteredClubs, filters.location]);

  const showEvents = filter === 'all' || filter === 'events';
  const showClubs = filter === 'all' || filter === 'clubs';

  // ----- formatters -----
  const formatDate = (date: any) => {
    if (!date) return '';
    const d = date.toDate ? date.toDate() : new Date(date);
    return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  };
  const formatTime = (date: any) => {
    if (!date) return '';
    const d = date.toDate ? date.toDate() : new Date(date);
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  // ----- card renderers -----
  const renderFeaturedEvent = (event: Event) => {
    const isAttending = !!user && event.attendees?.includes(user.uid);
    return (
      <TouchableOpacity
        key={event.id}
        style={styles.featuredCard}
        onPress={() => router.push(`/event/${event.id}`)}
        activeOpacity={0.9}
      >
        <BlurView intensity={20} tint={isDark ? 'dark' : 'light'} style={[styles.featuredCardBlur, { borderColor: theme.colors.outline }]}>
          {event.coverImage && (
            <ExpoImage
              source={{ uri: event.coverImage }}
              style={styles.featuredImage}
              contentFit="cover"
              transition={200}
              cachePolicy="memory-disk"
              priority="high"
            />
          )}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.4)', 'rgba(0,0,0,0.9)']}
            style={styles.featuredGradient}
          />
          <View style={styles.featuredContent}>
            <View style={styles.featuredBadges}>
              {isAttending && (
                <View style={styles.attendingBadge}>
                  <Text style={styles.attendingBadgeText}>Going</Text>
                </View>
              )}
              <View style={(event.ticketPrice || 0) > 0 ? styles.priceBadge : styles.freeBadge}>
                <Text style={styles.priceBadgeText}>
                  {(event.ticketPrice || 0) > 0 ? `$${event.ticketPrice}` : 'Free'}
                </Text>
              </View>
            </View>
            <View style={styles.featuredInfo}>
              <Text style={[styles.featuredDate, { color: isDark ? '#8B5CF6' : '#A78BFA' }]}>
                {formatDate(event.startDate)} • {formatTime(event.startDate)}
              </Text>
              <Text style={styles.featuredTitle} numberOfLines={2}>{event.title}</Text>
              <Text style={styles.featuredClub} numberOfLines={1}>by {event.clubName}</Text>
              <View style={styles.featuredFooter}>
                <View style={styles.featuredLocation}>
                  <Ionicons name={event.isVirtual ? 'globe-outline' : 'location-outline'} size={14} color="rgba(255,255,255,0.7)" />
                  <Text style={styles.featuredLocationText} numberOfLines={1}>
                    {event.isVirtual ? 'Virtual' : event.location}
                  </Text>
                </View>
                <View style={styles.featuredAttendees}>
                  <Ionicons name="people-outline" size={14} color="rgba(255,255,255,0.7)" />
                  <Text style={styles.featuredAttendeesText}>
                    {event.attendeeCount ?? event.attendees?.length ?? 0}{event.maxAttendees ? `/${event.maxAttendees}` : ''}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </BlurView>
      </TouchableOpacity>
    );
  };

  const renderFeaturedClub = (club: Club) => (
    <TouchableOpacity
      key={club.id}
      style={styles.featuredCard}
      onPress={() => router.push(`/club/${club.id}`)}
      activeOpacity={0.9}
    >
      <BlurView intensity={20} tint={isDark ? 'dark' : 'light'} style={[styles.featuredCardBlur, { borderColor: theme.colors.outline }]}>
        {(club.coverImage || club.logo) ? (
          <ExpoImage
            source={{ uri: club.coverImage || club.logo }}
            style={styles.featuredImage}
            contentFit="cover"
            transition={200}
            cachePolicy="memory-disk"
          />
        ) : (
          <LinearGradient colors={isDark ? ['#2E1065', '#8B5CF6'] : ['#1B365D', '#60A5FA']} style={styles.featuredImage} />
        )}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.4)', 'rgba(0,0,0,0.9)']}
          style={styles.featuredGradient}
        />
        <View style={styles.featuredContent}>
          <View style={styles.featuredBadges}>
            <View style={styles.clubBadge}>
              <Ionicons name="people" size={12} color="#fff" />
              <Text style={styles.clubBadgeText}>Club</Text>
            </View>
            {club.isPro && (
              <View style={styles.proBadge}>
                <Ionicons name="star" size={12} color="#FFD700" />
                <Text style={styles.proBadgeText}>Pro</Text>
              </View>
            )}
          </View>
          <View style={styles.featuredInfo}>
            <Text style={[styles.featuredCategory, { color: isDark ? '#8B5CF6' : '#A78BFA' }]}>{club.category}</Text>
            <Text style={styles.featuredTitle} numberOfLines={2}>{club.name}</Text>
            <Text style={styles.featuredClub} numberOfLines={2}>{club.description}</Text>
            <View style={styles.featuredFooter}>
              <View style={styles.featuredAttendees}>
                <Ionicons name="people-outline" size={14} color="rgba(255,255,255,0.7)" />
                <Text style={styles.featuredAttendeesText}>
                  {club.members?.length || 0} {club.members?.length === 1 ? 'member' : 'members'}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </BlurView>
    </TouchableOpacity>
  );

  const renderEventRow = (event: Event) => {
    const isAttending = !!user && event.attendees?.includes(user.uid);
    return (
      <TouchableOpacity
        key={event.id}
        style={styles.row}
        onPress={() => router.push(`/event/${event.id}`)}
        activeOpacity={0.9}
      >
        <BlurView intensity={20} tint={isDark ? 'dark' : 'light'} style={[styles.rowBlur, { borderColor: theme.colors.outline }]}>
          <View style={styles.rowContent}>
            {event.coverImage ? (
              <ExpoImage
                source={{ uri: event.coverImage }}
                style={styles.rowImage}
                contentFit="cover"
                transition={200}
                cachePolicy="memory-disk"
              />
            ) : (
              <View style={styles.rowImagePlaceholder}>
                <LinearGradient colors={isDark ? ['#8B5CF6', '#2E1065'] : ['#60A5FA', '#1B365D']} style={styles.rowImageGradient}>
                  <Ionicons name="calendar" size={28} color="#fff" />
                </LinearGradient>
              </View>
            )}
            <View style={styles.rowDetails}>
              <View style={styles.rowHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowTitle, { color: theme.colors.onSurface }]} numberOfLines={1}>{event.title}</Text>
                  <Text style={[styles.rowSubtitle, { color: theme.colors.onSurfaceVariant }]} numberOfLines={1}>{event.clubName}</Text>
                </View>
                {isAttending && (
                  <View style={styles.smallAttendingBadge}>
                    <Text style={styles.smallAttendingText}>Going</Text>
                  </View>
                )}
              </View>
              <View style={styles.rowMeta}>
                <View style={styles.rowMetaItem}>
                  <Ionicons name="time-outline" size={13} color={theme.colors.onSurfaceVariant} />
                  <Text style={[styles.rowMetaText, { color: theme.colors.onSurfaceVariant }]} numberOfLines={1}>
                    {formatDate(event.startDate)} · {formatTime(event.startDate)}
                  </Text>
                </View>
                <View style={styles.rowMetaItem}>
                  <Ionicons name={event.isVirtual ? 'globe-outline' : 'location-outline'} size={13} color={theme.colors.onSurfaceVariant} />
                  <Text style={[styles.rowMetaText, { color: theme.colors.onSurfaceVariant }]} numberOfLines={1}>
                    {event.isVirtual ? 'Virtual' : event.location}
                  </Text>
                </View>
              </View>
              <View style={styles.rowFooter}>
                <View style={styles.rowMetaItem}>
                  <Ionicons name="people-outline" size={13} color={theme.colors.onSurfaceVariant} />
                  <Text style={[styles.rowAttendeeText, { color: theme.colors.onSurfaceVariant }]}>
                    {event.attendeeCount ?? event.attendees?.length ?? 0}{event.maxAttendees ? `/${event.maxAttendees}` : ''} going
                  </Text>
                </View>
                <Text style={(event.ticketPrice || 0) > 0 ? [styles.rowPricePaid, { color: accent }] : styles.rowPriceFree}>
                  {(event.ticketPrice || 0) > 0 ? `$${event.ticketPrice}` : 'Free'}
                </Text>
              </View>
            </View>
          </View>
        </BlurView>
      </TouchableOpacity>
    );
  };

  const renderClubRow = (club: Club) => (
    <TouchableOpacity
      key={club.id}
      style={styles.row}
      onPress={() => router.push(`/club/${club.id}`)}
      activeOpacity={0.9}
    >
      <BlurView intensity={20} tint={isDark ? 'dark' : 'light'} style={[styles.rowBlur, { borderColor: theme.colors.outline }]}>
        <View style={styles.rowContent}>
          {(club.logo || club.coverImage) ? (
            <ExpoImage
              source={{ uri: club.logo || club.coverImage }}
              style={styles.rowImage}
              contentFit="cover"
              transition={200}
              cachePolicy="memory-disk"
            />
          ) : (
            <View style={styles.rowImagePlaceholder}>
              <LinearGradient colors={isDark ? ['#2E1065', '#8B5CF6'] : ['#1B365D', '#60A5FA']} style={styles.rowImageGradient}>
                <Ionicons name="people" size={28} color="#fff" />
              </LinearGradient>
            </View>
          )}
          <View style={styles.rowDetails}>
            <View style={styles.rowHeader}>
              <View style={{ flex: 1 }}>
                <View style={styles.rowTitleRow}>
                  <Text style={[styles.rowTitle, { color: theme.colors.onSurface }]} numberOfLines={1}>
                    {club.name}
                  </Text>
                  {club.isPro && (
                    <Ionicons name="star" size={14} color="#FFD700" style={{ marginLeft: 6 }} />
                  )}
                </View>
                <Text style={[styles.rowSubtitle, { color: theme.colors.onSurfaceVariant }]} numberOfLines={1}>{club.category}</Text>
              </View>
              <View style={[styles.entityTypePill, { backgroundColor: isDark ? 'rgba(139,92,246,0.18)' : 'rgba(167,139,250,0.15)', borderColor: accent }]}>
                <Text style={[styles.entityTypePillText, { color: accent }]}>CLUB</Text>
              </View>
            </View>
            <Text style={[styles.rowDescription, { color: theme.colors.onSurfaceVariant }]} numberOfLines={2}>
              {club.description}
            </Text>
            <View style={styles.rowFooter}>
              <View style={styles.rowMetaItem}>
                <Ionicons name="people-outline" size={13} color={theme.colors.onSurfaceVariant} />
                <Text style={[styles.rowAttendeeText, { color: theme.colors.onSurfaceVariant }]}>
                  {club.members?.length || 0} {club.members?.length === 1 ? 'member' : 'members'}
                </Text>
              </View>
              {!club.isPublic && (
                <View style={styles.rowMetaItem}>
                  <Ionicons name="lock-closed-outline" size={12} color={theme.colors.onSurfaceVariant} />
                  <Text style={[styles.rowMetaText, { color: theme.colors.onSurfaceVariant }]}>Private</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </BlurView>
    </TouchableOpacity>
  );

  // ----- chip ui -----
  const Chip = ({ label, value }: { label: string; value: Filter }) => {
    const active = filter === value;
    return (
      <TouchableOpacity
        onPress={() => setFilter(value)}
        activeOpacity={0.7}
        style={[
          styles.chip,
          { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)', borderColor: theme.colors.outline },
          active && {
            backgroundColor: isDark ? 'rgba(139, 92, 246, 0.28)' : 'rgba(167, 139, 250, 0.22)',
            borderColor: accent,
          },
        ]}
      >
        <Text
          style={[
            styles.chipText,
            { color: theme.colors.onSurfaceVariant },
            active && { color: accent },
          ]}
        >
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  const noResults = q.length > 0
    && (showEvents ? filteredEvents.length === 0 : true)
    && (showClubs ? filteredClubs.length === 0 : true);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={StyleSheet.absoluteFill}>
        <View style={[styles.blackBackground, { backgroundColor: theme.colors.background }]} />
      </View>
      {/* Gradient Overlay */}
      <LinearGradient
        colors={
          isDark
            ? ['rgba(139, 92, 246, 0.85)', 'rgba(0, 0, 0, 0.55)', 'rgba(0, 0, 0, 0)']
            : ['rgba(210, 146, 252, 0.61)', 'rgba(251, 250, 252, 0.63)', 'rgba(167, 139, 250, 0)']
        }
        locations={[0, 0.25, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: theme.colors.onSurface }]}>Discover</Text>
        </View>

        {/* Search */}
        <View style={styles.searchContainer}>
          <BlurView intensity={20} tint={isDark ? 'dark' : 'light'} style={[styles.searchBarContainer, { borderColor: theme.colors.outline }]}>
            <View style={styles.searchInputWrapper}>
              <Ionicons
                name="search-outline"
                size={18}
                color={theme.colors.onSurfaceVariant}
                style={styles.searchIcon}
              />
              <TextInput
                placeholder="Search events and clubs..."
                value={searchQuery}
                onChangeText={setSearchQuery}
                style={[styles.searchInput, { color: theme.colors.onSurface }]}
                placeholderTextColor={theme.colors.onSurfaceDisabled}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearButton}>
                  <Ionicons name="close-circle" size={18} color={theme.colors.onSurfaceVariant} />
                </TouchableOpacity>
              )}
            </View>
          </BlurView>

          {/* Filter Button */}
          <TouchableOpacity
            style={styles.filterButtonWrapper}
            onPress={() => setFilterPanelVisible(true)}
            activeOpacity={0.7}
          >
            <BlurView intensity={20} tint={isDark ? 'dark' : 'light'} style={[styles.filterButton, { borderColor: theme.colors.outline }]}>
              <IconButton
                icon="tune"
                iconColor={hasActiveFilters ? accent : theme.colors.onSurface}
                size={20}
                style={{ margin: 0 }}
              />
              {hasActiveFilters && <View style={[styles.filterBadge, { backgroundColor: accent }]} />}
            </BlurView>
          </TouchableOpacity>
        </View>

        {/* Filter chips */}
        <View style={styles.chipsRow}>
          <Chip label="All" value="all" />
          <Chip label="Events" value="events" />
          <Chip label="Clubs" value="clubs" />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} />}
          showsVerticalScrollIndicator={false}
        >
          {loading && events.length === 0 && clubs.length === 0 ? (
            <View style={styles.loadingState}>
              <Text style={{ color: theme.colors.onSurfaceVariant }}>Loading…</Text>
            </View>
          ) : noResults ? (
            <View style={styles.emptyState}>
              <Ionicons name="search-outline" size={48} color={theme.colors.onSurfaceVariant} />
              <Text style={[styles.emptyTitle, { color: theme.colors.onSurface }]}>No matches</Text>
              <Text style={[styles.emptySubtitle, { color: theme.colors.onSurfaceVariant }]}>
                Nothing found for "{searchQuery}". Try a different word or change the filter.
              </Text>
            </View>
          ) : (
            <>
              {/* Featured Events (only when not searching) */}
              {!q && showEvents && featuredEvents.length > 0 && (
                <View style={styles.section}>
                  <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Featured Events</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.horizontalContent}
                  >
                    {featuredEvents.map(renderFeaturedEvent)}
                  </ScrollView>
                </View>
              )}

              {/* Featured Clubs (only when not searching) */}
              {!q && showClubs && featuredClubs.length > 0 && (
                <View style={styles.section}>
                  <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Featured Clubs</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.horizontalContent}
                  >
                    {featuredClubs.map(renderFeaturedClub)}
                  </ScrollView>
                </View>
              )}

              {/* Events list */}
              {showEvents && filteredEvents.length > 0 && (
                <View style={styles.section}>
                  <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
                    {q ? `Events (${filteredEvents.length})` : 'All Events'}
                  </Text>
                  <View style={styles.listContainer}>
                    {filteredEvents.map(renderEventRow)}
                  </View>
                </View>
              )}

              {/* Clubs list */}
              {showClubs && filteredClubs.length > 0 && (
                <View style={styles.section}>
                  <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
                    {q ? `Clubs (${filteredClubs.length})` : 'All Clubs'}
                  </Text>
                  <View style={styles.listContainer}>
                    {filteredClubs.map(renderClubRow)}
                  </View>
                </View>
              )}

              {/* Section-empty hints (filter exclude case) */}
              {!q && showEvents && filteredEvents.length === 0 && (
                <View style={styles.sectionEmpty}>
                  <Text style={{ color: theme.colors.onSurfaceVariant }}>No upcoming events yet.</Text>
                </View>
              )}
              {!q && showClubs && filteredClubs.length === 0 && (
                <View style={styles.sectionEmpty}>
                  <Text style={{ color: theme.colors.onSurfaceVariant }}>No clubs yet.</Text>
                </View>
              )}
            </>
          )}
        </ScrollView>

        {/* Filter Panel */}
        <DiscoverFilterPanel
          visible={filterPanelVisible}
          onClose={() => setFilterPanelVisible(false)}
          filters={filters}
          onFiltersChange={setFilters}
          onReset={() => setFilters(defaultFilters)}
        />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  blackBackground: { flex: 1 },
  safeArea: { flex: 1 },

  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  headerTitle: { fontSize: 32, fontWeight: '800' },
  headerSubtitle: { fontSize: 13, marginTop: 4 },

  searchContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 10,
    alignItems: 'center',
  },
  searchBarContainer: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
  },
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    height: 42,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    padding: 0,
    margin: 0,
  },
  clearButton: {
    padding: 4,
  },
  filterButtonWrapper: {
    borderRadius: 21,
    overflow: 'hidden',
  },
  filterButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  filterBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#8B5CF6',
  },

  chipsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  chip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: { fontSize: 14, fontWeight: '500' },

  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 100 },

  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sectionEmpty: { paddingHorizontal: 16, paddingVertical: 16 },

  listContainer: { paddingHorizontal: 16, gap: 10 },

  loadingState: { paddingVertical: 60, alignItems: 'center' },
  emptyState: { paddingVertical: 80, alignItems: 'center', paddingHorizontal: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginTop: 12 },
  emptySubtitle: { fontSize: 13, marginTop: 6, textAlign: 'center' },

  // Featured (horizontal) cards
  horizontalContent: { paddingHorizontal: 16, gap: 12 },
  featuredCard: {
    width: FEATURED_CARD_WIDTH,
    height: FEATURED_CARD_HEIGHT,
    borderRadius: 16,
    overflow: 'hidden',
  },
  featuredCardBlur: { flex: 1, borderRadius: 16, overflow: 'hidden', borderWidth: 1 },
  featuredImage: { ...StyleSheet.absoluteFillObject },
  featuredGradient: { ...StyleSheet.absoluteFillObject },
  featuredContent: { flex: 1, padding: 14, justifyContent: 'space-between' },
  featuredBadges: { flexDirection: 'row', gap: 6 },
  featuredInfo: { gap: 4 },
  featuredDate: { color: '#8B5CF6', fontSize: 12, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  featuredCategory: { color: '#8B5CF6', fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  featuredTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  featuredClub: { color: 'rgba(255,255,255,0.85)', fontSize: 13 },
  featuredFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  featuredLocation: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1, marginRight: 8 },
  featuredLocationText: { color: 'rgba(255,255,255,0.7)', fontSize: 11, flex: 1 },
  featuredAttendees: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  featuredAttendeesText: { color: 'rgba(255,255,255,0.7)', fontSize: 11 },

  attendingBadge: {
    backgroundColor: 'rgba(34, 197, 94, 0.9)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  attendingBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  priceBadge: {
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  freeBadge: {
    backgroundColor: 'rgba(34, 197, 94, 0.9)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  priceBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  clubBadge: {
    backgroundColor: 'rgba(139, 92, 246, 0.9)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  clubBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  proBadge: {
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  proBadgeText: { color: '#FFD700', fontSize: 11, fontWeight: '700' },

  // List rows
  row: { borderRadius: 16, overflow: 'hidden' },
  rowBlur: { borderRadius: 16, overflow: 'hidden', borderWidth: 1 },
  rowContent: { flexDirection: 'row', padding: 12, gap: 12 },
  rowImage: { width: 84, height: 84, borderRadius: 12 },
  rowImagePlaceholder: { width: 84, height: 84, borderRadius: 12, overflow: 'hidden' },
  rowImageGradient: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  rowDetails: { flex: 1, gap: 6 },
  rowHeader: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  rowTitleRow: { flexDirection: 'row', alignItems: 'center' },
  rowTitle: { fontSize: 15, fontWeight: '700' },
  rowSubtitle: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  rowDescription: { fontSize: 12, lineHeight: 17 },
  rowMeta: { gap: 3 },
  rowMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rowMetaText: { fontSize: 12 },
  rowFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 },
  rowAttendeeText: { fontSize: 12, fontWeight: '600' },
  rowPriceFree: { color: '#22C55E', fontSize: 13, fontWeight: '700' },
  rowPricePaid: { color: '#8B5CF6', fontSize: 13, fontWeight: '700' },
  smallAttendingBadge: {
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
    borderColor: '#22C55E',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  smallAttendingText: { color: '#22C55E', fontSize: 10, fontWeight: '700' },
  entityTypePill: {
    backgroundColor: 'rgba(139,92,246,0.18)',
    borderColor: '#8B5CF6',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  entityTypePillText: { color: '#8B5CF6', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
});
