// components/FinixBankTokenizer.tsx
// Renders the Finix BankTokenForm (tokenize.html in bankOnly mode) inside a
// WebView and reports the resulting single-use bank token to the parent. Used
// by the payout-onboarding wizard to collect a club's payout bank account
// WITHOUT the raw account/routing numbers ever touching our servers.
import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { WebView } from 'react-native-webview';
import { getFinixTokenizationContext, buildFinixTokenizeUrl } from '../lib/finix';

interface Props {
  /** Called with the single-use bank token once the form is submitted. */
  onToken: (tokenId: string) => void;
  onError?: (message: string) => void;
  /** Called when the form is loaded and ready for input. */
  onReady?: () => void;
  themeName?: 'dark' | 'light';
}

export default function FinixBankTokenizer({ onToken, onError, onReady, themeName: colorScheme }: Props) {
  const theme = useTheme();
  const webRef = useRef<any>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [height, setHeight] = useState(320);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const result = await getFinixTokenizationContext();
      if (result.success && result.context) {
        const base = buildFinixTokenizeUrl({
          context: result.context,
          bankOnly: true,
          theme: colorScheme,
        });
        // Unique param per mount → guaranteed cache miss at every layer (device
        // + CDN). The page is security-sensitive and must never load stale.
        setUrl(`${base}${base.includes('?') ? '&' : '?'}cb=${Date.now()}`);
      } else {
        setLoadError(result.error || 'Unable to load the bank form');
        onError?.(result.error || 'Unable to load the bank form');
      }
    })();
  }, []);

  const handleMessage = (event: any) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'content-height' && typeof msg.height === 'number') {
        setHeight((prev) => (Math.abs(prev - msg.height) > 4 ? Math.max(220, msg.height) : prev));
      } else if (msg.type === 'ready') {
        if (msg.ready) onReady?.();
        else if (msg.error) onError?.(msg.error);
      } else if (msg.type === 'token' && msg.tokenId) {
        onToken(msg.tokenId);
      } else if (msg.type === 'error') {
        onError?.(msg.message || 'Bank tokenization failed');
      }
    } catch {
      /* ignore non-JSON diagnostics */
    }
  };

  if (loadError) {
    return (
      <View style={styles.center}>
        <Text variant="bodyMedium" style={{ color: theme.colors.error }}>{loadError}</Text>
      </View>
    );
  }

  if (!url) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <View style={{ height }}>
      <WebView
        ref={webRef}
        source={{ uri: url }}
        onMessage={handleMessage}
        originWhitelist={['*']}
        // Always fetch the tokenize page fresh — it's a security-sensitive form
        // that changes independently of the app, and stale caching once froze it.
        cacheEnabled={false}
        style={{ backgroundColor: 'transparent', flex: 1 }}
        scrollEnabled={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { minHeight: 120, justifyContent: 'center', alignItems: 'center', padding: 20 },
});
