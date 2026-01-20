import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Alert, Platform, TouchableOpacity, Animated, Dimensions, ScrollView, Modal, Image } from 'react-native';
import { Text, ActivityIndicator, IconButton } from 'react-native-paper';
import type { StoreItem, RallyCreditRedemption, UserRallyCredits, ShippingAddress } from '../lib/firebase';
import { getUserRallyCredits, getClubRallyRedemptions, spendRallyCredits } from '../lib/firebase';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { usePaymentSheet } from '@stripe/stripe-react-native';
import { createStorePaymentIntent } from '../lib/stripe';

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
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  // Rally Credits state
  const [userCredits, setUserCredits] = useState<UserRallyCredits | null>(null);
  const [storeRedemptions, setStoreRedemptions] = useState<RallyCreditRedemption[]>([]);
  const [selectedReward, setSelectedReward] = useState<RallyCreditRedemption | null>(null);
  const [showRewards, setShowRewards] = useState(false);
  const [loadingRewards, setLoadingRewards] = useState(false);
  const [processing, setProcessing] = useState(false);

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
    } else {
      Animated.timing(slideAnim, {
        toValue: SCREEN_HEIGHT,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

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

    // ORIGINAL price before any discount (for fee calculation)
    const originalItemAndShipping = itemPrice + shipping;

    let rewardDiscount = 0;
    if (selectedReward) {
      if (selectedReward.discountPercent) {
        rewardDiscount = (itemPrice * selectedReward.discountPercent) / 100;
      } else if (selectedReward.discountAmount) {
        rewardDiscount = Math.min(itemPrice + shipping, selectedReward.discountAmount);
      }
    }

    // Calculate subtotal after discount
    const subtotal = Math.max(0, itemPrice - rewardDiscount);
    const itemAndShipping = subtotal + shipping;

    // Calculate tax on item + shipping (after discount)
    const taxRate = item.taxRate || 0;
    const tax = Math.round(itemAndShipping * (taxRate / 100) * 100) / 100;

    const PROCESSING_FEE_PERCENTAGE = 0.06;  // 6%
    const PROCESSING_FEE_FIXED = 0.29;  // $0.29
    const processingFee = Math.round(((originalItemAndShipping * PROCESSING_FEE_PERCENTAGE) + PROCESSING_FEE_FIXED) * 100) / 100;

    // Total: discounted item + shipping + tax + processing fee (on original)
    const total = Math.round((itemAndShipping + tax + processingFee) * 100) / 100;

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

      // Create payment intent
      const paymentParams = {
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
          discountAmount: calculateTotal().rewardDiscount,
        } : undefined,
      };

      console.log('Store payment params:', JSON.stringify(paymentParams, null, 2));
      console.log('Item price:', item.price, 'Quantity:', quantity, 'Total:', total);

      const paymentIntentResult = await createStorePaymentIntent(paymentParams);

      if (!paymentIntentResult.success || !paymentIntentResult.clientSecret) {
        Alert.alert('Error', paymentIntentResult.error || 'Failed to initialize payment');
        setProcessing(false);
        return;
      }

      // Initialize Payment Sheet
      const { error: initError } = await initPaymentSheet({
        merchantDisplayName: 'RallySphere',
        paymentIntentClientSecret: paymentIntentResult.clientSecret,
        allowsDelayedPaymentMethods: true,
        googlePay: {
          merchantCountryCode: 'US',
          testEnv: true,
        },
        applePay: {
          merchantCountryCode: 'US',
        },
      });

      if (initError) {
        Alert.alert('Error', initError.message);
        setProcessing(false);
        return;
      }

      // Present Payment Sheet
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
          console.error('Error spending credits:', error);
        }
      }

      Alert.alert('Purchase Successful!', 'Your order has been placed successfully.');
      onSuccess();
      onDismiss();
    } catch (error) {
      console.error('Error processing payment:', error);
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
          <BlurView intensity={80} tint="dark" style={styles.sheetBlur}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.headerText}>Confirm Purchase</Text>
              <TouchableOpacity onPress={onDismiss}>
                <IconButton icon="close" iconColor="white" size={24} style={{ margin: 0 }} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
              {/* Product Info */}
              <View style={styles.section}>
                <View style={styles.productRow}>
                  {item.images && item.images.length > 0 && (
                    <Image source={{ uri: item.images[0] }} style={styles.productImage} />
                  )}
                  <View style={styles.productInfo}>
                    <Text style={styles.productName}>{item.name}</Text>
                    <Text style={styles.productClub}>{item.clubName}</Text>
                    <Text style={styles.productQuantity}>Quantity: {quantity}</Text>
                  </View>
                </View>
              </View>

              <View style={styles.divider} />

              {/* Delivery Method */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Delivery Method</Text>
                <View style={styles.deliveryBadge}>
                  <Ionicons
                    name={deliveryMethod === 'shipping' ? 'car' : 'location'}
                    size={16}
                    color="#60A5FA"
                  />
                  <Text style={styles.deliveryText}>
                    {deliveryMethod === 'shipping' ? 'Shipping' : 'Pickup'}
                  </Text>
                </View>

                {deliveryMethod === 'shipping' && selectedAddress && (
                  <View style={styles.addressCard}>
                    <Text style={styles.addressName}>{selectedAddress.fullName}</Text>
                    <Text style={styles.addressText}>{selectedAddress.addressLine1}</Text>
                    <Text style={styles.addressText}>
                      {selectedAddress.city}, {selectedAddress.state} {selectedAddress.zipCode}
                    </Text>
                  </View>
                )}
              </View>

              <View style={styles.divider} />

              {/* Rally Credit Rewards Section */}
              {storeRedemptions.length > 0 && (
                <>
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Rally Credit Rewards</Text>

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
                                <Text style={styles.appliedRewardName}>{selectedReward.name}</Text>
                                <Text style={styles.appliedRewardValue}>
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
                        style={styles.showRewardsButton}
                        onPress={() => setShowRewards(!showRewards)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="star" size={20} color="#F59E0B" />
                        <View style={styles.showRewardsInfo}>
                          <Text style={styles.showRewardsText}>Apply Reward</Text>
                          <Text style={styles.showRewardsSubtext}>
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
                                style={[styles.rewardItem, !canAfford && styles.rewardItemDisabled]}
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
                                      <Text style={[styles.rewardItemName, !canAfford && { opacity: 0.5 }]}>
                                        {reward.name}
                                      </Text>
                                      <Text style={[styles.rewardItemValue, !canAfford && { opacity: 0.5 }]}>
                                        {getRewardDescription(reward)}
                                      </Text>
                                    </View>
                                  </View>
                                  <View style={styles.rewardItemRight}>
                                    <View style={[styles.creditsBadge, !canAfford && styles.creditsBadgeDisabled]}>
                                      <Ionicons name="star" size={12} color={canAfford ? '#FFD700' : '#999'} />
                                      <Text style={[styles.creditsBadgeText, !canAfford && { color: '#999' }]}>
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
                  <View style={styles.divider} />
                </>
              )}

              {/* Price Breakdown */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Price Breakdown</Text>

                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>Item Price</Text>
                  <Text style={[styles.breakdownValue, selectedReward && styles.strikethrough]}>
                    ${item.price.toFixed(2)}
                  </Text>
                </View>

                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>Quantity</Text>
                  <Text style={styles.breakdownValue}>×{quantity}</Text>
                </View>

                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>Subtotal</Text>
                  <Text style={[styles.breakdownValue, selectedReward && styles.strikethrough]}>
                    ${calculateTotal().itemPrice.toFixed(2)}
                  </Text>
                </View>

                {selectedReward && calculateTotal().rewardDiscount > 0 && (
                  <View style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel}>Reward Discount</Text>
                    <Text style={[styles.breakdownValue, { color: '#10B981' }]}>
                      -${calculateTotal().rewardDiscount.toFixed(2)}
                    </Text>
                  </View>
                )}

                {calculateTotal().shipping > 0 && (
                  <View style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel}>Shipping</Text>
                    <Text style={styles.breakdownValue}>
                      ${calculateTotal().shipping.toFixed(2)}
                    </Text>
                  </View>
                )}

                {calculateTotal().tax > 0 && (
                  <View style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel}>Tax</Text>
                    <Text style={styles.breakdownValue}>
                      ${calculateTotal().tax.toFixed(2)}
                    </Text>
                  </View>
                )}

                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>Processing Fee</Text>
                  <Text style={[styles.breakdownValue, { color: '#EF4444' }]}>
                    ${calculateTotal().processingFee.toFixed(2)}
                  </Text>
                </View>

                <View style={styles.divider} />

                <View style={styles.breakdownRow}>
                  <Text style={styles.totalLabel}>Total</Text>
                  <Text style={styles.totalValue}>
                    ${calculateTotal().total.toFixed(2)}
                  </Text>
                </View>
              </View>
            </ScrollView>

            {/* Footer */}
            <View style={styles.footer}>
              <TouchableOpacity
                style={styles.purchaseButton}
                onPress={handlePurchase}
                disabled={processing}
                activeOpacity={0.8}
              >
                <LinearGradient colors={['#EF4444', '#DC2626']} style={styles.purchaseButtonGradient}>
                  {processing ? (
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
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  headerText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
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
    color: 'rgba(255, 255, 255, 0.7)',
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
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  productName: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
    marginBottom: 4,
  },
  productClub: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
    marginBottom: 4,
  },
  productQuantity: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
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
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  addressName: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
    marginBottom: 4,
  },
  addressText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
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
    color: 'white',
    marginBottom: 4,
  },
  appliedRewardValue: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  showRewardsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
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
    color: 'white',
    marginBottom: 4,
  },
  showRewardsSubtext: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  rewardsList: {
    marginTop: 12,
    gap: 8,
  },
  rewardItem: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.2)',
  },
  rewardItemDisabled: {
    opacity: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.1)',
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
    color: 'white',
    marginBottom: 4,
  },
  rewardItemValue: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
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
    color: 'rgba(255, 255, 255, 0.7)',
  },
  breakdownValue: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  strikethrough: {
    textDecorationLine: 'line-through',
    color: 'rgba(255, 255, 255, 0.5)',
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
  },
  totalValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#10B981',
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
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
