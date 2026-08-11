// app/profile/payment-methods.tsx
import React, { useEffect, useState, useMemo } from 'react';
import { View, StyleSheet, ScrollView, Alert, TouchableOpacity, Modal, Image } from 'react-native';
import { Text, useTheme, Surface, IconButton, ActivityIndicator } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { WebView } from 'react-native-webview';
import { useAuth, useThemeToggle } from '../_layout';
import {
  listSavedPaymentInstruments,
  deleteSavedPaymentInstrument,
  setDefaultSavedPaymentInstrument,
  saveNewPaymentMethod,
  getFinixTokenizationContext,
  buildFinixTokenizeUrl,
  type SavedPaymentInstrument,
  type FinixTokenizationContext,
} from '../../lib/finix';
import PaymentSecurityInfo from '../../components/PaymentSecurityInfo';

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

// Compact label rendered inside the colored brand chip.
const brandShortLabel = (brand: string | null): string => {
  if (!brand) return 'CARD';
  const k = brand.toLowerCase();
  if (k === 'amex' || k === 'american express') return 'AMEX';
  if (k === 'mastercard') return 'MC';
  if (k === 'discover') return 'DISC';
  return brand.toUpperCase().slice(0, 6);
};

// Brand color palette — used as the chip background.
const brandColor = (brand: string | null): string => {
  switch ((brand || '').toLowerCase()) {
    case 'visa': return '#1A1F71';
    case 'mastercard': return '#EB001B';
    case 'amex':
    case 'american express': return '#2E77BC';
    case 'discover': return '#FF6000';
    case 'diners': return '#0079BE';
    case 'jcb': return '#0E4C96';
    case 'unionpay': return '#005BAC';
    default: return '#475569';
  }
};

export default function PaymentMethodsScreen() {
  const theme = useTheme();
  const { isDark } = useThemeToggle();
  const { user } = useAuth();

  const [instruments, setInstruments] = useState<SavedPaymentInstrument[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyPiId, setBusyPiId] = useState<string | null>(null);

  // Add-card modal state
  const [addOpen, setAddOpen] = useState(false);
  const [finixContext, setFinixContext] = useState<FinixTokenizationContext | null>(null);
  const [finixContextLoading, setFinixContextLoading] = useState(false);
  const [formReady, setFormReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const webViewRef = React.useRef<any>(null);

  const load = async (silent = false) => {
    setLoading(true);
    const result = await listSavedPaymentInstruments();
    if (result.success && result.instruments) {
      setInstruments(result.instruments);
    } else {
      setInstruments([]);
      if (!silent && result.error) {
        Alert.alert('Error', result.error);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    if (user) load(true);
  }, [user]);

  const handleDelete = (pi: SavedPaymentInstrument) => {
    Alert.alert(
      'Remove payment method',
      `Remove ${formatBrand(pi.brand)} ending in ${pi.last4 || '----'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setBusyPiId(pi.piId);
            const result = await deleteSavedPaymentInstrument(pi.piId);
            setBusyPiId(null);
            if (result.success) {
              await load();
            } else {
              Alert.alert('Error', result.error || 'Failed to remove payment method');
            }
          },
        },
      ]
    );
  };

  const handleSetDefault = async (pi: SavedPaymentInstrument) => {
    if (pi.isDefault) return;
    setBusyPiId(pi.piId);
    const result = await setDefaultSavedPaymentInstrument(pi.piId);
    setBusyPiId(null);
    if (result.success) {
      await load();
    } else {
      Alert.alert('Error', result.error || 'Failed to set default');
    }
  };

  const openAddCard = async () => {
    setAddOpen(true);
    setFormReady(false);
    if (!finixContext) {
      setFinixContextLoading(true);
      const result = await getFinixTokenizationContext();
      setFinixContextLoading(false);
      if (result.success && result.context) {
        setFinixContext(result.context);
      } else {
        Alert.alert('Error', result.error || 'Failed to initialize payment form');
        setAddOpen(false);
      }
    }
  };

  const closeAddCard = () => {
    if (submitting) return;
    setAddOpen(false);
    setFormReady(false);
  };

  const handleAddSubmit = () => {
    if (!formReady || submitting) return;
    setSubmitting(true);
    webViewRef.current?.injectJavaScript('window.__submit && window.__submit(); true;');
  };

  const handleWebViewMessage = async (event_: any) => {
    let msg: any = null;
    try {
      msg = JSON.parse(event_.nativeEvent.data);
    } catch {
      return;
    }
    try {
      if (msg.type === 'ready') {
        setFormReady(!!msg.ready);
        return;
      }
      if (msg.type === 'token') {
        const result = await saveNewPaymentMethod(msg.tokenId);
        setSubmitting(false);
        if (result.success) {
          setAddOpen(false);
          setFormReady(false);
          await load();
          Alert.alert(
            'Card saved',
            `${formatBrand(result.instrument?.brand || null)} ending in ${result.instrument?.last4 || '----'} added.`
          );
        } else {
          Alert.alert('Could not save card', result.error || 'Unknown error');
        }
        return;
      }
      if (msg.type === 'error') {
        setSubmitting(false);
        Alert.alert('Error', msg.message || 'Failed to add card');
      }
    } catch (e: any) {
      setSubmitting(false);
      Alert.alert('Error', e?.message || 'Unexpected error processing payment form');
    }
  };

  // IMPORTANT: memoize this. Including Date.now() inline made the URL change on
  // every render, which re-mounted the WebView whenever any state updated —
  // including setSubmitting(true) from the Save button. The Finix iframe was
  // resetting before tokenization could fire, which looked like "form cleared".
  // Recompute only when the modal opens, the env changes, or the theme flips.
  const tokenizeUrl = useMemo(() => {
    if (!finixContext || !addOpen) return null;
    return buildFinixTokenizeUrl({
      context: finixContext,
      wallets: false,        // wallets are inherently single-use
      external: true,        // we drive submit from the parent button
      theme: isDark ? 'dark' : 'light',
    }) + `&_=${Date.now()}`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finixContext, isDark, addOpen]);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
            <BlurView intensity={20} tint={isDark ? 'dark' : 'light'} style={[styles.backButton, { borderColor: theme.colors.outline }]}>
              <Ionicons name="arrow-back" size={24} color={theme.colors.onSurface} />
            </BlurView>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={[styles.headerTitle, { color: theme.colors.onSurface }]}>Payment Methods</Text>
            <Text style={[styles.headerSubtitle, { color: theme.colors.onSurfaceVariant }]}>
              Manage cards saved during checkout
            </Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" />
          </View>
        ) : !user ? (
          <View style={styles.emptyContainer}>
            <Text variant="titleMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              Please log in to manage payment methods
            </Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.scrollContent}>
            {instruments.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text variant="titleMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                  No saved payment methods
                </Text>
                <Text
                  variant="bodyMedium"
                  style={{ color: theme.colors.onSurfaceVariant, marginTop: 8, marginBottom: 24, textAlign: 'center' }}
                >
                  Add a card now or save one during checkout
                </Text>
                <TouchableOpacity
                  onPress={openAddCard}
                  activeOpacity={0.85}
                  style={[styles.primaryButton, { backgroundColor: theme.colors.primary }]}
                >
                  <Ionicons name="add" size={20} color="#fff" style={{ marginRight: 6 }} />
                  <Text style={styles.primaryButtonText}>Add Payment Method</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.list}>
                {instruments.map((pi) => {
                  const isBusy = busyPiId === pi.piId;
                  const accent = brandColor(pi.brand);
                  return (
                    <Surface
                      key={pi.piId}
                      style={[styles.card, { backgroundColor: theme.colors.surface }]}
                      elevation={2}
                    >
                      {/* Vertical brand accent bar on the left edge */}
                      <View style={[styles.cardAccent, { backgroundColor: accent }]} />

                      <View style={styles.cardBody}>
                        <View style={styles.cardTopRow}>
                          <View style={[styles.brandChip, { backgroundColor: accent }]}>
                            <Text style={styles.brandChipText}>{brandShortLabel(pi.brand)}</Text>
                          </View>
                          <Text style={[styles.cardLast4, { color: theme.colors.onSurface }]}>
                            ···· {pi.last4 || '----'}
                          </Text>
                          <View style={{ flex: 1 }} />
                          {pi.isDefault && (
                            <View style={[styles.defaultPill, { backgroundColor: theme.colors.primary }]}>
                              <Ionicons name="checkmark" size={12} color="#fff" />
                              <Text style={styles.defaultPillText}>DEFAULT</Text>
                            </View>
                          )}
                        </View>

                        <View style={styles.cardBottomRow}>
                          <Text style={[styles.cardExp, { color: theme.colors.onSurfaceVariant }]}>
                            {pi.expMonth && pi.expYear
                              ? `Expires ${String(pi.expMonth).padStart(2, '0')}/${String(pi.expYear).slice(-2)}`
                              : 'No expiry on file'}
                          </Text>

                          <View style={styles.cardActionsRow}>
                            {!pi.isDefault && (
                              <TouchableOpacity
                                onPress={() => handleSetDefault(pi)}
                                disabled={isBusy}
                                activeOpacity={0.7}
                                style={styles.setDefaultLink}
                              >
                                <Text style={[styles.setDefaultLinkText, { color: theme.colors.primary }]}>
                                  Set default
                                </Text>
                              </TouchableOpacity>
                            )}
                            {isBusy ? (
                              <ActivityIndicator size="small" style={{ marginLeft: 8 }} />
                            ) : (
                              <TouchableOpacity
                                onPress={() => handleDelete(pi)}
                                activeOpacity={0.7}
                                hitSlop={8}
                                style={styles.deleteIconButton}
                              >
                                <Ionicons name="trash-outline" size={18} color="#B91C1C" />
                              </TouchableOpacity>
                            )}
                          </View>
                        </View>
                      </View>
                    </Surface>
                  );
                })}

                {/* Add another card */}
                <TouchableOpacity
                  onPress={openAddCard}
                  activeOpacity={0.7}
                  style={[styles.addRow, { borderColor: theme.colors.outline }]}
                >
                  <Ionicons name="add" size={20} color={theme.colors.primary} />
                  <Text style={{ color: theme.colors.primary, fontWeight: '600', marginLeft: 6 }}>
                    Add another card
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.footerNote}>
              <Text
                variant="bodySmall"
                style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center' }}
              >
                Card details are stored securely with our payment processor (Finix). RallySphere never
                stores full card numbers on its servers.
              </Text>
            </View>
          </ScrollView>
        )}
      </SafeAreaView>

      {/* Add-card modal */}
      <Modal
        visible={addOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeAddCard}
      >
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: theme.colors.background }]} edges={['top']}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={closeAddCard} disabled={submitting} activeOpacity={0.7}>
              <Text style={{ color: submitting ? theme.colors.onSurfaceDisabled : theme.colors.primary, fontSize: 16 }}>
                Cancel
              </Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: theme.colors.onSurface }]}>Add Payment Method</Text>
            <View style={{ width: 60 }} />
          </View>

          <View style={{ flex: 1, position: 'relative' }}>
            {tokenizeUrl && (
              <WebView
                ref={webViewRef}
                source={{ uri: tokenizeUrl }}
                style={{ flex: 1, backgroundColor: 'transparent', marginHorizontal: 20 }}
                containerStyle={{ backgroundColor: 'transparent', flex: 1 }}
                onMessage={handleWebViewMessage}
                javaScriptEnabled
                scrollEnabled
                originWhitelist={['*']}
                mixedContentMode="always"
                cacheEnabled={false}
                incognito
                backgroundColor="transparent"
                keyboardDisplayRequiresUserAction={false}
              />
            )}
            {(finixContextLoading || !formReady) && (
              <View style={[StyleSheet.absoluteFillObject, styles.formInitOverlay, { backgroundColor: theme.colors.background }]}>
                <Image source={require('../../assets/Logo.png')} style={styles.formInitLogo} resizeMode="contain" />
                <Text style={{ color: theme.colors.onSurfaceVariant, marginTop: 16 }}>
                  Initializing form…
                </Text>
              </View>
            )}
          </View>

          <View style={[styles.modalFooter, { paddingBottom: 24 }]}>
            <PaymentSecurityInfo variant="checkout" align="center" style={{ marginBottom: 8 }} />
            <TouchableOpacity
              onPress={handleAddSubmit}
              disabled={!formReady || submitting}
              activeOpacity={0.85}
              style={[
                styles.primaryButton,
                {
                  backgroundColor: theme.colors.primary,
                  opacity: !formReady || submitting ? 0.6 : 1,
                  width: '100%',
                },
              ]}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryButtonText}>Save Card</Text>
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: { fontSize: 22, fontWeight: 'bold' },
  headerSubtitle: { fontSize: 12, marginTop: 2 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 40 },
  emptyContainer: { paddingVertical: 60, paddingHorizontal: 24, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { padding: 16, paddingBottom: 32 },
  list: { gap: 12 },
  card: {
    borderRadius: 14,
    marginBottom: 12,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  cardAccent: { width: 4 },
  cardBody: { flex: 1, paddingVertical: 14, paddingHorizontal: 14 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    minWidth: 48,
    alignItems: 'center',
  },
  brandChipText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  cardLast4: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 1,
  },
  defaultPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    gap: 4,
  },
  defaultPillText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  cardBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  cardExp: { fontSize: 12 },
  cardActionsRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  setDefaultLink: { paddingVertical: 4, paddingHorizontal: 4 },
  setDefaultLinkText: { fontSize: 13, fontWeight: '600' },
  deleteIconButton: { padding: 4 },
  addRow: {
    marginTop: 4, paddingVertical: 14, borderWidth: 1, borderStyle: 'dashed',
    borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center',
  },
  footerNote: { marginTop: 24, paddingHorizontal: 8 },
  primaryButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 20, paddingVertical: 14, borderRadius: 12,
  },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  modalTitle: { fontSize: 17, fontWeight: '600' },
  modalFooter: { paddingHorizontal: 20, paddingTop: 12 },
  formInitOverlay: { alignItems: 'center', justifyContent: 'center' },
  formInitLogo: { width: 96, height: 96 },
});
