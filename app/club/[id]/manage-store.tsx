// app/club/[id]/manage-store.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Alert,
  TouchableOpacity,
  Image,
} from 'react-native';
import {
  Text,
  Button,
  useTheme,
  Surface,
  IconButton,
  FAB,
  Portal,
  Modal,
  TextInput,
  SegmentedButtons,
  Checkbox,
  ActivityIndicator,
  Chip,
  Divider,
  Menu,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../_layout';
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

export default function ManageStoreScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const { id } = useLocalSearchParams();
  const clubId = id as string;

  const [club, setClub] = useState<any>(null);
  const [items, setItems] = useState<StoreItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<StoreItem | null>(null);
  const [deliveryMenuVisible, setDeliveryMenuVisible] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: '',
    taxRate: '',
    shippingCost: '',
    allowPickup: true,
    pickupOnly: false,
    pickupAddress: '',
    inventory: '',
    images: [] as string[],
  });

  const [variants, setVariants] = useState<StoreItemVariant[]>([]);

  const getDeliveryOptionLabel = () => {
    if (formData.pickupOnly) return 'Pickup Only';
    if (formData.allowPickup) return 'Pickup & Delivery';
    return 'Delivery Only';
  };

  useEffect(() => {
    loadData();
  }, [clubId]);

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
      console.error('Error loading data:', error);
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
      price: '',
      taxRate: '0',
      shippingCost: '0',
      allowPickup: true,
      pickupOnly: false,
      pickupAddress: '',
      inventory: '',
      images: [],
    });
    setVariants([]);
    setModalVisible(true);
  };

  const openEditModal = (item: StoreItem) => {
    setEditingItem(item);
    setFormData({
      name: item.name,
      description: item.description,
      price: item.price.toString(),
      taxRate: item.taxRate.toString(),
      shippingCost: item.shippingCost?.toString() || '0',
      allowPickup: item.allowPickup,
      pickupOnly: item.pickupOnly,
      pickupAddress: (item as any).pickupAddress || '',
      inventory: item.inventory.toString(),
      images: item.images || [],
    });
    setVariants(item.variants || []);
    setModalVisible(true);
  };

  const pickImages = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please grant photo library permission');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
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
        console.error('Error uploading images:', error);
        Alert.alert('Error', 'Failed to upload images');
      }
    }
  };

  const removeImage = (index: number) => {
    const newImages = [...formData.images];
    newImages.splice(index, 1);
    setFormData({ ...formData, images: newImages });
  };

  const addVariant = () => {
    const variantName = prompt('Variant name (e.g., Size, Color):');
    if (!variantName) return;

    const optionsInput = prompt('Options (comma-separated, e.g., S,M,L):');
    if (!optionsInput) return;

    const options = optionsInput.split(',').map(o => o.trim()).filter(o => o);

    if (options.length === 0) {
      Alert.alert('Error', 'Please provide at least one option');
      return;
    }

    setVariants([
      ...variants,
      {
        id: `variant_${Date.now()}`,
        name: variantName,
        options,
      },
    ]);
  };

  const removeVariant = (index: number) => {
    const newVariants = [...variants];
    newVariants.splice(index, 1);
    setVariants(newVariants);
  };

  const handleSave = async () => {
    if (!user || !club) return;

    // Validation
    if (
      !formData.name ||
      !formData.description ||
      !formData.price ||
      !formData.inventory
    ) {
      Alert.alert('Missing Fields', 'Please fill in all required fields');
      return;
    }

    // Validate pickup address if pickup is enabled
    if ((formData.pickupOnly || formData.allowPickup) && !formData.pickupAddress.trim()) {
      Alert.alert('Missing Pickup Address', 'Please provide a pickup address');
      return;
    }

    const price = parseFloat(formData.price);
    const taxRate = parseFloat(formData.taxRate);
    const shippingCost = formData.pickupOnly ? null : parseFloat(formData.shippingCost);
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
        images: formData.images,
        price,
        taxRate,
        shippingCost,
        allowPickup: formData.allowPickup,
        pickupOnly: formData.pickupOnly,
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
      console.error('Error saving item:', error);
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
              console.error('Error deleting item:', error);
              Alert.alert('Error', 'An unexpected error occurred');
            }
          },
        },
      ]
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
      <View style={[styles.header, { backgroundColor: theme.colors.background }]}>
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
            const inStock = item.inventory > item.sold;

            return (
              <Surface key={item.id} style={[styles.itemCard, { backgroundColor: theme.colors.surface }]} elevation={2}>
                <View style={styles.cardInner}>
                  <View style={styles.itemHeader}>
                    {item.images && item.images.length > 0 ? (
                      <Image source={{ uri: item.images[0] }} style={styles.itemImage} />
                    ) : (
                      <View style={[styles.itemImagePlaceholder, { backgroundColor: theme.colors.surfaceVariant }]}>
                        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                          No Image
                        </Text>
                      </View>
                    )}

                    <View style={styles.itemInfo}>
                      <Text variant="titleMedium" style={{ fontWeight: '600' }} numberOfLines={2}>
                        {item.name}
                      </Text>
                      <Text variant="titleLarge" style={{ color: theme.colors.primary, marginTop: 4, fontWeight: 'bold' }}>
                        ${item.price.toFixed(2)}
                      </Text>

                      <View style={styles.itemStats}>
                        <Chip compact textStyle={{ fontSize: 11 }} style={{ height: 24 }}>
                          {item.sold} sold
                        </Chip>
                        <Chip compact textStyle={{ fontSize: 11 }} style={{ height: 24 }}>
                          {item.inventory - item.sold} in stock
                        </Chip>
                        {!item.isActive && (
                          <Chip compact textStyle={{ fontSize: 11 }} style={{ height: 24, backgroundColor: theme.colors.errorContainer }}>
                            Inactive
                          </Chip>
                        )}
                      </View>
                    </View>
                  </View>

                  <View style={styles.itemActions}>
                    <Button mode="outlined" onPress={() => openEditModal(item)} icon="pencil" style={{ flex: 1 }}>
                      Edit
                    </Button>
                    <Button mode="text" onPress={() => handleDelete(item)} icon="delete" textColor={theme.colors.error}>
                      Delete
                    </Button>
                  </View>
                </View>
              </Surface>
            );
          })
        )}
      </ScrollView>

      <FAB
        icon="plus"
        style={styles.fab}
        onPress={openAddModal}
        label="Add Product"
      />

      {/* Add/Edit Product Modal */}
      <Portal>
        <Modal
          visible={modalVisible}
          onDismiss={() => setModalVisible(false)}
          contentContainerStyle={[styles.modalContent, { backgroundColor: theme.colors.surface }]}
        >
          <View style={{ flex: 1 }}>
            <View style={styles.modalHeader}>
              <Text variant="headlineMedium" style={{ fontWeight: 'bold' }}>
                {editingItem ? 'Edit Product' : 'Add New Product'}
              </Text>
              <IconButton icon="close" onPress={() => setModalVisible(false)} />
            </View>

            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={true}>

            {/* Basic Information Section */}
            <View style={styles.formSection}>
              <Text variant="titleMedium" style={styles.sectionTitle}>Basic Information</Text>

              <TextInput
                label="Product Name"
                value={formData.name}
                onChangeText={(text) => setFormData({ ...formData, name: text })}
                style={styles.input}
                mode="outlined"
                placeholder="e.g., Club T-Shirt"
              />

              <TextInput
                label="Description"
                value={formData.description}
                onChangeText={(text) => setFormData({ ...formData, description: text })}
                style={styles.input}
                mode="outlined"
                multiline
                numberOfLines={3}
                placeholder="Describe your product..."
              />
            </View>

            {/* Images Section */}
            <View style={styles.formSection}>
              <Text variant="titleMedium" style={styles.sectionTitle}>Product Images</Text>

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

            {/* Pricing Section */}
            <View style={styles.formSection}>
              <Text variant="titleMedium" style={styles.sectionTitle}>Pricing & Inventory</Text>

              <View style={styles.row}>
                <TextInput
                  label="Price ($)"
                  value={formData.price}
                  onChangeText={(text) => setFormData({ ...formData, price: text })}
                  style={[styles.input, { flex: 1, marginRight: 8 }]}
                  mode="outlined"
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                />

                <TextInput
                  label="Tax Rate (%)"
                  value={formData.taxRate}
                  onChangeText={(text) => setFormData({ ...formData, taxRate: text })}
                  style={[styles.input, { flex: 1 }]}
                  mode="outlined"
                  keyboardType="decimal-pad"
                  placeholder="0"
                />
              </View>

              <TextInput
                label="Inventory"
                value={formData.inventory}
                onChangeText={(text) => setFormData({ ...formData, inventory: text })}
                style={styles.input}
                mode="outlined"
                keyboardType="number-pad"
                placeholder="Available quantity"
              />
            </View>

            {/* Delivery Section */}
            <View style={styles.formSection}>
              <Text variant="titleMedium" style={styles.sectionTitle}>Delivery Options</Text>

              <Menu
                visible={deliveryMenuVisible}
                onDismiss={() => setDeliveryMenuVisible(false)}
                anchor={
                  <TouchableOpacity onPress={() => setDeliveryMenuVisible(true)}>
                    <TextInput
                      label="Delivery Method"
                      value={getDeliveryOptionLabel()}
                      style={styles.input}
                      mode="outlined"
                      editable={false}
                      right={<TextInput.Icon icon="chevron-down" />}
                      pointerEvents="none"
                    />
                  </TouchableOpacity>
                }
              >
                <Menu.Item
                  onPress={() => {
                    setFormData({ ...formData, pickupOnly: true, allowPickup: false });
                    setDeliveryMenuVisible(false);
                  }}
                  title="Pickup Only"
                  leadingIcon="map-marker"
                />
                <Menu.Item
                  onPress={() => {
                    setFormData({ ...formData, pickupOnly: false, allowPickup: false });
                    setDeliveryMenuVisible(false);
                  }}
                  title="Delivery Only"
                  leadingIcon="truck-delivery"
                />
                <Menu.Item
                  onPress={() => {
                    setFormData({ ...formData, pickupOnly: false, allowPickup: true });
                    setDeliveryMenuVisible(false);
                  }}
                  title="Pickup & Delivery"
                  leadingIcon="package-variant"
                />
              </Menu>

              {(formData.pickupOnly || formData.allowPickup) && (
                <TextInput
                  label="Pickup Address"
                  value={formData.pickupAddress}
                  onChangeText={(text) => setFormData({ ...formData, pickupAddress: text })}
                  style={styles.input}
                  mode="outlined"
                  placeholder="123 Main St, City, State ZIP"
                  multiline
                  numberOfLines={2}
                />
              )}

              {!formData.pickupOnly && (
                <TextInput
                  label="Shipping Cost ($)"
                  value={formData.shippingCost}
                  onChangeText={(text) => setFormData({ ...formData, shippingCost: text })}
                  style={styles.input}
                  mode="outlined"
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                />
              )}
            </View>

            {/* Variants - Commented out for now */}
            {/* <Divider style={{ marginVertical: 16 }} />

            <View style={styles.variantsSection}>
              <View style={styles.sectionHeader}>
                <Text variant="titleSmall">Product Variants (Optional)</Text>
                <Button mode="text" onPress={addVariant}>
                  Add Variant
                </Button>
              </View>

              {variants.map((variant, index) => (
                <Surface key={variant.id} style={styles.variantCard} elevation={1}>
                  <View style={styles.variantHeader}>
                    <Text variant="titleSmall">{variant.name}</Text>
                    <IconButton icon="delete" size={20} onPress={() => removeVariant(index)} />
                  </View>
                  <Text variant="bodySmall">{variant.options.join(', ')}</Text>
                </Surface>
              ))}
            </View> */}
            </ScrollView>

            <View style={[styles.modalFooter, { backgroundColor: theme.colors.surface }]}>
              <Button mode="outlined" onPress={() => setModalVisible(false)} disabled={saving} style={{ flex: 1 }}>
                Cancel
              </Button>
              <Button mode="contained" onPress={handleSave} loading={saving} disabled={saving} style={{ flex: 1 }}>
                {editingItem ? 'Update' : 'Add'}
              </Button>
            </View>
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
    borderRadius: 12,
    marginBottom: 16,
  },
  cardInner: {
    overflow: 'hidden',
    borderRadius: 12,
    padding: 16,
  },
  itemHeader: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
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
  itemInfo: {
    flex: 1,
    justifyContent: 'space-between',
  },
  itemStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  itemActions: {
    flexDirection: 'row',
    gap: 8,
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
  },
  modalContent: {
    margin: 20,
    borderRadius: 12,
    maxHeight: '85%',
    height: '85%',
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
  modalScroll: {
    flex: 1,
    paddingHorizontal: 20,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 12,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  formSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontWeight: '600',
    marginBottom: 12,
    color: '#666',
  },
  input: {
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
  variantsSection: {
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  variantCard: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  variantHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
});
