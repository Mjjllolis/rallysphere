import React, { useState, useRef, useEffect } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { Modal, Portal, Text, Button, Divider, useTheme, ActivityIndicator } from 'react-native-paper';
import { WebView } from 'react-native-webview';
import {
  getFinixTokenizationContext,
  buildFinixTokenizeUrl,
  createEventTransaction,
  type FinixTokenizationContext,
} from '../lib/finix';

interface PaymentModalProps {
  visible: boolean;
  onDismiss: () => void;
  onSuccess: () => void;
  eventId: string;
  eventTitle: string;
  ticketPrice: number;
  currency?: string;
}

const SERVICE_FEE_PERCENTAGE = 0.10;
const SERVICE_FEE_FIXED = 0.29;

function calcBreakdown(ticketPrice: number) {
  const processingFee = Math.round(((ticketPrice * SERVICE_FEE_PERCENTAGE) + SERVICE_FEE_FIXED) * 100) / 100;
  return {
    ticketPrice,
    processingFee,
    platformFee: 0,
    totalAmount: ticketPrice + processingFee,
    clubReceives: ticketPrice,
  };
}

export default function PaymentModal({
  visible,
  onDismiss,
  onSuccess,
  eventId,
  eventTitle,
  ticketPrice,
  currency = 'USD',
}: PaymentModalProps) {
  const theme = useTheme();
  const webViewRef = useRef<any>(null);
  const [context, setContext] = useState<FinixTokenizationContext | null>(null);
  const [formReady, setFormReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'ach' | 'apple_pay' | 'google_pay'>('card');

  const breakdown = calcBreakdown(ticketPrice);

  useEffect(() => {
    if (visible && !context) {
      initPayment();
    }
    if (!visible) {
      setContext(null);
      setFormReady(false);
    }
  }, [visible]);

  const initPayment = async () => {
    setInitializing(true);
    try {
      const result = await getFinixTokenizationContext();
      if (result.success && result.context) {
        setContext(result.context);
      } else {
        Alert.alert('Error', result.error || 'Failed to initialize payment');
        onDismiss();
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to initialize payment');
      onDismiss();
    } finally {
      setInitializing(false);
    }
  };

  const handleMessage = async (event: any) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'ready') {
        setFormReady(!!msg.ready);
        if (!msg.ready) Alert.alert('Error', msg.error || 'Failed to load payment form');
      } else if (msg.type === 'tab') {
        setPaymentMethod(msg.paymentMethod || 'card');
      } else if (msg.type === 'token') {
        await processPayment(msg.tokenId, msg.paymentMethod || 'card', msg.fraudSessionId);
      } else if (msg.type === 'error') {
        setLoading(false);
        Alert.alert('Payment Error', msg.message || 'An error occurred');
      }
    } catch {
      // ignore parse errors
    }
  };

  const processPayment = async (tokenId: string, method: string, fraudSessionId?: string) => {
    try {
      const result = await createEventTransaction({
        tokenId,
        fraudSessionId,
        paymentMethod: method as any,
        eventId,
        ticketPrice,
        currency,
      });

      if (result.success) {
        const isAch = method === 'ach';
        Alert.alert(
          isAch ? 'ACH Payment Submitted' : 'Payment Successful!',
          isAch
            ? 'Your ACH payment has been submitted. It may take 3–5 business days to clear. You will receive a confirmation email.'
            : 'You have successfully joined the event. Your ticket has been confirmed.',
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
    if (!formReady) {
      Alert.alert('Error', 'Payment form is not ready yet');
      return;
    }
    setLoading(true);
    webViewRef.current?.injectJavaScript('window.__submit && window.__submit(); true;');
  };

  const tokenizeUrl = context
    ? buildFinixTokenizeUrl({
        context,
        amount: breakdown.totalAmount,
        ach: true,
        wallets: true,
        external: true,
      })
    : null;

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={[styles.modal, { backgroundColor: theme.colors.surface }]}
      >
        <Text variant="headlineSmall" style={styles.title}>Purchase Ticket</Text>

        <Text variant="bodyLarge" style={styles.eventTitle} numberOfLines={2}>
          {eventTitle}
        </Text>

        <Divider style={styles.divider} />

        <View style={styles.breakdown}>
          <Text variant="titleMedium" style={styles.breakdownTitle}>Price Breakdown</Text>
          <View style={styles.breakdownRow}>
            <Text variant="bodyMedium">Ticket Price</Text>
            <Text variant="bodyMedium">${breakdown.ticketPrice.toFixed(2)}</Text>
          </View>
          <View style={styles.breakdownRow}>
            <Text variant="bodyMedium">Processing Fee</Text>
            <Text variant="bodyMedium">${breakdown.processingFee.toFixed(2)}</Text>
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

        <Divider style={styles.divider} />

        <Text variant="titleMedium" style={styles.cardTitle}>Payment Method</Text>

        {initializing ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
            <Text variant="bodySmall" style={{ marginTop: 8, color: theme.colors.onSurfaceVariant }}>
              Initializing payment...
            </Text>
          </View>
        ) : tokenizeUrl ? (
          <WebView
            ref={webViewRef}
            source={{ uri: tokenizeUrl }}
            style={styles.webView}
            onMessage={handleMessage}
            javaScriptEnabled
            scrollEnabled
            originWhitelist={['*']}
            mixedContentMode="always"
          />
        ) : null}

        <View style={styles.actions}>
          <Button mode="outlined" onPress={onDismiss} disabled={loading} style={styles.button}>
            Cancel
          </Button>
          <Button
            mode="contained"
            onPress={handlePay}
            loading={loading}
            disabled={loading || !formReady}
            style={styles.button}
          >
            {paymentMethod === 'ach' ? `Authorize & Pay $${breakdown.totalAmount.toFixed(2)}` : `Pay $${breakdown.totalAmount.toFixed(2)}`}
          </Button>
        </View>

        <Text variant="bodySmall" style={styles.secureNote}>
          🔒 Secure payment powered by Finix
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
    maxHeight: '92%',
  },
  title: { fontWeight: 'bold', marginBottom: 8 },
  eventTitle: { marginBottom: 16, opacity: 0.8 },
  divider: { marginVertical: 12 },
  breakdown: { marginBottom: 8 },
  breakdownTitle: { fontWeight: 'bold', marginBottom: 12 },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  totalLabel: { fontWeight: 'bold' },
  totalAmount: { fontWeight: 'bold' },
  clubReceives: { textAlign: 'right', opacity: 0.6, marginTop: 4, fontStyle: 'italic' },
  cardTitle: { fontWeight: 'bold', marginBottom: 8 },
  loadingContainer: { alignItems: 'center', paddingVertical: 20 },
  webView: { height: 360, marginBottom: 16 },
  actions: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  button: { flex: 1 },
  secureNote: { textAlign: 'center', opacity: 0.6 },
});
