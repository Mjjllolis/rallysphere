import React, { useState, useRef } from 'react';
import { View, StyleSheet, Alert, Platform } from 'react-native';
import { Modal, Portal, Text, Button, Divider, useTheme, ActivityIndicator } from 'react-native-paper';
import { WebView } from 'react-native-webview';
import { getBraintreeClientToken, createEventTransaction } from '../lib/stripe';

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

function buildDropInHtml(clientToken: string, totalAmount: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: transparent; padding: 0; }
    #dropin-container { margin-bottom: 0; }
    .error { color: #DC2626; padding: 8px 0; font-size: 14px; display: none; }
    .loading { text-align: center; padding: 20px; color: #64748B; font-size: 14px; }
  </style>
</head>
<body>
  <div id="dropin-container"></div>
  <div id="error" class="error"></div>
  <div id="loading" class="loading">Loading payment form...</div>
  <script src="https://js.braintreegateway.com/web/dropin/1.42.0/js/dropin.min.js"></script>
  <script>
    var totalAmount = '${totalAmount}';
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
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready', ready: true }));
      window._dropinInstance = dropinInstance;
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
  const [clientToken, setClientToken] = useState<string | null>(null);
  const [dropInReady, setDropInReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(false);

  const breakdown = calcBreakdown(ticketPrice);

  React.useEffect(() => {
    if (visible && !clientToken) {
      initPayment();
    }
    if (!visible) {
      setClientToken(null);
      setDropInReady(false);
    }
  }, [visible]);

  const initPayment = async () => {
    setInitializing(true);
    try {
      const result = await getBraintreeClientToken();
      if (result.success && result.clientToken) {
        setClientToken(result.clientToken);
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
        setDropInReady(msg.ready);
        if (!msg.ready) {
          Alert.alert('Error', msg.error || 'Failed to load payment form');
        }
      } else if (msg.type === 'nonce') {
        await processPaymentWithNonce(msg.nonce);
      } else if (msg.type === 'error') {
        setLoading(false);
        Alert.alert('Payment Error', msg.message || 'An error occurred');
      }
    } catch (e) {
      // ignore parse errors
    }
  };

  const processPaymentWithNonce = async (nonce: string) => {
    try {
      const result = await createEventTransaction({
        paymentMethodNonce: nonce,
        eventId,
        ticketPrice,
        currency: currency.toLowerCase(),
      });

      if (result.success) {
        Alert.alert(
          'Payment Successful!',
          'You have successfully joined the event. Your ticket has been confirmed.',
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
    if (!dropInReady) {
      Alert.alert('Error', 'Payment form is not ready yet');
      return;
    }
    setLoading(true);
    webViewRef.current?.injectJavaScript('window.requestNonce(); true;');
  };

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

        {/* Price Breakdown */}
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

        {/* Payment Form */}
        <Text variant="titleMedium" style={styles.cardTitle}>Card Details</Text>

        {initializing ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
            <Text variant="bodySmall" style={{ marginTop: 8, color: theme.colors.onSurfaceVariant }}>
              Initializing payment...
            </Text>
          </View>
        ) : clientToken ? (
          <WebView
            ref={webViewRef}
            source={{ html: buildDropInHtml(clientToken, breakdown.totalAmount.toFixed(2)) }}
            style={styles.webView}
            onMessage={handleMessage}
            javaScriptEnabled
            scrollEnabled={false}
            originWhitelist={['*']}
            mixedContentMode="always"
          />
        ) : null}

        {/* Actions */}
        <View style={styles.actions}>
          <Button mode="outlined" onPress={onDismiss} disabled={loading} style={styles.button}>
            Cancel
          </Button>
          <Button
            mode="contained"
            onPress={handlePay}
            loading={loading}
            disabled={loading || !dropInReady}
            style={styles.button}
          >
            Pay ${breakdown.totalAmount.toFixed(2)}
          </Button>
        </View>

        <Text variant="bodySmall" style={styles.secureNote}>
          🔒 Secure payment powered by Braintree
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
  webView: { height: 220, marginBottom: 16 },
  actions: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  button: { flex: 1 },
  secureNote: { textAlign: 'center', opacity: 0.6 },
});
