// components/FinixActionRequiredCard.tsx
// Renders what Finix is waiting on before it will approve a club's payouts.
//
// Finix stalls an application by moving the merchant to UPDATE_REQUESTED and
// recording the reasons on its Verification — but it notifies nobody. Left
// alone, the club sees the word "UPDATE_REQUESTED" (or, worse, nothing at all)
// and calls us. This card is the difference between a support ticket and a
// task the club can finish on their own.
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Button, useTheme } from 'react-native-paper';
import type { FinixActionRequired } from '../lib/finix';

interface Props {
  action: FinixActionRequired;
  /** Hosted clubs get a working button; in-app clubs get told to contact us. */
  onResolve?: () => void;
  resolveLabel?: string;
  loading?: boolean;
  style?: any;
}

export default function FinixActionRequiredCard({ action, onResolve, resolveLabel, loading, style }: Props) {
  const theme = useTheme();
  const items = action.items || [];
  if (!items.length && !action.summary) return null;

  return (
    <View
      style={[
        styles.card,
        { borderColor: theme.colors.error, backgroundColor: theme.colors.errorContainer },
        style,
      ]}
    >
      <Text variant="titleSmall" style={{ fontWeight: '700', color: theme.colors.onErrorContainer }}>
        Finix needs more information
      </Text>
      <Text variant="bodySmall" style={{ marginTop: 4, color: theme.colors.onErrorContainer, opacity: 0.9, lineHeight: 18 }}>
        Your payouts are paused until these are provided. This is Finix’s standard verification — it isn’t a rejection.
      </Text>

      <View style={{ marginTop: 12, gap: 8 }}>
        {items.map((item, i) => (
          <View key={`${item.code}-${i}`} style={styles.item}>
            <Text style={{ color: theme.colors.onErrorContainer, marginTop: 1 }}>
              {item.action === 'upload' ? '📎' : '✏️'}
            </Text>
            <View style={{ flex: 1 }}>
              <Text variant="bodyMedium" style={{ color: theme.colors.onErrorContainer, fontWeight: '600' }}>
                {item.label}
              </Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onErrorContainer, opacity: 0.75 }}>
                {item.action === 'upload' ? 'Document upload' : item.action === 'correct' ? 'Needs correcting' : 'Requested by Finix'}
              </Text>
            </View>
          </View>
        ))}
      </View>

      {onResolve ? (
        <Button
          mode="contained"
          icon="open-in-new"
          onPress={onResolve}
          loading={loading}
          disabled={loading}
          style={{ marginTop: 14 }}
        >
          {resolveLabel || 'Provide this to Finix'}
        </Button>
      ) : (
        <Text variant="bodySmall" style={{ marginTop: 12, color: theme.colors.onErrorContainer, opacity: 0.85, lineHeight: 18 }}>
          Send these to support@rallysphere.com and we’ll pass them to Finix for you.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, borderRadius: 12, borderWidth: 1 },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
});
