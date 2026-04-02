import React, { useState, useEffect, useRef } from 'react';
import {
  View, StyleSheet, Alert, Platform, TouchableOpacity,
  Animated, Dimensions, ScrollView, Modal, Image, Linking,
} from 'react-native';
import { Text, ActivityIndicator, IconButton, useTheme } from 'react-native-paper';
import { WebView } from 'react-native-webview';
import type { StoreItem, RallyCreditRedemption, UserRallyCredits, ShippingAddress } from '../lib/firebase';
import { getUserRallyCredits, getClubRallyRedemptions, spendRallyCredits } from '../lib/firebase';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { getBraintreeClientToken, createStoreTransaction } from '../lib/stripe';
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

function buildDropInHtml(clientToken: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: transparent; padding: 8px 0; }
    .loading { text-align: center; padding: 16px; color: #64748B; font-size: 13px; }
    .error { color: #DC2626; padding: 8px 0; font-size: 13px; display: none; }
  </style>
</head>
<body>
  <div id="dropin-container"></div>
  <div id="error" class="error"></div>
  <div id="loading" class="loading">Loading payment form...</div>
  <script src="https://js.braintreegateway.com/web/dropin/1.42.0/js/dropin.min.js"></script>
  <script>
    braintree.dropin.create({
      authorization: '${clientToken}',
      container: '#dropin-container',
      card: { cardholderName: { required: false } }
    }, function(createErr, dropinInstance) {
      document.getElementById('loading').style.display = 'none';
      if (createErr) {
        document.getElementById('error').style.display = 'block';
        document.getElementById('error').textContent = createErr.message;
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready', ready: false, error: createErr.message }));
        return;
      }
      window._dropinInstance = dropinInstance;
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready', ready: true }));
    });
    window.requestNonce = function() {
      if (!window._dropinInstance) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', message: 'Payment form not ready' }));
        return;
      }
      window._dropinInstance.requestPaymentMethod(function(err, payload) {
        if (err) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', message: err.message }));
          return;
        }
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'nonce', nonce: payload.nonce }));
      });
    };
  </script>
</body>
</html>`;
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
  userId,
}: StorePaymentSheetProps) {
  const theme = useTheme();
  const { isDark } = useThemeToggle();
  const webViewRef = useRef<any>(null);
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  const [userCredits, setUserCredits] = useState<UserRallyCredits | null>(null);
  const [storeRedemptions, setStoreRedemptions] = useState<RallyCreditRedemption[]>([]);
  const [selectedReward, setSelectedReward] = useState<RallyCreditRedemption | null>(null);
  const [showRewards, setShowRewards] = useState(false);
  const [loadingRewards, setLoadingRewards] = useState(false);
  const [processing, setProcessing] = useState(false);

  const [serverBreakdown, setServerBreakdown] = useState<StoreBreakdown | null>(null);
  const [clientToken, setClientToken] = useState<string | null>(null);
  const [dropInReady, setDropInReady] = useState(false);
  const [initializingPayment, setInitializingPayment] = useState(false);

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start();
      loadUserCredits();
      loadStoreRedemptions();
      initPayment();
    } else {
      Animated.timing(slideAnim, { toValue: SCREEN_HEIGHT, duration: 250, useNativeDriver: true }).start();
      setServerBreakdown(null);
      setClientToken(null);
      setDropInReady(false);
      setSelectedReward(null);
    }
  }, [visible]);

  useEffect(() => {
    if (visible && userId) {
      calculateBreakdown();
    }
  }, [selectedReward]);

  const initPayment = async () => {
    setInitializingPayment(true);
    try {
      const result = await getBraintreeClientToken();
      if (result.success && result.clientToken) {
        setClientToken(result.clientToken);
        await calculateBreakdown();
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to initialize payment');
    } finally {
      setInitializingPayment(false);
    }
  };

  const calculateBreakdown = async () => {
    const price = item.price || 0;
    const qty = quantity || 1;
    const itemPrice = price * qty;
    const shipping = deliveryMethod === 'shipping' ? (item.shippingCost || 0) : 0;

    let rewardDiscountAmount = 0;
    if (selectedReward) {
      rewardDiscountAmount = selectedReward.discountPercent
        ? (itemPrice * selectedReward.discountPercent) / 100
        : Math.min(itemPrice, selectedReward.discountAmount || 0);
    }

    const subtotal = Math.max(0, itemPrice - rewardDiscountAmount);
    const SERVICE_FEE_PERCENTAGE = 0.10;
    const SERVICE_FEE_FIXED = 0.29;
    const originalItemAndShipping = itemPrice + shipping;
    const processingFee = Math.round(((originalItemAndShipping * SERVICE_FEE_PERCENTAGE) + SERVICE_FEE_FIXED) * 100) / 100;
    const totalAmount = subtotal + shipping + processingFee;

    setServerBreakdown({
      subtotal,
      shipping,
      tax: 0,
      processingFee,
      platformFee: 0,
      clubReceives: subtotal + shipping,
      totalAmount,
    });
  };

  const loadUserCredits = async () => {
    if (!userId) return;
    const result = await getUserRallyCredits(userId);
    if (result.success && result.credits) setUserCredits(result.credits);
  };

  const loadStoreRedemptions = async () => {
    if (!item.clubId) return;
    setLoadingRewards(true);
    const result = await getClubRallyRedemptions(item.clubId);
    if (result.success && result.redemptions) {
      setStoreRedemptions(result.redemptions.filter(
        (r: RallyCreditRedemption) => r.isActive && r.type === 'store_discount'
      ));
    }
    setLoadingRewards(false);
  };

  const getAvailableCreditsForClub = () => {
    if (!userCredits || !item.clubId) return 0;
    return userCredits.clubCredits?.[item.clubId] || 0;
  };

  const canAffordReward = (reward: RallyCreditRedemption) =>
    getAvailableCreditsForClub() >= reward.creditsRequired;

  const getRewardDescription = (reward: RallyCreditRedemption): string => {
    if (reward.discountPercent) return `${reward.discountPercent}% off`;
    if (reward.discountAmount) return `$${reward.discountAmount.toFixed(2)} off`;
    return 'Discount';
  };

  const handleApplyReward = (reward: RallyCreditRedemption) => {
    if (!canAffordReward(reward)) {
      Alert.alert('Not Enough Credits', `You need ${reward.creditsRequired} credits to redeem this reward.`);
      return;
    }
    setSelectedReward(reward);
    setShowRewards(false);
  };

  const calculateTotal = () => {
    const price = item.price || 0;
    const qty = quantity || 1;
    const itemPrice = price * qty;
    const shipping = deliveryMethod === 'shipping' ? (item.shippingCost || 0) : 0;

    let rewardDiscount = 0;
    if (selectedReward) {
      rewardDiscount = selectedReward.discountPercent
        ? (itemPrice * selectedReward.discountPercent) / 100
        : Math.min(itemPrice + shipping, selectedReward.discountAmount || 0);
    }

    const subtotal = Math.max(0, itemPrice - rewardDiscount);
    const tax = serverBreakdown?.tax ?? 0;
    const processingFee = serverBreakdown?.processingFee ?? 0;
    const total = serverBreakdown?.totalAmount ?? (subtotal + shipping + tax + processingFee);

    return { itemPrice, shipping, rewardDiscount, subtotal, tax, processingFee, total };
  };

  const handleWebViewMessage = async (event_: any) => {
    try {
      const msg = JSON.parse(event_.nativeEvent.data);
      if (msg.type === 'ready') {
        setDropInReady(msg.ready);
        if (!msg.ready) Alert.alert('Error', msg.error || 'Failed to load payment form');
      } else if (msg.type === 'nonce') {
        await processPaymentWithNonce(msg.nonce);
      } else if (msg.type === 'error') {
        setProcessing(false);
        Alert.alert('Payment Error', msg.message || 'An error occurred');
      }
    } catch (e) { /* ignore */ }
  };

  const processPaymentWithNonce = async (nonce: string) => {
    try {
      const result = await createStoreTransaction({
        paymentMethodNonce: nonce,
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
          discountAmount: selectedReward.discountPercent
            ? (item.price * quantity * selectedReward.discountPercent) / 100
            : Math.min(item.price * quantity, selectedReward.discountAmount || 0),
        } : undefined,
      });

      if (result.success) {
        if (selectedReward) {
          await spendRallyCredits(userId, item.clubId, selectedReward.creditsRequired,
            selectedReward.id, `Store discount: ${item.name}`).catch(() => {});
        }
        Alert.alert('Purchase Successful!', 'Your order has been placed successfully.');
        onSuccess();
        onDismiss();
      } else {
        Alert.alert('Payment Failed', result.error || 'An error occurred during payment');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to process payment');
    } finally {
      setProcessing(false);
    }
  };

  const handlePurchase = () => {
    if (!userId) return;
    const { total } = calculateTotal();

    if (total === 0) {
      setProcessing(true);
      processPaymentWithNonce('free_nonce');
      return;
    }

    if (!dropInReady) {
      Alert.alert('Please Wait', 'Payment is still being prepared. Please try again in a moment.');
      return;
    }

    setProcessing(true);
    webViewRef.current?.injectJavaScript('window.requestNonce(); true;');
  };

  if (!visible) return null;

  const totals = calculateTotal();

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onDismiss} />
        <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
          <BlurView intensity={80} tint={isDark ? 'dark' : 'light'} style={styles.sheetBlur}>
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
                    <Image source={{ uri: item.images[0] }} style={[styles.productImage, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]} />
                  )}
                  <View style={styles.productInfo}>
                    <Text style={[styles.productName, { color: theme.colors.onSurface }]}>{item.name}</Text>
                    <Text style={[styles.productClub, { color: theme.colors.onSurfaceVariant }]}>{item.clubName}</Text>
                    <Text style={[styles.productQuantity, { color: theme.colors.onSurfaceVariant }]}>Quantity: {quantity}</Text>
                  </View>
                </View>
              </View>

              <View style={[styles.divider, { backgroundColor: theme.colors.outline }]} />

              {/* Delivery */}
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: theme.colors.onSurfaceVariant }]}>
                  {deliveryMethod === 'pickup' ? 'Pickup Location' : 'Shipping Address'}
                </Text>
                {deliveryMethod === 'pickup' ? (
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
                      }) || `https://maps.google.com/?q=${encoded}`;
                      Linking.openURL(url);
                    }}
                  >
                    <View style={styles.deliveryBadge}>
                      <Ionicons name="location" size={16} color="#60A5FA" />
                      <Text style={[styles.deliveryText, { textDecorationLine: 'underline' }]}>
                        {item.pickupAddress || 'Location TBD'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ) : selectedAddress ? (
                  <View style={[styles.addressCard, { borderColor: theme.colors.outline, backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)' }]}>
                    <Text style={[styles.addressName, { color: theme.colors.onSurface }]}>{selectedAddress.fullName}</Text>
                    <Text style={[styles.addressText, { color: theme.colors.onSurfaceVariant }]}>{selectedAddress.addressLine1}</Text>
                    {selectedAddress.addressLine2 && <Text style={[styles.addressText, { color: theme.colors.onSurfaceVariant }]}>{selectedAddress.addressLine2}</Text>}
                    <Text style={[styles.addressText, { color: theme.colors.onSurfaceVariant }]}>
                      {selectedAddress.city}, {selectedAddress.state} {selectedAddress.zipCode}
                    </Text>
                  </View>
                ) : null}
              </View>

              <View style={[styles.divider, { backgroundColor: theme.colors.outline }]} />

              {/* Rally Credits Rewards */}
              {storeRedemptions.length > 0 && (
                <>
                  <View style={styles.section}>
                    <Text style={[styles.sectionTitle, { color: theme.colors.onSurfaceVariant }]}>Rally Credit Rewards</Text>

                    {selectedReward ? (
                      <View style={styles.appliedReward}>
                        <LinearGradient colors={['rgba(255,215,0,0.15)', 'rgba(255,165,0,0.1)']} style={styles.appliedRewardGradient}>
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
                            <TouchableOpacity onPress={() => setSelectedReward(null)}>
                              <IconButton icon="close" size={18} iconColor="#F59E0B" style={{ margin: 0 }} />
                            </TouchableOpacity>
                          </View>
                        </LinearGradient>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={[styles.showRewardsButton, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)' }]}
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
                        <IconButton icon={showRewards ? 'chevron-up' : 'chevron-down'} size={24} iconColor="#F59E0B" style={{ margin: 0 }} />
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
                                style={[styles.rewardItem, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)', borderColor: canAfford ? 'rgba(255,215,0,0.2)' : theme.colors.outline }, !canAfford && styles.rewardItemDisabled]}
                                onPress={() => handleApplyReward(reward)}
                                disabled={!canAfford}
                                activeOpacity={0.7}
                              >
                                <View style={styles.rewardItemContent}>
                                  <View style={styles.rewardItemLeft}>
                                    <Ionicons name="pricetag" size={20} color={canAfford ? '#FFD700' : '#999'} style={{ marginRight: 12 }} />
                                    <View>
                                      <Text style={[styles.rewardItemName, { color: theme.colors.onSurface, opacity: canAfford ? 1 : 0.5 }]}>{reward.name}</Text>
                                      <Text style={[styles.rewardItemValue, { color: theme.colors.onSurfaceVariant, opacity: canAfford ? 1 : 0.5 }]}>{getRewardDescription(reward)}</Text>
                                    </View>
                                  </View>
                                  <View style={[styles.creditsBadge, !canAfford && styles.creditsBadgeDisabled]}>
                                    <Ionicons name="star" size={12} color={canAfford ? '#FFD700' : '#999'} />
                                    <Text style={[styles.creditsBadgeText, !canAfford && { color: '#999' }]}>{reward.creditsRequired}</Text>
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
                  <Text style={[styles.breakdownValue, { color: theme.colors.onSurface }]}>${item.price.toFixed(2)}</Text>
                </View>
                <View style={styles.breakdownRow}>
                  <Text style={[styles.breakdownLabel, { color: theme.colors.onSurfaceVariant }]}>Quantity</Text>
                  <Text style={[styles.breakdownValue, { color: theme.colors.onSurface }]}>×{quantity}</Text>
                </View>
                <View style={styles.breakdownRow}>
                  <Text style={[styles.breakdownLabel, { color: theme.colors.onSurfaceVariant }]}>Subtotal</Text>
                  <Text style={[styles.breakdownValue, { color: theme.colors.onSurface }]}>${totals.itemPrice.toFixed(2)}</Text>
                </View>
                {selectedReward && totals.rewardDiscount > 0 && (
                  <View style={styles.breakdownRow}>
                    <Text style={[styles.breakdownLabel, { color: theme.colors.onSurfaceVariant }]}>Reward Discount</Text>
                    <Text style={[styles.breakdownValue, { color: '#10B981' }]}>-${totals.rewardDiscount.toFixed(2)}</Text>
                  </View>
                )}
                {totals.shipping > 0 && (
                  <View style={styles.breakdownRow}>
                    <Text style={[styles.breakdownLabel, { color: theme.colors.onSurfaceVariant }]}>Shipping</Text>
                    <Text style={[styles.breakdownValue, { color: theme.colors.onSurface }]}>${totals.shipping.toFixed(2)}</Text>
                  </View>
                )}
                <View style={styles.breakdownRow}>
                  <Text style={[styles.breakdownLabel, { color: theme.colors.onSurfaceVariant }]}>Service Fee (10% + $0.29)</Text>
                  <Text style={[styles.breakdownValue, { color: '#EF4444' }]}>${totals.processingFee.toFixed(2)}</Text>
                </View>
                <View style={[styles.divider, { backgroundColor: theme.colors.outline, marginVertical: 8 }]} />
                <View style={styles.breakdownRow}>
                  <Text style={[styles.totalLabel, { color: theme.colors.onSurface }]}>Total</Text>
                  <Text style={styles.totalValue}>${totals.total.toFixed(2)}</Text>
                </View>
              </View>

              {/* Braintree Drop-in */}
              {totals.total > 0 && (
                <View style={styles.section}>
                  <Text style={[styles.sectionTitle, { color: theme.colors.onSurfaceVariant }]}>PAYMENT METHOD</Text>
                  {initializingPayment || !clientToken ? (
                    <View style={{ alignItems: 'center', paddingVertical: 16 }}>
                      <ActivityIndicator size="small" color={theme.colors.primary} />
                      <Text style={{ marginTop: 8, color: theme.colors.onSurfaceVariant, fontSize: 13 }}>
                        Initializing payment...
                      </Text>
                    </View>
                  ) : (
                    <WebView
                      ref={webViewRef}
                      source={{ html: buildDropInHtml(clientToken) }}
                      style={styles.webView}
                      onMessage={handleWebViewMessage}
                      javaScriptEnabled
                      scrollEnabled={false}
                      originWhitelist={['*']}
                      mixedContentMode="always"
                    />
                  )}
                </View>
              )}
            </ScrollView>

            {/* Footer */}
            <View style={[styles.footer, { borderTopColor: theme.colors.outline }]}>
              <TouchableOpacity
                style={styles.purchaseButton}
                onPress={handlePurchase}
                disabled={processing || initializingPayment || (totals.total > 0 && !dropInReady)}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={['#EF4444', '#DC2626']}
                  style={[styles.purchaseButtonGradient, (initializingPayment || (totals.total > 0 && !dropInReady)) && { opacity: 0.6 }]}
                >
                  {processing || initializingPayment ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text style={styles.purchaseButtonText}>
                      {totals.total === 0 ? 'Confirm (Free)' : `Pay $${totals.total.toFixed(2)}`}
                    </Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>
              <Text style={{ textAlign: 'center', color: theme.colors.onSurfaceVariant, fontSize: 11, marginTop: 8 }}>
                🔒 Secure payment via Braintree
              </Text>
            </View>
          </BlurView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  backdrop: { flex: 1 },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: SCREEN_HEIGHT * 0.9, borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' },
  sheetBlur: { borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1 },
  headerText: { fontSize: 20, fontWeight: 'bold' },
  scrollView: { maxHeight: SCREEN_HEIGHT * 0.65 },
  section: { padding: 20 },
  sectionTitle: { fontSize: 14, fontWeight: '600', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  productRow: { flexDirection: 'row', gap: 16 },
  productInfo: { flex: 1 },
  productImage: { width: 70, height: 70, borderRadius: 8 },
  productName: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
  productClub: { fontSize: 14, marginBottom: 4 },
  productQuantity: { fontSize: 14 },
  divider: { height: 1 },
  deliveryBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(96,165,250,0.1)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, alignSelf: 'flex-start', gap: 8 },
  deliveryText: { fontSize: 14, color: '#60A5FA', fontWeight: '600' },
  addressCard: { borderRadius: 12, padding: 16, borderWidth: 1 },
  addressName: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
  addressText: { fontSize: 14, marginTop: 2 },
  appliedReward: { marginTop: 8 },
  appliedRewardGradient: { borderRadius: 12, padding: 16 },
  appliedRewardContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  appliedRewardLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 },
  appliedRewardInfo: { flex: 1 },
  appliedRewardName: { fontWeight: '600', fontSize: 14 },
  appliedRewardValue: { fontSize: 12, marginTop: 2 },
  showRewardsButton: { borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  showRewardsInfo: { flex: 1 },
  showRewardsText: { fontSize: 15, fontWeight: '600' },
  showRewardsSubtext: { fontSize: 12, marginTop: 2 },
  rewardsList: { marginTop: 8 },
  rewardItem: { borderRadius: 12, borderWidth: 1, marginBottom: 8, padding: 14 },
  rewardItemDisabled: { opacity: 0.6 },
  rewardItemContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rewardItemLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  rewardItemName: { fontWeight: '600', fontSize: 14 },
  rewardItemValue: { fontSize: 12, marginTop: 2 },
  creditsBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(245,158,11,0.15)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20, gap: 4 },
  creditsBadgeDisabled: { backgroundColor: 'rgba(150,150,150,0.15)' },
  creditsBadgeText: { fontSize: 13, fontWeight: '700', color: '#F59E0B' },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  breakdownLabel: { fontSize: 14 },
  breakdownValue: { fontSize: 14, fontWeight: '500' },
  totalLabel: { fontSize: 16, fontWeight: 'bold' },
  totalValue: { fontSize: 18, fontWeight: 'bold', color: '#EF4444' },
  webView: { height: 220, marginTop: 8 },
  footer: { padding: 20, borderTopWidth: 1 },
  purchaseButton: { borderRadius: 14, overflow: 'hidden' },
  purchaseButtonGradient: { paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
  purchaseButtonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});
