// components/PaymentSecurityInfo.tsx
// A small "How your info is protected" affordance for any place a user enters
// bank/card details: a trigger button that opens an explanatory panel covering
// what we collect, how it's tokenized (never stored on our servers), our use of
// Finix, and links to the relevant policies.
//
// The panel renders inside its own React Native <Modal> rather than a paper
// <Portal> so it correctly overlays every host — the buyer checkout sheets use
// RN Modals (a paper Portal would render *behind* them), while the payout wizard
// and PaymentModal use paper Modals (a nested RN Modal sits on top of those).
import React, { useState } from 'react';
import { View, StyleSheet, Modal, Pressable, ScrollView, Linking } from 'react-native';
import { Text, Icon, Button, Divider, useTheme } from 'react-native-paper';
import { router } from 'expo-router';

type Variant = 'checkout' | 'payout';

interface Block {
  icon: string;
  title: string;
  body: string;
}

const CONTENT: Record<Variant, { title: string; blocks: Block[] }> = {
  checkout: {
    title: 'How your payment info is protected',
    blocks: [
      {
        icon: 'clipboard-text-outline',
        title: 'What we collect',
        body: 'The card or bank account details you enter to pay. For bank (ACH) payments, that’s your account and routing numbers.',
      },
      {
        icon: 'shield-lock-outline',
        title: 'How it’s protected',
        body: 'You enter them in a secure form hosted by Finix, our payment processor. Your card and bank numbers are turned into a one-time token and sent straight to Finix — they never pass through or get stored on RallySphere’s servers.',
      },
      {
        icon: 'bank-outline',
        title: 'Why Finix',
        body: 'Finix is our PCI-compliant payment processor. They securely handle the charge and move funds to the club. RallySphere never sees or keeps your full card or bank number.',
      },
    ],
  },
  payout: {
    title: 'Your bank info is protected',
    blocks: [
      {
        icon: 'clipboard-text-outline',
        title: 'What we collect',
        body: 'Your bank account and routing numbers, plus the last 4 digits of the account owner’s SSN. The SSN digits are used only to verify that you own the account.',
      },
      {
        icon: 'shield-lock-outline',
        title: 'How it’s protected',
        body: 'You enter these details in a secure form provided by Finix. Your account and routing numbers are turned into a one-time token and sent straight to Finix — they never pass through or get stored on RallySphere’s servers.',
      },
      {
        icon: 'bank-outline',
        title: 'Why Finix',
        body: 'Finix is our licensed payment processor. They verify your bank account and handle depositing your payouts. RallySphere never sees or keeps your full banking details.',
      },
    ],
  },
};

interface Props {
  variant?: Variant;
  /** Trigger label override. Defaults to a variant-appropriate phrase. */
  label?: string;
  /** Alignment of the trigger row within its parent. */
  align?: 'left' | 'center';
  /** Extra style for the trigger container. */
  style?: any;
}

export default function PaymentSecurityInfo({ variant = 'checkout', label, align = 'left', style }: Props) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const accent = theme.colors.primary;
  const content = CONTENT[variant];
  const triggerLabel = label || (variant === 'payout' ? 'What we collect & how it’s protected' : 'How your info is protected');

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.trigger,
          align === 'center' && { justifyContent: 'center' },
          pressed && { opacity: 0.6 },
          style,
        ]}
        hitSlop={8}
      >
        <Icon source="shield-lock-outline" size={16} color={accent} />
        <Text variant="labelLarge" style={{ color: accent }}>{triggerLabel}</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)} statusBarTranslucent>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          {/* Inner pressable swallows taps so they don't dismiss via the backdrop. */}
          <Pressable style={[styles.card, { backgroundColor: theme.colors.elevation.level2 }]} onPress={() => {}}>
            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
              <View style={styles.head}>
                <Text variant="titleMedium" style={{ fontWeight: 'bold', flex: 1, color: theme.colors.onSurface }}>
                  {content.title}
                </Text>
                <Pressable onPress={() => setOpen(false)} hitSlop={10} style={{ padding: 2 }}>
                  <Icon source="close" size={22} color={theme.colors.onSurfaceVariant} />
                </Pressable>
              </View>

              {content.blocks.map((b) => (
                <View key={b.title} style={styles.block}>
                  <View style={styles.blockIcon}>
                    <Icon source={b.icon} size={22} color={accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text variant="titleSmall" style={{ fontWeight: '600', color: theme.colors.onSurface, marginBottom: 2 }}>
                      {b.title}
                    </Text>
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, lineHeight: 18 }}>
                      {b.body}
                    </Text>
                  </View>
                </View>
              ))}

              <Divider style={{ marginVertical: 12 }} />

              <Text variant="labelLarge" style={{ marginBottom: 8, color: theme.colors.onSurfaceVariant }}>Learn more</Text>
              <InfoLink label="RallySphere Privacy Policy" onPress={() => { setOpen(false); router.push('/legal/privacy'); }} />
              <InfoLink label="RallySphere Terms & Conditions" onPress={() => { setOpen(false); router.push('/legal/terms'); }} />
              <InfoLink label="How Finix protects your data" onPress={() => Linking.openURL('https://finix.com/terms-and-policies')} external />

              <Button mode="contained" onPress={() => setOpen(false)} style={{ marginTop: 16 }}>Got it</Button>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

// A tappable "learn more" row linking to a policy (internal) or Finix (external).
function InfoLink({ label, onPress, external }: { label: string; onPress: () => void; external?: boolean }) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.link, pressed && { opacity: 0.6 }]}>
      <Text variant="bodyMedium" style={{ color: theme.colors.primary, flex: 1 }}>{label}</Text>
      <Icon source={external ? 'open-in-new' : 'chevron-right'} size={18} color={theme.colors.primary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  trigger: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 16 },
  card: { borderRadius: 16, overflow: 'hidden', maxHeight: '85%' },
  scroll: { padding: 20 },
  head: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 8 },
  block: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 16 },
  blockIcon: { width: 24, alignItems: 'center', marginTop: 2 },
  link: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
});
