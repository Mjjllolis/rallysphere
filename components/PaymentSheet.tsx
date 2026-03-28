import React, { useState, useEffect, useRef } from 'react';
import {
  View, StyleSheet, Alert, Platform, TouchableOpacity,
  Animated, Dimensions, ScrollView, Modal,
} from 'react-native';
import { Button, Text, ActivityIndicator, useTheme, Divider, IconButton } from 'react-native-paper';
import { WebView } from 'react-native-webview';
import type { Event, RallyCreditRedemption, UserRallyCredits } from '../lib/firebase';
import { db, auth, getClubRallyRedemptions, getUserRallyCredits, spendRallyCredits } from '../lib/firebase';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { LinearGradient } from 'expo-linear-gradient';
import { useThemeToggle } from '../app/_layout';
import { getBraintreeClientToken, createEventTransaction } from '../lib/stripe';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface PaymentSheetProps {
  visible: boolean;
  event: Event;
  onDismiss: () => void;
  onSuccess: () => void;
}

function buildDropInHtml(clientToken: string, totalAmount: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: transparent; padding: 8px 0; }
    #dropin-container { margin-bottom: 0; }
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

export default function PaymentSheet({ visible, event, onDismiss, onSuccess }: PaymentSheetProps) {
  const theme = useTheme();
  const { isDark } = useThemeToggle();
  const webViewRef = useRef<any>(null);
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  const [loading, setLoading] = useState(false);
  const [clientToken, setClientToken] = useState<string | null>(null);
  const [dropInReady, setDropInReady] = useState(false);
  const [initializingPayment, setInitializingPayment] = useState(false);
  const [feeBreakdown, setFeeBreakdown] = useState<any>(null);

  // Rally Credits discount state
  const [showDiscounts, setShowDiscounts] = useState(false);
  const [eventRedemptions, setEventRedemptions] = useState<RallyCreditRedemption[]>([]);
  const [userCredits, setUserCredits] = useState<UserRallyCredits | null>(null);
  const [selectedDiscount, setSelectedDiscount] = useState<RallyCreditRedemption | null>(null);
  const [loadingDiscounts, setLoadingDiscounts] = useState(false);

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 0, useNativeDriver: true, tension: 50, friction: 8,
      }).start();
      loadFeeBreakdown(event.ticketPrice);
      loadDiscounts();
      setSelectedDiscount(null);
      setShowDiscounts(false);
      initPayment();
    } else {
      Animated.timing(slideAnim, {
        toValue: SCREEN_HEIGHT, duration: 250, useNativeDriver: true,
      }).start();
      setClientToken(null);
      setDropInReady(false);
    }
  }, [visible]);

  useEffect(() => {
    if (visible && event.ticketPrice) {
      const { ticketPrice: discountedPrice } = calculateDiscountedPrice();
      loadFeeBreakdown(discountedPrice);
    }
  }, [selectedDiscount]);

  const initPayment = async () => {
    setInitializingPayment(true);
    try {
      const result = await getBraintreeClientToken();
      if (result.success && result.clientToken) {
        setClientToken(result.clientToken);
      } else {
        Alert.alert('Error', result.error || 'Failed to initialize payment');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to initialize payment');
    } finally {
      setInitializingPayment(false);
    }
  };

  const loadDiscounts = async () => {
    if (!event.clubId) return;
    try {
      setLoadingDiscounts(true);
      const userId = auth.currentUser?.uid;
      if (!userId) return;

      const creditsResult = await getUserRallyCredits(userId);
      if (creditsResult.success && creditsResult.credits) {
        setUserCredits(creditsResult.credits);
      }

      const redemptionsResult = await getClubRallyRedemptions(event.clubId);
      if (redemptionsResult.success && redemptionsResult.redemptions) {
        const eventDiscounts = redemptionsResult.redemptions.filter(
          (r: RallyCreditRedemption) =>
            r.isActive && (r.type === 'event_discount' || r.type === 'event_free_admission')
        );
        setEventRedemptions(eventDiscounts);
      }
    } catch (error) {
      // silent
    } finally {
      setLoadingDiscounts(false);
    }
  };

  const loadFeeBreakdown = (ticketPrice?: number) => {
    const priceToUse = ticketPrice ?? event.ticketPrice;
    if (!priceToUse) return;
    const SERVICE_FEE_PERCENTAGE = 0.10;
    const SERVICE_FEE_FIXED = 0.29;
    const processingFee = Math.round(((priceToUse * SERVICE_FEE_PERCENTAGE) + SERVICE_FEE_FIXED) * 100) / 100;
    setFeeBreakdown({
      ticketPrice: priceToUse,
      processingFee,
      platformFee: 0,
      totalAmount: Math.round((priceToUse + processingFee) * 100) / 100,
      clubReceives: priceToUse,
    });
  };

  const addUserToEvent = async () => {
    try {
      const userId = auth.currentUser?.uid;
      if (!userId) return;
      const eventRef = doc(db, 'events', event.id);
      await updateDoc(eventRef, { attendees: arrayUnion(userId) });
    } catch (error) {
      // silent
    }
  };

  const calculateDiscountedPrice = (): { ticketPrice: number; discount: number; isFree: boolean } => {
    const originalPrice = event.ticketPrice || 0;
    if (!selectedDiscount) return { ticketPrice: originalPrice, discount: 0, isFree: false };

    if (selectedDiscount.type === 'event_free_admission') {
      return { ticketPrice: 0, discount: originalPrice, isFree: true };
    }
    if (selectedDiscount.discountPercent != null) {
      const discountPct = Number(selectedDiscount.discountPercent);
      if (!isNaN(discountPct)) {
        const discount = Math.round((originalPrice * discountPct) / 100 * 100) / 100;
        const newPrice = Math.round(Math.max(0, originalPrice - discount) * 100) / 100;
        return { ticketPrice: newPrice, discount, isFree: newPrice === 0 };
      }
    }
    if (selectedDiscount.discountAmount != null) {
      const discountAmt = Number(selectedDiscount.discountAmount);
      if (!isNaN(discountAmt)) {
        const discount = Math.round(Math.min(originalPrice, discountAmt) * 100) / 100;
        const newPrice = Math.round(Math.max(0, originalPrice - discount) * 100) / 100;
        return { ticketPrice: newPrice, discount, isFree: newPrice === 0 };
      }
    }
    return { ticketPrice: originalPrice, discount: 0, isFree: false };
  };

  const canAffordDiscount = (redemption: RallyCreditRedemption): boolean => {
    if (!userCredits) return false;
    return userCredits.availableCredits >= redemption.creditsRequired;
  };

  const getDiscountDescription = (redemption: RallyCreditRedemption): string => {
    if (redemption.type === 'event_free_admission') return 'Free Admission';
    if (redemption.discountPercent) return `${redemption.discountPercent}% off`;
    if (redemption.discountAmount) return `$${redemption.discountAmount.toFixed(2)} off`;
    return 'Discount';
  };

  const handleApplyDiscount = (redemption: RallyCreditRedemption) => {
    if (!canAffordDiscount(redemption)) {
      Alert.alert(
        'Insufficient Credits',
        `You need ${redemption.creditsRequired} Rally Credits. You have ${userCredits?.availableCredits || 0}.`
      );
      return;
    }
    setSelectedDiscount(redemption);
    setShowDiscounts(false);
  };

  const handleWebViewMessage = async (event_: any) => {
    try {
      const msg = JSON.parse(event_.nativeEvent.data);
      if (msg.type === 'ready') {
        setDropInReady(msg.ready);
        if (!msg.ready) Alert.alert('Error', msg.error || 'Failed to load payment form');
      } else if (msg.type === 'nonce') {
        await processPayment(msg.nonce);
      } else if (msg.type === 'error') {
        setLoading(false);
        Alert.alert('Payment Error', msg.message || 'An error occurred');
      }
    } catch (e) { /* ignore */ }
  };

  const processPayment = async (nonce: string) => {
    const { ticketPrice: discountedTicketPrice, discount: discountAmount, isFree } = calculateDiscountedPrice();
    const userId = auth.currentUser?.uid;

    if (!userId) {
      setLoading(false);
      Alert.alert('Error', 'You must be logged in');
      return;
    }

    try {
      // Free ticket via Rally Credits
      if (isFree && selectedDiscount) {
        const spendResult = await spendRallyCredits(
          userId, event.clubId, selectedDiscount.creditsRequired,
          selectedDiscount.id, `Event ticket: ${event.title}`
        );
        if (!spendResult.success) {
          Alert.alert('Error', spendResult.error || 'Failed to redeem Rally Credits');
          setLoading(false);
          return;
        }
        await addUserToEvent();
        Alert.alert(
          'Ticket Claimed!',
          `You claimed your free ticket using ${selectedDiscount.creditsRequired} Rally Credits.`,
          [{ text: 'OK', onPress: () => { onSuccess(); onDismiss(); } }]
        );
        setLoading(false);
        return;
      }

      const result = await createEventTransaction({
        paymentMethodNonce: nonce,
        eventId: event.id,
        ticketPrice: discountedTicketPrice,
        originalPrice: event.ticketPrice,
        discountAmount,
        currency: event.currency || 'usd',
        discountApplied: selectedDiscount ? {
          redemptionId: selectedDiscount.id,
          redemptionName: selectedDiscount.name,
          creditsUsed: selectedDiscount.creditsRequired,
        } : undefined,
      });

      if (result.success) {
        // Spend rally credits if a discount was applied
        if (selectedDiscount) {
          await spendRallyCredits(
            userId, event.clubId, selectedDiscount.creditsRequired,
            selectedDiscount.id, `Event discount: ${event.title}`
          ).catch(() => { /* non-fatal */ });
        }

        Alert.alert(
          'Payment Successful!',
          'You have successfully purchased a ticket for this event.',
          [{ text: 'OK', onPress: () => { onSuccess(); onDismiss(); } }]
        );
      } else {
        Alert.alert('Payment Failed', result.error || 'An error occurred during payment');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handlePay = () => {
    const { isFree } = calculateDiscountedPrice();

    if (isFree && selectedDiscount) {
      // No card needed for free tickets — process directly
      setLoading(true);
      processPayment('free_ticket_nonce');
      return;
    }

    if (!dropInReady) {
      Alert.alert('Error', 'Payment form is not ready yet. Please wait a moment.');
      return;
    }
    setLoading(true);
    webViewRef.current?.injectJavaScript('window.requestNonce(); true;');
  };

  const formatPrice = (price: number, currency: string = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: (currency || 'USD').toUpperCase(),
    }).format(price);
  };

  const { ticketPrice: discountedTicketPrice, discount: discountAmount, isFree } = calculateDiscountedPrice();

  return (
    <Modal visible={visible} onRequestClose={onDismiss} transparent animationType="none" statusBarTranslucent>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onDismiss} />

      <Animated.View
        style={[styles.sheet, { backgroundColor: theme.colors.surface, transform: [{ translateY: slideAnim }] }]}
      >
        {/* Handle */}
        <View style={styles.handleContainer}>
          <View style={[styles.handle, { backgroundColor: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.2)' }]} />
        </View>

        <TouchableOpacity
          style={[styles.closeButton, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]}
          onPress={onDismiss}
        >
          <Text style={[styles.closeIcon, { color: theme.colors.onSurfaceVariant }]}>✕</Text>
        </TouchableOpacity>

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.content}>
            <Text variant="headlineSmall" style={styles.title}>Complete Purchase</Text>

            {/* Event Info */}
            <View style={styles.eventInfo}>
              <Text variant="labelMedium" style={styles.sectionLabel}>EVENT</Text>
              <Text variant="titleLarge" style={styles.eventTitle}>{event.title}</Text>
              <Text variant="labelMedium" style={[styles.sectionLabel, { marginTop: 16 }]}>ORGANIZER</Text>
              <Text variant="bodyLarge">{event.clubName}</Text>
            </View>

            {/* Rally Credits Discounts */}
            {eventRedemptions.length > 0 && (
              <View style={styles.discountSection}>
                <Text variant="labelMedium" style={styles.sectionLabel}>RALLY CREDITS REWARDS</Text>

                {selectedDiscount ? (
                  <View style={styles.appliedDiscount}>
                    <LinearGradient
                      colors={['rgba(255, 215, 0, 0.15)', 'rgba(255, 165, 0, 0.1)']}
                      style={styles.appliedDiscountGradient}
                    >
                      <View style={[styles.appliedDiscountContent, { backgroundColor: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.7)' }]}>
                        <View style={styles.appliedDiscountLeft}>
                          <Text style={styles.appliedDiscountIcon}>⭐</Text>
                          <View>
                            <Text style={styles.appliedDiscountName}>{selectedDiscount.name}</Text>
                            <Text style={[styles.appliedDiscountValue, { color: theme.colors.onSurfaceVariant }]}>
                              {getDiscountDescription(selectedDiscount)} • {selectedDiscount.creditsRequired} credits
                            </Text>
                          </View>
                        </View>
                        <TouchableOpacity onPress={() => setSelectedDiscount(null)} style={styles.removeDiscountButton}>
                          <IconButton icon="close" size={18} iconColor="#F59E0B" style={{ margin: 0 }} />
                        </TouchableOpacity>
                      </View>
                    </LinearGradient>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.showDiscountsButton}
                    onPress={() => setShowDiscounts(!showDiscounts)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.showDiscountsContent}>
                      <Text style={styles.showDiscountsIcon}>⭐</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.showDiscountsText}>Apply Rally Credits Reward</Text>
                        <Text style={[styles.showDiscountsSubtext, { color: theme.colors.onSurfaceVariant }]}>
                          You have {userCredits?.availableCredits || 0} credits available
                        </Text>
                      </View>
                      <IconButton icon={showDiscounts ? 'chevron-up' : 'chevron-down'} size={24} iconColor="#F59E0B" style={{ margin: 0 }} />
                    </View>
                  </TouchableOpacity>
                )}

                {showDiscounts && !selectedDiscount && (
                  <View style={[styles.discountsList, { borderColor: theme.colors.outline }]}>
                    {loadingDiscounts ? (
                      <ActivityIndicator size="small" color="#F59E0B" style={{ padding: 20 }} />
                    ) : (
                      eventRedemptions.map((redemption) => {
                        const canAfford = canAffordDiscount(redemption);
                        return (
                          <TouchableOpacity
                            key={redemption.id}
                            style={[styles.discountItem, { borderBottomColor: theme.colors.outline }, !canAfford && styles.discountItemDisabled]}
                            onPress={() => handleApplyDiscount(redemption)}
                            disabled={!canAfford}
                            activeOpacity={0.7}
                          >
                            <View style={styles.discountItemContent}>
                              <View style={styles.discountItemLeft}>
                                <Text style={{ fontSize: 20, marginRight: 12, opacity: canAfford ? 1 : 0.5 }}>
                                  {redemption.type === 'event_free_admission' ? '🎟️' : '🏷️'}
                                </Text>
                                <View style={{ flex: 1 }}>
                                  <Text style={[styles.discountItemName, { color: theme.colors.onSurface, opacity: canAfford ? 1 : 0.5 }]}>
                                    {redemption.name}
                                  </Text>
                                  <Text style={[styles.discountItemValue, { opacity: canAfford ? 1 : 0.5 }]}>
                                    {getDiscountDescription(redemption)}
                                  </Text>
                                </View>
                              </View>
                              <View style={[styles.creditsBadge, !canAfford && styles.creditsBadgeDisabled]}>
                                <Text style={styles.creditsBadgeIcon}>⭐</Text>
                                <Text style={[styles.creditsBadgeText, !canAfford && { color: '#999' }]}>
                                  {redemption.creditsRequired}
                                </Text>
                              </View>
                            </View>
                          </TouchableOpacity>
                        );
                      })
                    )}
                  </View>
                )}
              </View>
            )}

            {/* Price Breakdown */}
            <View style={styles.breakdown}>
              <Text variant="labelMedium" style={styles.sectionLabel}>PAYMENT DETAILS</Text>

              <View style={styles.breakdownRow}>
                <Text variant="bodyLarge">Ticket Price</Text>
                <Text variant="bodyLarge">{formatPrice(event.ticketPrice || 0, event.currency)}</Text>
              </View>

              {selectedDiscount && discountAmount > 0 && (
                <View style={styles.breakdownRow}>
                  <Text variant="bodyMedium" style={{ color: '#10B981' }}>Rally Credits Discount</Text>
                  <Text variant="bodyMedium" style={{ color: '#10B981' }}>-{formatPrice(discountAmount, event.currency)}</Text>
                </View>
              )}

              {feeBreakdown && !isFree && discountedTicketPrice > 0 && (
                <View style={styles.breakdownRow}>
                  <Text variant="bodyMedium" style={{ opacity: 0.7 }}>Service Fee (10% + $0.29)</Text>
                  <Text variant="bodyMedium" style={{ opacity: 0.7 }}>{formatPrice(feeBreakdown.processingFee, event.currency)}</Text>
                </View>
              )}

              <Divider style={{ marginVertical: 12 }} />

              <View style={styles.breakdownRow}>
                <Text variant="titleMedium" style={{ fontWeight: 'bold' }}>Total</Text>
                <Text variant="titleLarge" style={{ fontWeight: 'bold', color: isFree ? '#10B981' : theme.colors.primary }}>
                  {isFree ? 'FREE' : feeBreakdown ? formatPrice(feeBreakdown.totalAmount, event.currency) : formatPrice(discountedTicketPrice, event.currency)}
                </Text>
              </View>

              {selectedDiscount && (
                <Text style={{ color: '#F59E0B', fontSize: 13, marginTop: 4 }}>
                  ⭐ {selectedDiscount.creditsRequired} Rally Credits will be spent
                </Text>
              )}
            </View>

            {/* Braintree Drop-in */}
            {!isFree && (
              <View>
                <Text variant="labelMedium" style={styles.sectionLabel}>PAYMENT METHOD</Text>
                {initializingPayment ? (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator size="small" color={theme.colors.primary} />
                    <Text variant="bodySmall" style={{ marginTop: 8, color: theme.colors.onSurfaceVariant }}>
                      Initializing payment...
                    </Text>
                  </View>
                ) : clientToken ? (
                  <WebView
                    ref={webViewRef}
                    source={{ html: buildDropInHtml(clientToken, feeBreakdown?.totalAmount?.toFixed(2) || '0.00') }}
                    style={styles.webView}
                    onMessage={handleWebViewMessage}
                    javaScriptEnabled
                    scrollEnabled={false}
                    originWhitelist={['*']}
                    mixedContentMode="always"
                  />
                ) : null}
              </View>
            )}

            {/* Pay Button */}
            <TouchableOpacity
              style={[styles.continueButton, { backgroundColor: isFree ? '#10B981' : theme.colors.primary, opacity: (loading || (!isFree && !dropInReady)) ? 0.7 : 1 }]}
              onPress={handlePay}
              disabled={loading || (!isFree && !dropInReady)}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Text style={styles.continueButtonText}>
                    {isFree ? 'Claim Free Ticket' : `Pay ${feeBreakdown ? formatPrice(feeBreakdown.totalAmount, event.currency) : formatPrice(discountedTicketPrice, event.currency)}`}
                  </Text>
                  <Text style={styles.continueButtonSubtext}>
                    {isFree ? `Using ${selectedDiscount?.creditsRequired} Rally Credits` : '🔒 Secure payment via Braintree'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.85)' },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: '90%',
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.2, shadowRadius: 8, elevation: 10,
  },
  handleContainer: { alignItems: 'center', paddingVertical: 12 },
  handle: { width: 40, height: 4, borderRadius: 2 },
  closeButton: {
    position: 'absolute', top: 12, right: 16,
    width: 30, height: 30, borderRadius: 15,
    justifyContent: 'center', alignItems: 'center', zIndex: 10,
  },
  closeIcon: { fontSize: 18, fontWeight: '300' },
  scrollView: { flex: 1 },
  scrollContent: { paddingBottom: 40 },
  content: { paddingHorizontal: 20 },
  title: { marginBottom: 20, fontWeight: 'bold', textAlign: 'center' },
  eventInfo: { marginBottom: 20 },
  eventTitle: { fontWeight: 'bold', marginTop: 8, marginBottom: 4 },
  sectionLabel: { fontWeight: '600', opacity: 0.6, letterSpacing: 0.5, marginBottom: 8 },
  breakdown: { marginBottom: 24, padding: 20, backgroundColor: 'rgba(128,128,128,0.05)', borderRadius: 12 },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  discountSection: { marginBottom: 20 },
  appliedDiscount: { borderRadius: 12, overflow: 'hidden', marginBottom: 8 },
  appliedDiscountGradient: { padding: 2, borderRadius: 12 },
  appliedDiscountContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 10, padding: 12 },
  appliedDiscountLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 },
  appliedDiscountIcon: { fontSize: 24 },
  appliedDiscountName: { fontWeight: '600', fontSize: 14 },
  appliedDiscountValue: { fontSize: 12, marginTop: 2 },
  removeDiscountButton: { marginLeft: 8 },
  showDiscountsButton: { borderRadius: 12, padding: 14, borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)', backgroundColor: 'rgba(245,158,11,0.05)' },
  showDiscountsContent: { flexDirection: 'row', alignItems: 'center' },
  showDiscountsIcon: { fontSize: 20, marginRight: 12 },
  showDiscountsText: { fontSize: 15, fontWeight: '600', color: '#D97706' },
  showDiscountsSubtext: { fontSize: 12, marginTop: 2 },
  discountsList: { borderWidth: 1, borderRadius: 12, overflow: 'hidden', marginTop: 8 },
  discountItem: { borderBottomWidth: 1 },
  discountItemDisabled: { opacity: 0.6 },
  discountItemContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14 },
  discountItemLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  discountItemName: { fontWeight: '600', fontSize: 14 },
  discountItemValue: { fontSize: 12, color: '#F59E0B', marginTop: 2 },
  creditsBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(245,158,11,0.15)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20, gap: 4 },
  creditsBadgeDisabled: { backgroundColor: 'rgba(150,150,150,0.15)' },
  creditsBadgeIcon: { fontSize: 12 },
  creditsBadgeText: { fontSize: 13, fontWeight: '700', color: '#F59E0B' },
  loadingContainer: { alignItems: 'center', paddingVertical: 20 },
  webView: { height: 220, marginBottom: 16 },
  continueButton: { borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginBottom: 16 },
  continueButtonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  continueButtonSubtext: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 4 },
});
