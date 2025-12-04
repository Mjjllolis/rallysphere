// app/profile/orders.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  ScrollView,
} from 'react-native';
import {
  Text,
  useTheme,
  Surface,
  Chip,
  ActivityIndicator,
  Divider,
  Button,
  IconButton,
  Portal,
  Modal,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuth } from '../_layout';
import { getUserStoreOrders } from '../../lib/firebase';
import type { StoreOrder } from '../../lib/firebase';
import { Ionicons } from '@expo/vector-icons';

const getStatusColor = (status: StoreOrder['status'], theme: any) => {
  switch (status) {
    case 'pending':
      return theme.colors.tertiary;
    case 'processing':
      return theme.colors.secondary;
    case 'shipped':
      return theme.colors.primary;
    case 'delivered':
    case 'picked_up':
      return theme.colors.tertiary;
    case 'cancelled':
      return theme.colors.error;
    default:
      return theme.colors.onSurface;
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
    default:
      return status;
  }
};

const FILTER_OPTIONS = [
  { id: 'all', label: 'All Orders' },
  { id: '30days', label: 'Last 30 Days' },
  { id: '3months', label: 'Last 3 Months' },
  { id: 'thisyear', label: 'This Year' },
];

const STATUS_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'processing', label: 'Processing' },
  { id: 'shipped', label: 'Shipped' },
  { id: 'delivered', label: 'Delivered' },
  { id: 'cancelled', label: 'Cancelled' },
];

export default function OrdersScreen() {
  const theme = useTheme();
  const { user } = useAuth();

  const [orders, setOrders] = useState<StoreOrder[]>([]);
  const [filteredOrders, setFilteredOrders] = useState<StoreOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTimeFilter, setSelectedTimeFilter] = useState('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('all');
  const [selectedOrder, setSelectedOrder] = useState<StoreOrder | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);

  useEffect(() => {
    if (user) {
      loadOrders();
    }
  }, [user]);

  useEffect(() => {
    filterOrders();
  }, [orders, searchQuery, selectedTimeFilter, selectedStatusFilter]);

  const loadOrders = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const result = await getUserStoreOrders(user.uid);

      if (result.success) {
        setOrders(result.orders);
      }
    } catch (error) {
      console.error('Error loading orders:', error);
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

    // Time filter
    if (selectedTimeFilter !== 'all') {
      const now = new Date();
      const filterDate = new Date();

      switch (selectedTimeFilter) {
        case '30days':
          filterDate.setDate(now.getDate() - 30);
          break;
        case '3months':
          filterDate.setMonth(now.getMonth() - 3);
          break;
        case 'thisyear':
          filterDate.setMonth(0);
          filterDate.setDate(1);
          break;
      }

      filtered = filtered.filter((order) => {
        const orderDate = order.createdAt?.toDate ? order.createdAt.toDate() : new Date(order.createdAt);
        return orderDate >= filterDate;
      });
    }

    // Status filter
    if (selectedStatusFilter !== 'all') {
      filtered = filtered.filter((order) => order.status === selectedStatusFilter);
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

  const openOrderDetail = (order: StoreOrder) => {
    setSelectedOrder(order);
    setDetailModalVisible(true);
  };

  const renderOrder = ({ item }: { item: StoreOrder }) => {
    return (
      <TouchableOpacity
        onPress={() => openOrderDetail(item)}
        activeOpacity={0.7}
      >
        <Surface style={[styles.orderCard, { backgroundColor: theme.colors.surface }]} elevation={0}>
          <View style={styles.orderHeader}>
            <View style={{ flex: 1 }}>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                Order #{item.id.slice(-8).toUpperCase()}
              </Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                {formatDate(item.createdAt)}
              </Text>
            </View>

            <Chip
              textStyle={{ fontSize: 12, color: getStatusColor(item.status, theme) }}
              style={{
                backgroundColor: `${getStatusColor(item.status, theme)}20`,
              }}
            >
              {getStatusLabel(item.status)}
            </Chip>
          </View>

          <Divider style={{ marginVertical: 12 }} />

          <View style={styles.orderBody}>
            <View style={styles.itemInfo}>
              {item.itemImage && (
                <Image source={{ uri: item.itemImage }} style={styles.itemImage} />
              )}

              <View style={{ flex: 1 }}>
                <Text variant="titleMedium" numberOfLines={2} style={{ fontWeight: '600' }}>
                  {item.itemName}
                </Text>

                <Text variant="bodyMedium" style={{ color: theme.colors.primary, marginTop: 4 }}>
                  {item.clubName}
                </Text>

                <View style={styles.orderDetails}>
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    Qty: {item.quantity}
                  </Text>

                  {item.selectedVariants && Object.keys(item.selectedVariants).length > 0 && (
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                      {' • '}
                      {Object.entries(item.selectedVariants)
                        .map(([key, value]) => `${key}: ${value}`)
                        .join(', ')}
                    </Text>
                  )}
                </View>

                <View style={styles.deliveryInfo}>
                  <Chip
                    icon={item.deliveryMethod === 'shipping' ? 'truck-delivery' : 'map-marker'}
                    compact
                    textStyle={{ fontSize: 11 }}
                    style={{ height: 24 }}
                  >
                    {item.deliveryMethod === 'shipping' ? 'Shipping' : 'Pickup'}
                  </Chip>
                </View>
              </View>
            </View>

            {item.shippingAddress && (
              <View style={styles.addressSection}>
                <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                  Shipping To:
                </Text>
                <Text variant="bodySmall">
                  {item.shippingAddress.fullName}
                </Text>
                <Text variant="bodySmall">
                  {item.shippingAddress.addressLine1}
                </Text>
                <Text variant="bodySmall">
                  {item.shippingAddress.city}, {item.shippingAddress.state}{' '}
                  {item.shippingAddress.zipCode}
                </Text>
              </View>
            )}
          </View>

          <Divider style={{ marginVertical: 12 }} />

          <View style={styles.orderFooter}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text variant="titleLarge" style={{ fontWeight: 'bold' }}>
                ${item.totalAmount.toFixed(2)}
              </Text>
              <Button mode="outlined" compact onPress={() => router.push(`/(tabs)/store/${item.itemId}`)}>
                View Product
              </Button>
            </View>
          </View>
        </Surface>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.colors.surface }]}>
        <View style={styles.headerTop}>
          <IconButton icon="arrow-left" onPress={() => router.back()} />
          <Text variant="headlineSmall" style={{ fontWeight: 'bold', flex: 1, color: theme.colors.onSurface }}>
            Your Orders
          </Text>
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Ionicons name="search-outline" size={20} color="#999" style={styles.searchIcon} />
          <TextInput
            placeholder="Search orders..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            style={styles.searchInput}
            placeholderTextColor="#999"
          />
        </View>

        {/* Time Filter Pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterContainer}
        >
          {FILTER_OPTIONS.map((filter) => (
            <TouchableOpacity
              key={filter.id}
              style={[
                styles.filterPill,
                selectedTimeFilter === filter.id && [styles.filterPillActive, { backgroundColor: theme.colors.primary }],
              ]}
              onPress={() => setSelectedTimeFilter(filter.id)}
            >
              <Text
                style={[
                  styles.filterPillText,
                  selectedTimeFilter === filter.id && styles.filterPillTextActive,
                ]}
              >
                {filter.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Status Filter Pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.statusFilterContainer}
        >
          {STATUS_FILTERS.map((filter) => (
            <TouchableOpacity
              key={filter.id}
              style={[
                styles.statusFilterPill,
                selectedStatusFilter === filter.id && [styles.statusFilterPillActive, { borderColor: theme.colors.primary }],
              ]}
              onPress={() => setSelectedStatusFilter(filter.id)}
            >
              <Text
                style={[
                  styles.statusFilterPillText,
                  selectedStatusFilter === filter.id && [styles.statusFilterPillTextActive, { color: theme.colors.primary }],
                ]}
              >
                {filter.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Results Count */}
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, paddingHorizontal: 16, paddingBottom: 8 }}>
          {filteredOrders.length} {filteredOrders.length === 1 ? 'order' : 'orders'}
        </Text>
      </View>

      {orders.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="receipt-outline" size={64} color="#ccc" />
          <Text variant="titleMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 16 }}>
            No orders yet
          </Text>
          <Text
            variant="bodyMedium"
            style={{ color: theme.colors.onSurfaceVariant, marginTop: 8, textAlign: 'center' }}
          >
            Your order history will appear here
          </Text>
          <Button mode="contained" style={{ marginTop: 24 }} onPress={() => router.push('/(tabs)/store')}>
            Start Shopping
          </Button>
        </View>
      ) : filteredOrders.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="search-outline" size={64} color="#ccc" />
          <Text variant="titleMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 16 }}>
            No orders found
          </Text>
          <Text
            variant="bodyMedium"
            style={{ color: theme.colors.onSurfaceVariant, marginTop: 8, textAlign: 'center' }}
          >
            Try adjusting your filters
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredOrders}
          renderItem={renderOrder}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        />
      )}

      {/* Order Detail Modal */}
      <Portal>
        <Modal
          visible={detailModalVisible}
          onDismiss={() => setDetailModalVisible(false)}
          contentContainerStyle={[styles.modalContent, { backgroundColor: theme.colors.surface }]}
        >
          {selectedOrder && (
            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Modal Header */}
              <View style={styles.modalHeader}>
                <Text variant="headlineSmall" style={{ fontWeight: 'bold' }}>
                  Order Details
                </Text>
                <IconButton icon="close" onPress={() => setDetailModalVisible(false)} />
              </View>

              {/* Order ID & Date */}
              <View style={styles.modalSection}>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  Order #{selectedOrder.id.slice(-8).toUpperCase()}
                </Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
                  Placed on {formatDate(selectedOrder.createdAt)}
                </Text>
              </View>

              <Divider />

              {/* Status */}
              <View style={styles.modalSection}>
                <Text variant="labelLarge" style={{ marginBottom: 8 }}>
                  Order Status
                </Text>
                <Chip
                  textStyle={{ fontSize: 14, color: getStatusColor(selectedOrder.status, theme) }}
                  style={{
                    backgroundColor: `${getStatusColor(selectedOrder.status, theme)}20`,
                    alignSelf: 'flex-start',
                  }}
                >
                  {getStatusLabel(selectedOrder.status)}
                </Chip>
              </View>

              <Divider />

              {/* Product Info */}
              <View style={styles.modalSection}>
                <Text variant="labelLarge" style={{ marginBottom: 12 }}>
                  Product Details
                </Text>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  {selectedOrder.itemImage && (
                    <Image source={{ uri: selectedOrder.itemImage }} style={styles.modalItemImage} />
                  )}
                  <View style={{ flex: 1 }}>
                    <Text variant="titleMedium" style={{ fontWeight: '600' }}>
                      {selectedOrder.itemName}
                    </Text>
                    <Text variant="bodyMedium" style={{ color: theme.colors.primary, marginTop: 4 }}>
                      {selectedOrder.clubName}
                    </Text>
                    <Text variant="bodySmall" style={{ marginTop: 8, color: theme.colors.onSurfaceVariant }}>
                      Quantity: {selectedOrder.quantity}
                    </Text>
                    {selectedOrder.selectedVariants && Object.keys(selectedOrder.selectedVariants).length > 0 && (
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                        {Object.entries(selectedOrder.selectedVariants)
                          .map(([key, value]) => `${key}: ${value}`)
                          .join(' • ')}
                      </Text>
                    )}
                  </View>
                </View>
              </View>

              <Divider />

              {/* Delivery Info */}
              <View style={styles.modalSection}>
                <Text variant="labelLarge" style={{ marginBottom: 12 }}>
                  Delivery Information
                </Text>
                <Chip
                  icon={selectedOrder.deliveryMethod === 'shipping' ? 'truck-delivery' : 'map-marker'}
                  style={{ alignSelf: 'flex-start' }}
                >
                  {selectedOrder.deliveryMethod === 'shipping' ? 'Shipping' : 'Pickup'}
                </Chip>
                {selectedOrder.shippingAddress && (
                  <View style={{ marginTop: 12, padding: 12, backgroundColor: theme.colors.surfaceVariant, borderRadius: 8 }}>
                    <Text variant="bodyMedium" style={{ fontWeight: '600' }}>
                      {selectedOrder.shippingAddress.fullName}
                    </Text>
                    <Text variant="bodySmall" style={{ marginTop: 4 }}>
                      {selectedOrder.shippingAddress.addressLine1}
                    </Text>
                    {selectedOrder.shippingAddress.addressLine2 && (
                      <Text variant="bodySmall">{selectedOrder.shippingAddress.addressLine2}</Text>
                    )}
                    <Text variant="bodySmall">
                      {selectedOrder.shippingAddress.city}, {selectedOrder.shippingAddress.state}{' '}
                      {selectedOrder.shippingAddress.zipCode}
                    </Text>
                  </View>
                )}
              </View>

              <Divider />

              {/* Price Breakdown */}
              <View style={styles.modalSection}>
                <Text variant="labelLarge" style={{ marginBottom: 12 }}>
                  Order Summary
                </Text>

                <View style={styles.priceRow}>
                  <Text variant="bodyMedium">Item Subtotal</Text>
                  <Text variant="bodyMedium">${selectedOrder.price.toFixed(2)}</Text>
                </View>

                {selectedOrder.shipping > 0 && (
                  <View style={styles.priceRow}>
                    <Text variant="bodyMedium">Shipping</Text>
                    <Text variant="bodyMedium">${selectedOrder.shipping.toFixed(2)}</Text>
                  </View>
                )}

                <Divider style={{ marginVertical: 8 }} />

                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8 }}>
                  Taxes & Fees
                </Text>

                {selectedOrder.tax > 0 && (
                  <View style={styles.priceRow}>
                    <Text variant="bodySmall">Sales Tax</Text>
                    <Text variant="bodySmall">${selectedOrder.tax.toFixed(2)}</Text>
                  </View>
                )}

                {(selectedOrder as any).adminFee > 0 && (
                  <View style={styles.priceRow}>
                    <Text variant="bodySmall">Admin Fee</Text>
                    <Text variant="bodySmall">${(selectedOrder as any).adminFee.toFixed(2)}</Text>
                  </View>
                )}

                {(selectedOrder as any).transactionFee > 0 && (
                  <View style={styles.priceRow}>
                    <Text variant="bodySmall">Transaction Fee</Text>
                    <Text variant="bodySmall">${(selectedOrder as any).transactionFee.toFixed(2)}</Text>
                  </View>
                )}

                <Divider style={{ marginVertical: 8 }} />

                <View style={styles.priceRow}>
                  <Text variant="titleMedium" style={{ fontWeight: 'bold' }}>
                    Order Total
                  </Text>
                  <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.primary }}>
                    ${selectedOrder.totalAmount.toFixed(2)}
                  </Text>
                </View>
              </View>

              {/* Action Buttons */}
              <View style={styles.modalActions}>
                <Button
                  mode="outlined"
                  style={{ flex: 1 }}
                  onPress={() => {
                    setDetailModalVisible(false);
                    router.push(`/(tabs)/store/${selectedOrder.itemId}`);
                  }}
                >
                  View Product
                </Button>
                <Button mode="contained" style={{ flex: 1 }} onPress={() => setDetailModalVisible(false)}>
                  Close
                </Button>
              </View>
            </ScrollView>
          )}
        </Modal>
      </Portal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    paddingBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingTop: 8,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    paddingHorizontal: 12,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 16,
    height: 44,
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
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 12,
  },
  filterPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
  },
  filterPillActive: {
    // backgroundColor set dynamically
  },
  filterPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  filterPillTextActive: {
    color: '#fff',
  },
  statusFilterContainer: {
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 8,
  },
  statusFilterPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    backgroundColor: '#fff',
  },
  statusFilterPillActive: {
    // borderColor set dynamically
  },
  statusFilterPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  statusFilterPillTextActive: {
    // color set dynamically
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 48,
  },
  listContent: {
    padding: 16,
  },
  orderCard: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    backgroundColor: '#fff',
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  orderBody: {
    gap: 12,
  },
  itemInfo: {
    flexDirection: 'row',
    gap: 12,
  },
  itemImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
  },
  orderDetails: {
    flexDirection: 'row',
    marginTop: 4,
  },
  deliveryInfo: {
    marginTop: 8,
  },
  addressSection: {
    marginTop: 8,
    padding: 12,
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 8,
  },
  orderFooter: {},
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  modalContent: {
    margin: 20,
    borderRadius: 16,
    maxHeight: '85%',
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalSection: {
    paddingVertical: 16,
  },
  modalItemImage: {
    width: 100,
    height: 100,
    borderRadius: 8,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
});
