import React, { useState, useEffect, useRef } from 'react';
import {
  View, StyleSheet, Alert, Platform, TouchableOpacity,
  Animated, Dimensions, ScrollView, Modal, Image, Linking, Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, ActivityIndicator, IconButton, useTheme } from 'react-native-paper';
import { WebView } from 'react-native-webview';
import type { StoreItem, RallyCreditRedemption, UserRallyCredits, ShippingAddress } from '../lib/firebase';
import { getUserRallyCredits, getClubRallyRedemptions, spendRallyCredits } from '../lib/firebase';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import {
  getFinixTokenizationContext,
  buildFinixTokenizeUrl,
  createStoreTransaction,
  listSavedPaymentInstruments,
  newIdempotencyKey,
  type FinixTokenizationContext,
  type StoreBreakdown,
  type SavedPaymentInstrument,
} from '../lib/finix';
import { useThemeToggle } from '../app/_layout';
import { useDebugLogs } from '../lib/debugContext';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const SLIDE_DURATION = 280;
const SUMMARY_HEIGHT = Math.round(SCREEN_HEIGHT * 0.6);
const PAYMENT_HEIGHT = Math.round(SCREEN_HEIGHT * 0.92);

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
  userId,
}: StorePaymentSheetProps) {
  const theme = useTheme();
  const { isDark } = useThemeToggle();
  const { debugLogs } = useDebugLogs();
  const insets = useSafeAreaInsets();
  const webViewRef = useRef<any>(null);
  const applePayWebViewRef = useRef<any>(null);
  // Stable idempotency key per checkout (regenerated on method change, cleared
  // on success) so a double tap / retry can't bill the buyer twice.
  const idempotencyRef = useRef<{ key: string; method: string } | null>(null);
  const getIdempotencyKey = (method: string) => {
    if (!idempotencyRef.current || idempotencyRef.current.method !== method) {
      idempotencyRef.current = { key: newIdempotencyKey(), method };
    }
    return idempotencyRef.current.key;
  };
  const apCacheBust = useRef(Date.now()).current;
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const slideX = useRef(new Animated.Value(0)).current;
  const sheetHeight = useRef(new Animated.Value(SUMMARY_HEIGHT)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const [step, setStep] = useState<'summary' | 'payment'>('summary');

  const [userCredits, setUserCredits] = useState<UserRallyCredits | null>(null);
  const [storeRedemptions, setStoreRedemptions] = useState<RallyCreditRedemption[]>([]);
  const [selectedReward, setSelectedReward] = useState<RallyCreditRedemption | null>(null);
  const [showRewards, setShowRewards] = useState(false);
  const [loadingRewards, setLoadingRewards] = useState(false);
  const [processing, setProcessing] = useState(false);

  const [serverBreakdown, setServerBreakdown] = useState<StoreBreakdown | null>(null);
  const [finixContext, setFinixContext] = useState<FinixTokenizationContext | null>(null);
  const [formReady, setFormReady] = useState(false);
  const [initializingPayment, setInitializingPayment] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'ach' | 'apple_pay' | 'google_pay'>('card');

  // Saved payment methods state
  const [savedInstruments, setSavedInstruments] = useState<SavedPaymentInstrument[]>([]);
  const [selectedSavedPiId, setSelectedSavedPiId] = useState<string | null>(null);
  const [useNewCard, setUseNewCard] = useState(false);
  const [saveNewCard, setSaveNewCard] = useState(false);
  const [diagLog, setDiagLog] = useState<string[]>([]);

  useEffect(() => {
    if (visible) {
      slideX.setValue(0);
      sheetHeight.setValue(SUMMARY_HEIGHT);
      slideAnim.setValue(SCREEN_HEIGHT);
      backdropOpacity.setValue(0);
      setStep('summary');
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: SLIDE_DURATION,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: SLIDE_DURATION,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
      loadUserCredits();
      loadStoreRedemptions();
      loadSavedInstruments();
      setSaveNewCard(false);
      initPayment();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: SCREEN_HEIGHT,
          duration: SLIDE_DURATION,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: SLIDE_DURATION,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
      setServerBreakdown(null);
      setFinixContext(null);
      setFormReady(false);
      setSelectedReward(null);
    }
  }, [visible]);

  // Animate horizontal slide (transform, native driver) and sheet-height (layout,
  // JS driver) separately rather than via Animated.parallel — mixing drivers
  // inside a parallel composite can cause "Attempting to run JS driven animation
  // on animated node that has been moved to 'native' earlier" after hot-reload.
  const goToPayment = () => {
    setStep('payment');
    Animated.timing(slideX, {
      toValue: -SCREEN_WIDTH,
      duration: SLIDE_DURATION,
      useNativeDriver: true,
    }).start();
    Animated.timing(sheetHeight, {
      toValue: PAYMENT_HEIGHT,
      duration: SLIDE_DURATION,
      useNativeDriver: false,
    }).start();
  };

  const goToSummary = () => {
    Animated.timing(slideX, {
      toValue: 0,
      duration: SLIDE_DURATION,
      useNativeDriver: true,
    }).start(() => setStep('summary'));
    Animated.timing(sheetHeight, {
      toValue: SUMMARY_HEIGHT,
      duration: SLIDE_DURATION,
      useNativeDriver: false,
    }).start();
  };

  const handleRequestClose = () => {
    if (step === 'payment') {
      goToSummary();
    } else {
      onDismiss();
    }
  };

  useEffect(() => {
    if (visible && userId) {
      calculateBreakdown();
    }
  }, [selectedReward]);

  const loadSavedInstruments = async () => {
    try {
      const result = await listSavedPaymentInstruments();
      if (result.success && result.instruments) {
        setSavedInstruments(result.instruments);
        const def = result.instruments.find((i) => i.isDefault) || result.instruments[0];
        setSelectedSavedPiId(def ? def.piId : null);
        setUseNewCard(result.instruments.length === 0);
      } else {
        setSavedInstruments([]);
        setSelectedSavedPiId(null);
        setUseNewCard(true);
      }
    } catch {
      setSavedInstruments([]);
      setSelectedSavedPiId(null);
      setUseNewCard(true);
    }
  };

  const formatBrand = (brand: string | null): string => {
    if (!brand) return 'Card';
    const map: Record<string, string> = {
      visa: 'Visa', mastercard: 'Mastercard', amex: 'American Express',
      'american express': 'American Express', discover: 'Discover',
      diners: 'Diners Club', jcb: 'JCB', unionpay: 'UnionPay',
    };
    return map[brand.toLowerCase()] || brand.charAt(0).toUpperCase() + brand.slice(1);
  };

  const initPayment = async () => {
    setInitializingPayment(true);
    try {
      const result = await getFinixTokenizationContext({ debug: debugLogs });
      if (result.success && result.context) {
        setFinixContext(result.context);
        await calculateBreakdown();
      } else {
        Alert.alert('Error', result.error || 'Failed to initialize payment');
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

  const pushDiag = (line: string) => {
    if (debugLogs) console.log('[finix-diag]', line);
    setDiagLog((prev) => [...prev.slice(-29), line]);
  };

  // Messages from the compact Apple-Pay-only WebView on the summary screen.
  // Only handles diag + the apple_pay token; ignores ready/tab so it never
  // interferes with the step-2 card form state.
  const handleApplePayMessage = async (event_: any) => {
    try {
      const msg = JSON.parse(event_.nativeEvent.data);
      if (msg.type === 'diag') {
        const { type, t, stage, ...rest } = msg;
        pushDiag(`[ap] ${stage} ${Object.keys(rest).length ? JSON.stringify(rest) : ''}`);
        return;
      }
      if (msg.type === 'token') {
        setProcessing(true);
        await processPaymentWithToken(msg.tokenId, msg.paymentMethod || 'apple_pay', msg.fraudSessionId, {
          thirdPartyToken: msg.thirdPartyToken,
          billingContact: msg.billingContact,
        });
      } else if (msg.type === 'error') {
        Alert.alert('Payment Error', msg.message || 'An error occurred');
      }
    } catch (e) { /* ignore */ }
  };

  const handleWebViewMessage = async (event_: any) => {
    if (debugLogs) console.log('[finix-raw]', event_.nativeEvent.data);
    try {
      const msg = JSON.parse(event_.nativeEvent.data);
      if (msg.type === 'diag') {
        const { type, t, stage, ...rest } = msg;
        pushDiag(`${stage} ${Object.keys(rest).length ? JSON.stringify(rest) : ''}`);
        return;
      }
      if (msg.type === 'ready') {
        setFormReady(!!msg.ready);
        if (!msg.ready) Alert.alert('Error', msg.error || 'Failed to load payment form');
      } else if (msg.type === 'tab') {
        setPaymentMethod(msg.paymentMethod || 'card');
      } else if (msg.type === 'token') {
        await processPaymentWithToken(msg.tokenId, msg.paymentMethod || 'card', msg.fraudSessionId, {
          savePaymentMethod: saveNewCard && (msg.paymentMethod || 'card') === 'card',
          thirdPartyToken: msg.thirdPartyToken,
          billingContact: msg.billingContact,
        });
      } else if (msg.type === 'error') {
        setProcessing(false);
        Alert.alert('Payment Error', msg.message || 'An error occurred');
      }
    } catch (e) { /* ignore */ }
  };

  const processPaymentWithToken = async (
    tokenId: string | null,
    method: string,
    fraudSessionId?: string,
    opts?: { savedPaymentInstrumentId?: string; savePaymentMethod?: boolean; thirdPartyToken?: string; billingContact?: any }
  ) => {
    try {
      const result = await createStoreTransaction({
        tokenId: tokenId || undefined,
        thirdPartyToken: opts?.thirdPartyToken,
        billingContact: opts?.billingContact,
        savedPaymentInstrumentId: opts?.savedPaymentInstrumentId,
        savePaymentMethod: opts?.savePaymentMethod,
        fraudSessionId,
        idempotencyKey: getIdempotencyKey(method),
        debug: debugLogs,
        paymentMethod: method as any,
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

      // Apple Pay: tell the in-WebView session to finish so its native sheet
      // dismisses before we show our own alert. Inject into both WebViews — only
      // the one that started the session will respond.
      if (method === 'apple_pay') {
        const js = `window.__applePayCompletion && window.__applePayCompletion(${result.success ? 'true' : 'false'}); true;`;
        webViewRef.current?.injectJavaScript(js);
        applePayWebViewRef.current?.injectJavaScript(js);
      }

      if (result.success) {
        idempotencyRef.current = null; // charge captured — next purchase gets a fresh key
        if (selectedReward) {
          await spendRallyCredits(userId, item.clubId, selectedReward.creditsRequired,
            selectedReward.id, `Store discount: ${item.name}`).catch(() => {});
        }
        const isAch = method === 'ach';
        Alert.alert(
          isAch ? 'ACH Authorization Confirmed' : 'Purchase Successful!',
          isAch
            ? 'You authorized a one-time ACH debit from your bank account for this order. The debit may take 3–5 business days to clear, and we\'ll ship your order once funds settle. To revoke or dispute this authorization, contact support@rallysphere.com.'
            : 'Your order has been placed successfully.'
        );
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
      processPaymentWithToken('free_token', 'card');
      return;
    }

    // Saved-card path — skip tokenization entirely
    if (!useNewCard && selectedSavedPiId) {
      setProcessing(true);
      processPaymentWithToken(null, 'card', undefined, { savedPaymentInstrumentId: selectedSavedPiId });
      return;
    }

    if (!formReady) {
      Alert.alert('Please Wait', 'Payment is still being prepared. Please try again in a moment.');
      return;
    }

    setProcessing(true);
    webViewRef.current?.injectJavaScript('window.__submit && window.__submit(); true;');
  };

  if (!visible) return null;

  const totals = calculateTotal();

  // Compact Apple-Pay-only form embedded on the summary screen.
  const applePayUrl = finixContext
    ? buildFinixTokenizeUrl({
        context: finixContext,
        amount: totals.total,
        wallets: true,
        walletsOnly: true,
        debug: debugLogs,
        theme: isDark ? 'dark' : 'light',
      }) + `&_=${apCacheBust}`
    : null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleRequestClose}>
      <View style={styles.overlay}>
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: backdropOpacity }]}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onDismiss} />
        </Animated.View>
        {/* Outer wrapper: native-driven open/close translateY. */}
        {/* Inner: JS-driven height (layout). Splitting avoids the native/JS driver collision. */}
        <Animated.View style={[styles.sheetWrapper, { transform: [{ translateY: slideAnim }] }]}>
          <Animated.View style={[styles.sheet, { height: sheetHeight }]}>
            <BlurView intensity={80} tint={isDark ? 'dark' : 'light'} style={styles.sheetBlur}>
            {/* Close button — closes the whole sheet on either step */}
            <TouchableOpacity
              style={[styles.closeButton, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]}
              onPress={onDismiss}
            >
              <Text style={[styles.closeIcon, { color: theme.colors.onSurfaceVariant }]}>✕</Text>
            </TouchableOpacity>

            {/* Sliding panes container — clips overflow so only one pane shows at a time */}
            <View style={{ flex: 1, overflow: 'hidden' }}>
              <Animated.View
                style={{
                  flexDirection: 'row',
                  width: SCREEN_WIDTH * 2,
                  flex: 1,
                  transform: [{ translateX: slideX }],
                }}
              >
                {/* ============ PANE 1: SUMMARY ============ */}
                <View style={{ width: SCREEN_WIDTH, flex: 1 }}>
                  <ScrollView
                    style={styles.scrollView}
                    contentContainerStyle={{ paddingBottom: 16 }}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                  >
                    <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 4 }}>
                      <Text style={[styles.headerText, { color: theme.colors.onSurface }]}>Confirm Purchase</Text>
                    </View>
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

                  </ScrollView>

                  {/* Pane 1 footer — Apple Pay on top, then card/bank */}
                  <View style={[styles.summaryFooter, { paddingBottom: insets.bottom + 16, borderTopColor: theme.colors.outline }]}>
                    {/* Apple Pay — compact WebView button (must launch from a tap inside a WebView) */}
                    {totals.total > 0 && finixContext && applePayUrl && (
                      <>
                        <View style={{ height: 52, marginBottom: 4 }}>
                          <WebView
                            ref={applePayWebViewRef}
                            source={{ uri: applePayUrl }}
                            style={{ flex: 1, backgroundColor: 'transparent' }}
                            onMessage={handleApplePayMessage}
                            javaScriptEnabled
                            scrollEnabled={false}
                            originWhitelist={['*']}
                            mixedContentMode="always"
                            applePayEnabled
                          />
                        </View>
                        <View style={styles.orRow}>
                          <View style={[styles.orLine, { backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)' }]} />
                          <Text style={[styles.orText, { color: theme.colors.onSurfaceVariant }]}>or</Text>
                          <View style={[styles.orLine, { backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)' }]} />
                        </View>
                      </>
                    )}
                    <TouchableOpacity
                      style={[
                        styles.continueButton,
                        {
                          backgroundColor: totals.total === 0 ? '#10B981' : theme.colors.primary,
                          opacity: (processing || initializingPayment || (totals.total > 0 && !finixContext)) ? 0.7 : 1,
                        },
                      ]}
                      onPress={totals.total === 0 ? handlePurchase : goToPayment}
                      disabled={processing || initializingPayment || (totals.total > 0 && !finixContext)}
                      activeOpacity={0.85}
                    >
                      {processing || initializingPayment ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <>
                          <Text style={styles.continueButtonText}>
                            {totals.total === 0
                              ? 'Confirm (Free)'
                              : `Continue with Card / Bank — $${totals.total.toFixed(2)}`}
                          </Text>
                          <Text style={styles.continueButtonSubtext}>
                            {totals.total === 0
                              ? 'Using Rally Credits'
                              : 'Next: enter card or bank details'}
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>

                {/* ============ PANE 2: PAYMENT ============ */}
                <View style={{ width: SCREEN_WIDTH, flex: 1 }}>
                  <View style={styles.stepHeader}>
                    <TouchableOpacity onPress={goToSummary} style={styles.backButton} activeOpacity={0.7}>
                      <Text style={[styles.backButtonText, { color: theme.colors.primary }]}>← Back</Text>
                    </TouchableOpacity>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={{ fontWeight: 'bold', fontSize: 16, color: theme.colors.onSurface }} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={{ fontSize: 13, color: theme.colors.onSurfaceVariant }}>
                        Total: ${totals.total.toFixed(2)}
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.sectionTitle, { color: theme.colors.onSurfaceVariant, paddingHorizontal: 20, marginBottom: 4 }]}>
                    PAYMENT METHOD
                  </Text>

                  {/* Body — saved-card picker or Finix WebView */}
                  {initializingPayment || !finixContext ? (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                      <ActivityIndicator size="small" color={theme.colors.primary} />
                      <Text style={{ marginTop: 8, color: theme.colors.onSurfaceVariant, fontSize: 13 }}>
                        Initializing payment...
                      </Text>
                    </View>
                  ) : !useNewCard && savedInstruments.length > 0 ? (
                    <ScrollView
                      style={{ flex: 1 }}
                      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8 }}
                      keyboardShouldPersistTaps="handled"
                    >
                      {savedInstruments.map((pi) => {
                        const selected = selectedSavedPiId === pi.piId;
                        return (
                          <TouchableOpacity
                            key={pi.piId}
                            onPress={() => setSelectedSavedPiId(pi.piId)}
                            activeOpacity={0.7}
                            style={[styles.savedCardRow, { borderColor: selected ? theme.colors.primary : theme.colors.outline }]}
                          >
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.savedCardBrand, { color: theme.colors.onSurface }]}>{formatBrand(pi.brand)}</Text>
                              <Text style={[styles.savedCardMeta, { color: theme.colors.onSurfaceVariant }]}>
                                •••• {pi.last4 || '----'}
                                {pi.expMonth && pi.expYear ? `  ·  ${String(pi.expMonth).padStart(2, '0')}/${String(pi.expYear).slice(-2)}` : ''}
                                {pi.isDefault ? '  ·  Default' : ''}
                              </Text>
                            </View>
                            <View style={[styles.savedCardRadio, { borderColor: selected ? theme.colors.primary : theme.colors.outline }]}>
                              {selected && <View style={[styles.savedCardRadioDot, { backgroundColor: theme.colors.primary }]} />}
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                      <TouchableOpacity
                        onPress={() => setUseNewCard(true)}
                        activeOpacity={0.7}
                        style={[styles.useNewCardButton, { borderColor: theme.colors.outline }]}
                      >
                        <Text style={[styles.useNewCardText, { color: theme.colors.primary }]}>+ Use new payment</Text>
                      </TouchableOpacity>
                    </ScrollView>
                  ) : (
                    <View style={{ flex: 1 }}>
                      <WebView
                        ref={webViewRef}
                        source={{
                          uri: (() => {
                            const u = buildFinixTokenizeUrl({
                              context: finixContext,
                              amount: totals.total,
                              ach: true,
                              wallets: false,
                              external: true,
                              debug: debugLogs,
                              theme: isDark ? 'dark' : 'light',
                            });
                            if (debugLogs) console.log('[finix-url]', u, 'context=', JSON.stringify(finixContext));
                            return u;
                          })(),
                        }}
                        style={{ flex: 1, backgroundColor: 'transparent', marginHorizontal: 20 }}
                        onMessage={handleWebViewMessage}
                        javaScriptEnabled
                        scrollEnabled
                        originWhitelist={['*']}
                        mixedContentMode="always"
                        applePayEnabled
                        onLoadStart={() => { if (debugLogs) console.log('[finix-wv] loadStart'); }}
                        onLoadEnd={() => { if (debugLogs) console.log('[finix-wv] loadEnd'); }}
                        onError={(e) => pushDiag(`WV-ERROR ${JSON.stringify(e.nativeEvent)}`)}
                        onHttpError={(e) => pushDiag(`WV-HTTP-ERROR ${JSON.stringify(e.nativeEvent)}`)}
                      />
                      {debugLogs && (
                        <View style={{ maxHeight: 140, marginHorizontal: 20, marginTop: 4, backgroundColor: 'rgba(0,0,0,0.85)', borderRadius: 8, padding: 8 }}>
                          <ScrollView>
                            <Text style={{ color: '#0f0', fontSize: 9, fontFamily: 'Courier' }}>
                              {diagLog.length ? diagLog.join('\n') : 'waiting for finix diag…'}
                            </Text>
                          </ScrollView>
                        </View>
                      )}
                      {paymentMethod === 'card' && (
                        <View style={{ paddingHorizontal: 20, paddingTop: 4 }}>
                          <TouchableOpacity onPress={() => setSaveNewCard((v) => !v)} activeOpacity={0.7} style={styles.saveCardRow}>
                            <View
                              style={[
                                styles.saveCardCheckbox,
                                { borderColor: saveNewCard ? theme.colors.primary : theme.colors.outline, backgroundColor: saveNewCard ? theme.colors.primary : 'transparent' },
                              ]}
                            >
                              {saveNewCard && <Text style={styles.saveCardCheckmark}>✓</Text>}
                            </View>
                            <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 13, marginLeft: 8 }}>
                              Save this card for next time
                            </Text>
                          </TouchableOpacity>
                          {savedInstruments.length > 0 && (
                            <TouchableOpacity onPress={() => setUseNewCard(false)} activeOpacity={0.7} style={{ marginTop: 6 }}>
                              <Text style={{ color: theme.colors.primary, fontSize: 13 }}>← Use a saved card</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      )}
                    </View>
                  )}

                  {/* Pane 2 footer — Pay button */}
                  <View style={[styles.paymentFooter, { paddingBottom: insets.bottom + 16, borderTopColor: theme.colors.outline }]}>
                    {(() => {
                      const usingSaved = !useNewCard && !!selectedSavedPiId;
                      const payDisabled = processing || initializingPayment || (totals.total > 0 && !usingSaved && !formReady);
                      return (
                        <TouchableOpacity
                          style={styles.purchaseButton}
                          onPress={handlePurchase}
                          disabled={payDisabled}
                          activeOpacity={0.8}
                        >
                          <LinearGradient
                            colors={['#EF4444', '#DC2626']}
                            style={[styles.purchaseButtonGradient, payDisabled && { opacity: 0.6 }]}
                          >
                            {processing || initializingPayment ? (
                              <ActivityIndicator color="white" />
                            ) : (
                              <Text style={styles.purchaseButtonText}>
                                {totals.total === 0
                                  ? 'Confirm (Free)'
                                  : paymentMethod === 'ach'
                                    ? `Authorize & Pay $${totals.total.toFixed(2)}`
                                    : `Pay $${totals.total.toFixed(2)}`}
                              </Text>
                            )}
                          </LinearGradient>
                        </TouchableOpacity>
                      );
                    })()}
                  </View>
                </View>
              </Animated.View>
            </View>
          </BlurView>
          </Animated.View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  backdrop: { flex: 1 },
  sheetWrapper: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.2, shadowRadius: 8, elevation: 10,
  },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' },
  sheetBlur: { flex: 1, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  closeButton: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  closeIcon: { fontSize: 16, fontWeight: '600' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1 },
  headerText: { fontSize: 20, fontWeight: 'bold' },
  scrollView: { flex: 1 },
  summaryFooter: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  paymentFooter: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  continueButton: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  continueButtonSubtext: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    marginTop: 4,
    fontWeight: '500',
  },
  orRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 12 },
  orLine: { flex: 1, height: 1 },
  orText: { marginHorizontal: 12, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 8,
  },
  backButton: {
    paddingVertical: 4,
    paddingRight: 8,
  },
  backButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
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
  webView: { height: 380, marginTop: 8 },
  footer: { padding: 20, borderTopWidth: 1 },
  purchaseButton: { borderRadius: 14, overflow: 'hidden' },
  purchaseButtonGradient: { paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
  purchaseButtonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  savedCardRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 10,
  },
  savedCardBrand: { fontSize: 15, fontWeight: '600' },
  savedCardMeta: { fontSize: 12, marginTop: 2 },
  savedCardRadio: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  savedCardRadioDot: { width: 10, height: 10, borderRadius: 5 },
  useNewCardButton: {
    borderWidth: 1, borderStyle: 'dashed', borderRadius: 12, padding: 14,
    alignItems: 'center', marginTop: 4,
  },
  useNewCardText: { fontSize: 14, fontWeight: '600' },
  saveCardRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  saveCardCheckbox: {
    width: 20, height: 20, borderRadius: 4, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  saveCardCheckmark: { color: '#fff', fontSize: 13, fontWeight: 'bold', lineHeight: 14 },
});
