import React, { useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { Modal, Portal, Text, Button, Divider, useTheme } from 'react-native-paper';
import { CardField, useStripe } from '@stripe/stripe-react-native';
import { createPaymentIntent, processPayment } from '../lib/stripe';

interface PaymentModalProps {
  visible: boolean;
  onDismiss: () => void;
  onSuccess: () => void;
  eventId: string;
  eventTitle: string;
  ticketPrice: number;
  currency?: string;
}

export default function PaymentModal({
  visible,
  onDismiss,
  onSuccess,
  eventId,
  eventTitle,
  ticketPrice,
  currency = 'USD'
}: PaymentModalProps) {
  const theme = useTheme();
  const stripe = useStripe();
  const [loading, setLoading] = useState(false);
  const [cardComplete, setCardComplete] = useState(false);
  const [breakdown, setBreakdown] = useState<any>(null);

  // Calculate fees on mount
  React.useEffect(() => {
    if (visible) {
      calculateFees();
    }
  }, [visible, ticketPrice]);

  const calculateFees = async () => {
    try {
      const result = await createPaymentIntent({
        eventId,
        ticketPrice,
        currency: currency.toLowerCase(),
      });

      if (result.success && result.breakdown) {
        setBreakdown(result.breakdown);
      }
    } catch (error) {
      console.error('Error calculating fees:', error);
    }
  };

  const handlePayment = async () => {
    if (!cardComplete) {
      Alert.alert('Error', 'Please enter valid card details');
      return;
    }

    setLoading(true);
    try {
      // Create payment intent
      const paymentResult = await createPaymentIntent({
        eventId,
        ticketPrice,
        currency: currency.toLowerCase(),
      });

      if (!paymentResult.success || !paymentResult.clientSecret) {
        Alert.alert('Error', paymentResult.error || 'Failed to initiate payment');
        setLoading(false);
        return;
      }

      // Process payment with Stripe
      const confirmResult = await processPayment(stripe, {
        clientSecret: paymentResult.clientSecret,
      });

      if (confirmResult.success) {
        Alert.alert(
          'Payment Successful!',
          'You have successfully joined the event. Your ticket has been confirmed.',
          [{ text: 'OK', onPress: () => {
            onSuccess();
            onDismiss();
          }}]
        );
      } else {
        Alert.alert('Payment Failed', confirmResult.error || 'An error occurred during payment');
      }
    } catch (error: any) {
      console.error('Payment error:', error);
      Alert.alert('Error', error.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={[styles.modal, { backgroundColor: theme.colors.surface }]}
      >
        <Text variant="headlineSmall" style={styles.title}>
          Purchase Ticket
        </Text>

        <Text variant="bodyLarge" style={styles.eventTitle} numberOfLines={2}>
          {eventTitle}
        </Text>

        <Divider style={styles.divider} />

        {/* Price Breakdown */}
        {breakdown && (
          <View style={styles.breakdown}>
            <Text variant="titleMedium" style={styles.breakdownTitle}>
              Price Breakdown
            </Text>

            <View style={styles.breakdownRow}>
              <Text variant="bodyMedium">Ticket Price</Text>
              <Text variant="bodyMedium">${breakdown.ticketPrice.toFixed(2)}</Text>
            </View>

            <View style={styles.breakdownRow}>
              <Text variant="bodyMedium">Processing Fee</Text>
              <Text variant="bodyMedium">${breakdown.processingFee.toFixed(2)}</Text>
            </View>

            <View style={styles.breakdownRow}>
              <Text variant="bodyMedium">Platform Fee</Text>
              <Text variant="bodyMedium">${breakdown.platformFee.toFixed(2)}</Text>
            </View>

            <Divider style={styles.divider} />

            <View style={styles.breakdownRow}>
              <Text variant="titleMedium" style={styles.totalLabel}>Total</Text>
              <Text variant="titleMedium" style={styles.totalAmount}>
                ${breakdown.totalAmount.toFixed(2)} {currency}
              </Text>
            </View>

            <Text variant="bodySmall" style={styles.clubReceives}>
              Club receives ${breakdown.clubReceives.toFixed(2)}
            </Text>
          </View>
        )}

        <Divider style={styles.divider} />

        {/* Card Input */}
        <Text variant="titleMedium" style={styles.cardTitle}>
          Card Details
        </Text>

        <CardField
          postalCodeEnabled={true}
          placeholders={{
            number: '4242 4242 4242 4242',
          }}
          cardStyle={styles.cardField}
          style={styles.cardFieldContainer}
          onCardChange={(cardDetails) => {
            setCardComplete(cardDetails.complete);
          }}
        />

        {/* Action Buttons */}
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
            loading={loading}
            disabled={loading || !cardComplete}
            style={styles.button}
          >
            Pay ${breakdown?.totalAmount.toFixed(2) || ticketPrice.toFixed(2)}
          </Button>
        </View>

        <Text variant="bodySmall" style={styles.secureNote}>
          🔒 Secure payment powered by Stripe
        </Text>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  modal: {
    marginHorizontal: 20,
    padding: 24,
    borderRadius: 16,
    maxHeight: '90%',
  },
  title: {
    fontWeight: 'bold',
    marginBottom: 8,
  },
  eventTitle: {
    marginBottom: 16,
    opacity: 0.8,
  },
  divider: {
    marginVertical: 16,
  },
  breakdown: {
    marginBottom: 8,
  },
  breakdownTitle: {
    fontWeight: 'bold',
    marginBottom: 12,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  totalLabel: {
    fontWeight: 'bold',
  },
  totalAmount: {
    fontWeight: 'bold',
    color: '#60A5FA',
  },
  clubReceives: {
    textAlign: 'right',
    opacity: 0.6,
    marginTop: 4,
    fontStyle: 'italic',
  },
  cardTitle: {
    fontWeight: 'bold',
    marginBottom: 12,
  },
  cardFieldContainer: {
    height: 50,
    marginBottom: 24,
  },
  cardField: {
    backgroundColor: '#FFFFFF',
    textColor: '#000000',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  button: {
    flex: 1,
  },
  secureNote: {
    textAlign: 'center',
    opacity: 0.6,
  },
});
