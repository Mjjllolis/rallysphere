// app/profile/tickets.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  RefreshControl,
  TextInput,
} from 'react-native';
import {
  Text,
  ActivityIndicator,
  IconButton,
  useTheme,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuth, useThemeToggle } from '../_layout';
import { getUserTicketOrders } from '../../lib/firebase';
import type { TicketOrder } from '../../lib/firebase';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';

const getStatusColor = (status: TicketOrder['status']) => {
  switch (status) {
    case 'confirmed':
      return '#22C55E';
    case 'checked_in':
      return '#60A5FA';
    case 'cancelled':
      return '#EF4444';
    case 'refunded':
      return '#A855F7';
    default:
      return '#999';
  }
};

const getStatusLabel = (status: TicketOrder['status']) => {
  switch (status) {
    case 'confirmed':
      return 'Confirmed';
    case 'checked_in':
      return 'Checked In';
    case 'cancelled':
      return 'Cancelled';
    case 'refunded':
      return 'Refunded';
    default:
      return status;
  }
};

const STATUS_FILTERS = ['All', 'Upcoming', 'Attended', 'Cancelled'];

export default function TicketsScreen() {
  const { user } = useAuth();
  const theme = useTheme();
  const { isDark } = useThemeToggle();

  const [tickets, setTickets] = useState<TicketOrder[]>([]);
  const [filteredTickets, setFilteredTickets] = useState<TicketOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('All');

  useEffect(() => {
    if (user) {
      loadTickets();
    }
  }, [user]);

  useEffect(() => {
    filterTickets();
  }, [tickets, searchQuery, selectedStatus]);

  const loadTickets = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const result = await getUserTicketOrders(user.uid);

      if (result.success) {
        setTickets(result.orders);
      }
    } catch (error) {
      // console.error('Error loading tickets:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadTickets();
    setRefreshing(false);
  };

  const filterTickets = () => {
    let filtered = [...tickets];

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (ticket) =>
          ticket.eventName.toLowerCase().includes(query) ||
          ticket.clubName.toLowerCase().includes(query) ||
          ticket.id.toLowerCase().includes(query)
      );
    }

    // Status filter
    if (selectedStatus !== 'All') {
      const now = new Date();
      if (selectedStatus === 'Upcoming') {
        filtered = filtered.filter((ticket) => {
          if (ticket.status === 'cancelled' || ticket.status === 'refunded') return false;
          if (!ticket.eventDate) return true;
          const eventDate = ticket.eventDate.toDate ? ticket.eventDate.toDate() : new Date(ticket.eventDate as any);
          return eventDate >= now;
        });
      } else if (selectedStatus === 'Attended') {
        filtered = filtered.filter((ticket) => {
          if (ticket.status === 'checked_in') return true;
          if (ticket.status === 'cancelled' || ticket.status === 'refunded') return false;
          if (!ticket.eventDate) return false;
          const eventDate = ticket.eventDate.toDate ? ticket.eventDate.toDate() : new Date(ticket.eventDate as any);
          return eventDate < now;
        });
      } else if (selectedStatus === 'Cancelled') {
        filtered = filtered.filter((ticket) =>
          ['cancelled', 'refunded'].includes(ticket.status)
        );
      }
    }

    setFilteredTickets(filtered);
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return '';

    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatTime = (timestamp: any) => {
    if (!timestamp) return '';

    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const renderTicket = (ticket: TicketOrder) => {
    return (
      <TouchableOpacity
        key={ticket.id}
        style={styles.ticketCard}
        onPress={() => router.push(`/event/${ticket.eventId}`)}
        activeOpacity={0.9}
      >
        <BlurView intensity={20} tint={isDark ? "dark" : "light"} style={[styles.ticketCardBlur, { borderColor: theme.colors.outline }]}>
          <View style={styles.ticketCardContent}>
            {/* Left: Event Image */}
            {ticket.eventImage ? (
              <Image
                source={{ uri: ticket.eventImage }}
                style={styles.ticketImage}
                resizeMode="cover"
              />
            ) : (
              <View style={[styles.ticketImagePlaceholder, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }]}>
                <Ionicons name="ticket-outline" size={32} color={theme.colors.onSurfaceDisabled} />
              </View>
            )}

            {/* Right: Ticket Details */}
            <View style={styles.ticketDetails}>
              <View style={styles.ticketHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.ticketTitle, { color: theme.colors.onSurface }]} numberOfLines={2}>
                    {ticket.eventName}
                  </Text>
                  <Text style={styles.ticketClub} numberOfLines={1}>
                    {ticket.clubName}
                  </Text>
                </View>

                <View
                  style={[
                    styles.statusBadge,
                    { backgroundColor: `${getStatusColor(ticket.status)}20`, borderColor: getStatusColor(ticket.status) },
                  ]}
                >
                  <Text style={[styles.statusText, { color: getStatusColor(ticket.status) }]}>
                    {getStatusLabel(ticket.status)}
                  </Text>
                </View>
              </View>

              <View style={styles.ticketMeta}>
                {ticket.eventDate && (
                  <View style={styles.ticketMetaRow}>
                    <Ionicons name="calendar-outline" size={12} color={theme.colors.onSurfaceVariant} />
                    <Text style={[styles.ticketMetaText, { color: theme.colors.onSurfaceVariant }]}>{formatDate(ticket.eventDate)}</Text>
                  </View>
                )}
                {ticket.eventDate && (
                  <View style={styles.ticketMetaRow}>
                    <Ionicons name="time-outline" size={12} color={theme.colors.onSurfaceVariant} />
                    <Text style={[styles.ticketMetaText, { color: theme.colors.onSurfaceVariant }]}>{formatTime(ticket.eventDate)}</Text>
                  </View>
                )}
              </View>

              <View style={styles.ticketFooter}>
                <View style={styles.ticketQuantity}>
                  <Text style={styles.quantityText}>
                    {ticket.quantity} {ticket.quantity === 1 ? 'Ticket' : 'Tickets'}
                  </Text>
                </View>
                <Text style={styles.ticketPrice}>${ticket.totalAmount.toFixed(2)}</Text>
              </View>
            </View>
          </View>
        </BlurView>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={StyleSheet.absoluteFill}>
          <View style={[styles.blackBackground, { backgroundColor: theme.colors.background }]} />
        </View>

        <LinearGradient
          colors={isDark ? ['rgba(139, 92, 246, 0.3)', 'rgba(96, 165, 250, 0.1)', 'rgba(0, 0, 0, 0)'] : ['rgba(139, 92, 246, 0.15)', 'rgba(96, 165, 250, 0.05)', 'rgba(255, 255, 255, 0)']}
          locations={[0, 0.3, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        <SafeAreaView style={styles.safeArea} edges={['top']}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#8B5CF6" />
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Black Background */}
      <View style={StyleSheet.absoluteFill}>
        <View style={[styles.blackBackground, { backgroundColor: theme.colors.background }]} />
      </View>

      {/* Subtle Gradient Overlay */}
      <LinearGradient
        colors={isDark ? ['rgba(139, 92, 246, 0.3)', 'rgba(96, 165, 250, 0.1)', 'rgba(0, 0, 0, 0)'] : ['rgba(139, 92, 246, 0.15)', 'rgba(96, 165, 250, 0.05)', 'rgba(255, 255, 255, 0)']}
        locations={[0, 0.3, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
              <BlurView intensity={20} tint={isDark ? "dark" : "light"} style={[styles.backButton, { borderColor: theme.colors.outline }]}>
                <Ionicons name="arrow-back" size={24} color={theme.colors.onSurface} />
              </BlurView>
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: theme.colors.onSurface }]}>Your Tickets</Text>
          </View>

          {/* Search Bar */}
          <BlurView intensity={20} tint={isDark ? "dark" : "light"} style={[styles.searchBarContainer, { borderColor: theme.colors.outline }]}>
            <View style={styles.searchInputWrapper}>
              <Ionicons
                name="search-outline"
                size={20}
                color={theme.colors.onSurfaceVariant}
                style={styles.searchIcon}
              />
              <TextInput
                placeholder="Search tickets..."
                value={searchQuery}
                onChangeText={setSearchQuery}
                style={[styles.searchInput, { color: theme.colors.onSurface }]}
                placeholderTextColor={theme.colors.onSurfaceDisabled}
              />
            </View>
          </BlurView>

          {/* Status Filter */}
          <View style={styles.filterContainer}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterContent}
            >
              {STATUS_FILTERS.map((status) => (
                <TouchableOpacity
                  key={status}
                  onPress={() => setSelectedStatus(status)}
                  activeOpacity={0.7}
                >
                  <BlurView
                    intensity={selectedStatus === status ? 30 : 15}
                    tint={isDark ? "dark" : "light"}
                    style={[
                      styles.filterChip,
                      { borderColor: theme.colors.outline },
                      selectedStatus === status && styles.filterChipSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.filterText,
                        { color: theme.colors.onSurfaceVariant },
                        selectedStatus === status && { color: theme.colors.onSurface },
                      ]}
                    >
                      {status}
                    </Text>
                  </BlurView>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>

        {tickets.length === 0 ? (
          <View style={styles.emptyContainer}>
            <BlurView intensity={20} tint={isDark ? "dark" : "light"} style={[styles.emptyCard, { borderColor: theme.colors.outline }]}>
              <View style={styles.emptyContent}>
                <IconButton icon="ticket-outline" size={64} iconColor={theme.colors.onSurfaceDisabled} />
                <Text style={[styles.emptyTitle, { color: theme.colors.onSurface }]}>No tickets yet</Text>
                <Text style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}>
                  Your purchased tickets will appear here
                </Text>
                <TouchableOpacity
                  onPress={() => router.push('/(tabs)/events')}
                  activeOpacity={0.7}
                >
                  <BlurView intensity={30} tint={isDark ? "dark" : "light"} style={[styles.browseButton, { borderColor: theme.colors.outline }]}>
                    <View style={styles.browseButtonInner}>
                      <IconButton icon="calendar-search" iconColor="#8B5CF6" size={20} style={{ margin: 0 }} />
                      <Text style={styles.browseButtonText}>Browse Events</Text>
                    </View>
                  </BlurView>
                </TouchableOpacity>
              </View>
            </BlurView>
          </View>
        ) : filteredTickets.length === 0 ? (
          <View style={styles.emptyContainer}>
            <BlurView intensity={20} tint={isDark ? "dark" : "light"} style={[styles.emptyCard, { borderColor: theme.colors.outline }]}>
              <View style={styles.emptyContent}>
                <IconButton icon="search-outline" size={64} iconColor={theme.colors.onSurfaceDisabled} />
                <Text style={[styles.emptyTitle, { color: theme.colors.onSurface }]}>No tickets found</Text>
                <Text style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}>
                  Try adjusting your search or filters
                </Text>
              </View>
            </BlurView>
          </View>
        ) : (
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.onSurface} />
            }
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.ticketsSection}>
              <Text style={[styles.sectionTitle, { color: theme.colors.onSurfaceVariant }]}>
                {filteredTickets.length} {filteredTickets.length === 1 ? 'Ticket' : 'Tickets'}
              </Text>
              {filteredTickets.map((ticket) => renderTicket(ticket))}
            </View>
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  blackBackground: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
  },
  searchBarContainer: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
  },
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    height: 48,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    padding: 0,
    margin: 0,
  },
  filterContainer: {
    marginTop: 4,
  },
  filterContent: {
    gap: 8,
    paddingRight: 16,
  },
  filterChip: {
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  filterChipSelected: {
    borderColor: '#8B5CF6',
  },
  filterText: {
    fontSize: 13,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  ticketsSection: {
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 16,
    marginTop: 8,
  },
  ticketCard: {
    marginBottom: 12,
    borderRadius: 16,
    overflow: 'hidden',
  },
  ticketCardBlur: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
  },
  ticketCardContent: {
    flexDirection: 'row',
    padding: 12,
    gap: 12,
  },
  ticketImage: {
    width: 100,
    height: 100,
    borderRadius: 12,
  },
  ticketImagePlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ticketDetails: {
    flex: 1,
    gap: 8,
  },
  ticketHeader: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  ticketTitle: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 20,
  },
  ticketClub: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8B5CF6',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
  },
  ticketMeta: {
    flexDirection: 'row',
    gap: 12,
  },
  ticketMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ticketMetaText: {
    fontSize: 11,
  },
  ticketFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ticketQuantity: {
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  quantityText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#8B5CF6',
  },
  ticketPrice: {
    fontSize: 20,
    fontWeight: '800',
    color: '#8B5CF6',
    letterSpacing: -0.5,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyCard: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
  },
  emptyContent: {
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
  },
  browseButton: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
  },
  browseButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
    gap: 8,
  },
  browseButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#8B5CF6',
  },
});
