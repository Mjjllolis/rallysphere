import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Alert, Platform, TouchableOpacity, Animated, Dimensions, ScrollView, Modal, Image, Linking } from 'react-native';
import { Text, ActivityIndicator, IconButton, useTheme } from 'react-native-paper';
import type { StoreItem, RallyCreditRedemption, UserRallyCredits, ShippingAddress } from '../lib/firebase';
import { getUserRallyCredits, getClubRallyRedemptions, spendRallyCredits } from '../lib/firebase';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { usePaymentSheet } from '@stripe/stripe-react-native';
import { createStorePaymentIntent } from '../lib/stripe';
import type { StoreBreakdown } from '../lib/stripe';
import { useThemeToggle } from '../app/_layout';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface StorePaymentSheetProps {
  visible: boolean;
  item: StoreItem;
  quantity: number;
  deliveryMethod: 'shipping' | 'pickup';
  selectedAddress: ShippingAddress | null;
  selectedVariants: { [key: string]: string };
  onDismiss: () => void;
  onSuccess: () => void;
  userId: string;
}

export default function StorePaymentSheet({
  visible,
  item,
  quantity,
  deliveryMethod,
  selectedAddress,
  selectedVariants,
  onDismiss,
  onSuccess,
  userId
}: StorePaymentSheetProps) {
  const theme = useTheme();
  const { isDark } = useThemeToggle();
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  // Rally Credits state
  const [userCredits, setUserCredits] = useState<UserRallyCredits | null>(null);
  const [storeRedemptions, setStoreRedemptions] = useState<RallyCreditRedemption[]>([]);
  const [selectedReward, setSelectedReward] = useState<RallyCreditRedemption | null>(null);
  const [showRewards, setShowRewards] = useState(false);
  const [loadingRewards, setLoadingRewards] = useState(false);
  const [processing, setProcessing] = useState(false);

  // Payment state
  const [serverBreakdown, setServerBreakdown] = useState<StoreBreakdown | null>(null);
  const [initializingPayment, setInitializingPayment] = useState(false);
  const [paymentReady, setPaymentReady] = useState(false);

  // Stripe hooks
  const { initPaymentSheet, presentPaymentSheet } = usePaymentSheet();

  // Animate sheet
  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }).start();
      loadUserCredits();
      loadStoreRedemptions();
      preparePayment();
    } else {
      Animated.timing(slideAnim, {
        toValue: SCREEN_HEIGHT,
        duration: 250,
        useNativeDriver: true,
      }).start();
      setServerBreakdown(null);
      setPaymentReady(false);
    }
  }, [visible]);

  // Re-prepare payment when reward changes
  useEffect(() => {
    if (visible && userId) {
      preparePayment();
    }
  }, [selectedReward]);

  const preparePayment = async () => {
    const price = item.price || 0;
    const qty = quantity || 1;
    const itemPrice = price * qty;

    // Skip if item is free (after potential discount)
    if (itemPrice <= 0) return;

    setInitializingPayment(true);
    setPaymentReady(false);

    try {
      const rewardDiscountAmount = selectedReward
        ? selectedReward.discountPercent
          ? (itemPrice * selectedReward.discountPercent) / 100
          : Math.min(itemPrice, selectedReward.discountAmount || 0)
        : 0;

      const paymentParams: any = {
        itemId: item.id,
        quantity,
        selectedVariants,
        deliveryMethod,
        shippingAddress: deliveryMethod === 'shipping' && selectedAddress ? {
          fullName: selectedAddress.fullName,
          addressLine1: selectedAddress.addressLine1,
          addressLine2: selectedAddress.addressLine2,
          city: selectedAddress.city,
          state: selectedAddress.state,
          zipCode: selectedAddress.zipCode,
          country: selectedAddress.country || 'US',
          phone: selectedAddress.phone || '',
        } : undefined,
        rewardDiscount: selectedReward ? {
          redemptionId: selectedReward.id,
          redemptionName: selectedReward.name,
          creditsRequired: selectedReward.creditsRequired,
          discountAmount: rewardDiscountAmount,
        } : undefined,
      };

      const result = await createStorePaymentIntent(paymentParams);

      if (!result.success || !result.clientSecret) {
        setInitializingPayment(false);
        return;
      }

      if (result.breakdown) {
        setServerBreakdown(result.breakdown);
      }

      const { error: initError } = await initPaymentSheet({
        merchantDisplayName: 'RallySphere',
        paymentIntentClientSecret: result.clientSecret,
        allowsDelayedPaymentMethods: true,
        googlePay: {
          merchantCountryCode: 'US',
          testEnv: true,
        },
        applePay: {
          merchantCountryCode: 'US',
        },
      });

      if (!initError) {
        setPaymentReady(true);
      }
    } catch (error) {
      // Payment preparation failed silently
    } finally {
      setInitializingPayment(false);
    }
  };

  const loadUserCredits = async () => {
    if (!userId) return;
    const result = await getUserRallyCredits(userId);
    if (result.success && result.credits) {
      setUserCredits(result.credits);
    }
  };

  const loadStoreRedemptions = async () => {
    if (!item.clubId) return;
    setLoadingRewards(true);
    const result = await getClubRallyRedemptions(item.clubId);
    if (result.success && result.redemptions) {
      const storeDiscounts = result.redemptions.filter(
        (r: RallyCreditRedemption) => r.isActive && r.type === 'store_discount'
      );
      setStoreRedemptions(storeDiscounts);
    }
    setLoadingRewards(false);
  };

  const getAvailableCreditsForClub = () => {
    if (!userCredits || !item.clubId) return 0;
    return userCredits.clubCredits?.[item.clubId] || 0;
  };

  const canAffordReward = (reward: RallyCreditRedemption) => {
    return getAvailableCreditsForClub() >= reward.creditsRequired;
  };

  const getRewardDescription = (reward: RallyCreditRedemption): string => {
    const typeLabel = reward.type === 'store_discount' ? 'Store Discount' : '';

    let discountValue = '';
    if (reward.discountPercent) {
      discountValue = `${reward.discountPercent}% off`;
    } else if (reward.discountAmount) {
      discountValue = `$${reward.discountAmount.toFixed(2)} off`;
    } else {
      discountValue = 'Discount';
    }

    return typeLabel ? `${discountValue} (${typeLabel})` : discountValue;
  };

  const handleApplyReward = (reward: RallyCreditRedemption) => {
    if (!canAffordReward(reward)) {
      Alert.alert('Not Enough Credits', `You need ${reward.creditsRequired} credits to redeem this reward.`);
      return;
    }
    setSelectedReward(reward);
    setShowRewards(false);
  };

  const handleRemoveReward = () => {
    setSelectedReward(null);
  };

  const calculateTotal = () => {
    const price = item.price || 0;
    const qty = quantity || 1;
    const itemPrice = price * qty;
    const shipping = deliveryMethod === 'shipping' ? (item.shippingCost || 0) : 0;

    let rewardDiscount = 0;
    if (selectedReward) {
      if (selectedReward.discountPercent) {
        rewardDiscount = (itemPrice * selectedReward.discountPercent) / 100;
      } else if (selectedReward.discountAmount) {
        rewardDiscount = Math.min(itemPrice + shipping, selectedReward.discountAmount);
      }
    }

    const subtotal = Math.max(0, itemPrice - rewardDiscount);

    // Tax and processing fee come from server (Stripe Tax)
    const tax = serverBreakdown?.tax ?? 0;
    const processingFee = serverBreakdown?.processingFee ?? 0;
    const total = serverBreakdown?.totalAmount ?? (subtotal + shipping + tax + processingFee);

    return {
      itemPrice,
      shipping,
      rewardDiscount,
      subtotal,
      tax,
      processingFee,
      total
    };
  };

  const handlePurchase = async () => {
    if (!userId) return;

    const { total } = calculateTotal();

    setProcessing(true);

    try {
      // If total is $0 after discount, handle free purchase
      if (total === 0) {
        if (selectedReward) {
          await spendRallyCredits(
            userId,
            item.clubId,
            selectedReward.creditsRequired,
            selectedReward.id,
            `Store discount: ${item.name}`
          );
        }
        Alert.alert('Success!', 'Your order has been placed successfully.');
        onSuccess();
        onDismiss();
        setProcessing(false);
        return;
      }

      if (!paymentReady) {
        Alert.alert('Please Wait', 'Payment is still being prepared. Please try again in a moment.');
        setProcessing(false);
        return;
      }

      // Present Payment Sheet (already initialized in preparePayment)
      const { error: presentError } = await presentPaymentSheet();

      if (presentError) {
        if (presentError.code !== 'Canceled') {
          Alert.alert('Payment Failed', presentError.message);
        }
        setProcessing(false);
        return;
      }

      // Spend Rally Credits if reward was applied
      if (selectedReward) {
        try {
          await spendRallyCredits(
            userId,
            item.clubId,
            selectedReward.creditsRequired,
            selectedReward.id,
            `Store discount: ${item.name}`
          );
        } catch (error) {
          // Error spending credits
        }
      }

      Alert.alert('Purchase Successful!', 'Your order has been placed successfully.');
      onSuccess();
      onDismiss();
    } catch (error) {
      Alert.alert('Error', 'Failed to process payment');
    } finally {
      setProcessing(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onDismiss} />
        <Animated.View
          style={[
            styles.sheet,
            {
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <BlurView intensity={80} tint={isDark ? "dark" : "light"} style={styles.sheetBlur}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: theme.colors.outline }]}>
              <Text style={[styles.headerText, { color: theme.colors.onSurface }]}>Confirm Purchase</Text>
              <TouchableOpacity onPress={onDismiss}>
                <IconButton icon="close" iconColor={theme.colors.onSurface} size={24} style={{ margin: 0 }} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
              {/* Product Info */}
              <View style={styles.section}>
                <View style={styles.productRow}>
                  {item.images && item.images.length > 0 && (
                    <Image source={{ uri: item.images[0] }} style={[styles.productImage, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)' }]} />
                  )}
                  <View style={styles.productInfo}>
                    <Text style={[styles.productName, { color: theme.colors.onSurface }]}>{item.name}</Text>
                    <Text style={[styles.productClub, { color: theme.colors.onSurfaceVariant }]}>{item.clubName}</Text>
                    <Text style={[styles.productQuantity, { color: theme.colors.onSurfaceVariant }]}>Quantity: {quantity}</Text>
                  </View>
                </View>
              </View>

              <View style={[styles.divider, { backgroundColor: theme.colors.outline }]} />

              {/* Delivery Method */}
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: theme.colors.onSurfaceVariant }]}>Pickup Location</Text>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => {
                    const address = item.pickupAddress;
                    if (!address) return;
                    const encoded = encodeURIComponent(address);
                    const url = Platform.select({
                      ios: `maps:0,0?q=${encoded}`,
                      android: `geo:0,0?q=${encoded}`,
                      default: `https://maps.google.com/?q=${encoded}`,
                    });
                    Linking.openURL(url);
                  }}
                >
                  <View style={styles.deliveryBadge}>
                    <Ionicons
                      name="location"
                      size={16}
                      color="#60A5FA"
                    />
                    <Text style={[styles.deliveryText, { textDecorationLine: 'underline' }]}>
                      {item.pickupAddress || 'Location TBD'}
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>

              <View style={[styles.divider, { backgroundColor: theme.colors.outline }]} />

              {/* Rally Credit Rewards Section */}
              {storeRedemptions.length > 0 && (
                <>
                  <View style={styles.section}>
                    <Text style={[styles.sectionTitle, { color: theme.colors.onSurfaceVariant }]}>Rally Credit Rewards</Text>

                    {selectedReward ? (
                      <View style={styles.appliedReward}>
                        <LinearGradient
                          colors={['rgba(255, 215, 0, 0.15)', 'rgba(255, 165, 0, 0.1)']}
                          style={styles.appliedRewardGradient}
                        >
                          <View style={styles.appliedRewardContent}>
                            <View style={styles.appliedRewardLeft}>
                              <Ionicons name="star" size={20} color="#FFD700" />
                              <View style={styles.appliedRewardInfo}>
                                <Text style={[styles.appliedRewardName, { color: theme.colors.onSurface }]}>{selectedReward.name}</Text>
                                <Text style={[styles.appliedRewardValue, { color: theme.colors.onSurfaceVariant }]}>
                                  {getRewardDescription(selectedReward)} • {selectedReward.creditsRequired} credits
                                </Text>
                              </View>
                            </View>
                            <TouchableOpacity onPress={handleRemoveReward}>
                              <IconButton icon="close" size={18} iconColor="#F59E0B" style={{ margin: 0 }} />
                            </TouchableOpacity>
                          </View>
                        </LinearGradient>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={[styles.showRewardsButton, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)' }]}
                        onPress={() => setShowRewards(!showRewards)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="star" size={20} color="#F59E0B" />
                        <View style={styles.showRewardsInfo}>
                          <Text style={[styles.showRewardsText, { color: theme.colors.onSurface }]}>Apply Reward</Text>
                          <Text style={[styles.showRewardsSubtext, { color: theme.colors.onSurfaceVariant }]}>
                            You have {getAvailableCreditsForClub()} credits for this club
                          </Text>
                        </View>
                        <IconButton
                          icon={showRewards ? 'chevron-up' : 'chevron-down'}
                          size={24}
                          iconColor="#F59E0B"
                          style={{ margin: 0 }}
                        />
                      </TouchableOpacity>
                    )}

                    {showRewards && !selectedReward && (
                      <View style={styles.rewardsList}>
                        {loadingRewards ? (
                          <ActivityIndicator size="small" color="#F59E0B" style={{ padding: 20 }} />
                        ) : (
                          storeRedemptions.map((reward) => {
                            const canAfford = canAffordReward(reward);
                            return (
                              <TouchableOpacity
                                key={reward.id}
                                style={[styles.rewardItem, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)', borderColor: canAfford ? 'rgba(255, 215, 0, 0.2)' : theme.colors.outline }, !canAfford && styles.rewardItemDisabled]}
                                onPress={() => handleApplyReward(reward)}
                                disabled={!canAfford}
                                activeOpacity={0.7}
                              >
                                <View style={styles.rewardItemContent}>
                                  <View style={styles.rewardItemLeft}>
                                    <View style={[styles.rewardItemIcon, !canAfford && { opacity: 0.5 }]}>
                                      <Ionicons name="pricetag" size={20} color="#FFD700" />
                                    </View>
                                    <View style={styles.rewardItemInfo}>
                                      <Text style={[styles.rewardItemName, { color: theme.colors.onSurface }, !canAfford && { opacity: 0.5 }]}>
                                        {reward.name}
                                      </Text>
                                      <Text style={[styles.rewardItemValue, { color: theme.colors.onSurfaceVariant }, !canAfford && { opacity: 0.5 }]}>
                                        {getRewardDescription(reward)}
                                      </Text>
                                    </View>
                                  </View>
                                  <View style={styles.rewardItemRight}>
                                    <View style={[styles.creditsBadge, !canAfford && styles.creditsBadgeDisabled]}>
                                      <Ionicons name="star" size={12} color={canAfford ? '#FFD700' : theme.colors.onSurfaceDisabled} />
                                      <Text style={[styles.creditsBadgeText, !canAfford && { color: theme.colors.onSurfaceDisabled }]}>
                                        {reward.creditsRequired}
                                      </Text>
                                    </View>
                                    {!canAfford && (
                                      <Text style={styles.notEnoughCredits}>Not enough credits</Text>
                                    )}
                                  </View>
                                </View>
                              </TouchableOpacity>
                            );
                          })
                        )}
                      </View>
                    )}
                  </View>
                  <View style={[styles.divider, { backgroundColor: theme.colors.outline }]} />
                </>
              )}

              {/* Price Breakdown */}
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: theme.colors.onSurfaceVariant }]}>Price Breakdown</Text>

                <View style={styles.breakdownRow}>
                  <Text style={[styles.breakdownLabel, { color: theme.colors.onSurfaceVariant }]}>Item Price</Text>
                  <Text style={[styles.breakdownValue, { color: theme.colors.onSurface }, selectedReward && styles.strikethrough]}>
                    ${item.price.toFixed(2)}
                  </Text>
                </View>

                <View style={styles.breakdownRow}>
                  <Text style={[styles.breakdownLabel, { color: theme.colors.onSurfaceVariant }]}>Quantity</Text>
                  <Text style={[styles.breakdownValue, { color: theme.colors.onSurface }]}>×{quantity}</Text>
                </View>

                <View style={styles.breakdownRow}>
                  <Text style={[styles.breakdownLabel, { color: theme.colors.onSurfaceVariant }]}>Subtotal</Text>
                  <Text style={[styles.breakdownValue, { color: theme.colors.onSurface }, selectedReward && styles.strikethrough]}>
                    ${calculateTotal().itemPrice.toFixed(2)}
                  </Text>
                </View>

                {selectedReward && calculateTotal().rewardDiscount > 0 && (
                  <View style={styles.breakdownRow}>
                    <Text style={[styles.breakdownLabel, { color: theme.colors.onSurfaceVariant }]}>Reward Discount</Text>
                    <Text style={[styles.breakdownValue, { color: '#10B981' }]}>
                      -${calculateTotal().rewardDiscount.toFixed(2)}
                    </Text>
                  </View>
                )}

                <View style={styles.breakdownRow}>
                  <Text style={[styles.breakdownLabel, { color: theme.colors.onSurfaceVariant }]}>Tax</Text>
                  <Text style={[styles.breakdownValue, { color: theme.colors.onSurface }]}>
                    {initializingPayment ? 'Calculating...' : `$${calculateTotal().tax.toFixed(2)}`}
                  </Text>
                </View>

                <View style={styles.breakdownRow}>
                  <Text style={[styles.breakdownLabel, { color: theme.colors.onSurfaceVariant }]}>Service Fee (10% + $0.29)</Text>
                  <Text style={[styles.breakdownValue, { color: '#EF4444' }]}>
                    ${calculateTotal().processingFee.toFixed(2)}
                  </Text>
                </View>

                <View style={[styles.divider, { backgroundColor: theme.colors.outline }]} />

                <View style={styles.breakdownRow}>
                  <Text style={[styles.totalLabel, { color: theme.colors.onSurface }]}>Total</Text>
                  <Text style={styles.totalValue}>
                    ${calculateTotal().total.toFixed(2)}
                  </Text>
                </View>
              </View>
            </ScrollView>

            {/* Footer */}
            <View style={[styles.footer, { borderTopColor: theme.colors.outline }]}>
              <TouchableOpacity
                style={styles.purchaseButton}
                onPress={handlePurchase}
                disabled={processing || initializingPayment}
                activeOpacity={0.8}
              >
                <LinearGradient colors={['#EF4444', '#DC2626']} style={[styles.purchaseButtonGradient, initializingPayment && { opacity: 0.6 }]}>
                  {processing || initializingPayment ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text style={styles.purchaseButtonText}>
                      {calculateTotal().total === 0 ? 'Confirm (Free)' : `Pay $${calculateTotal().total.toFixed(2)}`}
                    </Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </BlurView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  backdrop: {
    flex: 1,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: SCREEN_HEIGHT * 0.9,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  sheetBlur: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
  },
  headerText: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  scrollView: {
    maxHeight: SCREEN_HEIGHT * 0.6,
  },
  section: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  productRow: {
    flexDirection: 'row',
    gap: 16,
  },
  productInfo: {
    flex: 1,
  },
  productImage: {
    width: 70,
    height: 70,
    borderRadius: 8,
  },
  productName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  productClub: {
    fontSize: 14,
    marginBottom: 4,
  },
  productQuantity: {
    fontSize: 14,
  },
  divider: {
    height: 1,
  },
  deliveryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(96, 165, 250, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    alignSelf: 'flex-start',
    gap: 8,
    marginBottom: 12,
  },
  deliveryText: {
    fontSize: 14,
    color: '#60A5FA',
    fontWeight: '600',
  },
  addressCard: {
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
  },
  addressName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  addressText: {
    fontSize: 14,
    marginTop: 2,
  },
  appliedReward: {
    marginTop: 8,
  },
  appliedRewardGradient: {
    borderRadius: 12,
    padding: 16,
  },
  appliedRewardContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  appliedRewardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  appliedRewardInfo: {
    marginLeft: 12,
    flex: 1,
  },
  appliedRewardName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  appliedRewardValue: {
    fontSize: 14,
  },
  showRewardsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
  },
  showRewardsInfo: {
    flex: 1,
    marginLeft: 12,
  },
  showRewardsText: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  showRewardsSubtext: {
    fontSize: 14,
  },
  rewardsList: {
    marginTop: 12,
    gap: 8,
  },
  rewardItem: {
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
  },
  rewardItemDisabled: {
    opacity: 0.5,
  },
  rewardItemContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rewardItemInfo: {
    flex: 1,
    marginLeft: 12,
  },
  rewardItemName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  rewardItemValue: {
    fontSize: 14,
  },
  rewardItemRight: {
    alignItems: 'flex-end',
    marginLeft: 12,
  },
  creditsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 215, 0, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 4,
  },
  creditsBadgeDisabled: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  creditsBadgeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFD700',
  },
  notEnoughCredits: {
    fontSize: 12,
    color: '#EF4444',
    marginTop: 4,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  breakdownLabel: {
    fontSize: 16,
  },
  breakdownValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  strikethrough: {
    textDecorationLine: 'line-through',
    opacity: 0.5,
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  totalValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#10B981',
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
  },
  purchaseButton: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  purchaseButtonGradient: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  purchaseButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
  },
});
