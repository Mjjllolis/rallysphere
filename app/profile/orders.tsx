// app/profile/orders.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import {
  Text,
  useTheme,
  Surface,
  Chip,
  ActivityIndicator,
  Divider,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuth } from '../_layout';
import { getUserStoreOrders } from '../../lib/firebase';
import type { StoreOrder } from '../../lib/firebase';

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

export default function OrdersScreen() {
  const theme = useTheme();
  const { user } = useAuth();

  const [orders, setOrders] = useState<StoreOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (user) {
      loadOrders();
    }
  }, [user]);

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

  const formatDate = (timestamp: any) => {
    if (!timestamp) return '';

    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const renderOrder = ({ item }: { item: StoreOrder }) => {
    return (
      <TouchableOpacity
        onPress={() => router.push(`/(tabs)/store/${item.itemId}`)}
        activeOpacity={0.7}
      >
        <Surface style={[styles.orderCard, { backgroundColor: theme.colors.surface }]} elevation={1}>
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
            <View style={styles.priceBreakdown}>
              <View style={styles.priceRow}>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  Subtotal:
                </Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  ${item.price.toFixed(2)}
                </Text>
              </View>

              {item.tax > 0 && (
                <View style={styles.priceRow}>
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    Tax:
                  </Text>
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    ${item.tax.toFixed(2)}
                  </Text>
                </View>
              )}

              {item.shipping > 0 && (
                <View style={styles.priceRow}>
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    Shipping:
                  </Text>
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    ${item.shipping.toFixed(2)}
                  </Text>
                </View>
              )}

              <View style={styles.priceRow}>
                <Text variant="titleMedium" style={{ fontWeight: 'bold' }}>
                  Total:
                </Text>
                <Text
                  variant="titleMedium"
                  style={{ fontWeight: 'bold', color: theme.colors.primary }}
                >
                  ${item.totalAmount.toFixed(2)}
                </Text>
              </View>
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
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['bottom']}>
      <View style={styles.header}>
        <Text variant="headlineMedium" style={{ fontWeight: 'bold' }}>
          My Orders
        </Text>
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
          Track your purchases
        </Text>
      </View>

      {orders.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text variant="titleMedium" style={{ color: theme.colors.onSurfaceVariant }}>
            No orders yet
          </Text>
          <Text
            variant="bodyMedium"
            style={{ color: theme.colors.onSurfaceVariant, marginTop: 8, textAlign: 'center' }}
          >
            Your order history will appear here
          </Text>
        </View>
      ) : (
        <FlatList
          data={orders}
          renderItem={renderOrder}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        />
      )}
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
    padding: 16,
    paddingTop: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 48,
  },
  listContent: {
    padding: 16,
    paddingTop: 0,
  },
  orderCard: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
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
  priceBreakdown: {
    gap: 4,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
