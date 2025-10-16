import React, { useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { Modal, Portal, Button, Text, ActivityIndicator, useTheme, Card } from 'react-native-paper';
import { CardField, useStripe } from '@stripe/stripe-react-native';
import { createPaymentIntent } from '../lib/stripe';
import type { Event } from '../lib/firebase';

interface PaymentSheetProps {
  visible: boolean;
  event: Event;
  onDismiss: () => void;
  onSuccess: () => void;
}

export default function PaymentSheet({ visible, event, onDismiss, onSuccess }: PaymentSheetProps) {
  const theme = useTheme();
  const stripe = useStripe();
  const [loading, setLoading] = useState(false);
  const [cardComplete, setCardComplete] = useState(false);
  const [feeBreakdown, setFeeBreakdown] = useState<any>(null);

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

  const formatPrice = (price: number, currency: string = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(price);
  };

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={[styles.modal, { backgroundColor: theme.colors.surface }]}
      >
        <Card>
          <Card.Content>
            <Text variant="headlineSmall" style={styles.title}>
              Complete Purchase
            </Text>

            <View style={styles.eventInfo}>
              <Text variant="titleMedium">{event.title}</Text>
              <Text variant="bodyMedium" style={styles.clubName}>
                {event.clubName}
              </Text>

              {feeBreakdown ? (
                <View style={styles.breakdown}>
                  <View style={styles.breakdownRow}>
                    <Text variant="bodyMedium">Ticket Price:</Text>
                    <Text variant="bodyMedium">{formatPrice(feeBreakdown.ticketPrice, event.currency)}</Text>
                  </View>
                  <View style={styles.breakdownRow}>
                    <Text variant="bodyMedium">Processing Fee:</Text>
                    <Text variant="bodyMedium">{formatPrice(feeBreakdown.processingFee, event.currency)}</Text>
                  </View>
                  <View style={[styles.breakdownRow, styles.totalRow]}>
                    <Text variant="titleMedium" style={{ fontWeight: 'bold' }}>Total:</Text>
                    <Text variant="titleMedium" style={[{ fontWeight: 'bold' }, { color: theme.colors.primary }]}>
                      {formatPrice(feeBreakdown.totalAmount, event.currency)}
                    </Text>
                  </View>
                </View>
              ) : (
                <Text variant="headlineMedium" style={[styles.price, { color: theme.colors.primary }]}>
                  {formatPrice(event.ticketPrice || 0, event.currency)}
                </Text>
              )}
            </View>

            <View style={styles.cardContainer}>
              <Text variant="labelLarge" style={styles.label}>
                Card Details
              </Text>
              <CardField
                postalCodeEnabled={false}
                placeholders={{
                  number: '4242 4242 4242 4242',
                }}
                cardStyle={{
                  backgroundColor: theme.colors.surfaceVariant,
                  textColor: theme.colors.onSurface,
                  placeholderColor: theme.colors.onSurfaceDisabled,
                }}
                style={styles.cardField}
                onCardChange={(cardDetails) => {
                  setCardComplete(cardDetails.complete);
                }}
              />
              <Text variant="bodySmall" style={styles.testCardHint}>
                Test card: 4242 4242 4242 4242
              </Text>
            </View>

            <View style={styles.actions}>
              <Button
                mode="outlined"
                onPress={onDismiss}
                disabled={loading}
                style={styles.button}
              >
                Cancel
              </Button>
              <Button
                mode="contained"
                onPress={handlePayment}
                disabled={!cardComplete || loading}
                style={styles.button}
              >
                {loading ? (
                  <ActivityIndicator color={theme.colors.onPrimary} />
                ) : (
                  `Pay ${feeBreakdown ? formatPrice(feeBreakdown.totalAmount, event.currency) : formatPrice(event.ticketPrice || 0, event.currency)}`
                )}
              </Button>
            </View>
          </Card.Content>
        </Card>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  modal: {
    margin: 20,
    borderRadius: 12,
  },
  title: {
    marginBottom: 16,
    fontWeight: 'bold',
  },
  eventInfo: {
    marginBottom: 24,
    padding: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  clubName: {
    opacity: 0.7,
    marginTop: 4,
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
    marginTop: 12,
    padding: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.03)',
    borderRadius: 8,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  totalRow: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.1)',
  },
});
