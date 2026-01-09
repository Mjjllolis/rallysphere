// app/club/[id]/manage-ticket-orders.tsx
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
  getClubTicketOrders,
  updateTicketOrderStatus,
  getClub,
} from '../../../lib/firebase';
import { refundTicketOrder } from '../../../lib/stripe';
import type { TicketOrder } from '../../../lib/firebase';

const getStatusColor = (status: TicketOrder['status'], theme: any) => {
  switch (status) {
    case 'confirmed':
      return theme.colors.tertiary;
    case 'checked_in':
      return theme.colors.primary;
    case 'cancelled':
      return theme.colors.error;
    case 'refunded':
      return '#A855F7';
    default:
      return theme.colors.onSurface;
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

export default function ManageTicketOrdersScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const { id } = useLocalSearchParams();
  const clubId = id as string;

  const [club, setClub] = useState<any>(null);
  const [orders, setOrders] = useState<TicketOrder[]>([]);
  const [filteredOrders, setFilteredOrders] = useState<TicketOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<TicketOrder | null>(null);
  const [statusModalVisible, setStatusModalVisible] = useState(false);
  const [newStatus, setNewStatus] = useState<TicketOrder['status']>('confirmed');
  const [updating, setUpdating] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'all' | TicketOrder['status']>('all');
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

      // Load ticket orders
      const result = await getClubTicketOrders(clubId);
      if (result.success) {
        setOrders(result.orders);
      }
    } catch (error) {
      console.error('Error loading ticket orders:', error);
      Alert.alert('Error', 'Failed to load ticket orders');
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

  const openStatusModal = (order: TicketOrder) => {
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
          `Are you sure you want to refund $${selectedOrder.totalAmount.toFixed(2)} to the customer? This will also remove them from the event attendees. This action cannot be undone.`,
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
                const refundResult = await refundTicketOrder(selectedOrder.id, clubId);

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

      const result = await updateTicketOrderStatus(selectedOrder.id, newStatus);

      if (result.success) {
        Alert.alert('Success', 'Ticket status updated successfully');
        await loadData();
        setStatusModalVisible(false);
      } else {
        Alert.alert('Error', result.error || 'Failed to update ticket status');
      }
    } catch (error) {
      console.error('Error updating ticket status:', error);
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

  const formatEventDate = (timestamp: any) => {
    if (!timestamp) return 'TBD';

    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getOrderStats = () => {
    const stats = {
      total: orders.length,
      confirmed: orders.filter((o) => o.status === 'confirmed').length,
      checkedIn: orders.filter((o) => o.status === 'checked_in').length,
      cancelled: orders.filter((o) => o.status === 'cancelled').length,
      refunded: orders.filter((o) => o.status === 'refunded').length,
      totalRevenue: orders
        .filter((o) => o.status !== 'cancelled' && o.status !== 'refunded')
        .reduce((sum, o) => sum + o.totalAmount, 0),
      clubRevenue: orders
        .filter((o) => o.status !== 'cancelled' && o.status !== 'refunded')
        .reduce((sum, o) => sum + o.clubAmount, 0),
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
              Ticket Orders
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              {club?.name} • ${stats.clubRevenue.toFixed(0)} club revenue
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
          { key: 'confirmed', label: 'Confirmed', count: stats.confirmed },
          { key: 'checked_in', label: 'Checked In', count: stats.checkedIn },
          { key: 'cancelled', label: 'Cancelled', count: stats.cancelled },
          { key: 'refunded', label: 'Refunded', count: stats.refunded },
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
              No ticket orders found
            </Text>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 8 }}>
              {filterStatus !== 'all'
                ? `No ${filterStatus.replace('_', ' ')} tickets`
                : 'Ticket orders will appear here when customers purchase tickets'}
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
                    {order.eventImage ? (
                      <Image source={{ uri: order.eventImage }} style={styles.thumbImage} resizeMode="cover" />
                    ) : (
                      <View style={[styles.thumbImage, { backgroundColor: theme.colors.surfaceVariant }]}>
                        <IconButton icon="ticket" size={20} iconColor={theme.colors.onSurfaceVariant} />
                      </View>
                    )}

                    <View style={styles.orderInfo}>
                      <Text variant="titleSmall" numberOfLines={1} style={{ fontWeight: '600' }}>
                        {order.eventName}
                      </Text>
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                        {order.userName} • {order.quantity} ticket{order.quantity > 1 ? 's' : ''}
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

                      {/* Event Date */}
                      <View style={[styles.detailRow, { marginTop: 8 }]}>
                        <Chip
                          icon="calendar"
                          compact
                          textStyle={{ fontSize: 11 }}
                          style={{ alignSelf: 'flex-start' }}
                        >
                          {formatEventDate(order.eventDate)}
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

                      {/* Price Breakdown */}
                      <View style={[styles.infoSection, { backgroundColor: theme.colors.surfaceVariant + '40' }]}>
                        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 4 }}>
                          PRICE BREAKDOWN
                        </Text>
                        <View style={styles.priceRow}>
                          <Text variant="bodySmall">Ticket Price</Text>
                          <Text variant="bodySmall">${order.ticketPrice.toFixed(2)}</Text>
                        </View>
                        <View style={styles.priceRow}>
                          <Text variant="bodySmall">Processing Fee (6% + $0.29)</Text>
                          <Text variant="bodySmall">${order.processingFee.toFixed(2)}</Text>
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
                          <Text variant="bodyMedium" style={{ fontWeight: 'bold' }}>You Receive</Text>
                          <Text variant="bodyMedium" style={{ fontWeight: 'bold', color: theme.colors.primary }}>
                            ${order.ticketPrice.toFixed(2)}
                          </Text>
                        </View>
                        <View style={[styles.priceRow, { marginTop: 8 }]}>
                          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                            Transfer Status
                          </Text>
                          <Text
                            variant="bodySmall"
                            style={{
                              color: order.transferredToClub ? theme.colors.primary : theme.colors.tertiary,
                              fontWeight: '600',
                            }}
                          >
                            {order.transferredToClub ? 'Transferred' : 'Pending'}
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
            Update Ticket Status
          </Text>

          {selectedOrder && (
            <>
              <Text variant="bodyMedium" style={{ marginBottom: 16, color: theme.colors.onSurfaceVariant }}>
                Order #{selectedOrder.id.slice(-8).toUpperCase()}
              </Text>

              <SegmentedButtons
                value={newStatus}
                onValueChange={(value) => setNewStatus(value as TicketOrder['status'])}
                buttons={[
                  { value: 'confirmed', label: 'Confirmed' },
                  { value: 'checked_in', label: 'Checked In' },
                ]}
                style={{ marginBottom: 12 }}
              />

              <SegmentedButtons
                value={newStatus}
                onValueChange={(value) => setNewStatus(value as TicketOrder['status'])}
                buttons={[
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
    justifyContent: 'center',
    alignItems: 'center',
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
