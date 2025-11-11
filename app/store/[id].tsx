// app/store/[id].tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Image,
  Dimensions,
  Alert,
  TouchableOpacity,
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../_layout';
import { getStoreItem, getUserAddresses } from '../../lib/firebase';
import type { StoreItem, ShippingAddress } from '../../lib/firebase';
import { createStoreCheckoutSession } from '../../lib/stripe';
import { Linking } from 'react-native';

const { width } = Dimensions.get('window');

export default function StoreItemDetailScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const { id } = useLocalSearchParams();
  const itemId = id as string;

  const [item, setItem] = useState<StoreItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [selectedVariants, setSelectedVariants] = useState<{ [key: string]: string }>({});
  const [deliveryMethod, setDeliveryMethod] = useState<'shipping' | 'pickup'>('shipping');
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);

  // Purchase modal
  const [purchaseModalVisible, setPurchaseModalVisible] = useState(false);

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
    if (!item) return { subtotal: 0, tax: 0, shipping: 0, total: 0 };

    const subtotal = item.price * quantity;
    const tax = subtotal * (item.taxRate / 100);
    const shipping = deliveryMethod === 'shipping' ? (item.shippingCost || 0) : 0;
    const total = subtotal + tax + shipping;

    return { subtotal, tax, shipping, total };
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

    // Validate shipping address if shipping
    if (deliveryMethod === 'shipping' && !selectedAddressId) {
      Alert.alert('Missing Address', 'Please select or add a shipping address');
      setAddressModalVisible(true);
      return;
    }

    // Check stock
    const inStock = item.inventory - item.sold >= quantity;
    if (!inStock) {
      Alert.alert('Out of Stock', 'Not enough items in stock');
      return;
    }

    // Open purchase modal
    setPurchaseModalVisible(true);
  };

  const handlePurchase = async () => {
    if (!user || !item) return;

    try {
      setPurchasing(true);

      const { total, tax, shipping } = calculateTotal();

      // Get selected address
      let shippingAddress: ShippingAddress | undefined;
      if (deliveryMethod === 'shipping' && selectedAddressId) {
        shippingAddress = savedAddresses.find(addr => addr.id === selectedAddressId);
      }

      // Create checkout session
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

        // Open Stripe checkout
        const supported = await Linking.canOpenURL(result.checkoutUrl);
        if (supported) {
          await Linking.openURL(result.checkoutUrl);
        } else {
          Alert.alert('Error', 'Cannot open checkout page');
        }
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
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (!item) {
    return null;
  }

  const inStock = item.inventory - item.sold >= quantity;
  const { subtotal, tax, shipping, total } = calculateTotal();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
      {/* Header with Back Button */}
      <View style={[styles.topHeader, { backgroundColor: theme.colors.background }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={{ fontSize: 28 }}>←</Text>
        </TouchableOpacity>
        <Text variant="titleLarge" style={{ fontWeight: '600' }}>Product Details</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 20 }}>
        {/* Image Carousel */}
        <View style={styles.imageCarousel}>
          {item.images && item.images.length > 0 ? (
            <>
              <Image
                source={{ uri: item.images[selectedImageIndex] }}
                style={styles.mainImage}
                resizeMode="cover"
              />
              {item.images.length > 1 && (
                <View style={styles.imageIndicators}>
                  {item.images.map((_, index) => (
                    <TouchableOpacity
                      key={index}
                      onPress={() => setSelectedImageIndex(index)}
                      style={[
                        styles.indicator,
                        {
                          backgroundColor:
                            index === selectedImageIndex
                              ? theme.colors.primary
                              : theme.colors.surfaceVariant,
                        },
                      ]}
                    />
                  ))}
                </View>
              )}
            </>
          ) : (
            <View style={[styles.placeholderImage, { backgroundColor: theme.colors.surfaceVariant }]}>
              <Text variant="headlineSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                No Image
              </Text>
            </View>
          )}
        </View>

        <View style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTop}>
              <Text variant="headlineSmall" style={styles.itemName}>
                {item.name}
              </Text>
              <Text variant="headlineMedium" style={{ color: theme.colors.primary, fontWeight: 'bold' }}>
                ${item.price.toFixed(2)}
              </Text>
            </View>

            <TouchableOpacity onPress={() => router.push(`/club/${item.clubId}`)}>
              <Text variant="bodyLarge" style={{ color: theme.colors.primary }}>
                By {item.clubName}
              </Text>
            </TouchableOpacity>

            <View style={styles.badges}>
              {item.pickupOnly && (
                <Chip icon="map-marker">Pickup Only</Chip>
              )}
              {!inStock && (
                <Chip style={{ backgroundColor: theme.colors.errorContainer }}>
                  Out of Stock
                </Chip>
              )}
              {inStock && item.inventory - item.sold < 10 && (
                <Chip style={{ backgroundColor: theme.colors.tertiaryContainer }}>
                  Only {item.inventory - item.sold} left
                </Chip>
              )}
            </View>
          </View>

          <Divider />

          {/* Description */}
          <View style={styles.section}>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Description
            </Text>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              {item.description}
            </Text>
          </View>

          <Divider />

          {/* Variants */}
          {item.variants && item.variants.map((variant) => (
            <View key={variant.id} style={styles.section}>
              <Text variant="titleMedium" style={styles.sectionTitle}>
                {variant.name}
              </Text>
              <View style={styles.variantOptions}>
                {variant.options.map((option) => (
                  <Chip
                    key={option}
                    selected={selectedVariants[variant.name] === option}
                    onPress={() =>
                      setSelectedVariants({ ...selectedVariants, [variant.name]: option })
                    }
                    style={styles.variantChip}
                  >
                    {option}
                  </Chip>
                ))}
              </View>
            </View>
          ))}

          {item.variants && item.variants.length > 0 && <Divider />}

          {/* Quantity */}
          <View style={styles.section}>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Quantity
            </Text>
            <View style={styles.quantityControl}>
              <Button
                mode="outlined"
                onPress={() => setQuantity(Math.max(1, quantity - 1))}
                disabled={quantity <= 1}
              >
                -
              </Button>
              <Text variant="titleLarge" style={styles.quantityText}>
                {quantity}
              </Text>
              <Button
                mode="outlined"
                onPress={() => setQuantity(quantity + 1)}
                disabled={quantity >= item.inventory - item.sold}
              >
                +
              </Button>
            </View>
          </View>

          <Divider />

          {/* Delivery Method */}
          {!item.pickupOnly && item.allowPickup && (
            <>
              <View style={styles.section}>
                <Text variant="titleMedium" style={styles.sectionTitle}>
                  Delivery Method
                </Text>
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
              </View>
              <Divider />
            </>
          )}

          {/* Shipping Address */}
          {deliveryMethod === 'shipping' && (
            <>
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text variant="titleMedium" style={styles.sectionTitle}>
                    Shipping Address
                  </Text>
                  <Button mode="text" onPress={() => setAddressModalVisible(true)}>
                    {savedAddresses.length > 0 ? 'Change' : 'Add'}
                  </Button>
                </View>

                {selectedAddressId ? (
                  <Surface style={styles.addressCard} elevation={1}>
                    {(() => {
                      const addr = savedAddresses.find(a => a.id === selectedAddressId);
                      if (!addr) return null;
                      return (
                        <>
                          <Text variant="bodyLarge" style={{ fontWeight: '600' }}>
                            {addr.fullName}
                          </Text>
                          <Text variant="bodyMedium">{addr.addressLine1}</Text>
                          {addr.addressLine2 && <Text variant="bodyMedium">{addr.addressLine2}</Text>}
                          <Text variant="bodyMedium">
                            {addr.city}, {addr.state} {addr.zipCode}
                          </Text>
                          <Text variant="bodyMedium">{addr.phone}</Text>
                        </>
                      );
                    })()}
                  </Surface>
                ) : (
                  <Text variant="bodyMedium" style={{ color: theme.colors.error }}>
                    Please select a shipping address
                  </Text>
                )}
              </View>
              <Divider />
            </>
          )}

          {/* Price Breakdown */}
          <View style={styles.section}>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Price Summary
            </Text>

            <View style={styles.priceRow}>
              <Text variant="bodyLarge">Subtotal</Text>
              <Text variant="bodyLarge">${subtotal.toFixed(2)}</Text>
            </View>

            <View style={styles.priceRow}>
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                Tax ({item.taxRate}%)
              </Text>
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                ${tax.toFixed(2)}
              </Text>
            </View>

            {deliveryMethod === 'shipping' && (
              <View style={styles.priceRow}>
                <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                  Shipping
                </Text>
                <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                  ${shipping.toFixed(2)}
                </Text>
              </View>
            )}

            <Divider style={{ marginVertical: 8 }} />

            <View style={styles.priceRow}>
              <Text variant="titleLarge" style={{ fontWeight: 'bold' }}>
                Total
              </Text>
              <Text variant="titleLarge" style={{ fontWeight: 'bold', color: theme.colors.primary }}>
                ${total.toFixed(2)}
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Purchase Button */}
      <View style={[styles.footer, { backgroundColor: theme.colors.surface }]}>
        <Surface style={{ borderRadius: 0 }} elevation={4}>
          <View style={styles.footerContent}>
            <Button
              mode="contained"
              onPress={openPurchaseModal}
              disabled={!inStock || !user}
              style={styles.purchaseButton}
              contentStyle={{ height: 56 }}
            >
              {!user ? 'Login to Purchase' : !inStock ? 'Out of Stock' : 'Continue to Payment'}
            </Button>
          </View>
        </Surface>
      </View>

      {/* Purchase Confirmation Modal */}
      <Portal>
        <Modal
          visible={purchaseModalVisible}
          onDismiss={() => setPurchaseModalVisible(false)}
          contentContainerStyle={[styles.purchaseModalContent, { backgroundColor: theme.colors.surface }]}
        >
          <View style={{ flex: 1, maxHeight: '80%' }}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <Text variant="headlineMedium" style={{ fontWeight: 'bold' }}>
                Confirm Purchase
              </Text>
              <TouchableOpacity onPress={() => setPurchaseModalVisible(false)}>
                <Text style={{ fontSize: 24 }}>×</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flex: 1, paddingHorizontal: 20 }}>
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
                  <View style={{ marginTop: 12, padding: 12, backgroundColor: theme.colors.surfaceVariant, borderRadius: 8 }}>
                    <Text variant="bodySmall">{(item as any).pickupAddress}</Text>
                  </View>
                )}
              </View>

              <Divider />

              {/* Price Summary */}
              <View style={styles.modalSection}>
                <Text variant="titleSmall" style={{ marginBottom: 12, color: theme.colors.onSurfaceVariant }}>
                  Order Summary
                </Text>

                <View style={styles.summaryRow}>
                  <Text variant="bodyMedium">Subtotal</Text>
                  <Text variant="bodyMedium">${calculateTotal().subtotal.toFixed(2)}</Text>
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
  topHeader: {
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
  imageCarousel: {
    width: '100%',
    height: width,
    position: 'relative',
  },
  mainImage: {
    width: '100%',
    height: '100%',
  },
  placeholderImage: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageIndicators: {
    position: 'absolute',
    bottom: 16,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  indicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  content: {
    padding: 16,
  },
  header: {
    marginBottom: 16,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  itemName: {
    flex: 1,
    fontWeight: 'bold',
    marginRight: 16,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  section: {
    paddingVertical: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontWeight: '600',
    marginBottom: 12,
  },
  variantOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  variantChip: {
    marginRight: 0,
  },
  quantityControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  quantityText: {
    minWidth: 40,
    textAlign: 'center',
  },
  addressCard: {
    padding: 16,
    borderRadius: 8,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
  footerContent: {
    padding: 16,
  },
  purchaseButton: {
    borderRadius: 8,
  },
  purchaseModalContent: {
    margin: 20,
    borderRadius: 12,
    maxHeight: '80%',
    overflow: 'hidden',
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
