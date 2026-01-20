import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Alert, Platform, TouchableOpacity, Animated, Dimensions, ScrollView, Modal } from 'react-native';
import { Button, Text, ActivityIndicator, useTheme, Divider, TextInput, IconButton } from 'react-native-paper';
import type { Event, RallyCreditRedemption, UserRallyCredits } from '../lib/firebase';
import { db, auth, getClubRallyRedemptions, getUserRallyCredits, spendRallyCredits } from '../lib/firebase';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { LinearGradient } from 'expo-linear-gradient';

// Conditionally import Stripe based on platform
let CardField: any = null;
let useStripe: any = () => ({ confirmPayment: null, presentApplePay: null, confirmApplePayPayment: null, initGooglePay: null, presentGooglePay: null });
let usePaymentSheet: any = () => ({ initPaymentSheet: null, presentPaymentSheet: null });
let createPaymentIntent: any = null;
let loadStripe: any = null;
let stripePromise: any = null;

if (Platform.OS === 'web') {
  // Web: Use Stripe.js
  const { loadStripe: load } = require('@stripe/stripe-js');
  loadStripe = load;
  const publishableKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (publishableKey) {
    stripePromise = loadStripe(publishableKey);
  }
  const { createPaymentIntent: create } = require('../lib/stripe');
  createPaymentIntent = create;
} else {
  // Native: Use Stripe React Native
  const stripeModule = require('@stripe/stripe-react-native');
  CardField = stripeModule.CardField;
  useStripe = stripeModule.useStripe;
  usePaymentSheet = stripeModule.usePaymentSheet;
  const stripeLib = require('../lib/stripe');
  createPaymentIntent = stripeLib.createPaymentIntent;
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface PaymentSheetProps {
  visible: boolean;
  event: Event;
  onDismiss: () => void;
  onSuccess: () => void;
}

export default function PaymentSheet({ visible, event, onDismiss, onSuccess }: PaymentSheetProps) {
  const theme = useTheme();

  // State for web payment form
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvc, setCvc] = useState('');
  const [cardholderName, setCardholderName] = useState('');

  // Initialize Stripe for native
  const stripe = Platform.OS !== 'web' ? useStripe() : null;
  const { initPaymentSheet, presentPaymentSheet } = Platform.OS !== 'web' ? usePaymentSheet() : { initPaymentSheet: null, presentPaymentSheet: null };
  const [loading, setLoading] = useState(false);
  const [cardComplete, setCardComplete] = useState(false);
  const [feeBreakdown, setFeeBreakdown] = useState<any>(null);

  // Rally Credits discount state
  const [showDiscounts, setShowDiscounts] = useState(false);
  const [eventRedemptions, setEventRedemptions] = useState<RallyCreditRedemption[]>([]);
  const [userCredits, setUserCredits] = useState<UserRallyCredits | null>(null);
  const [selectedDiscount, setSelectedDiscount] = useState<RallyCreditRedemption | null>(null);
  const [loadingDiscounts, setLoadingDiscounts] = useState(false);

  // Animation
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  // Use platform detection for payment method availability
  // Apple Pay is only available on iOS, Google Pay on Android
  const applePaySupported = Platform.OS === 'ios';
  const googlePaySupported = Platform.OS === 'android';

  useEffect(() => {
    if (visible) {
      // Slide up
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 50,
        friction: 8,
      }).start();

      // Load fee breakdown when sheet opens - always use original price
      loadFeeBreakdown(event.ticketPrice, event.ticketPrice);
      // Load rally credit discounts
      loadDiscounts();
      // Reset selected discount
      setSelectedDiscount(null);
      setShowDiscounts(false);
    } else {
      // Slide down
      Animated.timing(slideAnim, {
        toValue: SCREEN_HEIGHT,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  const loadDiscounts = async () => {
    if (!event.clubId) return;

    try {
      setLoadingDiscounts(true);
      const userId = auth.currentUser?.uid;
      if (!userId) return;

      // Load user's rally credits
      const creditsResult = await getUserRallyCredits(userId);
      if (creditsResult.success && creditsResult.credits) {
        setUserCredits(creditsResult.credits);
      }

      // Load club's event redemptions (event_discount and event_free_admission)
      const redemptionsResult = await getClubRallyRedemptions(event.clubId);
      if (redemptionsResult.success && redemptionsResult.redemptions) {
        const eventDiscounts = redemptionsResult.redemptions.filter(
          (r: RallyCreditRedemption) =>
            r.isActive && (r.type === 'event_discount' || r.type === 'event_free_admission')
        );
        setEventRedemptions(eventDiscounts);
      }
    } catch (error) {
      console.error('Error loading discounts:', error);
    } finally {
      setLoadingDiscounts(false);
    }
  };

  const loadFeeBreakdown = async (ticketPrice?: number, originalPrice?: number) => {
    const priceToUse = ticketPrice ?? event.ticketPrice;
    const originalPriceToUse = originalPrice ?? event.ticketPrice;
    if (!priceToUse) return;

    try {
      console.log('🔍 loadFeeBreakdown params:', {
        ticketPrice: priceToUse,
        originalPrice: originalPriceToUse,
        eventTicketPrice: event.ticketPrice
      });

      const paymentIntentResult = await createPaymentIntent({
        eventId: event.id,
        ticketPrice: priceToUse,
        originalPrice: originalPriceToUse, // Always use original price for fee calculations
        currency: event.currency || 'usd',
      });

      if (paymentIntentResult.success && paymentIntentResult.breakdown) {
        setFeeBreakdown(paymentIntentResult.breakdown);
      }
    } catch (error) {
      console.error('Error loading fee breakdown:', error);
    }
  };

  const addUserToEvent = async () => {
    try {
      const userId = auth.currentUser?.uid;
      if (!userId) {
        console.error('No user ID found');
        return;
      }

      const eventRef = doc(db, 'events', event.id);
      await updateDoc(eventRef, {
        attendees: arrayUnion(userId),
      });

      console.log('Successfully added user to event');
    } catch (error) {
      console.error('Error adding user to event:', error);
    }
  };

  const handlePayment = async () => {
    if (!cardComplete) {
      Alert.alert('Error', 'Please complete your card details');
      return;
    }

    if (!event.ticketPrice) {
      Alert.alert('Error', 'This event does not have a ticket price');
      return;
    }

    setLoading(true);

    try {
      // Step 1: Create payment intent via Firebase Cloud Function
      const paymentIntentResult = await createPaymentIntent({
        eventId: event.id,
        ticketPrice: event.ticketPrice,
        originalPrice: event.ticketPrice, // Always pass original price for fee calculations
        currency: event.currency || 'usd',
      });

      if (!paymentIntentResult.success || !paymentIntentResult.clientSecret) {
        Alert.alert('Error', paymentIntentResult.error || 'Failed to initialize payment');
        setLoading(false);
        return;
      }

      // Store fee breakdown for display
      if (paymentIntentResult.breakdown) {
        setFeeBreakdown(paymentIntentResult.breakdown);
      }

      // Step 2: Confirm payment with Stripe
      const { error, paymentIntent } = await stripe.confirmPayment(paymentIntentResult.clientSecret, {
        paymentMethodType: 'Card',
      });

      if (error) {
        Alert.alert('Payment Failed', error.message || 'An error occurred during payment');
        setLoading(false);
        return;
      }

      // Step 3: Payment successful
      if (paymentIntent && paymentIntent.status === 'Succeeded') {
        // Wait a moment for webhook to process before showing success
        setTimeout(() => {
          Alert.alert(
            'Payment Successful!',
            'You have successfully purchased a ticket for this event.',
            [
              {
                text: 'OK',
                onPress: () => {
                  onSuccess();
                  onDismiss();
                },
              },
            ]
          );
        }, 1500); // Wait 1.5 seconds for webhook to process
      } else {
        Alert.alert('Payment Processing', 'Your payment is being processed. You will receive a confirmation shortly.');
        onDismiss();
      }
    } catch (error: any) {
      console.error('Payment error:', error);
      Alert.alert('Error', error.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleApplePay = async () => {
    if (!event.ticketPrice) return;

    setLoading(true);

    try {
      // Step 1: Create payment intent
      const paymentIntentResult = await createPaymentIntent({
        eventId: event.id,
        ticketPrice: event.ticketPrice,
        originalPrice: event.ticketPrice, // Always pass original price for fee calculations
        currency: event.currency || 'usd',
      });

      if (!paymentIntentResult.success || !paymentIntentResult.clientSecret) {
        Alert.alert('Error', paymentIntentResult.error || 'Failed to initialize payment');
        setLoading(false);
        return;
      }

      // Store fee breakdown
      if (paymentIntentResult.breakdown) {
        setFeeBreakdown(paymentIntentResult.breakdown);
      }

      const totalAmount = paymentIntentResult.breakdown?.totalAmount || event.ticketPrice;

      // Step 2: Present Apple Pay
      const { error } = await stripe.presentApplePay({
        cartItems: [
          {
            label: event.title,
            amount: totalAmount.toFixed(2),
            paymentType: 'Immediate',
          },
        ],
        country: 'US',
        currency: (event.currency || 'USD').toUpperCase(),
      });

      if (error) {
        Alert.alert('Apple Pay Failed', error.message);
        setLoading(false);
        return;
      }

      // Step 3: Confirm Apple Pay payment
      const { error: confirmError } = await stripe.confirmApplePayPayment(
        paymentIntentResult.clientSecret
      );

      if (confirmError) {
        Alert.alert('Payment Failed', confirmError.message);
        setLoading(false);
        return;
      }

      // Success - wait for webhook to process
      setTimeout(() => {
        Alert.alert(
          'Payment Successful!',
          'You have successfully purchased a ticket for this event.',
          [
            {
              text: 'OK',
              onPress: () => {
                onSuccess();
                onDismiss();
              },
            },
          ]
        );
      }, 1500); // Wait 1.5 seconds for webhook to process
    } catch (error: any) {
      console.error('Apple Pay error:', error);
      Alert.alert('Error', error.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleGooglePay = async () => {
    if (!event.ticketPrice) return;

    setLoading(true);

    try {
      // Step 1: Create payment intent
      const paymentIntentResult = await createPaymentIntent({
        eventId: event.id,
        ticketPrice: event.ticketPrice,
        originalPrice: event.ticketPrice, // Always pass original price for fee calculations
        currency: event.currency || 'usd',
      });

      if (!paymentIntentResult.success || !paymentIntentResult.clientSecret) {
        Alert.alert('Error', paymentIntentResult.error || 'Failed to initialize payment');
        setLoading(false);
        return;
      }

      // Store fee breakdown
      if (paymentIntentResult.breakdown) {
        setFeeBreakdown(paymentIntentResult.breakdown);
      }

      const totalAmount = paymentIntentResult.breakdown?.totalAmount || event.ticketPrice;

      // Step 2: Initialize Google Pay
      const { error: initError } = await stripe.initGooglePay({
        merchantName: 'RallySphere',
        countryCode: 'US',
        billingAddressConfig: {
          isRequired: false,
        },
        isEmailRequired: false,
        testEnv: __DEV__, // Use test environment in development
      });

      if (initError) {
        Alert.alert('Google Pay Error', initError.message);
        setLoading(false);
        return;
      }

      // Step 3: Present Google Pay
      const { error: presentError } = await stripe.presentGooglePay({
        clientSecret: paymentIntentResult.clientSecret,
        forSetupIntent: false,
      });

      if (presentError) {
        Alert.alert('Google Pay Failed', presentError.message);
        setLoading(false);
        return;
      }

      // Success
      Alert.alert(
        'Payment Successful!',
        'You have successfully purchased a ticket for this event.',
        [
          {
            text: 'OK',
            onPress: () => {
              onSuccess();
              onDismiss();
            },
          },
        ]
      );
    } catch (error: any) {
      console.error('Google Pay error:', error);
      Alert.alert('Error', error.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleMorePaymentOptions = async () => {
    if (!event.ticketPrice) return;

    setLoading(true);

    try {
      const userId = auth.currentUser?.uid;
      if (!userId) {
        Alert.alert('Error', 'You must be logged in to purchase tickets');
        setLoading(false);
        return;
      }

      // Handle FREE ticket redemption (using Rally Credits for free admission)
      if (isFree && selectedDiscount) {
        // Spend the rally credits
        const spendResult = await spendRallyCredits(
          userId,
          event.clubId,
          selectedDiscount.creditsRequired,
          selectedDiscount.id,
          `Event ticket: ${event.title}`
        );

        if (!spendResult.success) {
          Alert.alert('Error', spendResult.error || 'Failed to redeem Rally Credits');
          setLoading(false);
          return;
        }

        // Add user to event
        await addUserToEvent();

        Alert.alert(
          'Ticket Claimed!',
          `You've successfully claimed your free ticket using ${selectedDiscount.creditsRequired} Rally Credits.`,
          [
            {
              text: 'OK',
              onPress: () => {
                onSuccess();
                onDismiss();
              },
            },
          ]
        );
        return;
      }

      // Step 1: Create payment intent with discounted price
      const paymentIntentResult = await createPaymentIntent({
        eventId: event.id,
        ticketPrice: discountedTicketPrice, // Discounted price user pays
        originalPrice: event.ticketPrice, // Original price for fee calculations
        discountAmount: discountAmount, // Amount of discount applied
        currency: event.currency || 'usd',
        // Pass discount info for record-keeping
        discountApplied: selectedDiscount ? {
          redemptionId: selectedDiscount.id,
          redemptionName: selectedDiscount.name,
          originalPrice: event.ticketPrice,
          discountAmount: discountAmount,
          creditsUsed: selectedDiscount.creditsRequired,
        } : undefined,
      });

      if (!paymentIntentResult.success || !paymentIntentResult.clientSecret) {
        Alert.alert('Error', paymentIntentResult.error || 'Failed to initialize payment');
        setLoading(false);
        return;
      }

      // Store fee breakdown
      if (paymentIntentResult.breakdown) {
        setFeeBreakdown(paymentIntentResult.breakdown);
      }

      const totalAmount = paymentIntentResult.breakdown?.totalAmount || discountedTicketPrice;

      // Step 2: Initialize Stripe Payment Sheet (includes Link, Venmo, etc.)
      const { error: initError } = await initPaymentSheet({
        merchantDisplayName: 'RallySphere',
        paymentIntentClientSecret: paymentIntentResult.clientSecret,
        allowsDelayedPaymentMethods: true,
        googlePay: {
          merchantCountryCode: 'US',
          testEnv: __DEV__,
          currencyCode: (event.currency || 'USD').toUpperCase(),
        },
        applePay: {
          merchantCountryCode: 'US',
        },
        returnURL: 'rallysphere://payment-return',
      });

      if (initError) {
        console.error('Payment Sheet init error:', {
          code: initError.code,
          message: initError.message,
          localizedMessage: initError.localizedMessage,
        });
        Alert.alert('Payment Error', `${initError.message}\n\nCode: ${initError.code}`);
        setLoading(false);
        return;
      }

      // Step 3: Present the payment sheet
      const { error: presentError } = await presentPaymentSheet();

      if (presentError) {
        if (presentError.code !== 'Canceled') {
          Alert.alert('Payment Failed', presentError.message);
        }
        setLoading(false);
        return;
      }

      // Step 4: Spend Rally Credits if a discount was applied
      if (selectedDiscount) {
        const spendResult = await spendRallyCredits(
          userId,
          event.clubId,
          selectedDiscount.creditsRequired,
          selectedDiscount.id,
          `Event discount: ${event.title}`
        );

        if (!spendResult.success) {
          console.error('Failed to spend rally credits:', spendResult.error);
          // Note: Payment already succeeded, so we don't fail the transaction
          // The credits spend is best-effort
        }
      }

      // Success - add user to event immediately
      await addUserToEvent();

      Alert.alert(
        'Payment Successful!',
        'You have successfully purchased a ticket for this event.',
        [
          {
            text: 'OK',
            onPress: () => {
              onSuccess();
              onDismiss();
            },
          },
        ]
      );
    } catch (error: any) {
      console.error('Payment Sheet error:', error);
      Alert.alert('Error', error.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleWebPayment = async () => {
    if (!event.ticketPrice) return;

    setLoading(true);

    try {
      const userId = auth.currentUser?.uid;
      if (!userId) {
        Alert.alert('Error', 'You must be logged in to purchase tickets');
        setLoading(false);
        return;
      }

      // Handle FREE ticket redemption (using Rally Credits for free admission)
      if (isFree && selectedDiscount) {
        // Spend the rally credits
        const spendResult = await spendRallyCredits(
          userId,
          event.clubId,
          selectedDiscount.creditsRequired,
          selectedDiscount.id,
          `Event ticket: ${event.title}`
        );

        if (!spendResult.success) {
          Alert.alert('Error', spendResult.error || 'Failed to redeem Rally Credits');
          setLoading(false);
          return;
        }

        // Add user to event
        await addUserToEvent();

        Alert.alert(
          'Ticket Claimed!',
          `You've successfully claimed your free ticket using ${selectedDiscount.creditsRequired} Rally Credits.`,
          [
            {
              text: 'OK',
              onPress: () => {
                onSuccess();
                onDismiss();
              },
            },
          ]
        );
        return;
      }

      // Import createCheckoutSession from stripe lib
      const { createCheckoutSession } = require('../lib/stripe');

      // Get current URL origin for redirect
      const origin = typeof window !== 'undefined' ? window.location.origin : '';

      // Build success URL with discount info if applicable
      let successUrl = `${origin}/payment-success?session_id={CHECKOUT_SESSION_ID}&event_id=${event.id}`;
      if (selectedDiscount) {
        successUrl += `&redemption_id=${selectedDiscount.id}&credits_used=${selectedDiscount.creditsRequired}`;
      }

      // Create Stripe Checkout Session with discounted price
      const result = await createCheckoutSession({
        eventId: event.id,
        ticketPrice: discountedTicketPrice, // Use discounted price
        currency: event.currency || 'usd',
        successUrl,
        cancelUrl: `${origin}/payment-cancel?event_id=${event.id}`,
        // Pass discount info for record-keeping
        discountApplied: selectedDiscount ? {
          redemptionId: selectedDiscount.id,
          redemptionName: selectedDiscount.name,
          originalPrice: event.ticketPrice,
          discountAmount: discountAmount,
          creditsUsed: selectedDiscount.creditsRequired,
        } : undefined,
      });

      if (!result.success || !result.checkoutUrl) {
        Alert.alert('Error', result.error || 'Failed to initialize payment');
        setLoading(false);
        return;
      }

      // For web, spend credits on successful redirect back (handled by payment-success page)
      // Store discount info in session storage for the success page to use
      if (selectedDiscount && typeof window !== 'undefined') {
        window.sessionStorage.setItem('pendingCreditSpend', JSON.stringify({
          userId,
          clubId: event.clubId,
          amount: selectedDiscount.creditsRequired,
          redemptionId: selectedDiscount.id,
          description: `Event discount: ${event.title}`,
        }));
      }

      // Redirect to Stripe Checkout
      window.location.href = result.checkoutUrl;
    } catch (error: any) {
      console.error('Web payment error:', error);
      Alert.alert('Error', error.message || 'An unexpected error occurred');
      setLoading(false);
    }
  };

  const formatPrice = (price: number, currency: string = 'USD') => {
    const validCurrency = currency && typeof currency === 'string' ? currency : 'USD';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: validCurrency.toUpperCase(),
    }).format(price);
  };

  // Calculate discounted ticket price
  const calculateDiscountedPrice = (): { ticketPrice: number; discount: number; isFree: boolean } => {
    const originalPrice = event.ticketPrice || 0;

    if (!selectedDiscount) {
      return { ticketPrice: originalPrice, discount: 0, isFree: false };
    }

    // Free admission
    if (selectedDiscount.type === 'event_free_admission') {
      return { ticketPrice: 0, discount: originalPrice, isFree: true };
    }

    // Percentage discount
    if (selectedDiscount.discountPercent != null) {
      const discountPercent = Number(selectedDiscount.discountPercent);
      if (!isNaN(discountPercent)) {
        const discount = Math.round((originalPrice * discountPercent) / 100 * 100) / 100;
        const newPrice = Math.round(Math.max(0, originalPrice - discount) * 100) / 100;
        return { ticketPrice: newPrice, discount, isFree: newPrice === 0 };
      }
    }

    // Fixed amount discount
    if (selectedDiscount.discountAmount != null) {
      const discountAmount = Number(selectedDiscount.discountAmount);
      if (!isNaN(discountAmount)) {
        const discount = Math.round(Math.min(originalPrice, discountAmount) * 100) / 100;
        const newPrice = Math.round(Math.max(0, originalPrice - discount) * 100) / 100;
        return { ticketPrice: newPrice, discount, isFree: newPrice === 0 };
      }
    }

    return { ticketPrice: originalPrice, discount: 0, isFree: false };
  };

  // Check if user can afford a discount
  const canAffordDiscount = (redemption: RallyCreditRedemption): boolean => {
    if (!userCredits) return false;
    return userCredits.availableCredits >= redemption.creditsRequired;
  };

  // Get discount description with type
  const getDiscountDescription = (redemption: RallyCreditRedemption): string => {
    const typeLabel = redemption.type === 'event_discount' ? 'Event Discount' :
                      redemption.type === 'event_free_admission' ? 'Free Event Admission' : '';

    if (redemption.type === 'event_free_admission') {
      return 'Free Admission';
    }

    let discountValue = '';
    if (redemption.discountPercent) {
      discountValue = `${redemption.discountPercent}% off`;
    } else if (redemption.discountAmount) {
      discountValue = `$${redemption.discountAmount.toFixed(2)} off`;
    } else {
      discountValue = 'Discount';
    }

    return typeLabel ? `${discountValue} (${typeLabel})` : discountValue;
  };

  // Handle applying a discount
  const handleApplyDiscount = async (redemption: RallyCreditRedemption) => {
    if (!canAffordDiscount(redemption)) {
      Alert.alert(
        'Insufficient Credits',
        `You need ${redemption.creditsRequired} Rally Credits to apply this discount. You have ${userCredits?.availableCredits || 0} credits.`
      );
      return;
    }

    setSelectedDiscount(redemption);
    setShowDiscounts(false);
  };

  // Handle removing a discount
  const handleRemoveDiscount = () => {
    setSelectedDiscount(null);
  };

  // Reload fee breakdown when discount changes
  useEffect(() => {
    if (visible && event.ticketPrice) {
      const { ticketPrice: discountedPrice } = calculateDiscountedPrice();
      // Always pass original price for fee calculations, even when showing discounted price
      loadFeeBreakdown(discountedPrice, event.ticketPrice);
    }
  }, [selectedDiscount]);

  const { ticketPrice: discountedTicketPrice, discount: discountAmount, isFree } = calculateDiscountedPrice();

  return (
    <Modal
      visible={visible}
      onRequestClose={onDismiss}
      transparent
      animationType="none"
      statusBarTranslucent
    >
      {/* Backdrop */}
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={onDismiss}
      />

      <Animated.View
        style={[
          styles.sheet,
          {
            backgroundColor: theme.dark ? '#1c1c1e' : '#ffffff',
            transform: [{ translateY: slideAnim }],
          }
        ]}
      >
        {/* Handle Bar */}
        <View style={styles.handleContainer}>
          <View style={[styles.handle, { backgroundColor: theme.dark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.2)' }]} />
        </View>

        {/* Close Button */}
        <TouchableOpacity
          style={[styles.closeButton, { backgroundColor: theme.dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]}
          onPress={onDismiss}
        >
          <Text style={[styles.closeIcon, { color: theme.dark ? '#fff' : '#666' }]}>✕</Text>
        </TouchableOpacity>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>
            <Text variant="headlineSmall" style={styles.title}>
              Complete Purchase
            </Text>

            {/* Event Details */}
            <View style={styles.eventInfo}>
              <Text variant="labelMedium" style={styles.sectionLabel}>EVENT</Text>
              <Text variant="titleLarge" style={styles.eventTitle}>{event.title}</Text>

              <Text variant="labelMedium" style={[styles.sectionLabel, { marginTop: 16 }]}>ORGANIZER</Text>
              <Text variant="bodyLarge">{event.clubName}</Text>
            </View>

            {/* Rally Credits Discount Section */}
            {eventRedemptions.length > 0 && (
              <View style={styles.discountSection}>
                <Text variant="labelMedium" style={styles.sectionLabel}>RALLY CREDITS REWARDS</Text>

                {selectedDiscount ? (
                  // Show applied discount
                  <View style={styles.appliedDiscount}>
                    <LinearGradient
                      colors={['rgba(255, 215, 0, 0.15)', 'rgba(255, 165, 0, 0.1)']}
                      style={styles.appliedDiscountGradient}
                    >
                      <View style={styles.appliedDiscountContent}>
                        <View style={styles.appliedDiscountLeft}>
                          <Text style={styles.appliedDiscountIcon}>⭐</Text>
                          <View>
                            <Text style={styles.appliedDiscountName}>{selectedDiscount.name}</Text>
                            <Text style={styles.appliedDiscountValue}>
                              {getDiscountDescription(selectedDiscount)} • {selectedDiscount.creditsRequired} credits
                            </Text>
                          </View>
                        </View>
                        <TouchableOpacity onPress={handleRemoveDiscount} style={styles.removeDiscountButton}>
                          <IconButton icon="close" size={18} iconColor="#F59E0B" style={{ margin: 0 }} />
                        </TouchableOpacity>
                      </View>
                    </LinearGradient>
                  </View>
                ) : (
                  // Show button to reveal discounts
                  <TouchableOpacity
                    style={styles.showDiscountsButton}
                    onPress={() => setShowDiscounts(!showDiscounts)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.showDiscountsContent}>
                      <Text style={styles.showDiscountsIcon}>⭐</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.showDiscountsText}>Apply Rally Credits Reward</Text>
                        <Text style={styles.showDiscountsSubtext}>
                          You have {userCredits?.availableCredits || 0} credits available
                        </Text>
                      </View>
                      <IconButton
                        icon={showDiscounts ? 'chevron-up' : 'chevron-down'}
                        size={24}
                        iconColor="#F59E0B"
                        style={{ margin: 0 }}
                      />
                    </View>
                  </TouchableOpacity>
                )}

                {/* Discounts List */}
                {showDiscounts && !selectedDiscount && (
                  <View style={styles.discountsList}>
                    {loadingDiscounts ? (
                      <ActivityIndicator size="small" color="#F59E0B" style={{ padding: 20 }} />
                    ) : (
                      eventRedemptions.map((redemption) => {
                        const canAfford = canAffordDiscount(redemption);
                        return (
                          <TouchableOpacity
                            key={redemption.id}
                            style={[
                              styles.discountItem,
                              !canAfford && styles.discountItemDisabled,
                            ]}
                            onPress={() => handleApplyDiscount(redemption)}
                            disabled={!canAfford}
                            activeOpacity={0.7}
                          >
                            <View style={styles.discountItemContent}>
                              <View style={styles.discountItemLeft}>
                                <View style={[styles.discountItemIcon, !canAfford && { opacity: 0.5 }]}>
                                  <Text style={{ fontSize: 20 }}>
                                    {redemption.type === 'event_free_admission' ? '🎟️' : '🏷️'}
                                  </Text>
                                </View>
                                <View style={{ flex: 1 }}>
                                  <Text style={[styles.discountItemName, !canAfford && { opacity: 0.5 }]}>
                                    {redemption.name}
                                  </Text>
                                  <Text style={[styles.discountItemValue, !canAfford && { opacity: 0.5 }]}>
                                    {getDiscountDescription(redemption)}
                                  </Text>
                                </View>
                              </View>
                              <View style={styles.discountItemRight}>
                                <View style={[styles.creditsBadge, !canAfford && styles.creditsBadgeDisabled]}>
                                  <Text style={styles.creditsBadgeIcon}>⭐</Text>
                                  <Text style={[styles.creditsBadgeText, !canAfford && { color: '#999' }]}>
                                    {redemption.creditsRequired}
                                  </Text>
                                </View>
                                {!canAfford && (
                                  <Text style={styles.notEnoughCredits}>Need more credits</Text>
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
            )}

            {/* Price Breakdown */}
            <View style={styles.breakdown}>
              <Text variant="labelMedium" style={styles.sectionLabel}>PAYMENT DETAILS</Text>

              <View style={styles.breakdownRow}>
                <Text variant="bodyLarge">Ticket Price</Text>
                <Text variant="bodyLarge" style={selectedDiscount ? styles.strikethroughPrice : undefined}>
                  {formatPrice(event.ticketPrice || 0, event.currency)}
                </Text>
              </View>

              {/* Show discount line if applied */}
              {selectedDiscount && discountAmount > 0 && (
                <View style={styles.breakdownRow}>
                  <Text variant="bodyMedium" style={styles.discountText}>
                    Rally Credits Discount
                  </Text>
                  <Text variant="bodyMedium" style={styles.discountText}>
                    -{formatPrice(discountAmount, event.currency)}
                  </Text>
                </View>
              )}

              {/* Show discounted price */}
              {selectedDiscount && (
                <View style={styles.breakdownRow}>
                  <Text variant="bodyLarge">Discounted Price</Text>
                  <Text variant="bodyLarge" style={{ color: '#10B981', fontWeight: '600' }}>
                    {isFree ? 'FREE' : formatPrice(discountedTicketPrice, event.currency)}
                  </Text>
                </View>
              )}

              {feeBreakdown && !isFree && discountedTicketPrice > 0 && (
                <View style={styles.breakdownRow}>
                  <Text variant="bodyMedium" style={{ opacity: 0.7 }}>Processing Fee (6% + $0.29)</Text>
                  <Text variant="bodyMedium" style={{ opacity: 0.7 }}>
                    {formatPrice(feeBreakdown.processingFee, event.currency)}
                  </Text>
                </View>
              )}

              <Divider style={{ marginVertical: 12 }} />

              <View style={styles.breakdownRow}>
                <Text variant="titleMedium" style={{ fontWeight: 'bold' }}>Total</Text>
                <Text variant="titleLarge" style={[{ fontWeight: 'bold' }, { color: isFree ? '#10B981' : theme.colors.primary }]}>
                  {isFree
                    ? 'FREE'
                    : feeBreakdown
                      ? formatPrice(feeBreakdown.totalAmount, event.currency)
                      : formatPrice(discountedTicketPrice, event.currency)
                  }
                </Text>
              </View>

              {/* Show credits to be spent */}
              {selectedDiscount && (
                <View style={styles.creditsToSpend}>
                  <Text style={styles.creditsToSpendText}>
                    ⭐ {selectedDiscount.creditsRequired} Rally Credits will be spent
                  </Text>
                </View>
              )}
            </View>

            {/* Continue to Payment Button */}
            <TouchableOpacity
              style={[
                styles.continueButton,
                { backgroundColor: isFree ? '#10B981' : theme.colors.primary },
              ]}
              onPress={Platform.OS === 'web' ? handleWebPayment : handleMorePaymentOptions}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Text style={styles.continueButtonText}>
                    {isFree ? 'Claim Free Ticket' : 'Continue to Payment'}
                  </Text>
                  <Text style={styles.continueButtonSubtext}>
                    {isFree
                      ? `Using ${selectedDiscount?.creditsRequired} Rally Credits`
                      : Platform.OS === 'web'
                        ? 'Secure payment via Stripe'
                        : 'Apple Pay, Card, Link & more options available'
                    }
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
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
  webMessage: {
    margin: 'auto',
    padding: 32,
    borderRadius: 16,
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 10,
  },
  handleContainer: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  closeButton: {
    position: 'absolute',
    top: 12,
    right: 16,
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  closeIcon: {
    fontSize: 18,
    fontWeight: '300',
  },
  content: {
    paddingHorizontal: 20,
  },
  title: {
    marginBottom: 20,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  eventInfo: {
    marginBottom: 20,
  },
  eventTitle: {
    fontWeight: 'bold',
    marginTop: 8,
    marginBottom: 4,
  },
  sectionLabel: {
    fontWeight: '600',
    opacity: 0.6,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  price: {
    marginTop: 8,
    fontWeight: 'bold',
  },
  cardContainer: {
    marginBottom: 24,
  },
  label: {
    marginBottom: 8,
  },
  cardField: {
    width: '100%',
    height: 50,
    marginVertical: 8,
  },
  testCardHint: {
    opacity: 0.6,
    fontStyle: 'italic',
    marginTop: 4,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  button: {
    flex: 1,
  },
  breakdown: {
    marginBottom: 24,
    padding: 20,
    backgroundColor: 'rgba(128, 128, 128, 0.05)',
    borderRadius: 12,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  totalRow: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.1)',
  },
  expressPayment: {
    marginBottom: 24,
  },
  expressButton: {
    width: '100%',
    height: 50,
    marginVertical: 8,
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  dividerText: {
    marginHorizontal: 16,
    opacity: 0.5,
    fontSize: 13,
    color: '#666',
  },
  moreOptionsButton: {
    width: '100%',
    height: 60,
    marginVertical: 8,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 8,
    backgroundColor: '#5469D4',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  moreOptionsText: {
    fontWeight: '600',
    fontSize: 18,
    color: '#fff',
  },
  moreOptionsSubtext: {
    opacity: 0.9,
    marginTop: 4,
    fontSize: 13,
    color: '#fff',
  },
  applePayButton: {
    width: '100%',
    height: 56,
    marginVertical: 8,
    backgroundColor: '#000',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  paymentButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  appleLogo: {
    fontSize: 26,
    color: '#fff',
  },
  applePayText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '400',
    letterSpacing: 0.5,
  },
  googlePayButton: {
    width: '100%',
    height: 56,
    marginVertical: 8,
    backgroundColor: '#fff',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#DADCE0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  googlePayContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  googleLogo: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#4285F4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  googleG: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  googlePayText: {
    color: '#3C4043',
    fontSize: 20,
    fontWeight: '500',
    letterSpacing: 0.25,
  },
  linkButton: {
    width: '100%',
    height: 56,
    marginVertical: 8,
    backgroundColor: '#00D66F',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  linkContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  linkLogoContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  linkLogo: {
    fontSize: 14,
    fontWeight: '900',
    color: '#00D66F',
    letterSpacing: -2,
  },
  linkText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  venmoButton: {
    width: '100%',
    height: 56,
    marginVertical: 8,
    backgroundColor: '#3D95CE',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  venmoContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  venmoLogo: {
    fontSize: 26,
    fontWeight: '700',
    color: '#fff',
    fontStyle: 'italic',
    letterSpacing: -0.5,
  },
  continueButton: {
    width: '100%',
    paddingVertical: 18,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  continueButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  continueButtonSubtext: {
    color: '#fff',
    fontSize: 13,
    opacity: 0.9,
    marginTop: 4,
    fontWeight: '400',
  },
  // Rally Credits Discount Styles
  discountSection: {
    marginBottom: 20,
  },
  showDiscountsButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.3)',
    backgroundColor: 'rgba(255, 215, 0, 0.08)',
    overflow: 'hidden',
  },
  showDiscountsContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  showDiscountsIcon: {
    fontSize: 24,
  },
  showDiscountsText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F59E0B',
  },
  showDiscountsSubtext: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.6)',
    marginTop: 2,
  },
  discountsList: {
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
  },
  discountItem: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  discountItemDisabled: {
    opacity: 0.6,
  },
  discountItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  discountItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  discountItemIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 215, 0, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  discountItemName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  discountItemValue: {
    fontSize: 13,
    color: '#10B981',
    fontWeight: '500',
    marginTop: 2,
  },
  discountItemRight: {
    alignItems: 'flex-end',
  },
  creditsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 215, 0, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  creditsBadgeDisabled: {
    backgroundColor: 'rgba(128, 128, 128, 0.2)',
  },
  creditsBadgeIcon: {
    fontSize: 12,
  },
  creditsBadgeText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFD700',
  },
  notEnoughCredits: {
    fontSize: 11,
    color: '#EF4444',
    marginTop: 4,
  },
  appliedDiscount: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  appliedDiscountGradient: {
    padding: 2,
    borderRadius: 12,
  },
  appliedDiscountContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 10,
  },
  appliedDiscountLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  appliedDiscountIcon: {
    fontSize: 24,
  },
  appliedDiscountName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFD700',
  },
  appliedDiscountValue: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: 2,
  },
  removeDiscountButton: {
    padding: 4,
  },
  strikethroughPrice: {
    textDecorationLine: 'line-through',
    opacity: 0.5,
  },
  discountText: {
    color: '#10B981',
    fontWeight: '500',
  },
  creditsToSpend: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 215, 0, 0.2)',
    alignItems: 'center',
  },
  creditsToSpendText: {
    fontSize: 13,
    color: '#F59E0B',
    fontWeight: '500',
  },
});
