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

  const openStatusModal = (order: StoreOrder) => {
    setSelectedOrder(order);
    setNewStatus(order.status);
    setStatusModalVisible(true);
  };

  const handleUpdateStatus = async () => {
    if (!selectedOrder) return;

    try {
      setUpdating(true);

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
      year: 'numeric',
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
      totalRevenue: orders
        .filter((o) => o.status !== 'cancelled')
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
          <View style={{ flex: 1 }} />
        </View>
        <View style={styles.headerContent}>
          <Text variant="headlineLarge" style={[styles.title, { color: theme.colors.onBackground }]}>
            Manage Orders
          </Text>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
            {club?.name}
          </Text>
        </View>
      </View>

      {/* Stats */}
      <View style={styles.statsContainer}>
        <Surface style={[styles.statCard, { backgroundColor: theme.colors.surface }]} elevation={2}>
          <Text variant="headlineSmall" style={{ fontWeight: 'bold', color: theme.colors.primary }}>
            {stats.total}
          </Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            Total Orders
          </Text>
        </Surface>

        <Surface style={[styles.statCard, { backgroundColor: theme.colors.surface }]} elevation={2}>
          <Text variant="headlineSmall" style={{ fontWeight: 'bold', color: theme.colors.primary }}>
            ${stats.totalRevenue.toFixed(2)}
          </Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            Revenue
          </Text>
        </Surface>

        <Surface style={[styles.statCard, { backgroundColor: theme.colors.surface }]} elevation={2}>
          <Text variant="headlineSmall" style={{ fontWeight: 'bold', color: theme.colors.tertiary }}>
            {stats.pending}
          </Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            Pending
          </Text>
        </Surface>
      </View>

      {/* Filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterContainer}>
        <Chip
          selected={filterStatus === 'all'}
          onPress={() => setFilterStatus('all')}
          style={styles.filterChip}
        >
          All ({stats.total})
        </Chip>
        <Chip
          selected={filterStatus === 'pending'}
          onPress={() => setFilterStatus('pending')}
          style={styles.filterChip}
        >
          Pending ({stats.pending})
        </Chip>
        <Chip
          selected={filterStatus === 'processing'}
          onPress={() => setFilterStatus('processing')}
          style={styles.filterChip}
        >
          Processing ({stats.processing})
        </Chip>
        <Chip
          selected={filterStatus === 'shipped'}
          onPress={() => setFilterStatus('shipped')}
          style={styles.filterChip}
        >
          Shipped ({stats.shipped})
        </Chip>
        <Chip
          selected={filterStatus === 'delivered'}
          onPress={() => setFilterStatus('delivered')}
          style={styles.filterChip}
        >
          Completed ({stats.completed})
        </Chip>
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
          filteredOrders.map((order) => (
            <Surface key={order.id} style={[styles.orderCard, { backgroundColor: theme.colors.surface }]} elevation={2}>
              <View style={styles.cardInner}>
                <View style={styles.orderHeader}>
                <View style={{ flex: 1 }}>
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    Order #{order.id.slice(-8).toUpperCase()}
                  </Text>
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    {formatDate(order.createdAt)}
                  </Text>
                </View>

                <TouchableOpacity onPress={() => openStatusModal(order)}>
                  <Chip
                    textStyle={{ fontSize: 12, color: getStatusColor(order.status, theme) }}
                    style={{
                      backgroundColor: `${getStatusColor(order.status, theme)}20`,
                    }}
                    icon="chevron-down"
                  >
                    {getStatusLabel(order.status)}
                  </Chip>
                </TouchableOpacity>
              </View>

              <Divider style={{ marginVertical: 12 }} />

              <View style={styles.orderBody}>
                <View style={styles.itemInfo}>
                  {order.itemImage ? (
                    <Image source={{ uri: order.itemImage }} style={styles.itemImage} />
                  ) : (
                    <View style={[styles.itemImagePlaceholder, { backgroundColor: theme.colors.surfaceVariant }]}>
                      <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                        No Image
                      </Text>
                    </View>
                  )}

                  <View style={{ flex: 1 }}>
                    <Text variant="titleMedium" numberOfLines={2} style={{ fontWeight: '600' }}>
                      {order.itemName}
                    </Text>

                    <View style={styles.orderDetails}>
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                        Qty: {order.quantity}
                      </Text>

                      {order.selectedVariants && Object.keys(order.selectedVariants).length > 0 && (
                        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                          {' • '}
                          {Object.entries(order.selectedVariants)
                            .map(([key, value]) => `${key}: ${value}`)
                            .join(', ')}
                        </Text>
                      )}
                    </View>

                    <View style={styles.deliveryInfo}>
                      <Chip
                        icon={order.deliveryMethod === 'shipping' ? 'truck-delivery' : 'map-marker'}
                        compact
                        textStyle={{ fontSize: 11 }}
                        style={{ height: 24 }}
                      >
                        {order.deliveryMethod === 'shipping' ? 'Shipping' : 'Pickup'}
                      </Chip>
                    </View>
                  </View>
                </View>

                {/* Customer Info */}
                <View style={styles.customerSection}>
                  <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 4 }}>
                    Customer:
                  </Text>
                  <Text variant="bodyMedium" style={{ fontWeight: '600' }}>
                    {order.userName}
                  </Text>
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    {order.userEmail}
                  </Text>
                </View>

                {order.shippingAddress && (
                  <View style={styles.addressSection}>
                    <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                      Shipping Address:
                    </Text>
                    <Text variant="bodySmall">{order.shippingAddress.fullName}</Text>
                    <Text variant="bodySmall">{order.shippingAddress.addressLine1}</Text>
                    {order.shippingAddress.addressLine2 && (
                      <Text variant="bodySmall">{order.shippingAddress.addressLine2}</Text>
                    )}
                    <Text variant="bodySmall">
                      {order.shippingAddress.city}, {order.shippingAddress.state}{' '}
                      {order.shippingAddress.zipCode}
                    </Text>
                    <Text variant="bodySmall">{order.shippingAddress.phone}</Text>
                  </View>
                )}
              </View>

              <Divider style={{ marginVertical: 12 }} />

              <View style={styles.orderFooter}>
                <View style={styles.priceBreakdown}>
                  <View style={styles.priceRow}>
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                      Subtotal:
                    </Text>
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                      ${order.price.toFixed(2)}
                    </Text>
                  </View>

                  {order.tax > 0 && (
                    <View style={styles.priceRow}>
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                        Tax:
                      </Text>
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                        ${order.tax.toFixed(2)}
                      </Text>
                    </View>
                  )}

                  {order.shipping > 0 && (
                    <View style={styles.priceRow}>
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                        Shipping:
                      </Text>
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                        ${order.shipping.toFixed(2)}
                      </Text>
                    </View>
                  )}

                  <View style={styles.priceRow}>
                    <Text variant="titleMedium" style={{ fontWeight: 'bold' }}>
                      Total:
                    </Text>
                    <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.primary }}>
                      ${order.totalAmount.toFixed(2)}
                    </Text>
                  </View>
                </View>
              </View>
              </View>
            </Surface>
          ))
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
    paddingHorizontal: 8,
    paddingBottom: 16,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  title: {
    fontWeight: 'bold',
    marginBottom: 4,
  },
  statsContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  statCard: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  filterContainer: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  filterChip: {
    marginRight: 8,
  },
  scrollContent: {
    padding: 16,
  },
  emptyContainer: {
    alignItems: 'center',
    padding: 48,
  },
  orderCard: {
    borderRadius: 12,
    marginBottom: 16,
  },
  cardInner: {
    overflow: 'hidden',
    borderRadius: 12,
    padding: 16,
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
    width: 100,
    height: 100,
    borderRadius: 8,
  },
  itemImagePlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  orderDetails: {
    flexDirection: 'row',
    marginTop: 4,
  },
  deliveryInfo: {
    marginTop: 8,
  },
  customerSection: {
    marginTop: 8,
    padding: 12,
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 8,
  },
  addressSection: {
    marginTop: 8,
    padding: 12,
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 8,
  },
  orderFooter: {},
  priceBreakdown: {
    gap: 4,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
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
