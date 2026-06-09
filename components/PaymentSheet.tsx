import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View, StyleSheet, Alert, Platform, TouchableOpacity,
  Animated, Dimensions, ScrollView, Modal, KeyboardAvoidingView, Image, Easing,
} from 'react-native';
import { Button, Text, ActivityIndicator, useTheme, Divider, IconButton } from 'react-native-paper';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Event, RallyCreditRedemption, UserRallyCredits } from '../lib/firebase';
import { db, auth, getClubRallyRedemptions, getUserRallyCredits, spendRallyCredits } from '../lib/firebase';
import { doc, getDoc, updateDoc, arrayUnion, increment, writeBatch, serverTimestamp } from 'firebase/firestore';
import { LinearGradient } from 'expo-linear-gradient';
import { useThemeToggle } from '../app/_layout';
import { useDebugLogs } from '../lib/debugContext';
import {
  getFinixTokenizationContext,
  buildFinixTokenizeUrl,
  createEventTransaction,
  listSavedPaymentInstruments,
  newIdempotencyKey,
  type FinixTokenizationContext,
  type SavedPaymentInstrument,
} from '../lib/finix';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const SLIDE_DURATION = 280;
const SUMMARY_HEIGHT = Math.round(SCREEN_HEIGHT * 0.68);
const PAYMENT_HEIGHT = Math.round(SCREEN_HEIGHT * 0.92);

interface PaymentSheetProps {
  visible: boolean;
  event: Event;
  onDismiss: () => void;
  onSuccess: () => void;
}

export default function PaymentSheet({ visible, event, onDismiss, onSuccess }: PaymentSheetProps) {
  const theme = useTheme();
  const { isDark } = useThemeToggle();
  const { debugLogs } = useDebugLogs();
  const insets = useSafeAreaInsets();
  const webViewRef = useRef<any>(null);
  const applePayWebViewRef = useRef<any>(null);
  // Stable idempotency key for the current checkout. Regenerated when the
  // payment method changes (so it never conflicts) and cleared on success, so
  // a double tap / retry of the *same* charge can't bill the buyer twice.
  const idempotencyRef = useRef<{ key: string; method: string } | null>(null);
  const getIdempotencyKey = (method: string) => {
    if (!idempotencyRef.current || idempotencyRef.current.method !== method) {
      idempotencyRef.current = { key: newIdempotencyKey(), method };
    }
    return idempotencyRef.current.key;
  };
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const slideX = useRef(new Animated.Value(0)).current;
  const sheetHeight = useRef(new Animated.Value(SUMMARY_HEIGHT)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  const [loading, setLoading] = useState(false);
  const [finixContext, setFinixContext] = useState<FinixTokenizationContext | null>(null);
  const [formReady, setFormReady] = useState(false);
  const [initializingPayment, setInitializingPayment] = useState(false);
  const [feeBreakdown, setFeeBreakdown] = useState<any>(null);
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'ach' | 'apple_pay' | 'google_pay'>('card');
  const [diagLog, setDiagLog] = useState<string[]>([]);
  const [webViewHeight, setWebViewHeight] = useState<number>(480);
  const [step, setStep] = useState<'summary' | 'payment'>('summary');

  // Saved payment methods state
  const [savedInstruments, setSavedInstruments] = useState<SavedPaymentInstrument[]>([]);
  const [selectedSavedPiId, setSelectedSavedPiId] = useState<string | null>(null);
  const [useNewCard, setUseNewCard] = useState(false);
  const [saveNewCard, setSaveNewCard] = useState(false);

  const tokenizeUrl = useMemo(() => {
    if (!finixContext) return null;
    // Step 2 is card/ACH only — Apple Pay lives on the summary screen.
    return buildFinixTokenizeUrl({
      context: finixContext,
      amount: feeBreakdown?.totalAmount,
      ach: true,
      wallets: false,
      external: true,
      debug: debugLogs,
      theme: isDark ? 'dark' : 'light',
    }) + `&_=${Date.now()}`;
  }, [finixContext, feeBreakdown?.totalAmount, isDark, debugLogs]);

  // Compact Apple-Pay-only form embedded on the summary screen.
  const applePayUrl = useMemo(() => {
    if (!finixContext) return null;
    return buildFinixTokenizeUrl({
      context: finixContext,
      amount: feeBreakdown?.totalAmount,
      wallets: true,
      walletsOnly: true,
      debug: debugLogs,
      theme: isDark ? 'dark' : 'light',
    }) + `&_=${Date.now()}`;
  }, [finixContext, feeBreakdown?.totalAmount, isDark, debugLogs]);

  // Rally Credits discount state
  const [showDiscounts, setShowDiscounts] = useState(false);
  const [eventRedemptions, setEventRedemptions] = useState<RallyCreditRedemption[]>([]);
  const [userCredits, setUserCredits] = useState<UserRallyCredits | null>(null);
  const [selectedDiscount, setSelectedDiscount] = useState<RallyCreditRedemption | null>(null);
  const [loadingDiscounts, setLoadingDiscounts] = useState(false);

  useEffect(() => {
    if (visible) {
      slideX.setValue(0);
      sheetHeight.setValue(SUMMARY_HEIGHT);
      // Reset to off-screen BEFORE starting the open animation. Without this,
      // a previously interrupted close (Modal unmounted mid-animation) can leave
      // slideAnim partway up — causing the next open to animate from ~0 to 0,
      // which looks like an instant jump.
      slideAnim.setValue(SCREEN_HEIGHT);
      backdropOpacity.setValue(0);
      setStep('summary');
      // Smooth ease-out slide-up + backdrop fade to match the horizontal swipe.
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
      loadFeeBreakdown(event.ticketPrice);
      loadDiscounts();
      loadSavedInstruments();
      setSelectedDiscount(null);
      setShowDiscounts(false);
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
      setFinixContext(null);
      setFormReady(false);
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
      const result = await getFinixTokenizationContext({ debug: debugLogs });
      if (result.success && result.context) {
        setFinixContext(result.context);
      } else {
        Alert.alert('Error', result.error || 'Failed to initialize payment');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to initialize payment');
    } finally {
      setInitializingPayment(false);
    }
  };

  const loadSavedInstruments = async () => {
    try {
      const result = await listSavedPaymentInstruments();
      if (result.success && result.instruments) {
        setSavedInstruments(result.instruments);
        const defaultPi = result.instruments.find((i) => i.isDefault) || result.instruments[0];
        setSelectedSavedPiId(defaultPi ? defaultPi.piId : null);
        // If user has saved cards, default to using one of them, not the form
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
      const eventSnap = await getDoc(eventRef);
      const alreadyAttending = (eventSnap.data()?.attendees || []).includes(userId);
      if (!alreadyAttending) {
        const batch = writeBatch(db);
        batch.update(eventRef, {
          attendees: arrayUnion(userId),
          attendeeCount: increment(1),
        });
        batch.set(doc(db, 'events', event.id, 'attendees', userId), {
          userId,
          joinedAt: serverTimestamp(),
        });
        await batch.commit();
      }
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

  const goToPayment = () => {
    setStep('payment');
    Animated.parallel([
      Animated.timing(slideX, {
        toValue: -SCREEN_WIDTH,
        duration: SLIDE_DURATION,
        useNativeDriver: true,
      }),
      Animated.timing(sheetHeight, {
        toValue: PAYMENT_HEIGHT,
        duration: SLIDE_DURATION,
        useNativeDriver: false,
      }),
    ]).start();
  };

  const goToSummary = () => {
    Animated.parallel([
      Animated.timing(slideX, {
        toValue: 0,
        duration: SLIDE_DURATION,
        useNativeDriver: true,
      }),
      Animated.timing(sheetHeight, {
        toValue: SUMMARY_HEIGHT,
        duration: SLIDE_DURATION,
        useNativeDriver: false,
      }),
    ]).start(() => setStep('summary'));
  };

  const handleRequestClose = () => {
    if (step === 'payment') {
      goToSummary();
    } else {
      onDismiss();
    }
  };

  // Messages from the compact Apple-Pay-only WebView on the summary screen.
  // Only handles diag + the apple_pay token; ignores ready/tab/content-height so
  // it never interferes with the step-2 card form state.
  const handleApplePayMessage = async (event_: any) => {
    try {
      const msg = JSON.parse(event_.nativeEvent.data);
      if (msg.type === 'diag') {
        const { type, stage, t, ...rest } = msg;
        const extras = Object.keys(rest).length ? ' ' + JSON.stringify(rest) : '';
        setDiagLog((prev) => [...prev.slice(-19), `[ap ${new Date(t).toISOString().slice(11, 19)}] ${stage}${extras}`]);
        return;
      }
      if (msg.type === 'token') {
        await processPayment(msg.tokenId, msg.paymentMethod || 'apple_pay', msg.fraudSessionId, {
          thirdPartyToken: msg.thirdPartyToken,
          billingContact: msg.billingContact,
        });
      } else if (msg.type === 'error') {
        Alert.alert('Payment Error', msg.message || 'An error occurred');
      }
    } catch (e) { /* ignore */ }
  };

  const handleWebViewMessage = async (event_: any) => {
    try {
      const msg = JSON.parse(event_.nativeEvent.data);
      if (msg.type === 'diag') {
        const { type, stage, t, ...rest } = msg;
        const extras = Object.keys(rest).length ? ' ' + JSON.stringify(rest) : '';
        const line = `[${new Date(t).toISOString().slice(11, 19)}] ${stage}${extras}`;
        if (debugLogs) console.log('[Finix WebView]', msg);
        setDiagLog((prev) => [...prev.slice(-19), line]);
        return;
      }
      if (msg.type === 'content-height' && typeof msg.height === 'number') {
        const next = Math.max(120, Math.ceil(msg.height) + 16);
        console.log('[Finix WebView] content-height', { reported: msg.height, applied: next });
        setWebViewHeight((prev) => (Math.abs(prev - next) > 4 ? next : prev));
        return;
      }
      if (msg.type === 'ready') {
        setFormReady(!!msg.ready);
        if (!msg.ready) {
          setDiagLog((prev) => [...prev.slice(-19), `[ready=false] ${msg.error || 'unknown'}`]);
        }
      } else if (msg.type === 'tab') {
        setPaymentMethod(msg.paymentMethod || 'card');
      } else if (msg.type === 'token') {
        await processPayment(msg.tokenId, msg.paymentMethod || 'card', msg.fraudSessionId, {
          savePaymentMethod: saveNewCard && (msg.paymentMethod || 'card') === 'card',
          thirdPartyToken: msg.thirdPartyToken,
          billingContact: msg.billingContact,
        });
      } else if (msg.type === 'error') {
        setLoading(false);
        Alert.alert('Payment Error', msg.message || 'An error occurred');
      }
    } catch (e) { /* ignore */ }
  };

  const processPayment = async (
    tokenId: string | null,
    method: string,
    fraudSessionId?: string,
    opts?: { savedPaymentInstrumentId?: string; savePaymentMethod?: boolean; thirdPartyToken?: string; billingContact?: any }
  ) => {
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
        tokenId: tokenId || undefined,
        thirdPartyToken: opts?.thirdPartyToken,
        billingContact: opts?.billingContact,
        savedPaymentInstrumentId: opts?.savedPaymentInstrumentId,
        savePaymentMethod: opts?.savePaymentMethod,
        fraudSessionId,
        idempotencyKey: getIdempotencyKey(method),
        debug: debugLogs,
        paymentMethod: method as any,
        eventId: event.id,
        ticketPrice: discountedTicketPrice,
        originalPrice: event.ticketPrice,
        discountAmount,
        currency: (event.currency || 'usd').toUpperCase(),
        discountApplied: selectedDiscount ? {
          redemptionId: selectedDiscount.id,
          redemptionName: selectedDiscount.name,
          creditsUsed: selectedDiscount.creditsRequired,
        } : undefined,
      });

      // Apple Pay: dismiss the native sheet before our own alert. Inject into
      // both WebViews — only the one that started the session will respond.
      if (method === 'apple_pay') {
        const js = `window.__applePayCompletion && window.__applePayCompletion(${result.success ? 'true' : 'false'}); true;`;
        webViewRef.current?.injectJavaScript(js);
        applePayWebViewRef.current?.injectJavaScript(js);
      }

      if (result.success) {
        idempotencyRef.current = null; // charge captured — next purchase gets a fresh key
        if (selectedDiscount) {
          await spendRallyCredits(
            userId, event.clubId, selectedDiscount.creditsRequired,
            selectedDiscount.id, `Event discount: ${event.title}`
          ).catch(() => { /* non-fatal */ });
        }

        const isAch = method === 'ach';
        Alert.alert(
          isAch ? 'ACH Authorization Confirmed' : 'Payment Successful!',
          isAch
            ? 'You authorized a one-time ACH debit from your bank account for this ticket. The debit may take 3–5 business days to clear, and you will receive a confirmation email. To revoke or dispute this authorization, contact support@rallysphere.com.'
            : 'You have successfully purchased a ticket for this event.',
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
      setLoading(true);
      processPayment('free_ticket_token', 'card');
      return;
    }

    // Saved-card path — skip tokenization entirely
    if (!useNewCard && selectedSavedPiId) {
      setLoading(true);
      processPayment(null, 'card', undefined, { savedPaymentInstrumentId: selectedSavedPiId });
      return;
    }

    if (!formReady) {
      Alert.alert('Error', 'Payment form is not ready yet. Please wait a moment.');
      return;
    }
    setLoading(true);
    webViewRef.current?.injectJavaScript('window.__submit && window.__submit(); true;');
  };

  const formatBrand = (brand: string | null): string => {
    if (!brand) return 'Card';
    const map: Record<string, string> = {
      visa: 'Visa',
      mastercard: 'Mastercard',
      amex: 'American Express',
      'american express': 'American Express',
      discover: 'Discover',
      diners: 'Diners Club',
      jcb: 'JCB',
      unionpay: 'UnionPay',
    };
    return map[brand.toLowerCase()] || brand.charAt(0).toUpperCase() + brand.slice(1);
  };

  const formatPrice = (price: number, currency: string = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: (currency || 'USD').toUpperCase(),
    }).format(price);
  };

  const { ticketPrice: discountedTicketPrice, discount: discountAmount, isFree } = calculateDiscountedPrice();

  return (
    <Modal visible={visible} onRequestClose={handleRequestClose} transparent animationType="none" statusBarTranslucent>
      {/* Backdrop fades in/out alongside the slide. Inner pressable handles dismiss-on-tap. */}
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={onDismiss} />
      </Animated.View>

      {/* Outer wrapper: native-driven open/close translateY. */}
      {/* Inner: JS-driven height (layout). Splitting avoids the native/JS driver collision. */}
      <Animated.View
        style={[styles.sheetWrapper, { transform: [{ translateY: slideAnim }] }]}
      >
        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: theme.colors.surface,
              height: sheetHeight,
            },
          ]}
        >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
          keyboardVerticalOffset={0}
        >
          {/* Handle */}
          <View style={styles.handleContainer}>
            <View style={[styles.handle, { backgroundColor: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.2)' }]} />
          </View>

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
                  contentContainerStyle={[styles.scrollContent, { paddingBottom: 16 }]}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode="on-drag"
                >
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
                  </View>
                </ScrollView>

                {/* Fixed footer — Apple Pay on top, then card/bank. Pinned to the bottom of the sheet. */}
                <View style={[styles.content, { paddingBottom: insets.bottom + 16, paddingTop: 8 }]}>
                  {/* Apple Pay — compact WebView button (Apple Pay must launch from a tap inside a WebView) */}
                  {!isFree && finixContext && applePayUrl && (
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
                  )}

                  {!isFree && finixContext && applePayUrl && (
                    <View style={styles.orRow}>
                      <View style={[styles.orLine, { backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)' }]} />
                      <Text style={[styles.orText, { color: theme.colors.onSurfaceVariant }]}>or</Text>
                      <View style={[styles.orLine, { backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)' }]} />
                    </View>
                  )}

                  <TouchableOpacity
                    style={[styles.continueButton, { marginBottom: 0, backgroundColor: isFree ? '#10B981' : theme.colors.primary, opacity: (loading || (!isFree && !feeBreakdown)) ? 0.7 : 1 }]}
                    onPress={isFree ? handlePay : goToPayment}
                    disabled={loading || (!isFree && !feeBreakdown)}
                  >
                    {loading ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <>
                        <Text style={styles.continueButtonText}>
                          {isFree
                            ? 'Claim Free Ticket'
                            : `Continue with Card / Bank — ${feeBreakdown ? formatPrice(feeBreakdown.totalAmount, event.currency) : formatPrice(discountedTicketPrice, event.currency)}`}
                        </Text>
                        <Text style={styles.continueButtonSubtext}>
                          {isFree ? `Using ${selectedDiscount?.creditsRequired} Rally Credits` : 'Next: enter card or bank details'}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              {/* ============ PANE 2: PAYMENT ============ */}
              <View style={{ width: SCREEN_WIDTH, flex: 1 }}>
                <View style={[styles.content, { paddingBottom: 0, paddingTop: 4 }]}>
                  <View style={styles.stepHeader}>
                    <TouchableOpacity onPress={goToSummary} style={styles.backButton} activeOpacity={0.7}>
                      <Text style={[styles.backButtonText, { color: theme.colors.primary }]}>← Back</Text>
                    </TouchableOpacity>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text variant="titleMedium" style={{ fontWeight: 'bold' }} numberOfLines={1}>{event.title}</Text>
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                        Total: {feeBreakdown ? formatPrice(feeBreakdown.totalAmount, event.currency) : formatPrice(event.ticketPrice || 0, event.currency)}
                      </Text>
                    </View>
                  </View>
                  <Text variant="labelMedium" style={[styles.sectionLabel, { marginBottom: 4 }]}>PAYMENT METHOD</Text>
                </View>

                {/* Body: either saved-card picker or fresh-card WebView */}
                {!useNewCard && savedInstruments.length > 0 ? (
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
                          style={[
                            styles.savedCardRow,
                            { borderColor: selected ? theme.colors.primary : theme.colors.outline },
                          ]}
                        >
                          <View style={styles.savedCardLeft}>
                            <Text style={styles.savedCardBrand}>{formatBrand(pi.brand)}</Text>
                            <Text style={[styles.savedCardMeta, { color: theme.colors.onSurfaceVariant }]}>
                              •••• {pi.last4 || '----'}
                              {pi.expMonth && pi.expYear ? `  ·  ${String(pi.expMonth).padStart(2, '0')}/${String(pi.expYear).slice(-2)}` : ''}
                              {pi.isDefault ? '  ·  Default' : ''}
                            </Text>
                          </View>
                          <View
                            style={[
                              styles.savedCardRadio,
                              { borderColor: selected ? theme.colors.primary : theme.colors.outline },
                            ]}
                          >
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
                  <>
                    {/* Form area — WebView mounts as soon as tokenizeUrl is ready (modal open).
                        Overlay covers it with logo + "Initializing form…" until formReady fires. */}
                    <View style={{ flex: 1, position: 'relative' }}>
                      {!isFree && finixContext && tokenizeUrl && (
                        <WebView
                          ref={webViewRef}
                          source={{ uri: tokenizeUrl }}
                          style={{ flex: 1, backgroundColor: 'transparent', marginHorizontal: 20 }}
                          containerStyle={{ backgroundColor: 'transparent', flex: 1 }}
                          onMessage={handleWebViewMessage}
                          javaScriptEnabled
                          scrollEnabled
                          showsVerticalScrollIndicator
                          originWhitelist={['*']}
                          mixedContentMode="always"
                          cacheEnabled={false}
                          incognito
                          backgroundColor="transparent"
                          keyboardDisplayRequiresUserAction={false}
                          hideKeyboardAccessoryView={false}
                          // Expose Apple Pay JS API inside the WebView so window.Finix.ApplePay works.
                          // Off by default in react-native-webview; without this the wallet button never renders.
                          applePayEnabled
                        />
                      )}
                      {!formReady && (
                        <View
                          style={[
                            StyleSheet.absoluteFillObject,
                            styles.formInitOverlay,
                            { backgroundColor: theme.colors.surface },
                          ]}
                        >
                          <Image
                            source={require('../assets/Logo.png')}
                            style={styles.formInitLogo}
                            resizeMode="contain"
                          />
                          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 16 }}>
                            Initializing form…
                          </Text>
                        </View>
                      )}
                    </View>

                    {/* Save-card opt-in (only for fresh card flow). Wallet/ACH paths can't be saved. */}
                    {paymentMethod === 'card' && (
                      <View style={[styles.content, { paddingTop: 0, paddingBottom: 4 }]}>
                        <TouchableOpacity
                          onPress={() => setSaveNewCard((v) => !v)}
                          activeOpacity={0.7}
                          style={styles.saveCardRow}
                        >
                          <View
                            style={[
                              styles.saveCardCheckbox,
                              { borderColor: saveNewCard ? theme.colors.primary : theme.colors.outline, backgroundColor: saveNewCard ? theme.colors.primary : 'transparent' },
                            ]}
                          >
                            {saveNewCard && <Text style={styles.saveCardCheckmark}>✓</Text>}
                          </View>
                          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginLeft: 8 }}>
                            Save this card for next time
                          </Text>
                        </TouchableOpacity>
                        {savedInstruments.length > 0 && (
                          <TouchableOpacity onPress={() => setUseNewCard(false)} activeOpacity={0.7} style={{ marginTop: 6 }}>
                            <Text variant="bodySmall" style={{ color: theme.colors.primary }}>← Use a saved card</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}
                  </>
                )}

                <View style={[styles.content, { paddingBottom: insets.bottom + 16, paddingTop: 12 }]}>
                  {(() => {
                    const usingSaved = !useNewCard && !!selectedSavedPiId;
                    const payDisabled = loading || (!usingSaved && !formReady);
                    return (
                  <TouchableOpacity
                    style={[styles.continueButton, { marginBottom: 0, backgroundColor: theme.colors.primary, opacity: payDisabled ? 0.7 : 1 }]}
                    onPress={handlePay}
                    disabled={payDisabled}
                  >
                    {loading ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.continueButtonText}>
                        {paymentMethod === 'ach'
                          ? `Authorize & Pay ${feeBreakdown ? formatPrice(feeBreakdown.totalAmount, event.currency) : formatPrice(discountedTicketPrice, event.currency)}`
                          : `Pay ${feeBreakdown ? formatPrice(feeBreakdown.totalAmount, event.currency) : formatPrice(discountedTicketPrice, event.currency)}`}
                      </Text>
                    )}
                  </TouchableOpacity>
                    );
                  })()}
                </View>
              </View>
            </Animated.View>
          </View>
        </KeyboardAvoidingView>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.85)' },
  sheetWrapper: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.2, shadowRadius: 8, elevation: 10,
  },
  sheet: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    overflow: 'hidden',
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
  webView: { marginBottom: 8, backgroundColor: 'transparent' },
  stepHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, marginTop: 4 },
  backButton: { paddingVertical: 6, paddingHorizontal: 8, borderRadius: 8 },
  backButtonText: { fontSize: 15, fontWeight: '600' },
  diagPanel: { padding: 10, borderRadius: 8, borderWidth: 1, marginBottom: 16 },
  formInitOverlay: { alignItems: 'center', justifyContent: 'center' },
  formInitLogo: { width: 96, height: 96 },
  continueButton: { borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginBottom: 16 },
  continueButtonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  continueButtonSubtext: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 4 },
  orRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 12 },
  orLine: { flex: 1, height: 1 },
  orText: { marginHorizontal: 12, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  savedCardRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 10,
  },
  savedCardLeft: { flex: 1 },
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
