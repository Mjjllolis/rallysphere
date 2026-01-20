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
  StatusBar,
} from 'react-native';
import { Text, ActivityIndicator, RadioButton, Portal, Modal, IconButton } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../_layout';
import { getStoreItem, getUserAddresses } from '../../../lib/firebase';
import type { StoreItem, ShippingAddress } from '../../../lib/firebase';
import { useCart } from '../../../lib/cartContext';
import { useFavorites } from '../../../lib/favoritesContext';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import StorePaymentSheet from '../../../components/StorePaymentSheet';

const { width } = Dimensions.get('window');

export default function StoreItemDetailScreen() {
  const { user } = useAuth();
  const { id } = useLocalSearchParams();
  const itemId = id as string;
  const { addToCart } = useCart();
  const { addToFavorites, removeFromFavorites, isFavorite } = useFavorites();

  const [item, setItem] = useState<StoreItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [selectedVariants, setSelectedVariants] = useState<{ [key: string]: string }>({});
  const [deliveryMethod, setDeliveryMethod] = useState<'shipping' | 'pickup'>('shipping');
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);

  // Payment sheet
  const [paymentSheetVisible, setPaymentSheetVisible] = useState(false);

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

    // Validate shipping address if shipping is selected
    if (deliveryMethod === 'shipping' && !selectedAddressId) {
      Alert.alert('Missing Address', 'Please select a shipping address');
      setAddressModalVisible(true);
      return;
    }

    // Buy Now - open payment sheet
    setPaymentSheetVisible(true);
  };

  const handlePaymentSuccess = () => {
    // Refresh item data after successful purchase
    loadItemData();
    router.back();
  };

  if (loading) {
    return (
      <View style={styles.container}>
        {/* Black Background */}
        <View style={StyleSheet.absoluteFill}>
          <View style={styles.blackBackground} />
        </View>

        <LinearGradient
          colors={['rgba(96, 165, 250, 0.3)', 'rgba(139, 92, 246, 0.1)', 'rgba(0, 0, 0, 0)']}
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

  if (!item) {
    return null;
  }

  const inStock = item.inventory - item.sold >= quantity;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Black Background */}
      <View style={StyleSheet.absoluteFill}>
        <View style={styles.blackBackground} />
      </View>

      <LinearGradient
        colors={['rgba(96, 165, 250, 0.3)', 'rgba(139, 92, 246, 0.1)', 'rgba(0, 0, 0, 0)']}
        locations={[0, 0.3, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Header with Floating Buttons */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            activeOpacity={0.7}
            style={styles.headerButtonWrapper}
          >
            <BlurView intensity={40} tint="dark" style={styles.headerButton}>
              <IconButton icon="arrow-left" iconColor="white" size={24} style={{ margin: 0 }} />
            </BlurView>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.headerButtonWrapper}
            activeOpacity={0.7}
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
            <BlurView intensity={40} tint="dark" style={styles.headerButton}>
              <IconButton
                icon={isFavorite(item.id) ? "heart" : "heart-outline"}
                iconColor={isFavorite(item.id) ? "#FF4444" : "white"}
                size={24}
                style={{ margin: 0 }}
              />
            </BlurView>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {/* Main Image */}
          {item.images && item.images.length > 0 && (
            <View style={styles.mainImageContainer}>
              <Image
                source={{ uri: item.images[selectedImageIndex] }}
                style={styles.mainImage}
                resizeMode="cover"
              />
              {/* Pickup Badge */}
              {item.pickupOnly && (
                <View style={styles.pickupBadge}>
                  <BlurView intensity={30} tint="dark" style={styles.pickupBadgeBlur}>
                    <Ionicons name="location" size={14} color="#60A5FA" />
                    <Text style={styles.pickupBadgeText}>Pickup Only</Text>
                  </BlurView>
                </View>
              )}
            </View>
          )}

          {/* Image Grid (Facebook Marketplace style) */}
          {item.images && item.images.length > 1 && (
            <View style={styles.imageGrid}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.imageGridContent}
              >
                {item.images.map((imageUri, index) => (
                  <TouchableOpacity
                    key={index}
                    onPress={() => setSelectedImageIndex(index)}
                    activeOpacity={0.7}
                  >
                    <View
                      style={[
                        styles.thumbnailWrapper,
                        index === selectedImageIndex && styles.thumbnailWrapperActive,
                      ]}
                    >
                      <BlurView
                        intensity={20}
                        tint="dark"
                        style={[
                          styles.thumbnailBlur,
                          index === selectedImageIndex && styles.thumbnailBlurActive,
                        ]}
                      >
                        <Image
                          source={{ uri: imageUri }}
                          style={styles.thumbnailImage}
                          resizeMode="cover"
                        />
                      </BlurView>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Product Info Card */}
          <View style={styles.productInfoContainer}>
            <BlurView intensity={20} tint="dark" style={styles.productInfoBlur}>
              <Text style={styles.productTitle}>{item.name}</Text>

              <TouchableOpacity onPress={() => router.push(`/club/${item.clubId}`)}>
                <Text style={styles.clubName}>by {item.clubName}</Text>
              </TouchableOpacity>

              <View style={styles.priceRow}>
                <Text style={styles.price}>${item.price.toFixed(0)}</Text>
                {inStock && item.inventory - item.sold < 10 && (
                  <View style={styles.stockBadge}>
                    <Text style={styles.stockText}>{item.inventory - item.sold} left</Text>
                  </View>
                )}
              </View>

              {!inStock && (
                <Text style={styles.outOfStockText}>Out of Stock</Text>
              )}
            </BlurView>
          </View>

          {/* Description */}
          <View style={styles.sectionContainer}>
            <BlurView intensity={20} tint="dark" style={styles.sectionBlur}>
              <Text style={styles.sectionTitle}>Product Details</Text>
              <Text style={styles.description}>{item.description}</Text>
            </BlurView>
          </View>

          {/* Variants */}
          {item.variants && item.variants.map((variant) => (
            <View key={variant.id} style={styles.sectionContainer}>
              <BlurView intensity={20} tint="dark" style={styles.sectionBlur}>
                <Text style={styles.sectionTitle}>{variant.name}</Text>
                <View style={styles.variantOptions}>
                  {variant.options.map((option) => {
                    const isSelected = selectedVariants[variant.name] === option;
                    return (
                      <TouchableOpacity
                        key={option}
                        onPress={() => setSelectedVariants({ ...selectedVariants, [variant.name]: option })}
                        activeOpacity={0.7}
                      >
                        <BlurView
                          intensity={isSelected ? 30 : 15}
                          tint="dark"
                          style={[
                            styles.variantOption,
                            isSelected && styles.variantOptionSelected,
                          ]}
                        >
                          <Text style={[styles.variantOptionText, isSelected && styles.variantOptionTextSelected]}>
                            {option}
                          </Text>
                        </BlurView>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </BlurView>
            </View>
          ))}

          {/* Quantity */}
          <View style={styles.sectionContainer}>
            <BlurView intensity={20} tint="dark" style={styles.sectionBlur}>
              <Text style={styles.sectionTitle}>Quantity</Text>
              <View style={styles.quantityRow}>
                <TouchableOpacity
                  onPress={() => setQuantity(Math.max(1, quantity - 1))}
                  disabled={quantity <= 1}
                  activeOpacity={0.7}
                >
                  <BlurView intensity={30} tint="dark" style={styles.quantityButton}>
                    <IconButton icon="minus" iconColor="white" size={20} style={{ margin: 0 }} />
                  </BlurView>
                </TouchableOpacity>

                <Text style={styles.quantityValue}>{quantity}</Text>

                <TouchableOpacity
                  onPress={() => setQuantity(quantity + 1)}
                  disabled={quantity >= item.inventory - item.sold}
                  activeOpacity={0.7}
                >
                  <BlurView intensity={30} tint="dark" style={styles.quantityButton}>
                    <IconButton icon="plus" iconColor="white" size={20} style={{ margin: 0 }} />
                  </BlurView>
                </TouchableOpacity>
              </View>
            </BlurView>
          </View>

          {/* Delivery Method */}
          {!item.pickupOnly && item.allowPickup && (
            <View style={styles.sectionContainer}>
              <BlurView intensity={20} tint="dark" style={styles.sectionBlur}>
                <Text style={styles.sectionTitle}>Delivery Method</Text>
                <View style={styles.deliveryRow}>
                  <TouchableOpacity
                    onPress={() => setDeliveryMethod('shipping')}
                    activeOpacity={0.7}
                    style={{ flex: 1 }}
                  >
                    <BlurView
                      intensity={deliveryMethod === 'shipping' ? 30 : 15}
                      tint="dark"
                      style={[
                        styles.deliveryButton,
                        deliveryMethod === 'shipping' && styles.deliveryButtonActive,
                      ]}
                    >
                      <Ionicons
                        name="car-outline"
                        size={20}
                        color={deliveryMethod === 'shipping' ? '#60A5FA' : 'rgba(255,255,255,0.6)'}
                      />
                      <Text
                        style={[
                          styles.deliveryButtonText,
                          deliveryMethod === 'shipping' && styles.deliveryButtonTextActive,
                        ]}
                      >
                        Shipping
                      </Text>
                    </BlurView>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => setDeliveryMethod('pickup')}
                    activeOpacity={0.7}
                    style={{ flex: 1 }}
                  >
                    <BlurView
                      intensity={deliveryMethod === 'pickup' ? 30 : 15}
                      tint="dark"
                      style={[
                        styles.deliveryButton,
                        deliveryMethod === 'pickup' && styles.deliveryButtonActive,
                      ]}
                    >
                      <Ionicons
                        name="location-outline"
                        size={20}
                        color={deliveryMethod === 'pickup' ? '#60A5FA' : 'rgba(255,255,255,0.6)'}
                      />
                      <Text
                        style={[
                          styles.deliveryButtonText,
                          deliveryMethod === 'pickup' && styles.deliveryButtonTextActive,
                        ]}
                      >
                        Pickup
                      </Text>
                    </BlurView>
                  </TouchableOpacity>
                </View>
              </BlurView>
            </View>
          )}

          {/* Shipping Address */}
          {deliveryMethod === 'shipping' && (
            <View style={styles.sectionContainer}>
              <BlurView intensity={20} tint="dark" style={styles.sectionBlur}>
                <View style={styles.sectionTitleRow}>
                  <Text style={styles.sectionTitle}>Shipping Address</Text>
                  <TouchableOpacity onPress={() => setAddressModalVisible(true)}>
                    <Text style={styles.changeButton}>
                      {savedAddresses.length > 0 ? 'Change' : 'Add'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {selectedAddressId ? (
                  <View style={styles.addressCard}>
                    {(() => {
                      const addr = savedAddresses.find(a => a.id === selectedAddressId);
                      if (!addr) return null;
                      return (
                        <>
                          <Text style={styles.addressName}>{addr.fullName}</Text>
                          <Text style={styles.addressText}>
                            {addr.addressLine1}, {addr.city}, {addr.state} {addr.zipCode}
                          </Text>
                        </>
                      );
                    })()}
                  </View>
                ) : (
                  <Text style={styles.errorText}>Please select a shipping address</Text>
                )}
              </BlurView>
            </View>
          )}

          <View style={{ height: 120 }} />
        </ScrollView>

        {/* Fixed Bottom Buy Button */}
        <View style={styles.bottomBar}>
          <BlurView intensity={40} tint="dark" style={styles.bottomBarBlur}>
            <View style={styles.bottomBarContent}>
              <View style={styles.totalPriceContainer}>
                <Text style={styles.totalLabel}>Total Price</Text>
                <Text style={styles.totalPrice}>${(item.price * quantity).toFixed(0)}</Text>
              </View>

              <TouchableOpacity
                onPress={handleAddToCart}
                disabled={!inStock}
                style={[
                  styles.buyButtonWrapper,
                  !inStock && styles.buyButtonDisabled,
                ]}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={!inStock ? ['#666', '#444'] : ['#10B981', '#059669']}
                  style={styles.buyButton}
                >
                  <Text style={styles.buyButtonText}>
                    {!inStock ? 'Sold Out' : 'Buy Now'}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </BlurView>
        </View>
      </SafeAreaView>

      {/* Address Selection Modal */}
      <Portal>
        <Modal
          visible={addressModalVisible}
          onDismiss={() => setAddressModalVisible(false)}
          contentContainerStyle={styles.addressModalContent}
        >
          <BlurView intensity={80} tint="dark" style={styles.modalBlur}>
            <Text style={styles.modalHeaderText}>Select Shipping Address</Text>

            <ScrollView style={styles.addressScrollView}>
              <RadioButton.Group
                onValueChange={(value) => setSelectedAddressId(value)}
                value={selectedAddressId || ''}
              >
                {savedAddresses.map((addr) => (
                  <TouchableOpacity
                    key={addr.id}
                    onPress={() => setSelectedAddressId(addr.id)}
                    style={styles.addressOption}
                    activeOpacity={0.7}
                  >
                    <RadioButton value={addr.id} color="#60A5FA" />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={styles.addressOptionName}>{addr.fullName}</Text>
                      <Text style={styles.addressOptionText}>
                        {addr.addressLine1}, {addr.city}, {addr.state}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </RadioButton.Group>

              <TouchableOpacity
                style={styles.addNewAddressButton}
                onPress={() => {
                  setAddressModalVisible(false);
                  Alert.alert('Coming Soon', 'Add new address feature coming soon!');
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="add-circle" size={20} color="#60A5FA" />
                <Text style={styles.addNewAddressText}>Add New Address</Text>
              </TouchableOpacity>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                onPress={() => setAddressModalVisible(false)}
                style={styles.modalPayButton}
                activeOpacity={0.7}
              >
                <LinearGradient
                  colors={['#60A5FA', '#3B82F6']}
                  style={styles.modalPayButtonGradient}
                >
                  <Text style={styles.modalPayText}>Done</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </BlurView>
        </Modal>
      </Portal>

      {/* Store Payment Sheet */}
      {item && user && (
        <StorePaymentSheet
          visible={paymentSheetVisible}
          item={item}
          quantity={quantity}
          deliveryMethod={deliveryMethod}
          selectedAddress={savedAddresses.find(addr => addr.id === selectedAddressId) || null}
          selectedVariants={selectedVariants}
          onDismiss={() => setPaymentSheetVisible(false)}
          onSuccess={handlePaymentSuccess}
          userId={user.uid}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  blackBackground: {
    flex: 1,
    backgroundColor: '#000000',
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    zIndex: 10,
  },
  headerButtonWrapper: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  mainImageContainer: {
    width: width - 32,
    height: width - 32,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  mainImage: {
    width: '100%',
    height: '100%',
  },
  pickupBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    borderRadius: 12,
    overflow: 'hidden',
  },
  pickupBadgeBlur: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    gap: 4,
    overflow: 'hidden',
  },
  pickupBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#60A5FA',
  },
  imageGridContainer: {
    marginTop: 16,
    paddingLeft: 16,
  },
  imageGridContent: {
    gap: 12,
    paddingRight: 16,
  },
  thumbnailWrapper: {
    width: 80,
    height: 80,
    borderRadius: 12,
    overflow: 'hidden',
  },
  thumbnailWrapperActive: {
    borderWidth: 2,
    borderColor: '#60A5FA',
  },
  thumbnailBlur: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  thumbnailBlurActive: {
    borderColor: '#60A5FA',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  productInfoContainer: {
    marginHorizontal: 16,
    marginTop: 20,
    borderRadius: 16,
    overflow: 'hidden',
  },
  productInfoBlur: {
    padding: 16,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  productTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 8,
  },
  clubName: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 12,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  price: {
    fontSize: 28,
    fontWeight: '800',
    color: '#60A5FA',
  },
  stockBadge: {
    backgroundColor: 'rgba(255, 107, 0, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 0, 0.3)',
  },
  stockText: {
    fontSize: 12,
    color: '#FF6B00',
    fontWeight: '700',
  },
  outOfStockText: {
    fontSize: 14,
    color: '#FF4444',
    fontWeight: '600',
    marginTop: 8,
  },
  sectionContainer: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    overflow: 'hidden',
  },
  sectionBlur: {
    padding: 16,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 12,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  changeButton: {
    fontSize: 14,
    fontWeight: '600',
    color: '#60A5FA',
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    color: 'rgba(255,255,255,0.8)',
  },
  variantOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  variantOption: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  variantOptionSelected: {
    borderColor: '#60A5FA',
  },
  variantOptionText: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
  },
  variantOptionTextSelected: {
    color: '#ffffff',
  },
  quantityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  quantityButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  quantityValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    minWidth: 40,
    textAlign: 'center',
  },
  deliveryRow: {
    flexDirection: 'row',
    gap: 12,
  },
  deliveryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    gap: 8,
    overflow: 'hidden',
  },
  deliveryButtonActive: {
    borderColor: '#60A5FA',
  },
  deliveryButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
  },
  deliveryButtonTextActive: {
    color: '#ffffff',
  },
  addressCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 14,
    borderRadius: 12,
  },
  addressName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
  },
  addressText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 4,
  },
  errorText: {
    fontSize: 14,
    color: '#FF4444',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 85,
    left: 0,
    right: 0,
    borderRadius: 0,
    overflow: 'hidden',
  },
  bottomBarBlur: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  bottomBarContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 16,
  },
  totalPriceContainer: {
    flex: 1,
  },
  totalLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 4,
  },
  totalPrice: {
    fontSize: 22,
    fontWeight: '800',
    color: '#ffffff',
  },
  buyButtonWrapper: {
    borderRadius: 28,
    overflow: 'hidden',
  },
  buyButtonDisabled: {
    opacity: 0.5,
  },
  buyButton: {
    paddingHorizontal: 32,
    paddingVertical: 16,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 140,
  },
  buyButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.5,
  },
  purchaseModalContent: {
    margin: 20,
    borderRadius: 16,
    maxWidth: 500,
    alignSelf: 'center',
    width: '90%',
    overflow: 'hidden',
  },
  addressModalContent: {
    margin: 20,
    borderRadius: 16,
    maxWidth: 500,
    alignSelf: 'center',
    width: '90%',
    overflow: 'hidden',
  },
  modalBlur: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  modalHeaderText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#ffffff',
  },
  modalScroll: {
    maxHeight: 400,
    paddingHorizontal: 20,
  },
  modalSection: {
    paddingVertical: 16,
  },
  modalProductRow: {
    flexDirection: 'row',
    gap: 12,
  },
  modalItemImage: {
    width: 80,
    height: 80,
    borderRadius: 12,
  },
  modalItemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  modalItemClub: {
    fontSize: 14,
    color: '#60A5FA',
    marginTop: 4,
  },
  modalItemQuantity: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 4,
  },
  modalDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginVertical: 8,
  },
  modalSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 12,
  },
  modalDeliveryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(96, 165, 250, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  modalDeliveryText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#60A5FA',
  },
  modalAddressCard: {
    marginTop: 12,
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
  },
  modalAddressName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  modalAddressText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  summaryTotalLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
  },
  summaryTotalValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#60A5FA',
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 12,
    padding: 20,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
  },
  modalPayButton: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  modalPayButtonGradient: {
    paddingVertical: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalPayText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
  },
  addressScrollView: {
    maxHeight: 300,
    marginVertical: 16,
  },
  addressOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  addressOptionName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
  },
  addressOptionText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 4,
  },
  // Rally Credits styles
  creditsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  creditsInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  creditsText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  creditsValue: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
  },
  applyCreditsButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  applyCreditsButtonActive: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    borderColor: '#22C55E',
  },
  applyCreditsText: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
  },
  applyCreditsTextActive: {
    color: '#22C55E',
  },
  creditsAppliedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    padding: 12,
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.2)',
  },
  creditsAppliedText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#22C55E',
  },
  // Rally Credit Rewards Styles
  showRewardsButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.3)',
    backgroundColor: 'rgba(255, 215, 0, 0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  showRewardsText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#F59E0B',
  },
  showRewardsSubtext: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.6)',
    marginTop: 2,
  },
  rewardsList: {
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
  },
  rewardItem: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  rewardItemDisabled: {
    opacity: 0.6,
  },
  rewardItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  rewardItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  rewardItemIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 215, 0, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rewardItemName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  rewardItemValue: {
    fontSize: 13,
    color: '#10B981',
    fontWeight: '500',
    marginTop: 2,
  },
  rewardItemRight: {
    alignItems: 'flex-end',
  },
  creditsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 215, 0, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  creditsBadgeDisabled: {
    backgroundColor: 'rgba(128, 128, 128, 0.2)',
  },
  creditsBadgeText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFD700',
  },
  notEnoughCredits: {
    fontSize: 11,
    color: '#EF4444',
    marginTop: 4,
  },
  appliedReward: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  appliedRewardGradient: {
    padding: 2,
    borderRadius: 12,
  },
  appliedRewardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 10,
  },
  appliedRewardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  appliedRewardName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFD700',
  },
  appliedRewardValue: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: 2,
  },
  removeRewardButton: {
    padding: 4,
  },
  creditsToSpendNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    padding: 10,
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderRadius: 8,
  },
  creditsToSpendText: {
    flex: 1,
    fontSize: 12,
    color: '#F59E0B',
    fontWeight: '500',
  },
});
