// app/club/[id]/manage-orders.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Alert,
  TouchableOpacity,
  Image,
  RefreshControl,
} from 'react-native';
import {
  Text,
  Button,
  useTheme,
  Surface,
  IconButton,
  Chip,
  Divider,
  ActivityIndicator,
  Portal,
  Modal,
  SegmentedButtons,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../_layout';
import {
  getClubStoreOrders,
  updateStoreOrderStatus,
  getClub,
} from '../../../lib/firebase';
import { refundStoreOrder } from '../../../lib/stripe';
import type { StoreOrder } from '../../../lib/firebase';

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
    case 'refunded':
      return '#A855F7';
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
    case 'refunded':
      return 'Refunded';
    default:
      return status;
  }
};

export default function ManageOrdersScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const { id } = useLocalSearchParams();
  const clubId = id as string;

  const [club, setClub] = useState<any>(null);
  const [orders, setOrders] = useState<StoreOrder[]>([]);
  const [filteredOrders, setFilteredOrders] = useState<StoreOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<StoreOrder | null>(null);
  const [statusModalVisible, setStatusModalVisible] = useState(false);
  const [newStatus, setNewStatus] = useState<StoreOrder['status']>('pending');
  const [updating, setUpdating] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'all' | StoreOrder['status']>('all');
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadData();
  }, [clubId]);

  useEffect(() => {
    filterOrders();
  }, [filterStatus, orders]);

  const loadData = async () => {
    try {
      setLoading(true);

      // Load club info
      const clubResult = await getClub(clubId);
      if (clubResult.success && clubResult.club) {
        setClub(clubResult.club);
      }

      // Load orders
      const result = await getClubStoreOrders(clubId);
      if (result.success) {
        setOrders(result.orders);
      }
    } catch (error) {
      console.error('Error loading orders:', error);
      Alert.alert('Error', 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const filterOrders = () => {
    if (filterStatus === 'all') {
      setFilteredOrders(orders);
    } else {
      setFilteredOrders(orders.filter((order) => order.status === filterStatus));
    }
  };

  const toggleExpanded = (orderId: string) => {
    setExpandedOrders((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(orderId)) {
        newSet.delete(orderId);
      } else {
        newSet.add(orderId);
      }
      return newSet;
    });
  };

  const openStatusModal = (order: StoreOrder) => {
    // Don't allow status changes for refunded orders
    if (order.status === 'refunded') {
      Alert.alert('Cannot Update', 'This order has been refunded and cannot be updated.');
      return;
    }
    setSelectedOrder(order);
    setNewStatus(order.status);
    setStatusModalVisible(true);
  };

  const handleUpdateStatus = async () => {
    if (!selectedOrder) return;

    try {
      setUpdating(true);

      // Handle refund specially
      if (newStatus === 'refunded') {
        // Show confirmation for refund
        Alert.alert(
          'Confirm Refund',
          `Are you sure you want to refund $${selectedOrder.totalAmount.toFixed(2)} to the customer? This action cannot be undone.`,
          [
            {
              text: 'Cancel',
              style: 'cancel',
              onPress: () => setUpdating(false),
            },
            {
              text: 'Refund',
              style: 'destructive',
              onPress: async () => {
                const refundResult = await refundStoreOrder(selectedOrder.id, clubId);

                if (refundResult.success) {
                  Alert.alert(
                    'Refund Successful',
                    `$${refundResult.refundAmount?.toFixed(2)} has been refunded to the customer.`
                  );
                  await loadData();
                  setStatusModalVisible(false);
                } else {
                  Alert.alert('Refund Failed', refundResult.error || 'Failed to process refund');
                }
                setUpdating(false);
              },
            },
          ]
        );
        return;
      }

      const result = await updateStoreOrderStatus(selectedOrder.id, newStatus);

      if (result.success) {
        Alert.alert('Success', 'Order status updated successfully');
        await loadData();
        setStatusModalVisible(false);
      } else {
        Alert.alert('Error', result.error || 'Failed to update order status');
      }
    } catch (error) {
      console.error('Error updating order status:', error);
      Alert.alert('Error', 'An unexpected error occurred');
    } finally {
      setUpdating(false);
    }
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return '';

    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getOrderStats = () => {
    const stats = {
      total: orders.length,
      pending: orders.filter((o) => o.status === 'pending').length,
      processing: orders.filter((o) => o.status === 'processing').length,
      shipped: orders.filter((o) => o.status === 'shipped').length,
      completed: orders.filter((o) => o.status === 'delivered' || o.status === 'picked_up').length,
      cancelled: orders.filter((o) => o.status === 'cancelled').length,
      refunded: orders.filter((o) => o.status === 'refunded').length,
      totalRevenue: orders
        .filter((o) => o.status !== 'cancelled' && o.status !== 'refunded')
        .reduce((sum, o) => sum + o.totalAmount, 0),
    };
    return stats;
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

  const stats = getOrderStats();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.colors.background }]}>
        <View style={styles.headerTop}>
          <IconButton icon="arrow-left" onPress={() => router.back()} />
          <View style={{ flex: 1 }}>
            <Text variant="titleLarge" style={[styles.title, { color: theme.colors.onBackground }]}>
              Manage Orders
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              {club?.name} • ${stats.totalRevenue.toFixed(0)} revenue
            </Text>
          </View>
        </View>
      </View>

      {/* Compact Filter Chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterContainer}
        contentContainerStyle={styles.filterContent}
      >
        {[
          { key: 'all', label: 'All', count: stats.total },
          { key: 'pending', label: 'Pending', count: stats.pending },
          { key: 'processing', label: 'Processing', count: stats.processing },
          { key: 'shipped', label: 'Shipped', count: stats.shipped },
          { key: 'delivered', label: 'Done', count: stats.completed },
          { key: 'cancelled', label: 'Cancelled', count: stats.cancelled },
        ].map((filter) => (
          <Chip
            key={filter.key}
            selected={filterStatus === filter.key}
            onPress={() => setFilterStatus(filter.key as any)}
            style={styles.filterChip}
            textStyle={styles.filterChipText}
            compact
          >
            {filter.label} ({filter.count})
          </Chip>
        ))}
      </ScrollView>

      {/* Orders List */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {filteredOrders.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text variant="titleMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              No orders found
            </Text>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 8 }}>
              {filterStatus !== 'all'
                ? `No ${filterStatus} orders`
                : 'Orders will appear here when customers make purchases'}
            </Text>
          </View>
        ) : (
          filteredOrders.map((order) => {
            const isExpanded = expandedOrders.has(order.id);

            return (
              <TouchableOpacity
                key={order.id}
                onPress={() => toggleExpanded(order.id)}
                activeOpacity={0.7}
              >
                <Surface style={[styles.orderCard, { backgroundColor: theme.colors.surface }]} elevation={1}>
                  {/* Compact Header - Always Visible */}
                  <View style={styles.compactRow}>
                    {order.itemImage ? (
                      <Image source={{ uri: order.itemImage }} style={styles.thumbImage} resizeMode="cover" />
                    ) : (
                      <View style={[styles.thumbImage, { backgroundColor: theme.colors.surfaceVariant }]} />
                    )}

                    <View style={styles.orderInfo}>
                      <Text variant="titleSmall" numberOfLines={1} style={{ fontWeight: '600' }}>
                        {order.itemName}
                      </Text>
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                        {order.userName} • Qty: {order.quantity}
                      </Text>
                    </View>

                    <View style={styles.rightSection}>
                      <Text variant="titleSmall" style={{ fontWeight: 'bold', color: theme.colors.primary }}>
                        ${order.totalAmount.toFixed(2)}
                      </Text>
                      <TouchableOpacity
                        onPress={(e) => { e.stopPropagation(); openStatusModal(order); }}
                        style={[styles.statusBadge, { backgroundColor: `${getStatusColor(order.status, theme)}20` }]}
                      >
                        <Text style={{ fontSize: 11, fontWeight: '600', color: getStatusColor(order.status, theme) }}>
                          {getStatusLabel(order.status)}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <View style={styles.expandedContent}>
                      <Divider style={{ marginVertical: 12 }} />

                      {/* Order Info */}
                      <View style={styles.detailRow}>
                        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                          Order #{order.id.slice(-8).toUpperCase()}
                        </Text>
                        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                          {formatDate(order.createdAt)}
                        </Text>
                      </View>

                      {/* Delivery Method */}
                      <View style={[styles.detailRow, { marginTop: 8 }]}>
                        <Chip
                          icon={order.deliveryMethod === 'shipping' ? 'truck-delivery' : 'map-marker'}
                          compact
                          textStyle={{ fontSize: 11 }}
                          style={{ alignSelf: 'flex-start' }}
                        >
                          {order.deliveryMethod === 'shipping' ? 'Shipping' : 'Pickup'}
                        </Chip>
                      </View>

                      {/* Customer Info */}
                      <View style={[styles.infoSection, { backgroundColor: theme.colors.surfaceVariant + '40' }]}>
                        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                          CUSTOMER
                        </Text>
                        <Text variant="bodyMedium" style={{ fontWeight: '600' }}>
                          {order.userName}
                        </Text>
                        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                          {order.userEmail}
                        </Text>
                      </View>

                      {/* Shipping Address */}
                      {order.shippingAddress && (
                        <View style={[styles.infoSection, { backgroundColor: theme.colors.surfaceVariant + '40' }]}>
                          <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                            SHIPPING ADDRESS
                          </Text>
                          <Text variant="bodySmall">{order.shippingAddress.fullName}</Text>
                          <Text variant="bodySmall">{order.shippingAddress.addressLine1}</Text>
                          {order.shippingAddress.addressLine2 && (
                            <Text variant="bodySmall">{order.shippingAddress.addressLine2}</Text>
                          )}
                          <Text variant="bodySmall">
                            {order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.zipCode}
                          </Text>
                          <Text variant="bodySmall">{order.shippingAddress.phone}</Text>
                        </View>
                      )}

                      {/* Price Breakdown */}
                      <View style={[styles.infoSection, { backgroundColor: theme.colors.surfaceVariant + '40' }]}>
                        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 4 }}>
                          PRICE BREAKDOWN
                        </Text>
                        <View style={styles.priceRow}>
                          <Text variant="bodySmall">Subtotal</Text>
                          <Text variant="bodySmall">${order.price.toFixed(2)}</Text>
                        </View>
                        {order.shipping > 0 && (
                          <View style={styles.priceRow}>
                            <Text variant="bodySmall">Shipping</Text>
                            <Text variant="bodySmall">${order.shipping.toFixed(2)}</Text>
                          </View>
                        )}
                        <View style={styles.priceRow}>
                          <Text variant="bodySmall">Processing Fee (6% + $0.29)</Text>
                          <Text variant="bodySmall">
                            ${(order.totalAmount - order.price - (order.shipping || 0)).toFixed(2)}
                          </Text>
                        </View>
                        <Divider style={{ marginVertical: 4 }} />
                        <View style={styles.priceRow}>
                          <Text variant="bodyMedium" style={{ fontWeight: 'bold' }}>Total Charged</Text>
                          <Text variant="bodyMedium" style={{ fontWeight: 'bold' }}>
                            ${order.totalAmount.toFixed(2)}
                          </Text>
                        </View>
                      </View>

                      {/* Payout Info */}
                      <View style={[styles.infoSection, { backgroundColor: theme.colors.primaryContainer + '40' }]}>
                        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 4 }}>
                          CLUB PAYOUT
                        </Text>
                        <View style={styles.priceRow}>
                          <Text variant="bodySmall">Subtotal</Text>
                          <Text variant="bodySmall">${order.price.toFixed(2)}</Text>
                        </View>
                        {order.shipping > 0 && (
                          <View style={styles.priceRow}>
                            <Text variant="bodySmall">+ Shipping</Text>
                            <Text variant="bodySmall">${order.shipping.toFixed(2)}</Text>
                          </View>
                        )}
                        <Divider style={{ marginVertical: 4 }} />
                        <View style={styles.priceRow}>
                          <Text variant="bodyMedium" style={{ fontWeight: 'bold' }}>You Receive</Text>
                          <Text variant="bodyMedium" style={{ fontWeight: 'bold', color: theme.colors.primary }}>
                            ${(order.price + (order.shipping || 0)).toFixed(2)}
                          </Text>
                        </View>
                        <View style={[styles.priceRow, { marginTop: 8 }]}>
                          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                            Transfer Status
                          </Text>
                          <Text
                            variant="bodySmall"
                            style={{
                              color: (order as any).transferredToClub ? theme.colors.primary : theme.colors.tertiary,
                              fontWeight: '600',
                            }}
                          >
                            {(order as any).transferredToClub ? 'Transferred' : 'Pending'}
                          </Text>
                        </View>
                      </View>

                      {/* Update Status Button */}
                      <Button
                        mode="outlined"
                        onPress={() => openStatusModal(order)}
                        style={{ marginTop: 8 }}
                        compact
                      >
                        Update Status
                      </Button>
                    </View>
                  )}

                  {/* Expand Indicator */}
                  <View style={styles.expandIndicator}>
                    <IconButton
                      icon={isExpanded ? 'chevron-up' : 'chevron-down'}
                      size={16}
                      style={{ margin: 0, height: 20 }}
                    />
                  </View>
                </Surface>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* Update Status Modal */}
      <Portal>
        <Modal
          visible={statusModalVisible}
          onDismiss={() => setStatusModalVisible(false)}
          contentContainerStyle={[styles.modalContent, { backgroundColor: theme.colors.surface }]}
        >
          <Text variant="headlineSmall" style={{ marginBottom: 16 }}>
            Update Order Status
          </Text>

          {selectedOrder && (
            <>
              <Text variant="bodyMedium" style={{ marginBottom: 16, color: theme.colors.onSurfaceVariant }}>
                Order #{selectedOrder.id.slice(-8).toUpperCase()}
              </Text>

              <SegmentedButtons
                value={newStatus}
                onValueChange={(value) => setNewStatus(value as StoreOrder['status'])}
                buttons={[
                  { value: 'pending', label: 'Pending' },
                  { value: 'processing', label: 'Processing' },
                  { value: 'shipped', label: 'Shipped' },
                ]}
                style={{ marginBottom: 12 }}
              />

              <SegmentedButtons
                value={newStatus}
                onValueChange={(value) => setNewStatus(value as StoreOrder['status'])}
                buttons={[
                  {
                    value: selectedOrder.deliveryMethod === 'shipping' ? 'delivered' : 'picked_up',
                    label: selectedOrder.deliveryMethod === 'shipping' ? 'Delivered' : 'Picked Up',
                  },
                  { value: 'cancelled', label: 'Cancelled' },
                  { value: 'refunded', label: 'Refunded' },
                ]}
                style={{ marginBottom: 16 }}
              />

              <View style={styles.modalActions}>
                <Button
                  mode="outlined"
                  onPress={() => setStatusModalVisible(false)}
                  disabled={updating}
                  style={{ flex: 1 }}
                >
                  Cancel
                </Button>
                <Button
                  mode="contained"
                  onPress={handleUpdateStatus}
                  loading={updating}
                  disabled={updating || newStatus === selectedOrder.status}
                  style={{ flex: 1 }}
                >
                  Update
                </Button>
              </View>
            </>
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
    paddingHorizontal: 4,
    paddingBottom: 8,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    fontWeight: 'bold',
  },
  filterContainer: {
    maxHeight: 40,
    marginBottom: 8,
  },
  filterContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    height: 32,
  },
  filterChipText: {
    fontSize: 12,
  },
  scrollContent: {
    padding: 16,
    paddingTop: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    padding: 48,
  },
  orderCard: {
    borderRadius: 12,
    marginBottom: 12,
    padding: 12,
  },
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  thumbImage: {
    width: 50,
    height: 50,
    borderRadius: 8,
  },
  orderInfo: {
    flex: 1,
  },
  rightSection: {
    alignItems: 'flex-end',
    gap: 4,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  expandedContent: {
    marginTop: 4,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoSection: {
    marginTop: 12,
    padding: 12,
    borderRadius: 8,
    gap: 2,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  expandIndicator: {
    alignItems: 'center',
    marginTop: 4,
  },
  modalContent: {
    margin: 20,
    padding: 20,
    borderRadius: 12,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
});
