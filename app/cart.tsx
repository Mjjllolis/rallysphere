// app/cart.tsx
import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Alert,
  Platform,
} from 'react-native';
import {
  Text,
  useTheme,
  ActivityIndicator,
  Button,
  Divider,
  SegmentedButtons,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCart, type CartItem } from '../lib/cartContext';
import { useAuth } from './_layout';
import { createStorePaymentIntent } from '../lib/stripe';
import { useStripe, usePaymentSheet } from '@stripe/stripe-react-native';

export default function CartScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const { cart, removeFromCart, updateQuantity, clearCart } = useCart();
  const [deliveryMethod, setDeliveryMethod] = useState<'shipping' | 'pickup'>('shipping');
  const [processing, setProcessing] = useState(false);

  // Stripe hooks for native payments
  const stripe = Platform.OS !== 'web' ? useStripe() : null;
  const { initPaymentSheet, presentPaymentSheet } = Platform.OS !== 'web'
    ? usePaymentSheet()
    : { initPaymentSheet: null, presentPaymentSheet: null };

  const calculateTotals = () => {
    let itemsTotal = 0;
    let shipping = 0;
    let taxableAmount = 0;
    let tax = 0;

    cart.forEach((item) => {
      const itemSubtotal = item.price * item.quantity;
      itemsTotal += itemSubtotal;

      // Add shipping cost (only for shipping delivery method)
      if (deliveryMethod === 'shipping') {
        shipping += item.shippingCost * item.quantity;
      }
    });

    // Calculate tax on (items + shipping)
    taxableAmount = itemsTotal + shipping;

    // Use weighted average tax rate based on item totals
    if (cart.length > 0) {
      const weightedTaxRate = cart.reduce((sum, item) => {
        const itemTotal = item.price * item.quantity;
        return sum + (item.taxRate * itemTotal);
      }, 0) / itemsTotal;

      tax = taxableAmount * (weightedTaxRate / 100);
    }

    const total = taxableAmount + tax;

    return { itemsTotal, shipping, tax, total };
  };

  const handleRemoveItem = (item: CartItem) => {
    Alert.alert(
      'Remove Item',
      `Remove ${item.name} from cart?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => removeFromCart(item.id, item.selectedVariants),
        },
      ]
    );
  };

  const handleClearCart = () => {
    Alert.alert(
      'Clear Cart',
      'Remove all items from cart?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => clearCart(),
        },
      ]
    );
  };

  const handleCheckout = async () => {
    if (!user) {
      Alert.alert('Login Required', 'Please login to checkout');
      router.push('/(tabs)/profile');
      return;
    }

    if (cart.length === 0) {
      Alert.alert('Cart Empty', 'Add some items to your cart first');
      return;
    }

    // For now, show a message about checkout
    // In a full implementation, you'd process the entire cart
    Alert.alert(
      'Checkout',
      'Cart checkout with multiple items is coming soon! For now, you can purchase items individually from the product page.',
      [
        {
          text: 'OK',
        },
      ]
    );
  };

  const { itemsTotal, shipping, tax, total } = calculateTotals();

  if (cart.length === 0) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={theme.colors.onSurface} />
          </TouchableOpacity>
          <Text variant="titleLarge" style={{ fontWeight: '600' }}>Shopping Cart</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.emptyContainer}>
          <Ionicons name="cart-outline" size={80} color="#ccc" />
          <Text style={styles.emptyTitle}>Your cart is empty</Text>
          <Text style={styles.emptySubtitle}>Add items to get started</Text>
          <Button
            mode="contained"
            onPress={() => router.push('/(tabs)/store')}
            style={{ marginTop: 20 }}
          >
            Browse Store
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.onSurface} />
        </TouchableOpacity>
        <Text variant="titleLarge" style={{ fontWeight: '600' }}>Shopping Cart</Text>
        <TouchableOpacity onPress={handleClearCart}>
          <Ionicons name="trash-outline" size={22} color={theme.colors.error} />
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 20 }}>
        {/* Cart Items */}
        <View style={styles.itemsContainer}>
          {cart.map((item, index) => {
            const variantsText = Object.entries(item.selectedVariants)
              .map(([key, value]) => `${key}: ${value}`)
              .join(', ');

            return (
              <View key={`${item.id}-${JSON.stringify(item.selectedVariants)}`}>
                <View style={styles.cartItem}>
                  {/* Image */}
                  <View style={styles.itemImage}>
                    {item.images && item.images.length > 0 ? (
                      <Image
                        source={{ uri: item.images[0] }}
                        style={{ width: '100%', height: '100%' }}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={styles.placeholderImage}>
                        <Ionicons name="image-outline" size={32} color="#ccc" />
                      </View>
                    )}
                  </View>

                  {/* Details */}
                  <View style={styles.itemDetails}>
                    <Text style={styles.itemName} numberOfLines={2}>
                      {item.name}
                    </Text>
                    {variantsText && (
                      <Text style={styles.itemVariants}>{variantsText}</Text>
                    )}
                    <Text style={styles.itemPrice}>${item.price.toFixed(2)}</Text>

                    {/* Quantity Controls */}
                    <View style={styles.quantityRow}>
                      <TouchableOpacity
                        onPress={() => updateQuantity(item.id, item.selectedVariants, item.quantity - 1)}
                        disabled={item.quantity <= 1}
                        style={[styles.quantityButton, item.quantity <= 1 && styles.quantityButtonDisabled]}
                      >
                        <Ionicons name="remove" size={16} color={item.quantity <= 1 ? '#ccc' : theme.colors.onSurface} />
                      </TouchableOpacity>
                      <Text style={styles.quantityText}>{item.quantity}</Text>
                      <TouchableOpacity
                        onPress={() => updateQuantity(item.id, item.selectedVariants, item.quantity + 1)}
                        disabled={item.quantity >= (item.inventory - item.sold)}
                        style={[
                          styles.quantityButton,
                          item.quantity >= (item.inventory - item.sold) && styles.quantityButtonDisabled,
                        ]}
                      >
                        <Ionicons
                          name="add"
                          size={16}
                          color={item.quantity >= (item.inventory - item.sold) ? '#ccc' : theme.colors.onSurface}
                        />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Remove Button */}
                  <TouchableOpacity
                    onPress={() => handleRemoveItem(item)}
                    style={styles.removeButton}
                  >
                    <Ionicons name="close-circle" size={24} color={theme.colors.error} />
                  </TouchableOpacity>
                </View>
                {index < cart.length - 1 && <Divider style={{ marginVertical: 12 }} />}
              </View>
            );
          })}
        </View>

        {/* Delivery Method */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Delivery Method</Text>
          <SegmentedButtons
            value={deliveryMethod}
            onValueChange={(value) => setDeliveryMethod(value as 'shipping' | 'pickup')}
            buttons={[
              {
                value: 'shipping',
                label: 'Shipping',
                icon: 'truck-delivery',
              },
              {
                value: 'pickup',
                label: 'Pickup',
                icon: 'map-marker',
              },
            ]}
          />
          {deliveryMethod === 'shipping' && (
            <Text style={styles.deliveryNote}>
              Shipping costs calculated per item
            </Text>
          )}
        </View>

        {/* Order Summary */}
        <View style={styles.summarySection}>
          <Text style={styles.sectionTitle}>Order Summary</Text>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Items Total</Text>
            <Text style={styles.summaryValue}>${itemsTotal.toFixed(2)}</Text>
          </View>

          {deliveryMethod === 'shipping' && shipping > 0 && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Shipping</Text>
              <Text style={styles.summaryValue}>${shipping.toFixed(2)}</Text>
            </View>
          )}

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Tax</Text>
            <Text style={styles.summaryValue}>${tax.toFixed(2)}</Text>
          </View>

          <Divider style={{ marginVertical: 12 }} />

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={[styles.totalValue, { color: theme.colors.primary }]}>
              ${total.toFixed(2)}
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Checkout Button */}
      <View style={[styles.footer, { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.outlineVariant }]}>
        <Button
          mode="contained"
          onPress={handleCheckout}
          style={styles.checkoutButton}
          contentStyle={{ paddingVertical: 8 }}
          disabled={processing || cart.length === 0}
          loading={processing}
        >
          Checkout - ${total.toFixed(2)}
        </Button>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#999',
  },
  itemsContainer: {
    padding: 16,
    backgroundColor: '#fff',
    margin: 16,
    marginBottom: 0,
    borderRadius: 12,
  },
  cartItem: {
    flexDirection: 'row',
    gap: 12,
  },
  itemImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: '#F8F8F8',
    overflow: 'hidden',
  },
  placeholderImage: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemDetails: {
    flex: 1,
  },
  itemName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  itemVariants: {
    fontSize: 13,
    color: '#666',
    marginBottom: 4,
  },
  itemPrice: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  quantityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  quantityButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  quantityButtonDisabled: {
    opacity: 0.3,
  },
  quantityText: {
    fontSize: 16,
    fontWeight: '600',
    minWidth: 30,
    textAlign: 'center',
  },
  removeButton: {
    padding: 4,
  },
  section: {
    padding: 16,
    backgroundColor: '#fff',
    margin: 16,
    marginBottom: 0,
    borderRadius: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  deliveryNote: {
    fontSize: 13,
    color: '#666',
    marginTop: 8,
  },
  summarySection: {
    padding: 16,
    backgroundColor: '#fff',
    margin: 16,
    borderRadius: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  summaryLabel: {
    fontSize: 15,
    color: '#666',
  },
  summaryValue: {
    fontSize: 15,
    fontWeight: '600',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: '700',
  },
  totalValue: {
    fontSize: 20,
    fontWeight: '800',
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
  },
  checkoutButton: {
    borderRadius: 12,
  },
});
