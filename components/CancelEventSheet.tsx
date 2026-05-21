// components/CancelEventSheet.tsx
// Bottom-sheet confirmation modal for cancelling an event.
// Loads a cost breakdown via getEventCancellationPreview, then on confirm
// calls cancelEventWithRefunds (which invokes the cancelEvent cloud function).

import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
  Dimensions,
  Easing,
  Pressable,
} from 'react-native';
import { Text, ActivityIndicator, useTheme } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useThemeToggle } from '../app/_layout';
import type { Event } from '../lib/firebase';
import { getEventCancellationPreview, cancelEventWithRefunds } from '../lib/firebase';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface Props {
  visible: boolean;
  event: Event;
  onDismiss: () => void;
  onCancelled: (summary: {
    paidRefunded: number;
    freeCancelled: number;
    totalRefunded: number;
    failures: Array<{ orderId: string; error: string }>;
  }) => void;
}

type Preview = {
  paidCount: number;
  freeCount: number;
  totalRefund: number;
  alreadyRefundedCount: number;
};

export default function CancelEventSheet({ visible, event, onDismiss, onCancelled }: Props) {
  const theme = useTheme();
  const { isDark } = useThemeToggle();
  const slideAnim = React.useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const backdropOpacity = React.useRef(new Animated.Value(0)).current;

  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setPreview(null);
    setPreviewError(null);
    setPreviewLoading(true);
    (async () => {
      const result = await getEventCancellationPreview(event.id);
      if (result.success) {
        setPreview({
          paidCount: result.paidCount,
          freeCount: result.freeCount,
          totalRefund: result.totalRefund,
          alreadyRefundedCount: result.alreadyRefundedCount,
        });
      } else {
        setPreviewError(result.error || 'Failed to load refund preview');
      }
      setPreviewLoading(false);
    })();
  }, [visible, event.id]);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 280,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: SCREEN_HEIGHT,
          duration: 220,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  const handleConfirm = async () => {
    setProcessing(true);
    const summary = await cancelEventWithRefunds(event.id, 'Event cancelled by organizer');
    setProcessing(false);
    if (summary.success) {
      onCancelled({
        paidRefunded: summary.paidRefunded,
        freeCancelled: summary.freeCancelled,
        totalRefunded: summary.totalRefunded,
        failures: summary.failures,
      });
    } else {
      setPreviewError((summary as any).error || 'Failed to cancel event');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onDismiss}>
      <View style={styles.root}>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={!processing ? onDismiss : undefined} />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheetWrap,
            { transform: [{ translateY: slideAnim }] },
          ]}
        >
          <BlurView
            intensity={40}
            tint={isDark ? 'dark' : 'light'}
            style={[
              styles.sheet,
              { backgroundColor: isDark ? 'rgba(20,20,28,0.92)' : 'rgba(255,255,255,0.96)', borderColor: theme.colors.outline },
            ]}
          >
            <View style={styles.grabber} />

            <View style={styles.headerRow}>
              <View style={[styles.iconBadge, { backgroundColor: 'rgba(239,68,68,0.15)' }]}>
                <Ionicons name="close-circle-outline" size={22} color="#EF4444" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, { color: theme.colors.onSurface }]}>Cancel Event</Text>
                <Text style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]} numberOfLines={1}>
                  {event.title}
                </Text>
              </View>
              <TouchableOpacity onPress={onDismiss} disabled={processing} hitSlop={10}>
                <Ionicons name="close" size={22} color={theme.colors.onSurfaceVariant} />
              </TouchableOpacity>
            </View>

            <View style={styles.breakdownCard}>
              {previewLoading ? (
                <View style={styles.previewLoading}>
                  <ActivityIndicator color={theme.colors.primary} />
                  <Text style={[styles.helperText, { color: theme.colors.onSurfaceVariant, marginTop: 8 }]}>
                    Calculating refunds...
                  </Text>
                </View>
              ) : previewError ? (
                <Text style={[styles.errorText, { color: '#EF4444' }]}>{previewError}</Text>
              ) : preview ? (
                <>
                  <Row
                    label="Paid attendees to refund"
                    value={`${preview.paidCount}`}
                    color={theme.colors.onSurface}
                  />
                  <Row
                    label="Estimated total refund"
                    value={`$${preview.totalRefund.toFixed(2)}`}
                    color={theme.colors.onSurface}
                    emphasize
                  />
                  <Row
                    label="Free attendees notified"
                    value={`${preview.freeCount}`}
                    color={theme.colors.onSurfaceVariant}
                  />
                  {preview.alreadyRefundedCount > 0 && (
                    <Row
                      label="Already refunded/cancelled"
                      value={`${preview.alreadyRefundedCount}`}
                      color={theme.colors.onSurfaceVariant}
                    />
                  )}
                  <Text style={[styles.disclaimer, { color: theme.colors.onSurfaceVariant }]}>
                    Refunds are processed via Finix and may take 3-7 business days to appear. Processing fees are not recovered.
                  </Text>
                </>
              ) : null}
            </View>

            <View style={styles.actions}>
              <TouchableOpacity
                onPress={onDismiss}
                disabled={processing}
                style={[styles.secondaryBtn, { borderColor: theme.colors.outline }]}
                activeOpacity={0.8}
              >
                <Text style={[styles.secondaryBtnText, { color: theme.colors.onSurface }]}>Keep Event</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleConfirm}
                disabled={processing || previewLoading || !preview}
                style={[
                  styles.dangerBtn,
                  (processing || previewLoading || !preview) && { opacity: 0.6 },
                ]}
                activeOpacity={0.85}
              >
                {processing ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.dangerBtnText}>Confirm Cancellation</Text>
                )}
              </TouchableOpacity>
            </View>
          </BlurView>
        </Animated.View>
      </View>
    </Modal>
  );
}

function Row({
  label,
  value,
  color,
  emphasize,
}: {
  label: string;
  value: string;
  color: string;
  emphasize?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color }]}>{label}</Text>
      <Text style={[styles.rowValue, emphasize && styles.rowValueEmphasize, { color }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheetWrap: {
    width: '100%',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 32,
    borderWidth: 1,
    overflow: 'hidden',
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(150,150,160,0.4)',
    marginBottom: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 18,
  },
  iconBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  breakdownCard: {
    paddingVertical: 8,
    minHeight: 120,
  },
  previewLoading: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  rowLabel: {
    fontSize: 14,
  },
  rowValue: {
    fontSize: 15,
    fontWeight: '600',
  },
  rowValueEmphasize: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  disclaimer: {
    fontSize: 12,
    marginTop: 12,
    lineHeight: 16,
  },
  helperText: {
    fontSize: 13,
  },
  errorText: {
    fontSize: 14,
    paddingVertical: 16,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
  },
  secondaryBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
  dangerBtn: {
    flex: 1.4,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
