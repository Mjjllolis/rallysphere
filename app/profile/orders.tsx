// app/profile/orders.tsx
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
import { getUserStoreOrders } from '../../lib/firebase';
import type { StoreOrder } from '../../lib/firebase';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';

const getStatusColor = (status: StoreOrder['status']) => {
  switch (status) {
    case 'pending':
      return '#FFA500';
    case 'processing':
      return '#60A5FA';
    case 'shipped':
      return '#8B5CF6';
    case 'delivered':
    case 'picked_up':
      return '#22C55E';
    case 'cancelled':
      return '#EF4444';
    case 'refunded':
      return '#A855F7';
    default:
      return '#999';
  }
};

const getStatusLabel = (status: StoreOrder['status']) => {
  switch (status) {
    case 'pending':
      return 'Pending';
    case 'processing':
      return 'Processing';
    case 'shipped':
      return 'Shipped';
    case 'delivered':
      return 'Delivered';
    case 'picked_up':
      return 'Picked Up';
    case 'cancelled':
      return 'Cancelled';
    case 'refunded':
      return 'Refunded';
    default:
      return status;
  }
};

const STATUS_FILTERS = ['All', 'Active', 'Delivered', 'Cancelled', 'Refunded'];

export default function OrdersScreen() {
  const { user } = useAuth();
  const theme = useTheme();
  const { isDark } = useThemeToggle();

  const [orders, setOrders] = useState<StoreOrder[]>([]);
  const [filteredOrders, setFilteredOrders] = useState<StoreOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('All');

  useEffect(() => {
    if (user) {
      loadOrders();
    }
  }, [user]);

  useEffect(() => {
    filterOrders();
  }, [orders, searchQuery, selectedStatus]);

  const loadOrders = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const result = await getUserStoreOrders(user.uid);

      if (result.success) {
        setOrders(result.orders);
      }
    } catch (error) {
      // console.error('Error loading orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadOrders();
    setRefreshing(false);
  };

  const filterOrders = () => {
    let filtered = [...orders];

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (order) =>
          order.itemName.toLowerCase().includes(query) ||
          order.clubName.toLowerCase().includes(query) ||
          order.id.toLowerCase().includes(query)
      );
    }

    // Status filter
    if (selectedStatus !== 'All') {
      if (selectedStatus === 'Active') {
        filtered = filtered.filter((order) =>
          ['pending', 'processing', 'shipped'].includes(order.status)
        );
      } else if (selectedStatus === 'Delivered') {
        filtered = filtered.filter((order) =>
          ['delivered', 'picked_up'].includes(order.status)
        );
      } else if (selectedStatus === 'Cancelled') {
        filtered = filtered.filter((order) => order.status === 'cancelled');
      } else if (selectedStatus === 'Refunded') {
        filtered = filtered.filter((order) => order.status === 'refunded');
      }
    }

    setFilteredOrders(filtered);
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return '';

    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const renderOrder = (order: StoreOrder) => {
    return (
      <TouchableOpacity
        key={order.id}
        style={styles.orderCard}
        onPress={() => router.push(`/(tabs)/store/${order.itemId}`)}
        activeOpacity={0.9}
      >
        <BlurView intensity={20} tint={isDark ? "dark" : "light"} style={[styles.orderCardBlur, { borderColor: theme.colors.outline }]}>
          <View style={styles.orderCardContent}>
            {/* Left: Product Image */}
            {order.itemImage ? (
              <Image
                source={{ uri: order.itemImage }}
                style={styles.orderImage}
                resizeMode="cover"
              />
            ) : (
              <View style={[styles.orderImagePlaceholder, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }]}>
                <Ionicons name="image-outline" size={32} color={theme.colors.onSurfaceDisabled} />
              </View>
            )}

            {/* Right: Order Details */}
            <View style={styles.orderDetails}>
              <View style={styles.orderHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.orderTitle, { color: theme.colors.onSurface }]} numberOfLines={2}>
                    {order.itemName}
                  </Text>
                  <Text style={styles.orderClub} numberOfLines={1}>
                    {order.clubName}
                  </Text>
                </View>

                <View
                  style={[
                    styles.statusBadge,
                    { backgroundColor: `${getStatusColor(order.status)}20`, borderColor: getStatusColor(order.status) },
                  ]}
                >
                  <Text style={[styles.statusText, { color: getStatusColor(order.status) }]}>
                    {getStatusLabel(order.status)}
                  </Text>
                </View>
              </View>

              <View style={styles.orderMeta}>
                <View style={styles.orderMetaRow}>
                  <Ionicons name="calendar-outline" size={12} color={theme.colors.onSurfaceVariant} />
                  <Text style={[styles.orderMetaText, { color: theme.colors.onSurfaceVariant }]}>{formatDate(order.createdAt)}</Text>
                </View>
                <View style={styles.orderMetaRow}>
                  <Ionicons
                    name="location-outline"
                    size={12}
                    color={theme.colors.onSurfaceVariant}
                  />
                  <Text style={[styles.orderMetaText, { color: theme.colors.onSurfaceVariant }]}>
                    Pickup
                  </Text>
                </View>
              </View>

              <View style={styles.orderFooter}>
                <View style={styles.orderQuantity}>
                  <Text style={styles.quantityText}>Qty: {order.quantity}</Text>
                </View>
                <Text style={styles.orderPrice}>${order.totalAmount.toFixed(2)}</Text>
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
          colors={isDark ? ['rgba(96, 165, 250, 0.3)', 'rgba(139, 92, 246, 0.1)', 'rgba(0, 0, 0, 0)'] : ['rgba(96, 165, 250, 0.15)', 'rgba(139, 92, 246, 0.05)', 'rgba(255, 255, 255, 0)']}
          locations={[0, 0.3, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        <SafeAreaView style={styles.safeArea} edges={['top']}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#60A5FA" />
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
        colors={isDark ? ['rgba(96, 165, 250, 0.3)', 'rgba(139, 92, 246, 0.1)', 'rgba(0, 0, 0, 0)'] : ['rgba(96, 165, 250, 0.15)', 'rgba(139, 92, 246, 0.05)', 'rgba(255, 255, 255, 0)']}
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
            <Text style={[styles.headerTitle, { color: theme.colors.onSurface }]}>Your Orders</Text>
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
                placeholder="Search orders..."
                value={searchQuery}
                onChangeText={setSearchQuery}
                style={[styles.searchInput, { color: theme.colors.onSurface }]}
                placeholderTextColor={theme.colors.onSurfaceDisabled}
              />
            </View>
          </BlurView>

          {/* Simplified Status Filter */}
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

        {orders.length === 0 ? (
          <View style={styles.emptyContainer}>
            <BlurView intensity={20} tint={isDark ? "dark" : "light"} style={[styles.emptyCard, { borderColor: theme.colors.outline }]}>
              <View style={styles.emptyContent}>
                <IconButton icon="receipt-outline" size={64} iconColor={theme.colors.onSurfaceDisabled} />
                <Text style={[styles.emptyTitle, { color: theme.colors.onSurface }]}>No orders yet</Text>
                <Text style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}>
                  Your order history will appear here
                </Text>
                <TouchableOpacity
                  onPress={() => router.push('/(tabs)/store')}
                  activeOpacity={0.7}
                >
                  <BlurView intensity={30} tint={isDark ? "dark" : "light"} style={[styles.shopButton, { borderColor: theme.colors.outline }]}>
                    <View style={styles.shopButtonInner}>
                      <IconButton icon="shopping" iconColor="#60A5FA" size={20} style={{ margin: 0 }} />
                      <Text style={styles.shopButtonText}>Start Shopping</Text>
                    </View>
                  </BlurView>
                </TouchableOpacity>
              </View>
            </BlurView>
          </View>
        ) : filteredOrders.length === 0 ? (
          <View style={styles.emptyContainer}>
            <BlurView intensity={20} tint={isDark ? "dark" : "light"} style={[styles.emptyCard, { borderColor: theme.colors.outline }]}>
              <View style={styles.emptyContent}>
                <IconButton icon="search-outline" size={64} iconColor={theme.colors.onSurfaceDisabled} />
                <Text style={[styles.emptyTitle, { color: theme.colors.onSurface }]}>No orders found</Text>
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
            <View style={styles.ordersSection}>
              <Text style={[styles.sectionTitle, { color: theme.colors.onSurfaceVariant }]}>
                {filteredOrders.length} {filteredOrders.length === 1 ? 'Order' : 'Orders'}
              </Text>
              {filteredOrders.map((order) => renderOrder(order))}
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
    borderColor: '#60A5FA',
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
  ordersSection: {
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 16,
    marginTop: 8,
  },
  orderCard: {
    marginBottom: 12,
    borderRadius: 16,
    overflow: 'hidden',
  },
  orderCardBlur: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
  },
  orderCardContent: {
    flexDirection: 'row',
    padding: 12,
    gap: 12,
  },
  orderImage: {
    width: 100,
    height: 100,
    borderRadius: 12,
  },
  orderImagePlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  orderDetails: {
    flex: 1,
    gap: 8,
  },
  orderHeader: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  orderTitle: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 20,
  },
  orderClub: {
    fontSize: 13,
    fontWeight: '600',
    color: '#60A5FA',
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
  orderMeta: {
    flexDirection: 'row',
    gap: 12,
  },
  orderMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  orderMetaText: {
    fontSize: 11,
  },
  orderFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  orderQuantity: {
    backgroundColor: 'rgba(96, 165, 250, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  quantityText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#60A5FA',
  },
  orderPrice: {
    fontSize: 20,
    fontWeight: '800',
    color: '#60A5FA',
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
  shopButton: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
  },
  shopButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
    gap: 8,
  },
  shopButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#60A5FA',
  },
});
