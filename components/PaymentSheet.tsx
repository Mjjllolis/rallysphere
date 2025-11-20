import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Alert, Platform, TouchableOpacity, Animated, Dimensions, ScrollView, Modal } from 'react-native';
import { Button, Text, ActivityIndicator, useTheme, Divider, TextInput } from 'react-native-paper';
import type { Event } from '../lib/firebase';
import { db, auth } from '../lib/firebase';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';

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

      // Load fee breakdown when sheet opens
      loadFeeBreakdown();
    } else {
      // Slide down
      Animated.timing(slideAnim, {
        toValue: SCREEN_HEIGHT,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  const loadFeeBreakdown = async () => {
    if (!event.ticketPrice) return;

    try {
      const paymentIntentResult = await createPaymentIntent({
        eventId: event.id,
        ticketPrice: event.ticketPrice,
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
      // Step 1: Create payment intent
      const paymentIntentResult = await createPaymentIntent({
        eventId: event.id,
        ticketPrice: event.ticketPrice,
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
      // Import createCheckoutSession from stripe lib
      const { createCheckoutSession } = require('../lib/stripe');

      // Get current URL origin for redirect
      const origin = typeof window !== 'undefined' ? window.location.origin : '';

      // Create Stripe Checkout Session with web-friendly URLs
      const result = await createCheckoutSession({
        eventId: event.id,
        ticketPrice: event.ticketPrice,
        currency: event.currency || 'usd',
        successUrl: `${origin}/payment-success?session_id={CHECKOUT_SESSION_ID}&event_id=${event.id}`,
        cancelUrl: `${origin}/payment-cancel?event_id=${event.id}`,
      });

      if (!result.success || !result.checkoutUrl) {
        Alert.alert('Error', result.error || 'Failed to initialize payment');
        setLoading(false);
        return;
      }

      // Redirect to Stripe Checkout
      window.location.href = result.checkoutUrl;
    } catch (error: any) {
      console.error('Web payment error:', error);
      Alert.alert('Error', error.message || 'An unexpected error occurred');
      setLoading(false);
    }
  };

  const formatPrice = (price: number, currency?: string) => {
    const currencyCode = (currency || 'USD').toUpperCase();
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currencyCode,
    }).format(price);
  };

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
              backgroundColor: theme.colors.surface,
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

            {/* Price Breakdown */}
            <View style={styles.breakdown}>
              <Text variant="labelMedium" style={styles.sectionLabel}>PAYMENT DETAILS</Text>

              <View style={styles.breakdownRow}>
                <Text variant="bodyLarge">Ticket Price</Text>
                <Text variant="bodyLarge">{formatPrice(event.ticketPrice || 0, event.currency)}</Text>
              </View>

              {feeBreakdown && (
                <View style={styles.breakdownRow}>
                  <Text variant="bodyMedium" style={{ opacity: 0.7 }}>Processing Fee</Text>
                  <Text variant="bodyMedium" style={{ opacity: 0.7 }}>
                    {formatPrice(feeBreakdown.processingFee, event.currency)}
                  </Text>
                </View>
              )}

              <Divider style={{ marginVertical: 12 }} />

              <View style={styles.breakdownRow}>
                <Text variant="titleMedium" style={{ fontWeight: 'bold' }}>Total</Text>
                <Text variant="titleLarge" style={[{ fontWeight: 'bold' }, { color: theme.colors.primary }]}>
                  {feeBreakdown
                    ? formatPrice(event.ticketPrice + feeBreakdown.processingFee, event.currency)
                    : formatPrice(event.ticketPrice || 0, event.currency)
                  }
                </Text>
              </View>
            </View>

            {/* Continue to Payment Button */}
            <TouchableOpacity
              style={[styles.continueButton, { backgroundColor: theme.colors.primary }]}
              onPress={Platform.OS === 'web' ? handleWebPayment : handleMorePaymentOptions}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Text style={styles.continueButtonText}>Continue to Payment</Text>
                  <Text style={styles.continueButtonSubtext}>
                    {Platform.OS === 'web'
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
    backgroundColor: 'rgba(0,0,0,0.5)',
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
});
