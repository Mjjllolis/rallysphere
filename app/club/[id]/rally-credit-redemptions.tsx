// app/club/[id]/rally-credit-redemptions.tsx - Rally Credit Redemption Settings
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Switch,
  Animated,
} from 'react-native';
import {
  Text,
  IconButton,
  ActivityIndicator,
  Button,
  Chip,
  Portal,
  Modal,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../_layout';
import {
  getClub,
  getAllClubRallyRedemptions,
  createRallyRedemption,
  updateRallyRedemption,
  deleteRallyRedemption,
} from '../../../lib/firebase';
import type { Club, RallyCreditRedemption } from '../../../lib/firebase';
import GlassInput from '../../../components/GlassInput';

const REDEMPTION_TYPES = [
  { value: 'store_discount', label: 'Store Discount', icon: 'tag-outline', description: 'Discount on store purchases' },
  { value: 'event_discount', label: 'Event Discount', icon: 'ticket-outline', description: 'Discount on event tickets' },
  { value: 'event_free_admission', label: 'Free Event Entry', icon: 'ticket', description: 'Free admission to events' },
];

export default function RallyCreditRedemptionsScreen() {
  const { user } = useAuth();
  const { id } = useLocalSearchParams();
  const clubId = id as string;

  const [club, setClub] = useState<Club | null>(null);
  const [redemptions, setRedemptions] = useState<RallyCreditRedemption[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingRedemption, setEditingRedemption] = useState<RallyCreditRedemption | null>(null);
  const [typeMenuVisible, setTypeMenuVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  const scaleAnim = useRef(new Animated.Value(0)).current;

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    type: 'store_discount' as RallyCreditRedemption['type'],
    creditsRequired: '',
    discountAmount: '',
    discountPercent: '',
    isActive: true,
    maxRedemptions: '',
    validUntilDays: '',
  });

  useEffect(() => {
    loadData();
  }, [clubId]);

  useEffect(() => {
    if (typeMenuVisible) {
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 80,
        friction: 8,
        useNativeDriver: true,
      }).start();
    } else {
      scaleAnim.setValue(0);
    }
  }, [typeMenuVisible]);

  const loadData = async () => {
    try {
      setLoading(true);

      const clubResult = await getClub(clubId);
      if (clubResult.success && clubResult.club) {
        setClub(clubResult.club);

        if (user && !clubResult.club.admins.includes(user.uid)) {
          router.back();
          return;
        }
      } else {
        router.back();
        return;
      }

      const redemptionsResult = await getAllClubRallyRedemptions(clubId);
      if (redemptionsResult.success) {
        setRedemptions(redemptionsResult.redemptions || []);
      }
    } catch (error) {
      console.error('Error loading redemptions:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const openCreateModal = () => {
    setEditingRedemption(null);
    setFormData({
      name: '',
      description: '',
      type: 'store_discount',
      creditsRequired: '',
      discountAmount: '',
      discountPercent: '',
      isActive: true,
      maxRedemptions: '',
      validUntilDays: '',
    });
    setModalVisible(true);
  };

  const openEditModal = (redemption: RallyCreditRedemption) => {
    setEditingRedemption(redemption);
    setFormData({
      name: redemption.name,
      description: redemption.description,
      type: redemption.type,
      creditsRequired: redemption.creditsRequired.toString(),
      discountAmount: redemption.discountAmount?.toString() || '',
      discountPercent: redemption.discountPercent?.toString() || '',
      isActive: redemption.isActive,
      maxRedemptions: redemption.maxRedemptions?.toString() || '',
      validUntilDays: '',
    });
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      Alert.alert('Error', 'Please enter a name for this redemption option');
      return;
    }

    if (!formData.creditsRequired || parseInt(formData.creditsRequired) <= 0) {
      Alert.alert('Error', 'Please enter a valid number of credits required');
      return;
    }

    const needsDiscount = ['store_discount', 'event_discount'].includes(formData.type);
    if (needsDiscount && !formData.discountAmount && !formData.discountPercent) {
      Alert.alert('Error', 'Please enter either a discount amount or percentage');
      return;
    }

    try {
      setSaving(true);

      const redemptionData: Partial<RallyCreditRedemption> = {
        clubId,
        clubName: club?.name || '',
        name: formData.name.trim(),
        description: formData.description.trim(),
        type: formData.type,
        creditsRequired: parseInt(formData.creditsRequired),
        isActive: formData.isActive,
        createdBy: user?.uid,
      };

      if (formData.discountAmount) {
        redemptionData.discountAmount = parseFloat(formData.discountAmount);
      }

      if (formData.discountPercent) {
        redemptionData.discountPercent = parseFloat(formData.discountPercent);
      }

      if (formData.maxRedemptions) {
        redemptionData.maxRedemptions = parseInt(formData.maxRedemptions);
      }

      if (editingRedemption) {
        const result = await updateRallyRedemption(editingRedemption.id, redemptionData);
        if (result.success) {
          Alert.alert('Success', 'Redemption option updated successfully');
          setModalVisible(false);
          await loadData();
        } else {
          Alert.alert('Error', result.error || 'Failed to update redemption option');
        }
      } else {
        const result = await createRallyRedemption(redemptionData);
        if (result.success) {
          Alert.alert('Success', 'Redemption option created successfully');
          setModalVisible(false);
          await loadData();
        } else {
          Alert.alert('Error', result.error || 'Failed to create redemption option');
        }
      }
    } catch (error) {
      console.error('Error saving redemption:', error);
      Alert.alert('Error', 'An unexpected error occurred');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (redemption: RallyCreditRedemption) => {
    Alert.alert(
      'Delete Redemption Option',
      `Are you sure you want to delete "${redemption.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const result = await deleteRallyRedemption(redemption.id);
            if (result.success) {
              Alert.alert('Success', 'Redemption option deleted');
              await loadData();
            } else {
              Alert.alert('Error', result.error || 'Failed to delete redemption option');
            }
          },
        },
      ]
    );
  };

  const toggleActive = async (redemption: RallyCreditRedemption) => {
    const result = await updateRallyRedemption(redemption.id, {
      isActive: !redemption.isActive,
    });
    if (result.success) {
      await loadData();
    }
  };

  const getRedemptionTypeInfo = (type: string) => {
    return REDEMPTION_TYPES.find(t => t.value === type) || REDEMPTION_TYPES[0];
  };

  const renderRedemptionValue = (redemption: RallyCreditRedemption) => {
    if (redemption.discountAmount) {
      return `$${redemption.discountAmount.toFixed(2)} off`;
    }
    if (redemption.discountPercent) {
      return `${redemption.discountPercent}% off`;
    }
    return 'Free';
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={StyleSheet.absoluteFill}>
          <View style={styles.blackBackground} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FFD700" />
        </View>
      </View>
    );
  }

  if (!club) {
    return null;
  }

  const selectedType = getRedemptionTypeInfo(formData.type);

  return (
    <View style={styles.container}>
      {/* Black Background */}
      <View style={StyleSheet.absoluteFill}>
        <View style={styles.blackBackground} />
      </View>

      {/* Gradient Overlay */}
      <LinearGradient
        colors={['rgba(255, 215, 0, 0.15)', 'rgba(255, 165, 0, 0.08)', 'rgba(0, 0, 0, 0)']}
        locations={[0, 0.3, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <BlurView intensity={40} tint="dark" style={styles.backButtonBlur}>
              <IconButton icon="arrow-left" size={24} iconColor="#fff" />
            </BlurView>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Rally Credit Rewards</Text>
            <Text style={styles.headerSubtitle}>{club.name}</Text>
          </View>
          <TouchableOpacity onPress={openCreateModal}>
            <BlurView intensity={40} tint="dark" style={styles.addButtonBlur}>
              <IconButton icon="plus" size={24} iconColor="#FFD700" />
            </BlurView>
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FFD700" />
          }
        >
          {/* Info Card */}
          <BlurView intensity={20} tint="dark" style={styles.infoCard}>
            <View style={styles.infoCardInner}>
              <View style={styles.infoIconContainer}>
                <Text style={styles.infoIcon}>⭐</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.infoTitle}>Rally Credits Redemption</Text>
                <Text style={styles.infoDescription}>
                  Set up rewards that members can redeem using their Rally Credits. Members earn credits by attending events and can spend them on the rewards you create.
                </Text>
              </View>
            </View>
          </BlurView>

          {/* Quick Stats */}
          <View style={styles.statsGrid}>
            <BlurView intensity={20} tint="dark" style={styles.statCard}>
              <View style={styles.statCardInner}>
                <Text style={styles.statValue}>{redemptions.length}</Text>
                <Text style={styles.statLabel}>Total Rewards</Text>
              </View>
            </BlurView>

            <BlurView intensity={20} tint="dark" style={styles.statCard}>
              <View style={styles.statCardInner}>
                <Text style={[styles.statValue, { color: '#10B981' }]}>
                  {redemptions.filter(r => r.isActive).length}
                </Text>
                <Text style={styles.statLabel}>Active</Text>
              </View>
            </BlurView>

            <BlurView intensity={20} tint="dark" style={styles.statCard}>
              <View style={styles.statCardInner}>
                <Text style={[styles.statValue, { color: '#F59E0B' }]}>
                  {redemptions.reduce((sum, r) => sum + r.totalRedeemed, 0)}
                </Text>
                <Text style={styles.statLabel}>Total Redeemed</Text>
              </View>
            </BlurView>
          </View>

          {/* Redemption Options */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Redemption Options</Text>
            {redemptions.length === 0 ? (
              <BlurView intensity={20} tint="dark" style={styles.emptyCard}>
                <View style={styles.emptyCardInner}>
                  <Text style={styles.emptyIcon}>🎁</Text>
                  <Text style={styles.emptyTitle}>No Redemption Options Yet</Text>
                  <Text style={styles.emptyDescription}>
                    Create your first redemption option to let members spend their Rally Credits
                  </Text>
                  <Button
                    mode="contained"
                    onPress={openCreateModal}
                    style={styles.emptyButton}
                    buttonColor="#FFD700"
                    textColor="#000"
                  >
                    Create First Reward
                  </Button>
                </View>
              </BlurView>
            ) : (
              redemptions.map((redemption) => {
                const typeInfo = getRedemptionTypeInfo(redemption.type);
                return (
                  <TouchableOpacity
                    key={redemption.id}
                    onPress={() => openEditModal(redemption)}
                    activeOpacity={0.7}
                  >
                    <BlurView intensity={20} tint="dark" style={styles.redemptionCard}>
                      <View style={styles.redemptionCardInner}>
                        <View style={styles.redemptionHeader}>
                          <View style={styles.redemptionIconContainer}>
                            <IconButton icon={typeInfo.icon} size={24} iconColor="#FFD700" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <View style={styles.redemptionTitleRow}>
                              <Text style={styles.redemptionTitle}>{redemption.name}</Text>
                              {!redemption.isActive && (
                                <Chip
                                  mode="flat"
                                  textStyle={styles.inactiveChipText}
                                  style={styles.inactiveChip}
                                >
                                  Inactive
                                </Chip>
                              )}
                            </View>
                            <Text style={styles.redemptionDescription}>
                              {redemption.description || typeInfo.description}
                            </Text>
                          </View>
                          <Switch
                            value={redemption.isActive}
                            onValueChange={() => toggleActive(redemption)}
                            trackColor={{ false: '#555', true: '#FFD700' }}
                            thumbColor={redemption.isActive ? '#FFF' : '#888'}
                          />
                        </View>

                        <View style={styles.redemptionDetails}>
                          <View style={styles.detailItem}>
                            <Text style={styles.detailLabel}>Credits Required</Text>
                            <View style={styles.creditsTag}>
                              <Text style={styles.creditsIcon}>⭐</Text>
                              <Text style={styles.creditsValue}>
                                {redemption.creditsRequired.toLocaleString()}
                              </Text>
                            </View>
                          </View>

                          <View style={styles.detailItem}>
                            <Text style={styles.detailLabel}>Value</Text>
                            <Text style={styles.detailValue}>
                              {renderRedemptionValue(redemption)}
                            </Text>
                          </View>

                          <View style={styles.detailItem}>
                            <Text style={styles.detailLabel}>Times Redeemed</Text>
                            <Text style={styles.detailValue}>{redemption.totalRedeemed}</Text>
                          </View>

                          {redemption.maxRedemptions && (
                            <View style={styles.detailItem}>
                              <Text style={styles.detailLabel}>Max Per User</Text>
                              <Text style={styles.detailValue}>{redemption.maxRedemptions}</Text>
                            </View>
                          )}
                        </View>

                        <View style={styles.cardActions}>
                          <TouchableOpacity
                            onPress={() => openEditModal(redemption)}
                            style={styles.actionButton}
                          >
                            <IconButton icon="pencil" size={20} iconColor="#60A5FA" />
                            <Text style={styles.actionButtonText}>Edit</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => handleDelete(redemption)}
                            style={styles.actionButton}
                          >
                            <IconButton icon="delete" size={20} iconColor="#EF4444" />
                            <Text style={[styles.actionButtonText, { color: '#EF4444' }]}>
                              Delete
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </BlurView>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        </ScrollView>
      </SafeAreaView>

      {/* Create/Edit Modal */}
      <Portal>
        <Modal
          visible={modalVisible}
          onDismiss={() => setModalVisible(false)}
          contentContainerStyle={styles.modal}
        >
          <View style={styles.modalBlur}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingRedemption ? 'Edit Reward' : 'Create New Reward'}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeButton}>
                <IconButton icon="close" size={24} iconColor="rgba(255, 255, 255, 0.8)" style={{ margin: 0 }} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalScrollContent}
              showsVerticalScrollIndicator={true}
              indicatorStyle="white"
            >
              <GlassInput
                label="Reward Name *"
                value={formData.name}
                onChangeText={(text) => setFormData({ ...formData, name: text })}
                placeholder="e.g., $5 Off Store Purchase"
              />

              <GlassInput
                label="Description (Optional)"
                value={formData.description}
                onChangeText={(text) => setFormData({ ...formData, description: text })}
                placeholder="Add details about this reward..."
                multiline
                numberOfLines={3}
                style={{ height: 80 }}
              />

              {/* Reward Type Picker */}
              <View style={[styles.pickerContainer, typeMenuVisible && { marginBottom: 280 }]}>
                <Text style={styles.pickerLabel}>Reward Type *</Text>
                <TouchableOpacity
                  style={styles.typeSelector}
                  onPress={() => setTypeMenuVisible(!typeMenuVisible)}
                >
                  <View style={styles.typeSelectorContent}>
                    <IconButton icon={selectedType.icon} size={20} iconColor="#FFD700" style={{ margin: 0 }} />
                    <Text style={styles.typeSelectorText}>{selectedType.label}</Text>
                  </View>
                  <IconButton
                    icon={typeMenuVisible ? 'chevron-up' : 'chevron-down'}
                    size={20}
                    iconColor="white"
                    style={{ margin: 0 }}
                  />
                </TouchableOpacity>
              </View>

              {/* Dropdown Menu - Rendered Below When Open */}
              {typeMenuVisible && (
                <>
                  {/* Tap Outside to Close Dropdown - Rendered first so it's behind */}
                  <TouchableOpacity
                    style={styles.dropdownBackdrop}
                    activeOpacity={1}
                    onPress={() => setTypeMenuVisible(false)}
                  />

                  <Animated.View
                    style={[
                      styles.dropdownStatic,
                      {
                        transform: [{ scale: scaleAnim }],
                        opacity: scaleAnim,
                      },
                    ]}
                  >
                    <View style={styles.dropdownContent}>
                      {REDEMPTION_TYPES.map((type, index) => (
                        <TouchableOpacity
                          key={type.value}
                          style={[
                            styles.dropdownItem,
                            formData.type === type.value && styles.dropdownItemSelected,
                            index === REDEMPTION_TYPES.length - 1 && styles.dropdownItemLast,
                          ]}
                          onPress={() => {
                            setFormData({ ...formData, type: type.value as any });
                            setTypeMenuVisible(false);
                          }}
                          activeOpacity={0.7}
                        >
                          <View style={styles.dropdownItemContent}>
                            <IconButton icon={type.icon} size={18} iconColor={formData.type === type.value ? '#FFD700' : 'rgba(255,255,255,0.6)'} style={{ margin: 0 }} />
                            <View style={{ flex: 1 }}>
                              <Text
                                style={[
                                  styles.dropdownItemText,
                                  formData.type === type.value && styles.dropdownItemTextSelected,
                                ]}
                              >
                                {type.label}
                              </Text>
                              <Text style={styles.dropdownItemDescription}>{type.description}</Text>
                            </View>
                          </View>
                          {formData.type === type.value && (
                            <View style={styles.checkmarkContainer}>
                              <IconButton icon="check" size={18} iconColor="#FFD700" style={{ margin: 0, padding: 0 }} />
                            </View>
                          )}
                        </TouchableOpacity>
                      ))}
                    </View>
                  </Animated.View>
                </>
              )}

              <GlassInput
                label="Credits Required *"
                value={formData.creditsRequired}
                onChangeText={(text) => setFormData({ ...formData, creditsRequired: text })}
                placeholder="e.g., 100"
                keyboardType="numeric"
                icon="star"
              />

              {['store_discount', 'event_discount'].includes(formData.type) && (
                <>
                  <GlassInput
                    label="Discount Amount (USD)"
                    value={formData.discountAmount}
                    onChangeText={(text) =>
                      setFormData({ ...formData, discountAmount: text, discountPercent: '' })
                    }
                    placeholder="e.g., 5.00"
                    keyboardType="decimal-pad"
                    icon="currency-usd"
                  />

                  <Text style={styles.orText}>OR</Text>

                  <GlassInput
                    label="Discount Percentage (%)"
                    value={formData.discountPercent}
                    onChangeText={(text) =>
                      setFormData({ ...formData, discountPercent: text, discountAmount: '' })
                    }
                    placeholder="e.g., 10"
                    keyboardType="decimal-pad"
                    icon="percent"
                  />
                </>
              )}

              <GlassInput
                label="Max Redemptions Per User (Optional)"
                value={formData.maxRedemptions}
                onChangeText={(text) => setFormData({ ...formData, maxRedemptions: text })}
                placeholder="Leave empty for unlimited"
                keyboardType="numeric"
              />

              <View style={styles.modalActions}>
                <TouchableOpacity
                  onPress={() => setModalVisible(false)}
                  style={styles.cancelButton}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleSave}
                  style={[styles.saveButton, saving && styles.saveButtonDisabled]}
                  disabled={saving}
                >
                  <Text style={styles.saveButtonText}>
                    {editingRedemption ? 'Update Reward' : 'Create Reward'}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </Modal>
      </Portal>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  backButton: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  backButtonBlur: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButtonBlur: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ffffff',
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  infoCard: {
    borderRadius: 16,
    marginBottom: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.2)',
  },
  infoCardInner: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  infoIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 215, 0, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoIcon: {
    fontSize: 24,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFD700',
    marginBottom: 6,
  },
  infoDescription: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 18,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  statCardInner: {
    padding: 16,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFD700',
  },
  statLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 4,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 16,
  },
  emptyCard: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  emptyCardInner: {
    padding: 32,
    alignItems: 'center',
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    marginBottom: 24,
  },
  emptyButton: {
    borderRadius: 8,
  },
  redemptionCard: {
    borderRadius: 16,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  redemptionCardInner: {
    padding: 16,
  },
  redemptionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
    gap: 8,
  },
  redemptionIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 215, 0, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  redemptionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  redemptionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
  redemptionDescription: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
  },
  inactiveChip: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    height: 24,
  },
  inactiveChipText: {
    fontSize: 11,
    color: '#EF4444',
    marginVertical: 0,
  },
  redemptionDetails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 12,
  },
  detailItem: {
    minWidth: '45%',
  },
  detailLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  detailValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
  },
  creditsTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 215, 0, 0.15)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    gap: 4,
  },
  creditsIcon: {
    fontSize: 12,
  },
  creditsValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFD700',
  },
  cardActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#60A5FA',
  },
  modal: {
    margin: 20,
    height: '85%',
    borderRadius: 25,
  },
  modalBlur: {
    flex: 1,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(20, 20, 20, 0.98)',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFD700',
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalScroll: {
    flex: 1,
  },
  modalScrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  pickerContainer: {
    marginBottom: 16,
    zIndex: 1000,
  },
  pickerLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: 'white',
    marginBottom: 8,
    marginLeft: 4,
  },
  typeSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    minHeight: 52,
  },
  typeSelectorContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  typeSelectorText: {
    fontSize: 16,
    fontWeight: '500',
    color: 'white',
    marginLeft: 8,
  },
  dropdownStatic: {
    marginTop: -280, // Offset to position dropdown above keyboard on mobile
    marginBottom: 16,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(20, 20, 20, 0.95)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 10,
    zIndex: 999,
  },
  dropdownContent: {
    paddingVertical: 4,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  dropdownItemLast: {
    borderBottomWidth: 0,
  },
  dropdownItemSelected: {
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
  },
  dropdownItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 8,
  },
  dropdownItemText: {
    fontSize: 15,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.8)',
  },
  dropdownItemTextSelected: {
    color: 'white',
    fontWeight: '600',
  },
  dropdownItemDescription: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
    marginTop: 2,
  },
  checkmarkContainer: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dropdownBackdrop: {
    position: 'absolute',
    top: 0,
    left: -20,
    right: -20,
    bottom: -40,
    zIndex: 998,
  },
  orText: {
    textAlign: 'center',
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    fontWeight: '600',
    marginVertical: 12,
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 32,
    paddingBottom: 8,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  saveButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: '#FFD700',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
});
