// components/FinixManageAccountCard.tsx
// The club's permanent door to Finix — shown once payouts are set up, not just
// during onboarding. It has to stay reachable forever: verification requests,
// document re-checks and re-verifications all land AFTER approval, which is
// exactly when an onboarding-only entry point has already disappeared.
//
// There is no Finix login we can provision for a sub-merchant: Finix's Users API
// issues API key pairs, and Dashboard team invites are scoped to OUR whole
// platform account. Hosted Onboarding Form links used to fill that gap, but that
// path was retired (2026-06-30) — so the club's self-serve surface is now the
// action list below plus a Dashboard invite we provision by hand.
import React, { useState } from 'react';
import { View, StyleSheet, Linking, ScrollView, useWindowDimensions } from 'react-native';
import { Text, Button, useTheme, HelperText, Portal, Modal, IconButton } from 'react-native-paper';
import { addClubBeneficialOwner, type FinixActionRequired } from '../lib/finix';
import type { Club } from '../lib/firebase';
import FinixActionRequiredCard from './FinixActionRequiredCard';
import { useDebugLogs } from '../lib/debugContext';
import FinixOwnerForm, {
  emptyFinixOwner,
  finixOwnerValid,
  toFinixOwnerInput,
  type FinixOwnerDraft,
} from './FinixOwnerForm';

// Finix's merchant-facing dashboard — the seller's ongoing account: transactions,
// settlements, disputes, documents.
//
// It is NOT self-serve: a Dashboard user has to exist for this merchant before
// the owner can sign in, and Finix exposes no API to create one — the invite is
// provisioned by RallySphere from our Finix Dashboard, and Finix emails them
// from notifications@payments-dashboard.com. Hence the "ask us" copy below.
//
// The default host is finix.payments-dashboard.com; Finix can white-label it to
// a RallySphere subdomain on request. Override here if that gets set up.
const FINIX_DASHBOARD_URL = 'https://finix.payments-dashboard.com';
const SUPPORT_EMAIL = 'support@rallysphere.com';

interface Props {
  club: Club;
  onStatusChange?: () => void;
  style?: any;
}

export default function FinixManageAccountCard({ club, onStatusChange, style }: Props) {
  const theme = useTheme();
  const { debugLogs } = useDebugLogs();
  const { height: winH } = useWindowDimensions();
  const [error, setError] = useState<string | null>(null);
  // Informational, not a failure — e.g. no mail client to hand off to.
  const [notice, setNotice] = useState<string | null>(null);
  // Derived, not state: the webhook writes finixActionRequired onto the club and
  // the parent refetches after onStatusChange, so reading the prop each render is
  // what keeps this current. Held in state it would freeze at the first value.
  const action = (club.finixActionRequired as FinixActionRequired) || null;

  // "Add an owner" sheet.
  const [ownerOpen, setOwnerOpen] = useState(false);
  const [ownerBusy, setOwnerBusy] = useState(false);
  const [ownerAdded, setOwnerAdded] = useState(false);
  const [newOwner, setNewOwner] = useState<FinixOwnerDraft>(emptyFinixOwner());

  const submitOwner = async () => {
    setOwnerBusy(true);
    setError(null);
    // resubmit defaults to true server-side: adding an owner changes who
    // underwriting has to check, so it needs a fresh Verification to take effect.
    const res = await addClubBeneficialOwner(club.id, toFinixOwnerInput(newOwner), true, debugLogs);
    setOwnerBusy(false);
    if (!res.success) {
      setError(res.error || 'Could not add that owner. Try again.');
      return;
    }
    setOwnerOpen(false);
    setNewOwner(emptyFinixOwner());
    setOwnerAdded(true);
    onStatusChange?.();
  };

  // Raw Finix onboarding_state means nothing to a club owner. Say what it means
  // for them and, crucially, whether the ball is in their court.
  const statusLine = (): { label: string; detail: string; tone: 'good' | 'wait' | 'act' } => {
    if (club.finixMerchantAccountActive) {
      return { label: 'Active', detail: 'Your club is receiving payments.', tone: 'good' };
    }
    if (action) {
      return { label: 'Action needed', detail: 'Finix is waiting on you — see below.', tone: 'act' };
    }
    if (club.finixOnboardingDeclined || club.finixOnboardingState === 'REJECTED') {
      return { label: 'Declined', detail: 'Finix could not approve this account. Contact us and we’ll go through it with you.', tone: 'act' };
    }
    if (club.finixMerchantId) {
      return { label: 'In review', detail: 'Finix is reviewing your application — usually 1–2 business days. We’ll notify you.', tone: 'wait' };
    }
    // Legacy: clubs that started on the retired hosted form and never finished.
    if (club.finixOnboardingFormId) {
      return { label: 'Not finished', detail: 'Your application hasn’t been submitted yet.', tone: 'act' };
    }
    return { label: 'Not started', detail: 'Set up payouts to start receiving payments.', tone: 'wait' };
  };
  const status = statusLine();
  const toneColor =
    status.tone === 'good' ? '#10B981' : status.tone === 'act' ? theme.colors.error : theme.colors.onSurfaceVariant;

  return (
    <View style={[styles.card, { borderColor: theme.colors.outline, backgroundColor: theme.colors.elevation.level1 }, style]}>
      <View style={styles.head}>
        <Text variant="titleSmall" style={{ fontWeight: '600', color: theme.colors.onSurface, flex: 1 }}>
          Your Finix account
        </Text>
        <View style={[styles.dot, { backgroundColor: toneColor }]} />
        <Text variant="labelMedium" style={{ color: toneColor, fontWeight: '700' }}>{status.label}</Text>
      </View>
      <Text variant="bodySmall" style={{ marginTop: 4, color: theme.colors.onSurfaceVariant, lineHeight: 18 }}>
        {status.detail}
      </Text>
      <Text variant="bodySmall" style={{ marginTop: 8, color: theme.colors.onSurfaceVariant, lineHeight: 18 }}>
        Finix processes your payments and verifies your club. If they ever need anything from you,
        it’ll appear here — corrections you can make yourself, documents we’ll pass along for you.
      </Text>

      {action && (
        <FinixActionRequiredCard
          action={action}
          // Corrections happen in Payment Profile; this gives the club the
          // re-review button, since fixing details alone won't reopen
          // underwriting — Finix only re-reviews on a new Verification.
          clubId={club.id}
          onResubmitted={onStatusChange}
          style={{ marginTop: 12 }}
        />
      )}

      {/* Beneficial owners. Finix requires every 25%+ owner on the application,
          and ownership changes after approval — a new partner buys in, a founder
          is bought out. Without this the only fix is a support ticket. */}
      {club.finixMerchantId && (
        <View style={{ marginTop: 16, paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.outline }}>
          <Text variant="titleSmall" style={{ fontWeight: '600', color: theme.colors.onSurface }}>
            Business owners
          </Text>
          <Text variant="bodySmall" style={{ marginTop: 4, color: theme.colors.onSurfaceVariant, lineHeight: 18 }}>
            Finix requires everyone who owns 25% or more of the business to be on file. Add anyone who
            isn’t — payouts can be paused if the list is incomplete.
          </Text>
          <Button mode="outlined" icon="account-plus-outline" onPress={() => setOwnerOpen(true)} style={{ marginTop: 12 }}>
            Add an owner
          </Button>
          {ownerAdded && (
            <Text variant="bodySmall" style={{ marginTop: 8, fontWeight: '600', color: theme.colors.onSurface }}>
              Owner added and sent to Finix for review.
            </Text>
          )}
        </View>
      )}

      {/* Ongoing account access, available on both paths once a merchant exists. */}
      {club.finixMerchantId && (
        <View style={{ marginTop: 16, paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.outline }}>
          <Text variant="titleSmall" style={{ fontWeight: '600', color: theme.colors.onSurface }}>
            Finix dashboard
          </Text>
          <Text variant="bodySmall" style={{ marginTop: 4, color: theme.colors.onSurfaceVariant, lineHeight: 18 }}>
            See your payouts, settlements and disputes directly with Finix. You’ll need a Finix login — if you
            don’t have one yet, email {SUPPORT_EMAIL} and we’ll send you an invite.
          </Text>
          <Button
            mode="outlined"
            icon="open-in-new"
            onPress={() => Linking.openURL(FINIX_DASHBOARD_URL).catch(() => setError('Could not open the Finix dashboard.'))}
            style={{ marginTop: 12 }}
          >
            Open Finix dashboard
          </Button>
          <Button
            mode="text"
            compact
            onPress={() =>
              Linking.openURL(
                `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Finix dashboard access')}&body=${encodeURIComponent(
                  `Please set up Finix dashboard access for ${club.name}.\n\nMerchant ID: ${club.finixMerchantId}`
                )}`
              ).catch(() =>
                // No mail client (simulator, or none configured). The address is
                // already on screen above — point at it rather than dead-ending.
                setNotice(`No mail app set up. Email ${SUPPORT_EMAIL} with your merchant ID and we’ll sort it out.`)
              )
            }
            style={{ marginTop: 4 }}
          >
            Request dashboard access
          </Button>
          <Text variant="bodySmall" style={{ marginTop: 12, color: theme.colors.onSurfaceVariant, opacity: 0.7 }}>
            Merchant ID: {club.finixMerchantId}
          </Text>
        </View>
      )}
      {notice && (
        <Text variant="bodySmall" style={{ marginTop: 8, color: theme.colors.onSurfaceVariant, lineHeight: 18 }}>
          {notice}
        </Text>
      )}
      {error && <HelperText type="error" visible>{error}</HelperText>}

      {/* Add-an-owner sheet. Same form the onboarding wizard uses, so the two
          can't drift into asking for different fields. */}
      <Portal>
        <Modal
          visible={ownerOpen}
          onDismiss={() => { if (!ownerBusy) { setOwnerOpen(false); setError(null); } }}
          contentContainerStyle={[styles.modalCard, { backgroundColor: theme.dark ? '#131D33' : '#FFFFFF', borderColor: theme.colors.outline, borderWidth: StyleSheet.hairlineWidth }]}
        >
          <ScrollView style={{ maxHeight: winH * 0.8 }} contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
            <View style={styles.modalHead}>
              <Text variant="titleMedium" style={{ fontWeight: 'bold', flex: 1, color: theme.colors.onSurface }}>
                Add an owner
              </Text>
              <IconButton icon="close" size={22} style={{ margin: 0 }} disabled={ownerBusy} onPress={() => { setOwnerOpen(false); setError(null); }} />
            </View>
            <Text variant="bodySmall" style={{ marginBottom: 12, color: theme.colors.onSurfaceVariant, lineHeight: 18 }}>
              Anyone owning 25% or more of the business. Adding them sends the account back to Finix for
              review — payouts keep working while they check.
            </Text>

            <FinixOwnerForm value={newOwner} onChange={setNewOwner} />

            <Button
              mode="contained"
              loading={ownerBusy}
              disabled={ownerBusy || !finixOwnerValid(newOwner)}
              onPress={submitOwner}
              style={{ marginTop: 16 }}
            >
              Add owner
            </Button>
            {error && <HelperText type="error" visible>{error}</HelperText>}
          </ScrollView>
        </Modal>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, borderRadius: 12, borderWidth: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  modalCard: { margin: 16, borderRadius: 16, overflow: 'hidden' },
  modalHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
});
