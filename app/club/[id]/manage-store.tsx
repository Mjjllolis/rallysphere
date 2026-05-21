// app/club/[id]/manage-store.tsx
import { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Alert,
  TouchableOpacity,
  Image,
  Animated,
  Keyboard,
  Platform,
  Easing,
} from 'react-native';
import {
  Text,
  Button,
  useTheme,
  IconButton,
  Portal,
  Modal,
  ActivityIndicator,
  Chip,
} from 'react-native-paper';
import { BlurView } from 'expo-blur';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth, useThemeToggle } from '../../_layout';
import {
  getClubStoreItems,
  createStoreItem,
  updateStoreItem,
  deleteStoreItem,
  getClub,
  uploadImage,
} from '../../../lib/firebase';
import type { StoreItem, StoreItemVariant } from '../../../lib/firebase';
import * as ImagePicker from 'expo-image-picker';
import GlassInput from '../../../components/GlassInput';

const CATEGORIES = ['Merch', 'Equipment', 'Snacks', 'Etc'];

export default function ManageStoreScreen() {
  const theme = useTheme();
  const { isDark } = useThemeToggle();
  const { user } = useAuth();
  const { id } = useLocalSearchParams();
  const clubId = id as string;

  const [club, setClub] = useState<any>(null);
  const [items, setItems] = useState<StoreItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<StoreItem | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: '',
    price: '',
    adminFeeRate: '10',
    shippingCost: '',
    allowPickup: true,
    pickupOnly: false,
    pickupAddress: '',
    inventory: '',
    images: [] as string[],
  });

  const [variants, setVariants] = useState<StoreItemVariant[]>([]);
  const [deliveryOption, setDeliveryOption] = useState<'pickup' | 'delivery' | 'both'>('both');

  const keyboardTranslateY = useState(new Animated.Value(0))[0];
  const modalScrollRef = useRef<ScrollView>(null);
  const nameY = useRef(0);
  const descriptionY = useRef(0);
  const priceY = useRef(0);
  const inventoryY = useRef(0);
  const pickupAddressY = useRef(0);
  const shippingCostY = useRef(0);
  const focusedFieldY = useRef(0);
  const keyboardHeightRef = useRef(0);
  const currentScrollY = useRef(0);

  const focusField = (fieldY: number) => {
    focusedFieldY.current = fieldY;

    setTimeout(() => {
      const keyboardHeight = keyboardHeightRef.current;

      const targetScrollY = fieldY < 180 ? 0 : Math.max(fieldY - 200, 0);
      const shouldLiftModal = fieldY > 320;

      Animated.timing(keyboardTranslateY, {
        toValue: shouldLiftModal ? -keyboardHeight * 0.22 : 0,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();

      modalScrollRef.current?.scrollTo({
        y: targetScrollY,
        animated: true,
      });
    }, 120);
  };

  useEffect(() => {
    loadData();
  }, [clubId]);

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (event) => {
        keyboardHeightRef.current = event.endCoordinates.height;

        if (focusedFieldY.current > 320) {
          Animated.timing(keyboardTranslateY, {
            toValue: -event.endCoordinates.height * 0.22,
            duration: Platform.OS === 'ios' ? event.duration || 250 : 220,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }).start();
        }
      }
    );

    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      (event) => {
        Animated.timing(keyboardTranslateY, {
          toValue: 0,
          duration: Platform.OS === 'ios' ? event.duration || 250 : 200,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start();
      }
    );

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);

      // Load club info
      const clubResult = await getClub(clubId);
      if (clubResult.success && clubResult.club) {
        setClub(clubResult.club);
      }

      // Load store items
      const result = await getClubStoreItems(clubId, false);
      if (result.success) {
        setItems(result.items);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to load store items');
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    setEditingItem(null);
    setFormData({
      name: '',
      description: '',
      category: '',
      price: '',
      adminFeeRate: '10',
      shippingCost: '0',
      allowPickup: true,
      pickupOnly: false,
      pickupAddress: '',
      inventory: '',
      images: [],
    });
    setVariants([]);
    setDeliveryOption('both');
    setModalVisible(true);
  };

  const openEditModal = (item: StoreItem) => {
    setEditingItem(item);
    setFormData({
      name: item.name,
      description: item.description,
      category: item.category || '',
      price: item.price.toString(),
      adminFeeRate: (item.adminFeeRate || 10).toString(),
      shippingCost: item.shippingCost?.toString() || '0',
      allowPickup: item.allowPickup,
      pickupOnly: item.pickupOnly,
      pickupAddress: (item as any).pickupAddress || '',
      inventory: item.inventory.toString(),
      images: item.images || [],
    });
    setVariants(item.variants || []);

    // Set delivery option
    if (item.pickupOnly) {
      setDeliveryOption('pickup');
    } else if (item.allowPickup) {
      setDeliveryOption('both');
    } else {
      setDeliveryOption('delivery');
    }

    setModalVisible(true);
  };

  const pickImages = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please grant photo library permission');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsMultipleSelection: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets) {
      // Upload images
      try {
        const uploadedUrls = [];

        for (const asset of result.assets) {
          const url = await uploadImage(asset.uri, `stores/${clubId}/${Date.now()}.jpg`);
          if (url) {
            uploadedUrls.push(url);
          }
        }

        setFormData({ ...formData, images: [...formData.images, ...uploadedUrls] });
      } catch (error) {
        Alert.alert('Error', 'Failed to upload images');
      }
    }
  };

  const removeImage = (index: number) => {
    const newImages = [...formData.images];
    newImages.splice(index, 1);
    setFormData({ ...formData, images: newImages });
  };

  const handleSave = async () => {
    if (!user || !club) return;

    // Validation
    if (
      !formData.name ||
      !formData.description ||
      !formData.category ||
      !formData.price ||
      !formData.inventory
    ) {
      Alert.alert('Missing Fields', 'Please fill in all required fields');
      return;
    }

    // Validate pickup address if pickup is enabled
    const needsPickupAddress = deliveryOption === 'pickup' || deliveryOption === 'both';
    if (needsPickupAddress && !formData.pickupAddress.trim()) {
      Alert.alert('Missing Pickup Address', 'Please provide a pickup address');
      return;
    }

    const price = parseFloat(formData.price);
    const adminFeeRate = parseFloat(formData.adminFeeRate);
    const shippingCost = deliveryOption === 'pickup' ? null : parseFloat(formData.shippingCost);
    const inventory = parseInt(formData.inventory);

    if (isNaN(price) || price <= 0) {
      Alert.alert('Invalid Price', 'Please enter a valid price');
      return;
    }

    if (isNaN(inventory) || inventory < 0) {
      Alert.alert('Invalid Inventory', 'Please enter a valid inventory count');
      return;
    }

    try {
      setSaving(true);

      const itemData = {
        clubId,
        clubName: club.name,
        name: formData.name,
        description: formData.description,
        category: formData.category,
        images: formData.images,
        price,
        adminFeeRate,
        shippingCost,
        allowPickup: deliveryOption === 'both',
        pickupOnly: deliveryOption === 'pickup',
        pickupAddress: formData.pickupAddress.trim(),
        inventory,
        variants,
        isActive: true,
        createdBy: user.uid,
      };

      if (editingItem) {
        // Update existing item
        const result = await updateStoreItem(editingItem.id, itemData);

        if (result.success) {
          Alert.alert('Success', 'Product updated successfully');
          await loadData();
          setModalVisible(false);
        } else {
          Alert.alert('Error', result.error || 'Failed to update product');
        }
      } else {
        // Create new item
        const result = await createStoreItem(itemData as any);

        if (result.success) {
          Alert.alert('Success', 'Product added successfully');
          await loadData();
          setModalVisible(false);
        } else {
          Alert.alert('Error', result.error || 'Failed to add product');
        }
      }
    } catch (error) {
      Alert.alert('Error', 'An unexpected error occurred');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: StoreItem) => {
    Alert.alert(
      'Delete Product',
      'Are you sure you want to delete this product?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const result = await deleteStoreItem(item.id);

              if (result.success) {
                Alert.alert('Success', 'Product deleted successfully');
                await loadData();
              } else {
                Alert.alert('Error', result.error || 'Failed to delete product');
              }
            } catch (error) {
              Alert.alert('Error', 'An unexpected error occurred');
            }
          },
        },
      ]
    );
  };

  const isFormComplete = () => {
    return (
      formData.name.trim().length > 0 &&
      formData.description.trim().length > 0 &&
      formData.category.trim().length > 0 &&
      formData.price.trim().length > 0 &&
      formData.inventory.trim().length > 0 &&
      (deliveryOption !== 'pickup' && deliveryOption !== 'both' || formData.pickupAddress.trim().length > 0)
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
      {/* Background Gradient */}
      <View style={StyleSheet.absoluteFill}>
        <View style={[styles.background, { backgroundColor: theme.colors.background }]} />
      </View>
      <LinearGradient
        colors={[
          'rgba(99, 102, 241, 0.15)',
          'rgba(139, 92, 246, 0.08)',
          isDark ? 'rgba(0, 0, 0, 0)' : 'rgba(248, 250, 252, 0)',
        ]}
        locations={[0, 0.3, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <IconButton icon="arrow-left" onPress={() => router.back()} />
          <View style={{ flex: 1 }} />
          <Button mode="text" onPress={() => router.push(`/club/${clubId}/manage-orders`)}>
            Orders
          </Button>
        </View>
        <View style={styles.headerContent}>
          <Text variant="headlineLarge" style={[styles.title, { color: theme.colors.onBackground }]}>
            Manage Store
          </Text>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
            {club?.name}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {items.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text variant="titleMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              No products yet
            </Text>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 8 }}>
              Add your first product to get started
            </Text>
          </View>
        ) : (
          items.map((item) => {
            const inStock = item.inventory - item.sold;
            const stockPercentage = (inStock / item.inventory) * 100;

            return (
              <TouchableOpacity
                key={item.id}
                style={styles.itemCard}
                onPress={() => openEditModal(item)}
                activeOpacity={0.9}
              >
                <BlurView
                  intensity={20}
                  tint={isDark ? "dark" : "light"}
                  style={[styles.itemCardBlur, { borderColor: theme.colors.outline }]}
                >
                  <View style={styles.cardInner}>
                    {/* Product Image */}
                    <View style={styles.imageSection}>
                      {item.images && item.images.length > 0 ? (
                        <Image source={{ uri: item.images[0] }} style={styles.productImage} />
                      ) : (
                        <LinearGradient
                          colors={isDark ? ['rgba(99, 102, 241, 0.2)', 'rgba(139, 92, 246, 0.2)'] : ['#E1E7F1', '#D4DCE8']}
                          style={styles.productImagePlaceholder}
                        >
                          <IconButton icon="image-off" size={28} iconColor={theme.colors.onSurfaceVariant} />
                        </LinearGradient>
                      )}
                    </View>

                    {/* Product Info */}
                    <View style={styles.contentSection}>
                      {/* Header Section */}
                      <View style={styles.headerSection}>
                        <View style={styles.titleContainer}>
                          <Text style={[styles.productTitle, { color: theme.colors.onSurface }]} numberOfLines={1}>
                            {item.name}
                          </Text>
                          <Text style={[styles.categoryLabel, { color: theme.colors.onSurfaceVariant }]}>
                            {item.category}
                          </Text>
                        </View>
                        {!item.isActive && (
                          <Chip
                            compact
                            textStyle={styles.inactiveChipText}
                            style={[styles.inactiveChip, { backgroundColor: theme.colors.errorContainer }]}
                          >
                            Inactive
                          </Chip>
                        )}
                      </View>

                      {/* Price and Stats Section */}
                      <View style={styles.metricsSection}>
                        <Text style={[styles.priceText, { color: theme.colors.primary }]}>
                          ${item.price.toFixed(2)}
                        </Text>

                        <View style={styles.statsBox}>
                          <View style={styles.statColumn}>
                            <Text style={[styles.statNumber, { color: theme.colors.onSurface }]}>{item.sold}</Text>
                            <Text style={[styles.statText, { color: theme.colors.onSurfaceVariant }]}>Sold</Text>
                          </View>
                          <View style={styles.statSeparator} />
                          <View style={styles.statColumn}>
                            <Text style={[styles.statNumber, { color: stockPercentage > 20 ? '#22C55E' : theme.colors.error }]}>
                              {inStock}
                            </Text>
                            <Text style={[styles.statText, { color: theme.colors.onSurfaceVariant }]}>Stock</Text>
                          </View>
                        </View>
                      </View>

                      {/* Actions Section */}
                      <View style={styles.actionsSection}>
                        <TouchableOpacity
                          onPress={() => openEditModal(item)}
                          style={[styles.actionBtn, { borderColor: theme.colors.outline }]}
                          activeOpacity={0.7}
                        >
                          <IconButton icon="pencil" size={14} iconColor={theme.colors.primary} style={styles.actionIcon} />
                          <Text style={[styles.actionText, { color: theme.colors.onSurface }]}>Edit</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          onPress={() => handleDelete(item)}
                          style={[styles.actionBtn, { borderColor: theme.colors.errorContainer }]}
                          activeOpacity={0.7}
                        >
                          <IconButton icon="delete" size={14} iconColor={theme.colors.error} style={styles.actionIcon} />
                          <Text style={[styles.actionText, { color: theme.colors.error }]}>Delete</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                </BlurView>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* Add Product Button - Glass Circle */}
      <View style={styles.fabContainer}>
        <TouchableOpacity onPress={openAddModal} activeOpacity={0.7}>
          {isDark ? (
            <BlurView
              intensity={40}
              tint="light"
              style={[styles.fabGlass, {
                borderColor: 'rgba(255,255,255,0.15)',
              }]}
            >
              <IconButton
                icon="plus"
                size={24}
                iconColor={theme.colors.primary}
                style={{ margin: 0 }}
                containerColor="transparent"
              />
            </BlurView>
          ) : (
            <View style={[styles.fabGlass, { borderColor: 'rgba(255,255,255,0.9)', backgroundColor: theme.colors.surfaceVariant }]}>
              <IconButton
                icon="plus"
                size={24}
                iconColor={theme.colors.primary}
                style={{ margin: 0 }}
                containerColor="transparent"
              />
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Add/Edit Product Modal */}
      <Portal>
        <Modal
          visible={modalVisible}
          onDismiss={() => setModalVisible(false)}
          contentContainerStyle={[styles.modalContent, { backgroundColor: theme.colors.surface }]}
        >
          <Animated.View
            style={[
              styles.modalAnimatedWrapper,
              {
                transform: [{ translateY: keyboardTranslateY }],
              },
            ]}
          >
            <View style={styles.modalInner}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <Text variant="headlineMedium" style={{ fontWeight: 'bold' }}>
                {editingItem ? 'Edit Product' : 'Add New Product'}
              </Text>
              <IconButton icon="close" onPress={() => setModalVisible(false)} />
            </View>

            {/* Scrollable Content */}
            <ScrollView
              ref={modalScrollRef}
              style={styles.modalScroll}
              contentContainerStyle={styles.modalScrollContent}
              showsVerticalScrollIndicator={true}
              keyboardShouldPersistTaps="handled"
              onScroll={(e) => {
                currentScrollY.current = e.nativeEvent.contentOffset.y;
              }}
              scrollEventThrottle={16}
            >

                {/* Images Section */}
                <View style={styles.modalImageSection}>
                  <Text style={[styles.sectionLabel, { color: theme.colors.onSurface }]}>Product Images</Text>
                  <View style={styles.imagesGrid}>
                    {formData.images.map((uri, index) => (
                      <View key={index} style={styles.imagePreview}>
                        <Image source={{ uri }} style={styles.previewImage} />
                        <IconButton
                          icon="close-circle"
                          size={20}
                          iconColor={theme.colors.error}
                          style={styles.removeImageButton}
                          onPress={() => removeImage(index)}
                        />
                      </View>
                    ))}

                    <TouchableOpacity
                      style={[styles.addImageButton, { borderColor: theme.colors.outline, backgroundColor: theme.colors.surfaceVariant }]}
                      onPress={pickImages}
                    >
                      <IconButton icon="camera-plus" iconColor={theme.colors.primary} />
                      <Text variant="bodySmall" style={{ color: theme.colors.primary }}>Add Photos</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Basic Information */}
                <View onLayout={(e) => {
                  nameY.current = e.nativeEvent.layout.y;
                }}>
                  <GlassInput
                    label="Product Name *"
                    value={formData.name}
                    onChangeText={(text) => setFormData({ ...formData, name: text })}
                    placeholder="e.g., Club T-Shirt"
                    onFocus={() => focusField(nameY.current)}
                  />
                </View>

                <View onLayout={(e) => {
                  descriptionY.current = e.nativeEvent.layout.y;
                }}>
                  <GlassInput
                    label="Description *"
                    value={formData.description}
                    onChangeText={(text) => setFormData({ ...formData, description: text })}
                    placeholder="Describe your product..."
                    multiline
                    numberOfLines={3}
                    onFocus={() => focusField(descriptionY.current + 105)}
                  />
                </View>

                {/* Category Chips */}
                <View style={styles.categorySection}>
                  <Text style={[styles.sectionLabel, { color: theme.colors.onSurface }]}>Category *</Text>
                  <View style={styles.categoryChips}>
                    {CATEGORIES.map((cat) => (
                      <Chip
                        key={cat}
                        selected={formData.category === cat}
                        onPress={() => setFormData({ ...formData, category: cat })}
                        style={styles.categoryChip}
                        mode={formData.category === cat ? "flat" : "outlined"}
                        selectedColor={theme.colors.primary}
                      >
                        {cat}
                      </Chip>
                    ))}
                  </View>
                </View>

                {/* Pricing */}
                <View onLayout={(e) => {
                  priceY.current = e.nativeEvent.layout.y;
                }}>
                  <GlassInput
                    label="Price ($) *"
                    value={formData.price}
                    onChangeText={(text) => setFormData({ ...formData, price: text })}
                    placeholder="0.00"
                    keyboardType="decimal-pad"
                    icon="currency-usd"
                    onFocus={() => focusField(priceY.current)}
                  />
                </View>

                <View onLayout={(e) => {
                  inventoryY.current = e.nativeEvent.layout.y;
                }}>
                  <GlassInput
                    label="Inventory *"
                    value={formData.inventory}
                    onChangeText={(text) => setFormData({ ...formData, inventory: text })}
                    placeholder="Available quantity"
                    keyboardType="number-pad"
                    icon="package-variant"
                    onFocus={() => focusField(inventoryY.current)}
                  />
                </View>

                {(deliveryOption === 'pickup' || deliveryOption === 'both') && (
                  <View onLayout={(e) => {
                    pickupAddressY.current = e.nativeEvent.layout.y;
                  }}>
                    <GlassInput
                      label="Pickup Address *"
                      value={formData.pickupAddress}
                      onChangeText={(text) => setFormData({ ...formData, pickupAddress: text })}
                      placeholder="123 Main St, City, State ZIP"
                      multiline
                      numberOfLines={2}
                      icon="map-marker"
                      onFocus={() => focusField(pickupAddressY.current)}
                    />
                  </View>
                )}

                {deliveryOption !== 'pickup' && (
                  <View onLayout={(e) => {
                    shippingCostY.current = e.nativeEvent.layout.y;
                  }}>
                    <GlassInput
                      label="Shipping Cost ($)"
                      value={formData.shippingCost}
                      onChangeText={(text) => setFormData({ ...formData, shippingCost: text })}
                      placeholder="0.00"
                      keyboardType="decimal-pad"
                      icon="truck-delivery"
                      onFocus={() => focusField(shippingCostY.current)}
                    />
                  </View>
                )}

                {/* Delivery Options */}
                <View style={styles.deliverySection}>
                  <Text style={[styles.sectionLabel, { color: theme.colors.onSurface }]}>Delivery Method</Text>
                  <View style={styles.deliveryChips}>
                    <Chip
                      selected={deliveryOption === 'pickup'}
                      onPress={() => setDeliveryOption('pickup')}
                      style={styles.deliveryChip}
                      mode={deliveryOption === 'pickup' ? "flat" : "outlined"}
                      selectedColor={theme.colors.primary}
                      icon="map-marker"
                    >
                      Pickup Only
                    </Chip>
                    <Chip
                      selected={deliveryOption === 'delivery'}
                      onPress={() => setDeliveryOption('delivery')}
                      style={styles.deliveryChip}
                      mode={deliveryOption === 'delivery' ? "flat" : "outlined"}
                      selectedColor={theme.colors.primary}
                      icon="truck-delivery"
                    >
                      Delivery Only
                    </Chip>
                    <Chip
                      selected={deliveryOption === 'both'}
                      onPress={() => setDeliveryOption('both')}
                      style={styles.deliveryChip}
                      mode={deliveryOption === 'both' ? "flat" : "outlined"}
                      selectedColor={theme.colors.primary}
                      icon="package-variant"
                    >
                      Both
                    </Chip>
                  </View>
                </View>
              </ScrollView>

            {/* Buttons */}
            <View style={styles.modalButtons}>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                disabled={saving}
                activeOpacity={0.7}
                style={[styles.pillButton, styles.cancelButton, { borderColor: theme.colors.outline }]}
              >
                <Text style={[styles.pillButtonText, { color: theme.colors.onSurface }]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleSave}
                disabled={saving || !isFormComplete()}
                activeOpacity={0.7}
                style={styles.pillButton}
              >
                <LinearGradient
                  colors={isFormComplete() && !saving ? ['#6366f1', '#8b5cf6'] : ['#9CA3AF', '#6B7280']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.pillButtonGradient}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.pillButtonTextWhite}>
                      {editingItem ? 'Update' : 'Add Product'}
                    </Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
          </Animated.View>
        </Modal>
      </Portal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  background: {
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
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  emptyContainer: {
    alignItems: 'center',
    padding: 48,
  },
  itemCard: {
    marginBottom: 16,
    borderRadius: 16,
    overflow: 'hidden',
  },
  itemCardBlur: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  cardInner: {
    padding: 12,
    flexDirection: 'row',
    gap: 12,
  },
  // Image Section
  imageSection: {
    width: 120,
    height: 120,
  },
  productImage: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
    resizeMode: 'cover',
  },
  productImagePlaceholder: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Content Section
  contentSection: {
    flex: 1,
    justifyContent: 'space-between',
    minHeight: 120,
  },
  // Header Section
  headerSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  titleContainer: {
    flex: 1,
  },
  productTitle: {
    fontWeight: '700',
    fontSize: 15,
    lineHeight: 18,
  },
  categoryLabel: {
    fontSize: 11,
    marginTop: 1,
  },
  inactiveChip: {
    height: 20,
  },
  inactiveChipText: {
    fontSize: 9,
    fontWeight: '600',
  },
  // Metrics Section
  metricsSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  priceText: {
    fontWeight: 'bold',
    fontSize: 18,
    lineHeight: 22,
    flex: 1,
  },
  statsBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    flexShrink: 0,
  },
  statColumn: {
    alignItems: 'center',
    minWidth: 32,
  },
  statNumber: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 16,
  },
  statText: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: 2,
  },
  statSeparator: {
    width: 1,
    height: 20,
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
  },
  // Actions Section
  actionsSection: {
    flexDirection: 'row',
    gap: 6,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
  },
  actionIcon: {
    margin: 0,
    padding: 0,
  },
  actionText: {
    fontSize: 12,
    fontWeight: '600',
  },
  fabContainer: {
    position: 'absolute',
    right: 24,
    bottom: 24,
    zIndex: 1000,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  fabGlass: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    overflow: 'hidden',
  },
  modalContent: {
    margin: 20,
    borderRadius: 16,
    height: '85%',
    overflow: 'hidden',
  },
  modalAnimatedWrapper: {
    flex: 1,
  },
  modalInner: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingBottom: 12,
  },
  modalScroll: {
    flex: 1,
  },
  modalScrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 260,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    padding: 20,
    paddingTop: 12,
    flexShrink: 0,
  },
  pillButton: {
    flex: 1,
    borderRadius: 24,
    overflow: 'hidden',
  },
  cancelButton: {
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 14,
  },
  pillButtonGradient: {
    paddingVertical: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 24,
  },
  pillButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  pillButtonTextWhite: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  modalImageSection: {
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  imagesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  imagePreview: {
    width: 100,
    height: 100,
    position: 'relative',
  },
  previewImage: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
  },
  removeImageButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    margin: 0,
  },
  addImageButton: {
    width: 100,
    height: 100,
    borderRadius: 8,
    borderWidth: 2,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  categorySection: {
    marginBottom: 16,
  },
  categoryChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryChip: {
    marginBottom: 4,
  },
  deliverySection: {
    marginBottom: 16,
  },
  deliveryChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  deliveryChip: {
    marginBottom: 4,
  },
});
