// app/profile/addresses.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Alert,
  TouchableOpacity,
} from 'react-native';
import {
  Text,
  Button,
  useTheme,
  Surface,
  IconButton,
  Portal,
  Modal,
  TextInput,
  Checkbox,
  ActivityIndicator,
  Divider,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuth } from '../_layout';
import {
  getDoc,
  doc,
  db,
  saveShippingAddress,
  updateShippingAddress,
  deleteShippingAddress,
} from '../../lib/firebase';
import type { ShippingAddress } from '../../lib/firebase';

export default function AddressesScreen() {
  const theme = useTheme();
  const { user } = useAuth();

  const [addresses, setAddresses] = useState<ShippingAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingAddress, setEditingAddress] = useState<ShippingAddress | null>(null);

  const [formData, setFormData] = useState({
    fullName: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    zipCode: '',
    country: 'US',
    phone: '',
    isDefault: false,
  });

  useEffect(() => {
    loadAddresses();
  }, [user]);

  const loadAddresses = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const userDoc = await getDoc(doc(db, 'users', user.uid));

      if (userDoc.exists()) {
        const userData = userDoc.data();
        setAddresses(userData.savedAddresses || []);
      }
    } catch (error) {
      console.error('Error loading addresses:', error);
      Alert.alert('Error', 'Failed to load addresses');
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    setEditingAddress(null);
    setFormData({
      fullName: user?.displayName || '',
      addressLine1: '',
      addressLine2: '',
      city: '',
      state: '',
      zipCode: '',
      country: 'US',
      phone: '',
      isDefault: addresses.length === 0,
    });
    setModalVisible(true);
  };

  const openEditModal = (address: ShippingAddress) => {
    setEditingAddress(address);
    setFormData({
      fullName: address.fullName,
      addressLine1: address.addressLine1,
      addressLine2: address.addressLine2 || '',
      city: address.city,
      state: address.state,
      zipCode: address.zipCode,
      country: address.country,
      phone: address.phone,
      isDefault: address.isDefault,
    });
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!user) return;

    // Validation
    if (
      !formData.fullName ||
      !formData.addressLine1 ||
      !formData.city ||
      !formData.state ||
      !formData.zipCode ||
      !formData.phone
    ) {
      Alert.alert('Missing Fields', 'Please fill in all required fields');
      return;
    }

    try {
      setSaving(true);

      if (editingAddress) {
        // Update existing address
        const result = await updateShippingAddress(user.uid, editingAddress.id, formData);

        if (result.success) {
          Alert.alert('Success', 'Address updated successfully');
          await loadAddresses();
          setModalVisible(false);
        } else {
          Alert.alert('Error', result.error || 'Failed to update address');
        }
      } else {
        // Save new address
        const result = await saveShippingAddress(user.uid, formData);

        if (result.success) {
          Alert.alert('Success', 'Address saved successfully');
          await loadAddresses();
          setModalVisible(false);
        } else {
          Alert.alert('Error', result.error || 'Failed to save address');
        }
      }
    } catch (error) {
      console.error('Error saving address:', error);
      Alert.alert('Error', 'An unexpected error occurred');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (address: ShippingAddress) => {
    if (!user) return;

    Alert.alert(
      'Delete Address',
      'Are you sure you want to delete this address?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const result = await deleteShippingAddress(user.uid, address.id);

              if (result.success) {
                Alert.alert('Success', 'Address deleted successfully');
                await loadAddresses();
              } else {
                Alert.alert('Error', result.error || 'Failed to delete address');
              }
            } catch (error) {
              console.error('Error deleting address:', error);
              Alert.alert('Error', 'An unexpected error occurred');
            }
          },
        },
      ]
    );
  };

  const handleSetDefault = async (address: ShippingAddress) => {
    if (!user) return;

    try {
      const result = await updateShippingAddress(user.uid, address.id, { isDefault: true });

      if (result.success) {
        await loadAddresses();
      } else {
        Alert.alert('Error', result.error || 'Failed to update address');
      }
    } catch (error) {
      console.error('Error setting default address:', error);
      Alert.alert('Error', 'An unexpected error occurred');
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

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text variant="headlineMedium" style={{ fontWeight: 'bold' }}>
            Shipping Addresses
          </Text>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
            Manage your saved addresses
          </Text>
        </View>

        {addresses.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text variant="titleMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              No saved addresses
            </Text>
            <Text
              variant="bodyMedium"
              style={{ color: theme.colors.onSurfaceVariant, marginTop: 8, textAlign: 'center' }}
            >
              Add a shipping address to make checkout faster
            </Text>
          </View>
        ) : (
          <View style={styles.addressList}>
            {addresses.map((address) => (
              <Surface key={address.id} style={styles.addressCard} elevation={1}>
                <View style={styles.addressHeader}>
                  <View style={{ flex: 1 }}>
                    <Text variant="titleMedium" style={{ fontWeight: '600' }}>
                      {address.fullName}
                    </Text>
                    {address.isDefault && (
                      <Text
                        variant="labelSmall"
                        style={{ color: theme.colors.primary, marginTop: 4 }}
                      >
                        DEFAULT
                      </Text>
                    )}
                  </View>

                  <View style={styles.addressActions}>
                    <IconButton
                      icon="pencil"
                      size={20}
                      onPress={() => openEditModal(address)}
                    />
                    <IconButton
                      icon="delete"
                      size={20}
                      onPress={() => handleDelete(address)}
                    />
                  </View>
                </View>

                <View style={styles.addressBody}>
                  <Text variant="bodyMedium">{address.addressLine1}</Text>
                  {address.addressLine2 && (
                    <Text variant="bodyMedium">{address.addressLine2}</Text>
                  )}
                  <Text variant="bodyMedium">
                    {address.city}, {address.state} {address.zipCode}
                  </Text>
                  <Text variant="bodyMedium">{address.country}</Text>
                  <Text variant="bodyMedium" style={{ marginTop: 8 }}>
                    {address.phone}
                  </Text>
                </View>

                {!address.isDefault && (
                  <Button
                    mode="text"
                    onPress={() => handleSetDefault(address)}
                    style={{ marginTop: 8 }}
                  >
                    Set as Default
                  </Button>
                )}
              </Surface>
            ))}
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Button
          mode="contained"
          onPress={openAddModal}
          icon="plus"
          style={styles.addButton}
          contentStyle={{ height: 48 }}
        >
          Add New Address
        </Button>
      </View>

      {/* Add/Edit Address Modal */}
      <Portal>
        <Modal
          visible={modalVisible}
          onDismiss={() => setModalVisible(false)}
          contentContainerStyle={[
            styles.modalContent,
            { backgroundColor: theme.colors.surface },
          ]}
        >
          <ScrollView>
            <Text variant="headlineSmall" style={{ marginBottom: 16 }}>
              {editingAddress ? 'Edit Address' : 'Add New Address'}
            </Text>

            <TextInput
              label="Full Name *"
              value={formData.fullName}
              onChangeText={(text) => setFormData({ ...formData, fullName: text })}
              style={styles.input}
              mode="outlined"
            />

            <TextInput
              label="Address Line 1 *"
              value={formData.addressLine1}
              onChangeText={(text) => setFormData({ ...formData, addressLine1: text })}
              style={styles.input}
              mode="outlined"
            />

            <TextInput
              label="Address Line 2 (Optional)"
              value={formData.addressLine2}
              onChangeText={(text) => setFormData({ ...formData, addressLine2: text })}
              style={styles.input}
              mode="outlined"
            />

            <View style={styles.row}>
              <TextInput
                label="City *"
                value={formData.city}
                onChangeText={(text) => setFormData({ ...formData, city: text })}
                style={[styles.input, { flex: 1, marginRight: 8 }]}
                mode="outlined"
              />

              <TextInput
                label="State *"
                value={formData.state}
                onChangeText={(text) => setFormData({ ...formData, state: text })}
                style={[styles.input, { width: 100 }]}
                mode="outlined"
              />
            </View>

            <TextInput
              label="ZIP Code *"
              value={formData.zipCode}
              onChangeText={(text) => setFormData({ ...formData, zipCode: text })}
              style={styles.input}
              mode="outlined"
              keyboardType="numeric"
            />

            <TextInput
              label="Phone *"
              value={formData.phone}
              onChangeText={(text) => setFormData({ ...formData, phone: text })}
              style={styles.input}
              mode="outlined"
              keyboardType="phone-pad"
            />

            <TouchableOpacity
              onPress={() => setFormData({ ...formData, isDefault: !formData.isDefault })}
              style={styles.checkboxRow}
            >
              <Checkbox
                status={formData.isDefault ? 'checked' : 'unchecked'}
                onPress={() => setFormData({ ...formData, isDefault: !formData.isDefault })}
              />
              <Text variant="bodyMedium">Set as default address</Text>
            </TouchableOpacity>

            <View style={styles.modalActions}>
              <Button
                mode="outlined"
                onPress={() => setModalVisible(false)}
                disabled={saving}
                style={{ flex: 1 }}
              >
                Cancel
              </Button>
              <Button
                mode="contained"
                onPress={handleSave}
                loading={saving}
                disabled={saving}
                style={{ flex: 1 }}
              >
                {editingAddress ? 'Update' : 'Save'}
              </Button>
            </View>
          </ScrollView>
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
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  header: {
    marginBottom: 24,
  },
  emptyContainer: {
    alignItems: 'center',
    padding: 48,
  },
  addressList: {
    gap: 16,
  },
  addressCard: {
    padding: 16,
    borderRadius: 12,
  },
  addressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  addressActions: {
    flexDirection: 'row',
    marginRight: -8,
  },
  addressBody: {
    gap: 2,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
  },
  addButton: {
    borderRadius: 8,
  },
  modalContent: {
    margin: 20,
    padding: 20,
    borderRadius: 12,
    maxHeight: '90%',
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
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
});
