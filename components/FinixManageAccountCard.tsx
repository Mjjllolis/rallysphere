// components/FinixManageAccountCard.tsx
// The club's permanent door to Finix — shown once payouts are set up, not just
// during onboarding.
//
// There is no Finix login we can provision for a sub-merchant: Finix's Users API
// issues API key pairs, and Dashboard team invites are scoped to OUR whole
// platform account. What a club CAN have is a hosted Onboarding Form link, which
// is a short-lived bearer-token URL we mint on demand. So the "portal" is this
// button, and it has to stay reachable forever — verification requests, document
// re-checks and re-verifications all land AFTER approval, which is exactly when
// an onboarding-only entry point has already disappeared.
import React, { useState } from 'react';
import { View, StyleSheet, Linking } from 'react-native';
import { Text, Button, useTheme, HelperText } from 'react-native-paper';
import { getClubOnboardingFormLink, type FinixActionRequired } from '../lib/finix';
import type { Club } from '../lib/firebase';
import FinixActionRequiredCard from './FinixActionRequiredCard';

// Finix's merchant-facing dashboard. This is the seller's ongoing account —
// transactions, settlements, disputes, documents — and is a different thing
// from the hosted onboarding form link (a one-off verification page).
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Informational, not a failure — e.g. no mail client to hand off to.
  const [notice, setNotice] = useState<string | null>(null);
  const [action, setAction] = useState<FinixActionRequired | null>(
    (club.finixActionRequired as FinixActionRequired) || null
  );

  // Finix refuses to generate a link once a form is Completed (409). It only
  // reopens when underwriting asks for something, which flips the form back to
  // UPDATE_REQUESTED. So offer the form link only when there's genuinely
  // something to open — otherwise the button is guaranteed to fail.
  const hosted = club.finixOnboardingMode === 'hosted';
  const formOpenable = hosted && (!!action || club.finixOnboardingFormStatus !== 'COMPLETED');

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
    if (club.finixOnboardingFormId) {
      return { label: 'Not finished', detail: 'Your application hasn’t been submitted yet.', tone: 'act' };
    }
    return { label: 'Not started', detail: 'Set up payouts to start receiving payments.', tone: 'wait' };
  };
  const status = statusLine();
  const toneColor =
    status.tone === 'good' ? '#10B981' : status.tone === 'act' ? theme.colors.error : theme.colors.onSurfaceVariant;

  const open = async () => {
    setBusy(true);
    setError(null);
    const res = await getClubOnboardingFormLink(club.id);
    if (!res.success) {
      setError(res.error || 'Could not open Finix');
      setBusy(false);
      return;
    }
    setAction(res.actionRequired || null);
    if (res.linkUrl) {
      await Linking.openURL(res.linkUrl).catch(() => setError('Could not open the Finix page. Try again.'));
    } else {
      setError('Nothing to review at Finix right now.');
    }
    setBusy(false);
    onStatusChange?.();
  };

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
        {formOpenable
          ? 'Finix processes your payments and verifies your club. Open your Finix page to finish up or respond to anything they ask for.'
          : hosted
          ? 'Finix processes your payments and verifies your club. If they need anything from you later, it’ll appear here and you can send it to them directly.'
          : 'Finix processes your payments and verifies your club. If they ever need documents from you, we’ll show them here and pass them along.'}
      </Text>

      {action && (
        <FinixActionRequiredCard
          action={action}
          onResolve={hosted ? open : undefined}
          resolveLabel="Open my Finix page"
          loading={busy}
          style={{ marginTop: 12 }}
        />
      )}

      {formOpenable && !action && (
        <Button mode="outlined" icon="open-in-new" onPress={open} loading={busy} disabled={busy} style={{ marginTop: 12 }}>
          Open my Finix page
        </Button>
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
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, borderRadius: 12, borderWidth: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
