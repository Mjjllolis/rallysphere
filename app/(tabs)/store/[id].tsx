// app/store/[id].tsx
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Image,
  Dimensions,
  Alert,
  TouchableOpacity,
  Platform,
  StatusBar,
  FlatList,
  Animated,
} from 'react-native';
import {
  Text,
  Button,
  useTheme,
  Surface,
  Chip,
  Divider,
  ActivityIndicator,
  SegmentedButtons,
  TextInput,
  RadioButton,
  Portal,
  Modal,
} from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../_layout';
import { getStoreItem, getUserAddresses } from '../../../lib/firebase';
import type { StoreItem, ShippingAddress } from '../../../lib/firebase';
import { createStoreCheckoutSession, createStorePaymentIntent } from '../../../lib/stripe';
import { Linking } from 'react-native';
import { useStripe, usePaymentSheet } from '@stripe/stripe-react-native';
import { useCart } from '../../../lib/cartContext';
import { useFavorites } from '../../../lib/favoritesContext';

const { width } = Dimensions.get('window');

export default function StoreItemDetailScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const { id } = useLocalSearchParams();
  const itemId = id as string;
  const { addToCart } = useCart();
  const { addToFavorites, removeFromFavorites, isFavorite } = useFavorites();

  // Stripe hooks for native payments
  const stripe = Platform.OS !== 'web' ? useStripe() : null;
  const { initPaymentSheet, presentPaymentSheet } = Platform.OS !== 'web' ? usePaymentSheet() : { initPaymentSheet: null, presentPaymentSheet: null };

  const [item, setItem] = useState<StoreItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [selectedVariants, setSelectedVariants] = useState<{ [key: string]: string }>({});
  const [deliveryMethod, setDeliveryMethod] = useState<'shipping' | 'pickup'>('shipping');
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);

  // Purchase modal
  const [purchaseModalVisible, setPurchaseModalVisible] = useState(false);
  const slideAnim = useRef(new Animated.Value(1000)).current;

  // Animate modal
  useEffect(() => {
    if (purchaseModalVisible) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: 1000,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [purchaseModalVisible]);

  // Address modal
  const [addressModalVisible, setAddressModalVisible] = useState(false);
  const [savedAddresses, setSavedAddresses] = useState<ShippingAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [newAddress, setNewAddress] = useState<Omit<ShippingAddress, 'id' | 'isDefault'>>({
    fullName: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    zipCode: '',
    country: 'US',
    phone: '',
  });

  useEffect(() => {
    if (itemId) {
      loadItemData();
    }
  }, [itemId]);

  useEffect(() => {
    if (user) {
      loadUserAddresses();
    }
  }, [user]);

  const loadItemData = async () => {
    try {
      setLoading(true);
      const result = await getStoreItem(itemId);

      if (result.success && result.item) {
        setItem(result.item);

        // Set default delivery method
        if (result.item.pickupOnly) {
          setDeliveryMethod('pickup');
        }
      } else {
        Alert.alert('Error', 'Item not found');
        router.back();
      }
    } catch (error) {
      console.error('Error loading item:', error);
      Alert.alert('Error', 'Failed to load item');
    } finally {
      setLoading(false);
    }
  };

  const loadUserAddresses = async () => {
    if (!user) return;

    try {
      const result = await getUserAddresses(user.uid);
      if (result.success) {
        setSavedAddresses(result.addresses);

        // Select default address if exists
        const defaultAddr = result.addresses.find((addr: ShippingAddress) => addr.isDefault);
        if (defaultAddr) {
          setSelectedAddressId(defaultAddr.id);
        }
      }
    } catch (error) {
      console.error('Error loading addresses:', error);
    }
  };

  const calculateTotal = () => {
    if (!item) return { itemTotal: 0, tax: 0, shipping: 0, total: 0 };

    const itemTotal = item.price * quantity;
    const shipping = deliveryMethod === 'shipping' ? (item.shippingCost || 0) : 0;
    const subtotal = itemTotal + shipping;
    const tax = subtotal * (item.taxRate / 100);
    const total = subtotal + tax;

    return { itemTotal, tax, shipping, total };
  };

  const openPurchaseModal = () => {
    if (!user || !item) return;

    // Validate variant selection
    if (item.variants && item.variants.length > 0) {
      for (const variant of item.variants) {
        if (!selectedVariants[variant.name]) {
          Alert.alert('Missing Selection', `Please select ${variant.name}`);
          return;
        }
      }
    }

    // Check stock
    const inStock = item.inventory - item.sold >= quantity;
    if (!inStock) {
      Alert.alert('Out of Stock', 'Not enough items in stock');
      return;
    }

    // Validate shipping address if shipping (moved after stock check)
    if (deliveryMethod === 'shipping' && !selectedAddressId) {
      Alert.alert('Missing Address', 'Please select or add a shipping address');
      setAddressModalVisible(true);
      return;
    }

    // Open purchase modal
    setPurchaseModalVisible(true);
  };

  const handleAddToCart = () => {
    if (!item) return;

    // Validate variant selection
    if (item.variants && item.variants.length > 0) {
      for (const variant of item.variants) {
        if (!selectedVariants[variant.name]) {
          Alert.alert('Missing Selection', `Please select ${variant.name}`);
          return;
        }
      }
    }

    // Check stock
    const inStock = item.inventory - item.sold >= quantity;
    if (!inStock) {
      Alert.alert('Out of Stock', 'Not enough items in stock');
      return;
    }

    // Buy Now - directly open purchase modal instead of adding to cart
    setPurchaseModalVisible(true);
  };

  const handlePurchase = async () => {
    if (!user || !item) return;

    // Validate variant selection
    if (item.variants && item.variants.length > 0) {
      for (const variant of item.variants) {
        if (!selectedVariants[variant.name]) {
          Alert.alert('Missing Selection', `Please select ${variant.name}`);
          return;
        }
      }
    }

    // Check stock
    const inStock = item.inventory - item.sold >= quantity;
    if (!inStock) {
      Alert.alert('Out of Stock', 'Not enough items in stock');
      return;
    }

    // Validate shipping address if shipping
    if (deliveryMethod === 'shipping' && !selectedAddressId) {
      Alert.alert('Missing Address', 'Please select or add a shipping address');
      setAddressModalVisible(true);
      return;
    }

    // Web: Use Stripe Checkout (redirect)
    if (Platform.OS === 'web') {
      return handleWebPurchase();
    }

    // Native: Use in-app payment sheet
    try {
      setPurchasing(true);

      const { total, tax, shipping } = calculateTotal();

      // Get selected address
      let shippingAddress: ShippingAddress | undefined;
      if (deliveryMethod === 'shipping' && selectedAddressId) {
        shippingAddress = savedAddresses.find(addr => addr.id === selectedAddressId);
      }

      // Step 1: Create payment intent
      const paymentIntentResult = await createStorePaymentIntent({
        itemId: item.id,
        quantity,
        selectedVariants,
        deliveryMethod,
        shippingAddress,
      });

      if (!paymentIntentResult.success || !paymentIntentResult.clientSecret) {
        Alert.alert('Error', paymentIntentResult.error || 'Failed to initialize payment');
        setPurchasing(false);
        return;
      }

      // Step 2: Initialize Stripe Payment Sheet
      if (!initPaymentSheet) {
        Alert.alert('Error', 'Payment system not initialized');
        setPurchasing(false);
        return;
      }

      const { error: initError } = await initPaymentSheet({
        merchantDisplayName: 'RallySphere',
        paymentIntentClientSecret: paymentIntentResult.clientSecret,
        allowsDelayedPaymentMethods: true,
        googlePay: {
          merchantCountryCode: 'US',
          testEnv: __DEV__,
          currencyCode: 'USD',
        },
        applePay: {
          merchantCountryCode: 'US',
        },
        returnURL: 'rallysphere://payment-return',
      });

      if (initError) {
        console.error('Payment Sheet init error:', {
          code: initError.code,
          message: initError.message,
          localizedMessage: initError.localizedMessage,
        });
        Alert.alert('Payment Error', `${initError.message}\n\nCode: ${initError.code}`);
        setPurchasing(false);
        return;
      }

      // Step 3: Present the payment sheet
      if (!presentPaymentSheet) {
        Alert.alert('Error', 'Payment system not initialized');
        setPurchasing(false);
        return;
      }

      const { error: presentError } = await presentPaymentSheet();

      if (presentError) {
        if (presentError.code !== 'Canceled') {
          Alert.alert('Payment Failed', presentError.message);
        }
        setPurchasing(false);
        return;
      }

      // Success - close modal and show success message
      setPurchaseModalVisible(false);

      Alert.alert(
        'Purchase Successful!',
        'Your order has been placed successfully.',
        [
          {
            text: 'OK',
            onPress: () => {
              // Navigate back or refresh
              router.back();
            },
          },
        ]
      );
    } catch (error: any) {
      console.error('Payment error:', error);
      Alert.alert('Error', error.message || 'An unexpected error occurred');
    } finally {
      setPurchasing(false);
    }
  };

  const handleWebPurchase = async () => {
    if (!user || !item) return;

    try {
      setPurchasing(true);

      // Get selected address
      let shippingAddress: ShippingAddress | undefined;
      if (deliveryMethod === 'shipping' && selectedAddressId) {
        shippingAddress = savedAddresses.find(addr => addr.id === selectedAddressId);
      }

      // Create checkout session for web
      const result = await createStoreCheckoutSession({
        itemId: item.id,
        quantity,
        selectedVariants,
        deliveryMethod,
        shippingAddress,
      });

      if (result.success && result.checkoutUrl) {
        // Close modal
        setPurchaseModalVisible(false);

        // Redirect to Stripe checkout
        window.location.href = result.checkoutUrl;
      } else {
        Alert.alert('Error', result.error || 'Failed to create checkout');
      }
    } catch (error) {
      console.error('Error purchasing item:', error);
      Alert.alert('Error', 'Failed to process purchase');
    } finally {
      setPurchasing(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" />
        </View>
      </View>
    );
  }

  if (!item) {
    return null;
  }

  const inStock = item.inventory - item.sold >= quantity;
  const { itemTotal, tax, shipping, total } = calculateTotal();

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Hero Image Section with Swipeable Gallery */}
      <View style={styles.imageSection}>
        {item.images && item.images.length > 0 ? (
          <>
            <FlatList
              data={item.images}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onScroll={(event) => {
                const scrollX = event.nativeEvent.contentOffset.x;
                const index = Math.round(scrollX / width);
                setSelectedImageIndex(index);
              }}
              scrollEventThrottle={16}
              renderItem={({ item: imageUri }) => (
                <View style={{ width }}>
                  <Image
                    source={{ uri: imageUri }}
                    style={styles.heroImage}
                    resizeMode="cover"
                  />
                </View>
              )}
              keyExtractor={(_, index) => index.toString()}
            />

            {/* Floating Back & Heart Buttons */}
            <View style={styles.floatingButtons}>
              <TouchableOpacity onPress={() => router.back()} style={styles.floatingButton}>
                <Ionicons name="arrow-back" size={24} color="#000" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.floatingButton}
                onPress={() => {
                  if (isFavorite(item.id)) {
                    removeFromFavorites(item.id);
                  } else {
                    addToFavorites({
                      id: item.id,
                      name: item.name,
                      price: item.price,
                      images: item.images || [],
                      clubName: item.clubName,
                      category: item.category,
                    });
                  }
                }}
              >
                <Ionicons
                  name={isFavorite(item.id) ? "heart" : "heart-outline"}
                  size={24}
                  color={isFavorite(item.id) ? theme.colors.primary : "#000"}
                />
              </TouchableOpacity>
            </View>

            {/* Pickup Badge */}
            {item.pickupOnly && (
              <View style={[styles.pickupBadge, { backgroundColor: theme.colors.primary }]}>
                <Ionicons name="location" size={14} color="#fff" />
                <Text style={styles.pickupBadgeText}>Pickup</Text>
              </View>
            )}

            {/* Image Dots Indicator */}
            {item.images.length > 1 && (
              <View style={styles.dotsContainer}>
                {item.images.map((_, index) => (
                  <TouchableOpacity
                    key={index}
                    onPress={() => setSelectedImageIndex(index)}
                    style={[
                      styles.dot,
                      index === selectedImageIndex && [styles.dotActive, { backgroundColor: theme.colors.primary }],
                    ]}
                  />
                ))}
              </View>
            )}
          </>
        ) : (
          <View style={styles.heroImagePlaceholder}>
            <Ionicons name="image-outline" size={64} color="#ccc" />
          </View>
        )}
      </View>

      {/* Product Card (Scrollable overlay) */}
      <ScrollView style={styles.productCard} contentContainerStyle={{ paddingBottom: 180 }}>
        <Text style={styles.productTitle}>{item.name}</Text>

        <View style={styles.clubRow}>
          <TouchableOpacity onPress={() => router.push(`/club/${item.clubId}`)}>
            <Text style={styles.clubName}>by {item.clubName}</Text>
          </TouchableOpacity>
        </View>

        {/* Ratings */}
        <View style={styles.ratingContainer}>
          <Text style={[styles.stars, { color: theme.colors.primary }]}>★ ★ ★ ★ ★</Text>
          <Text style={styles.ratingText}>(5.0)</Text>
        </View>

        {/* Description */}
        <Text style={styles.sectionLabel}>Product Details</Text>
        <Text style={styles.description}>{item.description}</Text>

        {/* Size/Variants */}
        {item.variants && item.variants.map((variant) => (
          <View key={variant.id} style={{ marginTop: 20 }}>
            <Text style={styles.sectionLabel}>{variant.name}</Text>
            <View style={styles.sizeContainer}>
              {variant.options.map((option) => {
                const isSelected = selectedVariants[variant.name] === option;
                return (
                  <TouchableOpacity
                    key={option}
                    onPress={() => setSelectedVariants({ ...selectedVariants, [variant.name]: option })}
                    style={[
                      styles.sizeButton,
                      isSelected && [styles.sizeButtonActive, { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }],
                    ]}
                  >
                    <Text style={[styles.sizeButtonText, isSelected && styles.sizeButtonTextActive]}>
                      {option}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))}

        {/* Quantity */}
        <View style={{ marginTop: 20 }}>
          <Text style={styles.sectionLabel}>Quantity</Text>
          <View style={styles.quantityRow}>
            <TouchableOpacity
              onPress={() => setQuantity(Math.max(1, quantity - 1))}
              disabled={quantity <= 1}
              style={styles.quantityButton}
            >
              <Text style={styles.quantityButtonText}>−</Text>
            </TouchableOpacity>
            <Text style={styles.quantityValue}>{quantity}</Text>
            <TouchableOpacity
              onPress={() => setQuantity(quantity + 1)}
              disabled={quantity >= item.inventory - item.sold}
              style={styles.quantityButton}
            >
              <Text style={styles.quantityButtonText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Delivery Method */}
        {!item.pickupOnly && item.allowPickup && (
          <>
            <Text style={[styles.sectionLabel, { marginTop: 20 }]}>Delivery Method</Text>
            <View style={styles.deliveryRow}>
              <TouchableOpacity
                onPress={() => setDeliveryMethod('shipping')}
                style={[
                  styles.deliveryButton,
                  deliveryMethod === 'shipping' && [styles.deliveryButtonActive, { backgroundColor: theme.colors.primary }],
                ]}
              >
                <Ionicons name="car-outline" size={20} color={deliveryMethod === 'shipping' ? '#fff' : '#999'} />
                <Text style={[
                  styles.deliveryButtonText,
                  deliveryMethod === 'shipping' && [styles.deliveryButtonTextActive, { color: '#fff' }],
                ]}>
                  Shipping
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setDeliveryMethod('pickup')}
                style={[
                  styles.deliveryButton,
                  deliveryMethod === 'pickup' && [styles.deliveryButtonActive, { backgroundColor: theme.colors.primary }],
                ]}
              >
                <Ionicons name="location-outline" size={20} color={deliveryMethod === 'pickup' ? '#fff' : '#999'} />
                <Text style={[
                  styles.deliveryButtonText,
                  deliveryMethod === 'pickup' && [styles.deliveryButtonTextActive, { color: '#fff' }],
                ]}>
                  Pickup
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* Shipping Address */}
        {deliveryMethod === 'shipping' && (
          <View style={{ marginTop: 20 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={styles.sectionLabel}>Shipping Address</Text>
              <TouchableOpacity onPress={() => setAddressModalVisible(true)}>
                <Text style={{ color: theme.colors.primary, fontSize: 14, fontWeight: '600' }}>
                  {savedAddresses.length > 0 ? 'Change' : 'Add'}
                </Text>
              </TouchableOpacity>
            </View>
            {selectedAddressId ? (
              <View style={styles.addressCardCompact}>
                {(() => {
                  const addr = savedAddresses.find(a => a.id === selectedAddressId);
                  if (!addr) return null;
                  return (
                    <>
                      <Text style={{ fontSize: 15, fontWeight: '600', color: '#333' }}>{addr.fullName}</Text>
                      <Text style={{ fontSize: 14, color: '#666', marginTop: 4 }}>
                        {addr.addressLine1}, {addr.city}, {addr.state} {addr.zipCode}
                      </Text>
                    </>
                  );
                })()}
              </View>
            ) : (
              <Text style={{ fontSize: 14, color: '#F44336' }}>Please select a shipping address</Text>
            )}
          </View>
        )}

        {/* Stock Status */}
        <View style={styles.priceSection}>
          {!inStock && (
            <Text style={{ color: '#F44336', fontSize: 14, fontWeight: '600' }}>Out of Stock</Text>
          )}
          {inStock && item.inventory - item.sold < 10 && (
            <Text style={{ color: '#FF9800', fontSize: 14 }}>Only {item.inventory - item.sold} left!</Text>
          )}
        </View>
      </ScrollView>

      {/* Fixed Bottom Add to Cart Button */}
      <View style={styles.bottomBar}>
        <View style={styles.totalPriceContainer}>
          <Text style={styles.totalLabel}>Price</Text>
          <Text style={styles.totalPrice}>${(item.price * quantity).toFixed(0)}</Text>
        </View>
        <TouchableOpacity
          onPress={handleAddToCart}
          disabled={!inStock}
          style={[
            styles.buyButton,
            !inStock && styles.buyButtonDisabled,
          ]}
          activeOpacity={0.8}
        >
          <Text style={styles.buyButtonText}>
            {!inStock ? 'Sold Out' : 'Buy Now'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Purchase Confirmation Modal */}
      <Portal>
        <Modal
          visible={purchaseModalVisible}
          onDismiss={() => setPurchaseModalVisible(false)}
          contentContainerStyle={[styles.purchaseModalContent, { backgroundColor: theme.colors.surface, overflow: 'hidden' }]}
        >
          {/* Header */}
          <View style={[styles.modalHeader, { backgroundColor: theme.colors.surface }]}>
            <Text variant="headlineMedium" style={{ fontWeight: 'bold' }}>
              Confirm Purchase
            </Text>
            <TouchableOpacity onPress={() => setPurchaseModalVisible(false)}>
              <Text style={{ fontSize: 24 }}>×</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={{ paddingHorizontal: 20 }} showsVerticalScrollIndicator={false}>

              {/* Product Info */}
              <View style={styles.modalSection}>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  {item.images && item.images.length > 0 && (
                    <Image source={{ uri: item.images[0] }} style={styles.modalItemImage} />
                  )}
                  <View style={{ flex: 1 }}>
                    <Text variant="titleMedium" style={{ fontWeight: '600' }}>
                      {item.name}
                    </Text>
                    <Text variant="bodyMedium" style={{ color: theme.colors.primary }}>
                      {item.clubName}
                    </Text>
                    <Text variant="bodyMedium" style={{ marginTop: 4 }}>
                      Quantity: {quantity}
                    </Text>
                  </View>
                </View>
              </View>

              <Divider />

              {/* Delivery Method */}
              <View style={styles.modalSection}>
                <Text variant="titleSmall" style={{ marginBottom: 8, color: theme.colors.onSurfaceVariant }}>
                  Delivery Method
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Chip icon={deliveryMethod === 'shipping' ? 'truck-delivery' : 'map-marker'}>
                    {deliveryMethod === 'shipping' ? 'Shipping' : 'Pickup'}
                  </Chip>
                </View>

                {deliveryMethod === 'shipping' && selectedAddressId && (
                  <View style={{ marginTop: 12, padding: 12, backgroundColor: theme.colors.surfaceVariant, borderRadius: 8 }}>
                    {savedAddresses.find(addr => addr.id === selectedAddressId) && (
                      <>
                        <Text variant="bodyMedium" style={{ fontWeight: '600' }}>
                          {savedAddresses.find(addr => addr.id === selectedAddressId)!.fullName}
                        </Text>
                        <Text variant="bodySmall">
                          {savedAddresses.find(addr => addr.id === selectedAddressId)!.addressLine1}
                        </Text>
                        {savedAddresses.find(addr => addr.id === selectedAddressId)!.addressLine2 && (
                          <Text variant="bodySmall">
                            {savedAddresses.find(addr => addr.id === selectedAddressId)!.addressLine2}
                          </Text>
                        )}
                        <Text variant="bodySmall">
                          {savedAddresses.find(addr => addr.id === selectedAddressId)!.city}, {savedAddresses.find(addr => addr.id === selectedAddressId)!.state} {savedAddresses.find(addr => addr.id === selectedAddressId)!.zipCode}
                        </Text>
                      </>
                    )}
                  </View>
                )}

                {deliveryMethod === 'pickup' && (item as any).pickupAddress && (
                  <TouchableOpacity
                    style={{ marginTop: 12, padding: 12, backgroundColor: theme.colors.surfaceVariant, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}
                    onPress={() => {
                      const address = encodeURIComponent((item as any).pickupAddress);
                      const url = Platform.OS === 'ios'
                        ? `maps://maps.apple.com/?q=${address}`
                        : `https://www.google.com/maps/search/?api=1&query=${address}`;
                      Linking.openURL(url);
                    }}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="location" size={16} color={theme.colors.primary} />
                    <Text variant="bodySmall" style={{ flex: 1, color: theme.colors.primary }}>
                      {(item as any).pickupAddress}
                    </Text>
                    <Ionicons name="open-outline" size={16} color={theme.colors.primary} />
                  </TouchableOpacity>
                )}
              </View>

              <Divider />

              {/* Price Summary */}
              <View style={styles.modalSection}>
                <Text variant="titleSmall" style={{ marginBottom: 12, color: theme.colors.onSurfaceVariant }}>
                  Order Summary
                </Text>

                <View style={styles.summaryRow}>
                  <Text variant="bodyMedium">Item Total</Text>
                  <Text variant="bodyMedium">${calculateTotal().itemTotal.toFixed(2)}</Text>
                </View>

                {calculateTotal().tax > 0 && (
                  <View style={styles.summaryRow}>
                    <Text variant="bodyMedium">Tax</Text>
                    <Text variant="bodyMedium">${calculateTotal().tax.toFixed(2)}</Text>
                  </View>
                )}

                {calculateTotal().shipping > 0 && (
                  <View style={styles.summaryRow}>
                    <Text variant="bodyMedium">Shipping</Text>
                    <Text variant="bodyMedium">${calculateTotal().shipping.toFixed(2)}</Text>
                  </View>
                )}

                <Divider style={{ marginVertical: 12 }} />

                <View style={styles.summaryRow}>
                  <Text variant="titleLarge" style={{ fontWeight: 'bold' }}>Total</Text>
                  <Text variant="titleLarge" style={{ fontWeight: 'bold', color: theme.colors.primary }}>
                    ${calculateTotal().total.toFixed(2)}
                  </Text>
                </View>
              </View>
          </ScrollView>

          {/* Footer */}
          <View style={[styles.modalFooter, { backgroundColor: theme.colors.surface }]}>
            <Button mode="outlined" onPress={() => setPurchaseModalVisible(false)} disabled={purchasing} style={{ flex: 1 }}>
              Cancel
            </Button>
            <Button mode="contained" onPress={handlePurchase} loading={purchasing} disabled={purchasing} style={{ flex: 1 }}>
              Pay Now
            </Button>
          </View>
        </Modal>
      </Portal>

      {/* Address Selection Modal */}
      <Portal>
        <Modal
          visible={addressModalVisible}
          onDismiss={() => setAddressModalVisible(false)}
          contentContainerStyle={[styles.modalContent, { backgroundColor: theme.colors.surface }]}
        >
          <Text variant="headlineSmall" style={{ marginBottom: 16 }}>
            Select Shipping Address
          </Text>

          <ScrollView style={{ maxHeight: 400 }}>
            <RadioButton.Group
              onValueChange={(value) => setSelectedAddressId(value)}
              value={selectedAddressId || ''}
            >
              {savedAddresses.map((addr) => (
                <TouchableOpacity
                  key={addr.id}
                  onPress={() => setSelectedAddressId(addr.id)}
                  style={styles.addressOption}
                >
                  <RadioButton value={addr.id} />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text variant="bodyLarge" style={{ fontWeight: '600' }}>
                      {addr.fullName}
                    </Text>
                    <Text variant="bodyMedium">
                      {addr.addressLine1}, {addr.city}, {addr.state}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </RadioButton.Group>
          </ScrollView>

          <View style={styles.modalActions}>
            <Button mode="outlined" onPress={() => router.push('/profile/addresses')}>
              Manage Addresses
            </Button>
            <Button mode="contained" onPress={() => setAddressModalVisible(false)}>
              Done
            </Button>
          </View>
        </Modal>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Hero Image Section
  imageSection: {
    width: '100%',
    height: width * 1.1,
    position: 'relative',
    backgroundColor: '#F8F8F8',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroImagePlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F0F0F0',
  },
  floatingButtons: {
    position: 'absolute',
    top: 50,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  floatingButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  pickupBadge: {
    position: 'absolute',
    top: 50,
    right: 70,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  pickupBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  dotsContainer: {
    position: 'absolute',
    bottom: 20,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  dotActive: {
    width: 24,
  },

  // Product Card Overlay
  productCard: {
    position: 'absolute',
    top: width * 0.9,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  productTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  clubRow: {
    marginBottom: 12,
  },
  clubName: {
    fontSize: 15,
    color: '#666',
    fontWeight: '500',
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 8,
  },
  stars: {
    fontSize: 16,
    letterSpacing: 2,
  },
  ratingText: {
    fontSize: 15,
    color: '#666',
    fontWeight: '600',
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 12,
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    color: '#666',
  },

  // Size Selection
  sizeContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  sizeButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  sizeButtonActive: {
    // Color set dynamically via theme
  },
  sizeButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#666',
  },
  sizeButtonTextActive: {
    color: '#fff',
    fontWeight: '700',
  },

  // Quantity Controls
  quantityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  quantityButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  quantityButtonText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  quantityValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
    minWidth: 40,
    textAlign: 'center',
  },

  // Delivery Method
  deliveryRow: {
    flexDirection: 'row',
    gap: 12,
  },
  deliveryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#F5F5F5',
    gap: 8,
  },
  deliveryButtonActive: {
    // Color set dynamically via theme
  },
  deliveryButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#999',
  },
  deliveryButtonTextActive: {
    // Color set dynamically
  },

  // Address
  addressCardCompact: {
    backgroundColor: '#F8F8F8',
    padding: 14,
    borderRadius: 12,
  },

  // Price Summary
  priceSection: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  priceDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  priceLabel: {
    fontSize: 15,
    color: '#666',
  },
  priceValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1a1a',
  },

  // Bottom Bar
  bottomBar: {
    position: 'absolute',
    bottom: 85,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    gap: 16,
  },
  totalPriceContainer: {
    flex: 1,
  },
  totalLabel: {
    fontSize: 13,
    color: '#666',
    marginBottom: 4,
  },
  totalPrice: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1a1a1a',
  },
  buyButton: {
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 140,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  buyButtonDisabled: {
    backgroundColor: '#CCCCCC',
  },
  buyButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.5,
  },

  // Modals (keeping existing modal styles)
  // Bottom sheet modal styles
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  bottomSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 10,
  },
  handleContainer: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  closeButton: {
    position: 'absolute',
    top: 12,
    right: 16,
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  closeIcon: {
    fontSize: 18,
    fontWeight: '300',
  },
  modalScrollView: {
    flex: 1,
  },
  modalScrollContent: {
    paddingBottom: 40,
  },
  sheetContent: {
    paddingHorizontal: 20,
  },
  sheetTitle: {
    marginBottom: 20,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  purchaseModalContent: {
    margin: 20,
    borderRadius: 12,
    maxWidth: 500,
    alignSelf: 'center',
    width: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  modalSection: {
    paddingVertical: 16,
  },
  modalItemImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 12,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
  modalContent: {
    margin: 20,
    padding: 20,
    borderRadius: 12,
  },
  addressOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
    gap: 12,
  },
});
