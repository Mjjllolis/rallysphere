// components/FinixOnboardingWizard.tsx
// Club payout onboarding, entirely in-app against the Finix API.
//
// Finix's own hosted onboarding form used to be offered alongside this and was
// removed on 2026-06-30 (see lib/finix.ts and functions/src/index.ts). The
// server callable and the rallysphere://finix-onboarding/* landing routes are
// still there so already-installed builds don't break, but nothing in the app
// mints a new hosted form. Because we now own the form, we also own Finix's
// required onboarding language — see constants/legalDocs.ts, and don't reword
// those strings.
//
// The wizard is a hub of three independent stages the admin completes in order:
//   1. Payment Profile  → createClubIdentity()      (business + owner KYC)
//   2. Bank Account     → addClubBankAccount()       (locked until 1 is done)
//   3. Review & Submit  → provisionClubMerchant()    (locked until 1 & 2 done)
// The terminal underwriting result then arrives via the finixWebhook.
//
// Each stage can be finished separately — an admin can set up the profile now
// and add the bank later — but the account can't be submitted for approval
// until both the profile and bank exist (Finix needs a settlement bank).
//
// Sensitive fields (EIN, SSN, bank #) are sent straight to the callables and
// forwarded to Finix; they are NOT persisted to Firestore. Only the required
// fields are shown — optional Finix fields (DBA, website, apt line, title,
// ownership %) use sensible defaults server-side.
import React, { useState } from 'react';
import { View, StyleSheet, Platform, Pressable, ScrollView, useWindowDimensions, Linking, KeyboardAvoidingView } from 'react-native';
import { Text, TextInput, Button, useTheme, Checkbox, HelperText, Divider, ProgressBar, Chip, Portal, Modal, IconButton } from 'react-native-paper';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import { useDebugLogs } from '../lib/debugContext';
import {
  createClubIdentity,
  addClubBankAccount,
  provisionClubMerchant,
  getSubMerchantStatus,
  type FinixBusinessInput,
  type FinixPersonInput,
} from '../lib/finix';
import { updateClub } from '../lib/firebase';
import type { Club } from '../lib/firebase';
import FinixBankTokenizer from './FinixBankTokenizer';
import PaymentSecurityInfo from './PaymentSecurityInfo';
import FinixActionRequiredCard from './FinixActionRequiredCard';
import type { FinixActionRequired } from '../lib/finix';
import {
  FINIX_TERMS_URL,
  FINIX_BANK_ACCOUNT_CONSENT,
  FINIX_VERIFICATION_CONSENT,
  FINIX_TOS_CONSENT,
} from '../constants/legalDocs';
import { SELLER_FEE_DISCLOSURE, SERVICE_FEE_LABEL, FEE_SCHEDULE_URL } from '../constants/fees';
import FinixOwnerForm, {
  SecureField,
  DateField,
  FinixAddressFields,
  emptyFinixAddr,
  emptyFinixOwner,
  finixOwnerValid,
  finixOwnerMissing,
  toFinixOwnerInput,
  type FinixAddr,
  type FinixOwnerDraft,
} from './FinixOwnerForm';

interface Props {
  club: Club;
  acceptedByUid?: string;
  onComplete?: () => void;
  themeName?: 'dark' | 'light';
  /** When embedded directly in a screen (not its own route) hide the
   *  "Save & close" affordance — there's nothing to close. */
  embedded?: boolean;
}

// Values must be Finix's exact business_type enum.
// Values must be Finix's exact refund_policy enum.
const REFUND_POLICIES = [
  ['WITHIN_30_DAYS', 'Refunds within 30 days'],
  ['MERCHANDISE_EXCHANGE_ONLY', 'Exchanges only'],
  ['NO_REFUNDS', 'No refunds'],
  ['OTHER', 'Other'],
] as const;

const BUSINESS_TYPES = [
  ['LIMITED_LIABILITY_COMPANY', 'LLC'],
  ['CORPORATION', 'Corporation'],
  ['INDIVIDUAL_SOLE_PROPRIETORSHIP', 'Sole proprietor'],
  ['PARTNERSHIP', 'Partnership'],
  ['LIMITED_PARTNERSHIP', 'Limited partnership'],
  ['GENERAL_PARTNERSHIP', 'General partnership'],
  ['ASSOCIATION_ESTATE_TRUST', 'Association / Trust'],
  ['TAX_EXEMPT_ORGANIZATION', 'Non-profit'],
] as const;

// Public web build — a club's page here doubles as their business website for
// Finix underwriting when they don't have one of their own.
const CLUB_PAGE_BASE = process.env.EXPO_PUBLIC_WEB_BASE_URL || 'https://rally-sphere.web.app';

// Person shape, validation, and the field renderer all live in FinixOwnerForm —
// the same form is used here and on the "add an owner" flow for approved clubs.
type Addr = FinixAddr;
const emptyAddr = emptyFinixAddr;
type Person = FinixOwnerDraft;
const emptyPerson = emptyFinixOwner;
const personValid = finixOwnerValid;
const toPersonInput = toFinixOwnerInput;

// The wizard is a hub with these views. 'hub' is the landing screen listing the
// three stages; the others are the individual sub-flows.
type View_ = 'hub' | 'profile' | 'bank' | 'submit' | 'status';

const fmtDate = (d: Date | null): string =>
  d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : '';

export default function FinixOnboardingWizard({ club, acceptedByUid, onComplete, themeName, embedded }: Props) {
  const theme = useTheme();
  const router = useRouter();
  // Staff sandbox toggle. Every Finix call in this wizard carries it so the
  // identity, bank, merchant and status checks all land in the SAME environment
  // — a half-sandbox application is worse than none.
  const { debugLogs } = useDebugLogs();
  const { height: winH } = useWindowDimensions();
  const isDark = themeName !== 'light';
  const draft = club.finixOnboardingDraft || {};
  // Outlined inputs mask the outline behind the floating label with this color;
  // match the card surface so labels don't get a black notch.
  // OPAQUE, not theme.colors.elevation.* — those are rgba with 0.4–0.8 alpha in
  // the dark theme, so the screen behind bled through the modal and through the
  // notch each outlined label punches in its border. A form you're reading data
  // into has to be solid.
  const surfaceSolid = isDark ? '#131D33' : '#FFFFFF';
  const fieldBg = { backgroundColor: surfaceSolid };

  // Always land on the hub (the 3-stage overview). Sub-steps open in a modal;
  // the hub's stage 3 opens the status view when the merchant is already submitted.
  const [view, setView] = useState<View_>('hub');
  // Sub-step within the Payment Profile flow only: 0 = Business, 1 = Owner.
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live stage-completion flags. Seeded from the club doc, then flipped locally
  // as each sub-flow finishes so the hub reflects progress without a reload.
  const [identityDone, setIdentityDone] = useState(!!club.finixIdentityId);

  // --- Business (required fields only) ---
  const [biz, setBiz] = useState({
    businessName: draft.business?.businessName || club.name || '',
    businessType: draft.business?.businessType || '',
    taxId: '', // EIN — secure, never prefilled
    phone: draft.business?.phone || '',
    email: draft.business?.email || club.contactEmail || '',
    // Finix requires a URL and underwriters actually open it to confirm the
    // business is real. Most clubs have no website, and a blank or junk value
    // is a guaranteed manual review — so default to the club's own public
    // RallySphere page, which shows their name, description, events and store.
    // Editable, so a club with a real site can replace it.
    url: draft.business?.url || club.socialLinks?.website || `${CLUB_PAGE_BASE}/club/${club.id}`,
    // This Finix application only allows MCCs [5045, 7997]; 7997 = Membership
    // Clubs (Sports/Recreation/Athletic), the right fit for RallySphere clubs.
    mcc: draft.business?.mcc || '7997',
    // Whole-dollar strings in the UI; converted to integer cents on submit.
    annualCardVolume: draft.business?.annualCardVolume ? String(Math.round(draft.business.annualCardVolume / 100)) : '50000',
    maxTransactionAmount: draft.business?.maxTransactionAmount ? String(Math.round(draft.business.maxTransactionAmount / 100)) : '5000',
    incorporationDate: (draft.business?.incorporationDate ? new Date(draft.business.incorporationDate) : null) as Date | null,
    // What participants see on their card statement. Was silently derived as
    // businessName.slice(0, 20), which truncates a long legal name mid-word —
    // an unrecognisable descriptor is a leading cause of chargebacks, so the
    // club gets to choose it.
    statementDescriptor:
      draft.business?.defaultStatementDescriptor || (draft.business?.businessName || club.name || '').slice(0, 20),
    address: { ...emptyAddr, ...(draft.business?.address || {}) } as Addr,
  });

  // Underwriting narrative. Finix's reviewers ask a human to chase whatever we
  // leave blank here — and they chase US, not the club. Everything else in the
  // block is defaulted server-side; these two are the ones only the club knows.
  const [uw, setUw] = useState({
    businessDescription: draft.underwriting?.businessDescription || '',
    averageTransactionAmount: draft.underwriting?.averageCardTransferAmount
      ? String(Math.round(draft.underwriting.averageCardTransferAmount / 100))
      : '',
    refundPolicy: draft.underwriting?.refundPolicy || 'WITHIN_30_DAYS',
  });
  const [refundMenu, setRefundMenu] = useState(false);
  const [bizTypeMenu, setBizTypeMenu] = useState(false);

  // --- Control person / primary owner ---
  const [owner, setOwner] = useState<Person>({
    ...emptyPerson(),
    firstName: draft.controlPerson?.firstName || '',
    lastName: draft.controlPerson?.lastName || '',
    title: draft.controlPerson?.title || 'Owner',
    ownershipPercentage:
      draft.controlPerson?.principalPercentageOwnership != null
        ? String(draft.controlPerson.principalPercentageOwnership)
        : '100',
    phone: draft.controlPerson?.phone || '',
    email: draft.controlPerson?.email || club.contactEmail || '',
    address: { ...emptyAddr, ...(draft.controlPerson?.address || {}) } as Addr,
  });

  // --- Additional beneficial owners (25%+) ---
  // Finix requires EVERY 25%+ owner on the application. Collecting only the
  // control person is what gets co-owned LLCs and partnerships rejected.
  const [extraOwners, setExtraOwners] = useState<Person[]>(() =>
    (draft.owners || []).map((o: any) => ({
      ...emptyPerson(),
      firstName: o?.firstName || '',
      lastName: o?.lastName || '',
      title: o?.title || '',
      ownershipPercentage: o?.principalPercentageOwnership != null ? String(o.principalPercentageOwnership) : '',
      phone: o?.phone || '',
      email: o?.email || '',
      address: { ...emptyAddr, ...(o?.address || {}) } as Addr,
    }))
  );
  // Which additional owner's form is expanded. -1 = none.
  const [openOwner, setOpenOwner] = useState(-1);

  // A sole proprietorship has exactly one owner by definition, so the extra
  // owners step is noise there — skip it rather than ask a question with only
  // one valid answer.
  const needsOwnersStep = !!biz.businessType && biz.businessType !== 'INDIVIDUAL_SOLE_PROPRIETORSHIP';

  const [bankLast4, setBankLast4] = useState<string | null>(club.finixPayoutBankLast4 || null);
  // Last 4 of the account owner's SSN, collected on the bank step and submitted
  // with the tokenized account. Required. Never persisted to Firestore.
  const [bankSsnLast4, setBankSsnLast4] = useState('');
  // Flips true the instant addClubBankAccount returns success, so the hub shows
  // the bank step done immediately — independent of the club re-fetch, which can
  // serve a stale cached doc that still lacks finixPayoutPiId.
  const [bankSaved, setBankSaved] = useState(false);
  // What Finix is waiting on, if anything. Seeded from the club doc (written by
  // the webhook) and refreshed by every status check.
  const [actionRequired, setActionRequired] = useState<FinixActionRequired | null>(
    (club.finixActionRequired as FinixActionRequired) || null
  );

  const [agree, setAgree] = useState(!!club.finixTosAcceptedAt);
  // Consent gate on the Payment Profile stage. Separate from `agree` because
  // it's collected earlier and covers a different assertion: submitting the
  // owner step is what creates the Finix Identity carrying the merchant
  // agreement and credit-check consent records.
  const [profileAgree, setProfileAgree] = useState(!!club.finixIdentityId);
  const [merchantState, setMerchantState] = useState<string>(club.finixOnboardingState || 'PROVISIONING');
  const [statusActive, setStatusActive] = useState<boolean>(!!club.finixMerchantAccountActive);

  // Stage status derived from local + club state. The Payment Profile counts as
  // done the moment the identity exists on Finix — submitting it is a committed
  // action, so we check it off and move the admin on to the bank step (there is
  // no "resume the form" state).
  const profileDone = identityDone || !!club.finixIdentityId;
  const bankDone = bankSaved || !!bankLast4 || !!club.finixPayoutPiId;
  const submitted = !!club.finixMerchantId;
  const completedStages = (profileDone ? 1 : 0) + (bankDone ? 1 : 0) + (submitted ? 1 : 0);
  // Once submitted, the application is under review at Finix until it's active.
  // During that window the admin can view everything but must not edit the
  // profile or bank — a change mid-underwriting would desync us from Finix.
  //
  // UPDATE_REQUESTED is the deliberate exception: Finix has stopped reviewing
  // and is asking for corrections, so editing is exactly what's wanted. Leaving
  // the lock on here is what strands a club — we tell them to fix a field and
  // then disable the row that holds it.
  const updateRequested = merchantState === 'UPDATE_REQUESTED' || !!actionRequired;
  const reviewLock = submitted && !statusActive && !updateRequested;

  const today = new Date();
  const fail = (msg: string) => { setError(msg); setBusy(false); };

  // A LIST of what's outstanding, not a bare boolean — so a greyed-out button can
  // say why instead of leaving you hunting for the one field you missed.
  // Every field here is required by Finix; there are no optional ones on this step.
  const businessMissing: string[] = [
    !biz.businessName.trim() && 'Legal business name',
    !biz.businessType && 'Business type',
    !biz.taxId.trim() && 'EIN (Tax ID)',
    !biz.phone.trim() && 'Business phone',
    !biz.email.trim() && 'Business email',
    !biz.url.trim() && 'Website',
    !(Number(biz.annualCardVolume) > 0) && 'Estimated annual card sales',
    !(Number(biz.maxTransactionAmount) > 0) && 'Largest single charge',
    !biz.incorporationDate && 'Incorporation date',
    !biz.statementDescriptor.trim() && 'Statement descriptor',
    !(Number(uw.averageTransactionAmount) > 0) && 'Typical purchase amount',
    // Underwriting narrative — a vague description is the #1 reason Finix comes
    // back with manual questions, so require a real one rather than defaulting.
    uw.businessDescription.trim().length < 20 &&
      `A fuller answer to “What does your club sell?” (at least 20 characters — you have ${uw.businessDescription.trim().length})`,
    !biz.address.line1.trim() && 'Street address',
    !biz.address.city.trim() && 'City',
    !biz.address.region.trim() && 'State',
    !biz.address.postalCode.trim() && 'ZIP code',
  ].filter(Boolean) as string[];
  const businessValid = businessMissing.length === 0;

  const ownerValid = personValid(owner);
  const ownerMissing = finixOwnerMissing(owner);
  // Each incomplete extra owner names itself, so "Owner 2: SSN" points straight
  // at the card to open rather than making you expand each one to find it.
  const extraOwnersMissing = extraOwners.flatMap((o, i) =>
    finixOwnerMissing(o, `${o.firstName.trim() || `Owner ${i + 2}`}`)
  );

  // Total declared ownership can legitimately be under 100 (holders below 25%
  // don't have to be listed), but it can never exceed it.
  const totalOwnership =
    (Number(owner.ownershipPercentage) || 0) +
    extraOwners.reduce((sum, o) => sum + (Number(o.ownershipPercentage) || 0), 0);
  const ownershipOverAllocated = totalOwnership > 100;
  const extraOwnersValid = extraOwners.every(personValid) && !ownershipOverAllocated;

  const submitIdentity = async () => {
    setBusy(true); setError(null);
    const business: FinixBusinessInput = {
      businessName: biz.businessName.trim(),
      businessType: biz.businessType,
      taxId: biz.taxId.replace(/\D/g, ''),
      phone: biz.phone.trim(),
      email: biz.email.trim(),
      url: biz.url.trim(),
      mcc: biz.mcc.trim() || undefined,
      annualCardVolume: Math.round((Number(biz.annualCardVolume) || 0) * 100),
      maxTransactionAmount: Math.round((Number(biz.maxTransactionAmount) || 0) * 100),
      incorporationDate: fmtDate(biz.incorporationDate) || undefined,
      defaultStatementDescriptor: biz.statementDescriptor.trim().slice(0, 20),
      address: { ...biz.address, country: 'USA' },
    };
    const res = await createClubIdentity({
      clubId: club.id,
      business,
      controlPerson: toPersonInput(owner),
      // Every 25%+ owner beyond the control person. The server turns each into
      // an associated identity under the merchant identity.
      owners: extraOwners.filter(personValid).map(toPersonInput),
      underwriting: {
        businessDescription: uw.businessDescription.trim() || undefined,
        averageCardTransferAmount: Number(uw.averageTransactionAmount)
          ? Math.round(Number(uw.averageTransactionAmount) * 100)
          : undefined,
        refundPolicy: uw.refundPolicy,
      },
      // IP is filled server-side from the request — the client can't see its own.
      // Both flags are only reachable once the club has ticked the consent box
      // and seen the linked terms directly above this step's Continue button.
      consent: {
        userAgent: `RallySphere/${Platform.OS}`,
        merchantAgreementAccepted: true,
        creditCheckAllowed: true,
      },
      debug: debugLogs,
    });
    if (!res.success) return fail(res.error || 'Failed to save details');
    setIdentityDone(true);
    setBusy(false); setStep(0); setView('hub'); onComplete?.();
  };

  const handleBankToken = async (tokenId: string) => {
    if (!/^\d{4}$/.test(bankSsnLast4)) {
      setError('Enter the last 4 digits of the account owner’s SSN before continuing.');
      return;
    }
    setBusy(true); setError(null);
    const res = await addClubBankAccount(club.id, tokenId, bankSsnLast4, debugLogs);
    if (!res.success) return fail(res.error || 'Failed to add bank account');
    setBankSaved(true);
    setBankLast4(res.last4 || null);
    setBusy(false); setView('hub'); onComplete?.();
  };

  const submitApplication = async () => {
    if (!agree) { setError('Please accept the terms to submit.'); return; }
    setBusy(true); setError(null);
    const res = await provisionClubMerchant(club.id, debugLogs);
    if (!res.success) return fail(res.error || 'Failed to submit application');
    setMerchantState(res.onboardingState || 'PROVISIONING');
    setStatusActive(res.onboardingState === 'APPROVED');
    setBusy(false); setView('status'); onComplete?.();
  };

  const refreshStatus = async () => {
    setBusy(true); setError(null);
    const res = await getSubMerchantStatus({ clubId: club.id, merchantId: club.finixMerchantId, identityId: club.finixIdentityId, debug: debugLogs });
    if (res.success) {
      setMerchantState(res.status || merchantState);
      setStatusActive(!!res.isComplete);
      setActionRequired(res.actionRequired || null);
      if (res.isComplete && !club.finixMerchantAccountActive) {
        await updateClub(club.id, {
          finixMerchantId: res.merchantId || club.finixMerchantId,
          finixMerchantAccountActive: true,
          finixOnboardingComplete: true,
          finixOnboardingStatus: 'APPROVED',
        });
        onComplete?.();
      }
    }
    setBusy(false);
  };

  // ---- shared field renderers ----
  // autoCorrect/spellCheck are OFF by default. iOS turns them on otherwise, and
  // autocorrect rewriting a *controlled* TextInput mid-keystroke is what makes
  // typing feel like the field is fighting back — it replaces words you already
  // committed. None of these fields (legal names, addresses, EIN, business
  // descriptions) benefit from it, and a mangled legal name goes to underwriting.
  // `extra` is spread last so any field can opt back in.
  // UNCONTROLLED (defaultValue, not value). Every keystroke re-renders this whole
  // wizard; a controlled input re-applies its `value` on each render, and when JS
  // lags the native field by even one frame the value it re-applies is stale —
  // the caret jumps back and eats a character. Letting the native input own the
  // text removes that loop; onChangeText still keeps state current.
  //
  // Fields that REWRITE input as you type (digit-stripping, upper-casing) pass
  // `controlled: true` and keep `value`, because the rewrite has to be shown back.
  const field = (label: string, value: string, onChangeText: (t: string) => void, extra?: any) => {
    const { controlled, ...rest } = extra || {};
    return (
      <TextInput
        mode="outlined"
        label={label}
        {...(controlled ? { value } : { defaultValue: value })}
        onChangeText={onChangeText}
        autoCorrect={false}
        spellCheck={false}
        autoCapitalize="sentences"
        style={[styles.input, fieldBg]}
        {...rest}
      />
    );
  };

  // The Finix-mandated ToS sentence, rendered verbatim with both documents
  // linked. Shown at every point the club "continues" into a commitment — the
  // step that creates the Identity, and the final submit.
  const tosLine = () => (
    <Text variant="bodySmall" style={[styles.tosLine, { color: theme.colors.onSurfaceVariant }]}>
      {FINIX_TOS_CONSENT.prefix}
      <Text style={[styles.link, { color: theme.colors.primary }]} onPress={() => router.push('/legal/terms')}>
        {FINIX_TOS_CONSENT.ownLabel}
      </Text>
      {FINIX_TOS_CONSENT.middle}
      <Text
        style={[styles.link, { color: theme.colors.primary }]}
        onPress={() => Linking.openURL(FINIX_TERMS_URL).catch(() => setError('Could not open the Finix Terms of Service.'))}
      >
        {FINIX_TOS_CONSENT.finixLabel}
      </Text>
      {FINIX_TOS_CONSENT.suffix}
      {/* Privacy sits alongside the mandated sentence rather than inside it —
          the Finix wording is fixed and must not be altered, but a club agreeing
          to share owner SSNs and bank details should be one tap from our privacy
          policy. */}
      {'  '}
      <Text
        style={[styles.link, { color: theme.colors.primary }]}
        onPress={() => router.push('/legal/privacy')}
      >
        Privacy Policy
      </Text>
    </Text>
  );

  return (
    <View>
      {/* ---------- HUB: the three stages (sub-steps open in the modal below) ---------- */}
      <ProgressBar progress={completedStages / 3} color={theme.colors.primary} style={styles.progress} />
      <Text variant="labelLarge" style={{ marginBottom: 16, color: theme.colors.onSurfaceVariant }}>
        {completedStages} of 3 complete
      </Text>

      {/* Surfaced on the hub, not just inside the status modal — a club that
          never opens "View application status" would otherwise never learn
          Finix is waiting on them. */}
      {!statusActive && actionRequired && (
        <FinixActionRequiredCard
          action={actionRequired}
          clubId={club.id}
          onResubmitted={refreshStatus}
          loading={busy}
          style={{ marginBottom: 16 }}
        />
      )}

      <StageRow
        n={1}
        title="Payment Profile"
        subtitle="Business & owner identity verification (KYC)"
        status={profileDone ? 'done' : 'todo'}
        actionLabel={reviewLock ? undefined : (profileDone ? 'Edit' : 'Set up')}
        onPress={() => { if (reviewLock) return; setError(null); setStep(0); setView('profile'); }}
      />
      <StageRow
        n={2}
        title="Bank Account"
        subtitle="Where your payouts are deposited"
        status={bankDone ? 'done' : profileDone ? 'todo' : 'locked'}
        value={bankDone && bankLast4 ? `•••• ${bankLast4}` : undefined}
        actionLabel={reviewLock ? undefined : (bankDone ? 'Change' : 'Add')}
        lockedHint="Complete your Payment Profile first"
        disabled={!profileDone}
        onPress={() => { if (reviewLock) return; setError(null); setView('bank'); }}
      />
      <StageRow
        n={3}
        title="Review & Submit"
        subtitle="Send your application to Finix for approval"
        status={submitted ? 'done' : profileDone && bankDone ? 'todo' : 'locked'}
        actionLabel={submitted ? 'View status' : 'Review'}
        lockedHint="Finish both steps above first"
        disabled={!submitted && !(profileDone && bankDone)}
        onPress={() => { setError(null); setView(submitted ? 'status' : 'submit'); }}
      />

      {/* Once submitted, a clear button to open the live application status. */}
      {submitted && (
        <Button mode="contained" icon="refresh" onPress={() => { setError(null); setView('status'); }} style={styles.next}>
          View application status
        </Button>
      )}

      {reviewLock && (
        <Text variant="bodySmall" style={{ marginTop: 12, textAlign: 'center', color: theme.colors.onSurfaceVariant }}>
          Your application is under review — these details are locked until it’s approved.
        </Text>
      )}
      {submitted && !statusActive && updateRequested && (
        <Text variant="bodySmall" style={{ marginTop: 12, textAlign: 'center', color: theme.colors.onSurfaceVariant }}>
          Editing is unlocked so you can make the corrections Finix asked for.
        </Text>
      )}

      {error && <HelperText type="error" visible style={{ marginTop: 8 }}>{error}</HelperText>}

      {!embedded && (
        <Button mode="text" onPress={() => onComplete?.()} style={{ marginTop: 16 }}>Save &amp; close</Button>
      )}

      {/* Sub-steps open in a modal popup so they don't crowd the card — or the
          Benefits box behind it — while an application is in progress. */}
      <Portal>
        <Modal
          visible={view !== 'hub'}
          onDismiss={() => { setError(null); setView('hub'); }}
          contentContainerStyle={[styles.modalCard, { backgroundColor: surfaceSolid, borderColor: theme.colors.outline, borderWidth: StyleSheet.hairlineWidth }]}
        >
          {/* Without this the iOS keyboard covers the lower half of the form and
              you type blind into a field you can't see. */}
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            style={{ maxHeight: winH * 0.8 }}
            contentContainerStyle={styles.modalScrollContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="none"
            showsVerticalScrollIndicator={false}
          >
          {/* Always-visible back control. Inside the Payment Profile flow it
              walks back a sub-step (skipping the owners step for sole props,
              the same way forward navigation does); everywhere else it closes
              to the hub. */}
          <View style={styles.modalHead}>
            <Button
              mode="text"
              icon="chevron-left"
              compact
              contentStyle={{ marginLeft: -4 }}
              onPress={() => {
                setError(null);
                if (view === 'profile' && step > 0) {
                  setStep(step === 3 && !needsOwnersStep ? 1 : step - 1);
                } else {
                  setView('hub');
                }
              }}
            >
              Back
            </Button>
            <IconButton icon="close" size={22} style={{ margin: 0 }} onPress={() => { setError(null); setView('hub'); }} />
          </View>
      {/* ---------- PROFILE · STEP 0: BUSINESS ---------- */}
      {view === 'profile' && step === 0 && (
        <View>
          <Text variant="titleMedium" style={styles.h}>Business details</Text>
          <Text variant="bodySmall" style={styles.note}>
            Finix requires all of these — there are no optional fields on this step.
          </Text>
          {field('Legal business name', biz.businessName, (t) => setBiz({ ...biz, businessName: t }))}

          {/* Inline dropdown — expands directly below the field. No portal, so it
              always reopens and never overlaps the form. */}
          <View>
            <Pressable onPress={() => setBizTypeMenu((v) => !v)}>
              <View pointerEvents="none">
                <TextInput
                  mode="outlined" label="Business type" editable={false}
                  value={BUSINESS_TYPES.find((b) => b[0] === biz.businessType)?.[1] || ''}
                  right={<TextInput.Icon icon={bizTypeMenu ? 'menu-up' : 'menu-down'} />}
                  style={[styles.input, fieldBg]}
                />
              </View>
            </Pressable>
            {bizTypeMenu && (
              <View style={[styles.dropdown, { backgroundColor: isDark ? '#1B2236' : '#FFFFFF', borderColor: theme.colors.outline }]}>
                {BUSINESS_TYPES.map(([val, label]) => {
                  const selected = val === biz.businessType;
                  return (
                    <Pressable
                      key={val}
                      onPress={() => { setBiz({ ...biz, businessType: val }); setBizTypeMenu(false); }}
                      style={({ pressed }) => [styles.dropdownItem, pressed && { backgroundColor: theme.colors.elevation.level3 }]}
                    >
                      <Text variant="bodyLarge" style={{ color: selected ? theme.colors.primary : theme.colors.onSurface }}>{label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>

          <SecureField label="EIN (Tax ID)" value={biz.taxId} onChangeText={(t) => setBiz({ ...biz, taxId: t })} fieldBg={fieldBg} />
          {field('Business phone', biz.phone, (t) => setBiz({ ...biz, phone: t }), { keyboardType: 'phone-pad' })}
          {field('Business email', biz.email, (t) => setBiz({ ...biz, email: t }), { keyboardType: 'email-address', autoCapitalize: 'none' })}
          {field('Website', biz.url, (t) => setBiz({ ...biz, url: t }), { keyboardType: 'url', autoCapitalize: 'none', placeholder: 'https://…' })}
          <Text variant="bodySmall" style={styles.note}>
            No website? Leave this as your RallySphere club page — Finix just needs somewhere that shows what your club does.
          </Text>
          {field('Estimated annual card sales (USD)', biz.annualCardVolume, (t) => setBiz({ ...biz, annualCardVolume: t.replace(/[^0-9]/g, '') }), { keyboardType: 'number-pad', left: <TextInput.Affix text="$" /> })}
          {field('Largest single charge (USD)', biz.maxTransactionAmount, (t) => setBiz({ ...biz, maxTransactionAmount: t.replace(/[^0-9]/g, '') }), { keyboardType: 'number-pad', left: <TextInput.Affix text="$" /> })}
          <DateField label="Incorporation date" value={biz.incorporationDate} onChange={(d) => setBiz({ ...biz, incorporationDate: d })} fieldBg={fieldBg} maximumDate={today} dark={isDark} />

          {field('Statement descriptor', biz.statementDescriptor, (t) => setBiz({ ...biz, statementDescriptor: t }), { maxLength: 20 })}
          <Text variant="bodySmall" style={styles.note}>
            What participants see on their card statement — up to 20 characters. Make it recognisable, or
            they may not know what the charge was and dispute it.
          </Text>

          {field('Typical purchase amount (USD)', uw.averageTransactionAmount, (t) => setUw({ ...uw, averageTransactionAmount: t.replace(/[^0-9]/g, '') }), { keyboardType: 'number-pad', left: <TextInput.Affix text="$" />, placeholder: 'e.g. 50' })}

          {/* Same inline-dropdown pattern as business type — no portal. */}
          <View>
            <Pressable onPress={() => setRefundMenu((v) => !v)}>
              <View pointerEvents="none">
                <TextInput
                  mode="outlined" label="Refund policy" editable={false}
                  value={REFUND_POLICIES.find((r) => r[0] === uw.refundPolicy)?.[1] || ''}
                  right={<TextInput.Icon icon={refundMenu ? 'menu-up' : 'menu-down'} />}
                  style={[styles.input, fieldBg]}
                />
              </View>
            </Pressable>
            {refundMenu && (
              <View style={[styles.dropdown, { backgroundColor: isDark ? '#1B2236' : '#FFFFFF', borderColor: theme.colors.outline }]}>
                {REFUND_POLICIES.map(([val, label]) => (
                  <Pressable
                    key={val}
                    onPress={() => { setUw({ ...uw, refundPolicy: val }); setRefundMenu(false); }}
                    style={({ pressed }) => [styles.dropdownItem, pressed && { backgroundColor: theme.colors.elevation.level3 }]}
                  >
                    <Text variant="bodyLarge" style={{ color: val === uw.refundPolicy ? theme.colors.primary : theme.colors.onSurface }}>{label}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          {field('What does your club sell?', uw.businessDescription, (t) => setUw({ ...uw, businessDescription: t }), {
            multiline: true,
            // Explicit height, not numberOfLines — that prop is Android-only on
            // RN's TextInput, so on iOS this rendered as a single cramped line
            // for a field we ask people to write a paragraph in.
            style: [styles.input, styles.multiline, fieldBg],
            placeholder: 'e.g. Weekly league dues, tournament entry fees, and team jerseys for our members.',
          })}
          <Text variant="bodySmall" style={styles.note}>
            Finix reviews this by hand. The more specific you are, the less likely they come back with questions.
          </Text>

          <Text variant="labelLarge" style={styles.subh}>Business address</Text>
          <FinixAddressFields value={biz.address} onChange={(a) => setBiz({ ...biz, address: a })} fieldBg={fieldBg} />

          <Button
            mode="contained"
            onPress={() => {
              // Deliberately NOT `disabled` — a dead button tells you nothing.
              // Pressing it names exactly what's outstanding.
              if (businessMissing.length) {
                setError(`Still needed: ${businessMissing.join(', ')}`);
                return;
              }
              setError(null);
              setStep(1);
            }}
            style={[styles.next, !businessValid && styles.incompleteBtn]}
          >
            Continue
          </Button>
        </View>
      )}

      {/* ---------- PROFILE · STEP 1: OWNER ---------- */}
      {view === 'profile' && step === 1 && (
        <View>
          <Text variant="titleMedium" style={styles.h}>Owner / control person</Text>
          <Text variant="bodySmall" style={styles.note}>The primary person who controls the business — required by federal “know your customer” rules.</Text>
          {/* Finix-mandated verification consent. Verbatim — see legalDocs.ts. */}
          <Text variant="bodySmall" style={styles.requiredNotice}>{FINIX_VERIFICATION_CONSENT}</Text>

          <FinixOwnerForm value={owner} onChange={setOwner} themeName={themeName} />

          <Button
            mode="contained"
            onPress={() => {
              if (ownerMissing.length) {
                setError(`Still needed: ${ownerMissing.join(', ')}`);
                return;
              }
              setError(null);
              setStep(needsOwnersStep ? 2 : 3);
            }}
            style={[styles.next, !ownerValid && styles.incompleteBtn]}
          >
            Continue
          </Button>
        </View>
      )}

      {/* ---------- PROFILE · STEP 2: OTHER 25%+ OWNERS ---------- */}
      {view === 'profile' && step === 2 && (
        <View>
          <Text variant="titleMedium" style={styles.h}>Other owners</Text>
          <Text variant="bodySmall" style={styles.note}>
            Finix requires everyone who owns 25% or more of the business to be listed. If{' '}
            {owner.firstName.trim() || 'the person you just entered'} is the only owner at 25% or more,
            skip this — otherwise your application will be held up.
          </Text>

          <View style={[styles.ownerTally, { borderColor: theme.colors.outline }]}>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              {owner.firstName.trim() || 'Control person'} {owner.ownershipPercentage || 0}%
              {extraOwners.length > 0 && ` + ${extraOwners.length} more`}
            </Text>
            <Text variant="bodySmall" style={{ fontWeight: '700', color: ownershipOverAllocated ? theme.colors.error : theme.colors.onSurface }}>
              {totalOwnership}% total
            </Text>
          </View>
          {ownershipOverAllocated && (
            <HelperText type="error" visible>Ownership adds up to more than 100%.</HelperText>
          )}

          {extraOwners.map((p, i) => {
            const expanded = openOwner === i;
            const complete = personValid(p);
            return (
              <View key={i} style={[styles.ownerCard, { borderColor: complete ? theme.colors.outline : theme.colors.error, backgroundColor: theme.colors.elevation.level1 }]}>
                <Pressable onPress={() => setOpenOwner(expanded ? -1 : i)} style={styles.ownerHead}>
                  <View style={{ flex: 1 }}>
                    <Text variant="titleSmall" style={{ fontWeight: '600', color: theme.colors.onSurface }}>
                      {`${p.firstName} ${p.lastName}`.trim() || `Owner ${i + 2}`}
                    </Text>
                    <Text variant="bodySmall" style={{ color: complete ? theme.colors.onSurfaceVariant : theme.colors.error }}>
                      {complete ? `${p.title || 'Owner'} · ${p.ownershipPercentage}%` : 'Incomplete — tap to finish'}
                    </Text>
                  </View>
                  <IconButton
                    icon="delete-outline"
                    size={20}
                    style={{ margin: 0 }}
                    onPress={() => {
                      setExtraOwners(extraOwners.filter((_, j) => j !== i));
                      setOpenOwner(-1);
                    }}
                  />
                  <Text style={{ color: theme.colors.onSurfaceVariant }}>{expanded ? '▲' : '▼'}</Text>
                </Pressable>
                {expanded && (
                  <View style={{ marginTop: 12 }}>
                    <FinixOwnerForm value={p} onChange={(next) => setExtraOwners(extraOwners.map((o, j) => (j === i ? next : o)))} themeName={themeName} />
                  </View>
                )}
              </View>
            );
          })}

          <Button
            mode="outlined"
            icon="plus"
            onPress={() => { setExtraOwners([...extraOwners, emptyPerson()]); setOpenOwner(extraOwners.length); }}
            style={{ marginTop: 8 }}
          >
            Add another owner
          </Button>

          <Button
            mode="contained"
            onPress={() => {
              if (ownershipOverAllocated) {
                setError('Ownership adds up to more than 100%. Adjust the percentages.');
                return;
              }
              if (extraOwnersMissing.length) {
                setError(`Still needed: ${extraOwnersMissing.join(', ')}`);
                return;
              }
              setError(null);
              setStep(3);
            }}
            style={[styles.next, !extraOwnersValid && styles.incompleteBtn]}
          >
            {extraOwners.length ? 'Continue' : 'No other 25%+ owners'}
          </Button>
        </View>
      )}

      {/* ---------- PROFILE · STEP 3: CONSENT & SUBMIT PROFILE ---------- */}
      {view === 'profile' && step === 3 && (
        <View>
          <Text variant="titleMedium" style={styles.h}>Confirm and continue</Text>
          <Text variant="bodySmall" style={styles.note}>
            This sends your business and owner details to Finix for verification.
          </Text>

          <ReviewRow label="Business" value={biz.businessName} />
          <ReviewRow label="Control person" value={`${owner.firstName} ${owner.lastName}`.trim()} />
          <ReviewRow
            label="Owners listed"
            value={`${1 + extraOwners.filter(personValid).length} · ${totalOwnership}% total`}
          />
          <Divider style={{ marginVertical: 12 }} />

          {/* This button is what creates the Finix Identity — and the Identity
              carries the merchant_agreement_* and credit_check_* consent
              records. So the terms have to be presented here, not only on the
              later Review & Submit step. */}
          <Pressable onPress={() => setProfileAgree(!profileAgree)} style={styles.consentRow}>
            {/* Checkbox.Android on BOTH platforms: the generic <Checkbox> maps to
                Checkbox.IOS on iOS, which draws a checkmark when ticked and
                literally nothing when unticked — an invisible control on a step
                you cannot pass without ticking it. */}
            <Checkbox.Android
              status={profileAgree ? 'checked' : 'unchecked'}
              onPress={() => setProfileAgree(!profileAgree)}
              color={theme.colors.primary}
              uncheckedColor={theme.colors.onSurfaceVariant}
            />
            <Text variant="bodySmall" style={styles.consentText}>
              I authorize a credit and identity check on the business and every owner listed above.
            </Text>
          </Pressable>
          {tosLine()}

          <Button
            mode="contained"
            loading={busy}
            disabled={busy}
            onPress={() => {
              const missing = [...ownerMissing, ...extraOwnersMissing];
              if (missing.length) {
                setError(`Still needed: ${missing.join(', ')}`);
                return;
              }
              if (!profileAgree) {
                setError('Please tick the box authorising the credit and identity check.');
                return;
              }
              setError(null);
              submitIdentity();
            }}
            style={[styles.next, (!ownerValid || !extraOwnersValid || !profileAgree) && styles.incompleteBtn]}
          >
            Continue
          </Button>
        </View>
      )}

      {/* ---------- BANK ACCOUNT ---------- */}
      {view === 'bank' && (
        <View>
          <Text variant="titleMedium" style={styles.h}>Payout bank account</Text>
          <Text variant="bodySmall" style={styles.note}>Where your payouts are deposited. Entered securely — account numbers never touch RallySphere’s servers.</Text>
          {/* Finix-mandated bank account language. Verbatim — see legalDocs.ts. */}
          <Text variant="bodySmall" style={styles.requiredNotice}>{FINIX_BANK_ACCOUNT_CONSENT}</Text>
          <PaymentSecurityInfo variant="payout" style={{ marginBottom: 8 }} />
          {busy ? (
            <Text variant="bodyMedium" style={{ marginVertical: 16 }}>Adding bank account…</Text>
          ) : (
            <>
              <SecureField
                label="Last 4 of SSN"
                value={bankSsnLast4}
                onChangeText={(t) => setBankSsnLast4(t.replace(/\D/g, '').slice(0, 4))}
                fieldBg={fieldBg}
              />
              <Text variant="bodySmall" style={styles.note}>Last 4 digits of the account owner’s SSN — required to verify the bank account.</Text>
              <FinixBankTokenizer onToken={handleBankToken} onError={(m) => setError(m)} themeName={themeName} />
            </>
          )}
        </View>
      )}

      {/* ---------- REVIEW & SUBMIT ---------- */}
      {view === 'submit' && (
        <View>
          <Text variant="titleMedium" style={styles.h}>Review &amp; submit</Text>
          <ReviewRow label="Business" value={biz.businessName || draft.business?.businessName || club.name} />
          <ReviewRow label="Type" value={BUSINESS_TYPES.find((b) => b[0] === (biz.businessType || draft.business?.businessType))?.[1] || '—'} />
          <ReviewRow label="Owner" value={`${owner.firstName || draft.controlPerson?.firstName || ''} ${owner.lastName || draft.controlPerson?.lastName || ''}`.trim() || '—'} />
          <ReviewRow label="Payout bank" value={bankLast4 ? `•••• ${bankLast4}` : 'Added'} />
          <Divider style={{ marginVertical: 12 }} />

          {/* Finix "Presenting Fees": what we charge has to be clear and
              prominent at the moment the club commits — not buried in a policy
              document. Numbers come from constants/fees.ts, the same source the
              server uses to build the transfer, so this can't drift. */}
          <View style={[styles.feeCard, { borderColor: theme.colors.outline, backgroundColor: theme.colors.elevation.level1 }]}>
            <Text variant="labelLarge" style={{ color: theme.colors.onSurface }}>Fees</Text>
            <View style={styles.feeRow}>
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>Cost to your club</Text>
              <Text variant="bodyMedium" style={{ fontWeight: '700', color: theme.colors.onSurface }}>$0.00</Text>
            </View>
            <View style={styles.feeRow}>
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>Buyer pays, per order</Text>
              <Text variant="bodyMedium" style={{ fontWeight: '700', color: theme.colors.onSurface }}>{SERVICE_FEE_LABEL}</Text>
            </View>
            <Text variant="bodySmall" style={{ marginTop: 8, lineHeight: 18, color: theme.colors.onSurfaceVariant }}>
              {SELLER_FEE_DISCLOSURE}
            </Text>
            <Button
              mode="text"
              compact
              onPress={() => Linking.openURL(FEE_SCHEDULE_URL).catch(() => setError('Could not open the fee schedule.'))}
              style={{ alignSelf: 'flex-start', marginTop: 4 }}
            >
              View full fee schedule
            </Button>
          </View>

          <Pressable onPress={() => setAgree(!agree)} style={styles.consentRow}>
            <Checkbox.Android
              status={agree ? 'checked' : 'unchecked'}
              onPress={() => setAgree(!agree)}
              color={theme.colors.primary}
              uncheckedColor={theme.colors.onSurfaceVariant}
            />
            <Text variant="bodySmall" style={styles.consentText}>
              I confirm the information above is accurate, and I authorize a credit and identity check.
            </Text>
          </Pressable>

          {/* Kept out of the checkbox row above so a link tap can't toggle the
              checkbox, and so the sentence stays verbatim rather than being
              folded into our own copy. */}
          {tosLine()}

          <Button mode="contained" loading={busy} disabled={busy || !agree} onPress={submitApplication} style={styles.next}>Submit application</Button>
        </View>
      )}

      {/* ---------- STATUS ---------- */}
      {view === 'status' && (
        <View style={{ alignItems: 'center', paddingTop: 8 }}>
          <Text variant="titleMedium" style={[styles.h, { textAlign: 'center' }]}>
            {statusActive ? 'Payouts active' : actionRequired ? 'Action needed' : 'Application submitted'}
          </Text>
          {!actionRequired && (
            <Text variant="bodyMedium" style={[styles.note, { textAlign: 'center' }]}>
              {statusActive
                ? 'Your club can now receive payments.'
                : `Status: ${merchantState}. Finix is reviewing your application — usually within 1–2 business days. You’ll be notified when it’s approved.`}
            </Text>
          )}

          {/* In-app clubs have no self-serve door to Finix — no uploader, and
              the hosted form can't be attached to a merchant the API created.
              So we tell them exactly what's wanted and take it from there. */}
          {!statusActive && actionRequired && (
            <FinixActionRequiredCard
              action={actionRequired}
              clubId={club.id}
              onResubmitted={refreshStatus}
              style={{ marginBottom: 12, alignSelf: 'stretch' }}
            />
          )}
          {!statusActive && (
            <Button mode="outlined" loading={busy} disabled={busy} onPress={refreshStatus} icon="refresh" style={styles.next}>Check status</Button>
          )}
          <Button mode="contained" onPress={() => { setView('hub'); onComplete?.(); }} style={[styles.next, { elevation: 0, shadowOpacity: 0 }]}>Done</Button>
        </View>
      )}

            {error && <HelperText type="error" visible style={{ marginTop: 8 }}>{error}</HelperText>}
          </ScrollView>
          </KeyboardAvoidingView>
        </Modal>
      </Portal>
    </View>
  );
}



function ReviewRow({ label, value }: { label: string; value?: string }) {
  return (
    <View style={styles.reviewRow}>
      <Text variant="bodySmall" style={{ opacity: 0.7 }}>{label}</Text>
      <Text variant="bodyMedium">{value || '—'}</Text>
    </View>
  );
}

// One tappable stage on the hub. `status` drives the trailing chip and whether
// the row is actionable; a locked row shows why it's disabled.
function StageRow({
  n, title, subtitle, status, value, actionLabel, lockedHint, disabled, onPress,
}: {
  n: number;
  title: string;
  subtitle: string;
  status: 'done' | 'todo' | 'locked';
  value?: string;
  actionLabel?: string;
  lockedHint?: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const done = status === 'done';
  const locked = status === 'locked';
  const badgeColor = done ? '#10B981' : locked ? theme.colors.surfaceVariant : theme.colors.primary;
  const badgeText = done ? '#FFFFFF' : locked ? theme.colors.onSurfaceVariant : theme.colors.onPrimary;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.stageRow,
        { borderColor: theme.colors.outline, backgroundColor: theme.colors.elevation.level1 },
        pressed && !disabled && { backgroundColor: theme.colors.elevation.level3 },
        disabled && { opacity: 0.6 },
      ]}
    >
      <View style={[styles.stageBadge, { backgroundColor: badgeColor }]}>
        {done
          ? <Text style={[styles.stageBadgeText, { color: badgeText }]}>✓</Text>
          : locked
          ? <Text style={[styles.stageBadgeText, { color: badgeText }]}>🔒</Text>
          : <Text style={[styles.stageBadgeText, { color: badgeText }]}>{n}</Text>}
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="titleSmall" style={{ fontWeight: '600', color: theme.colors.onSurface }}>{title}</Text>
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
          {locked && lockedHint ? lockedHint : value || subtitle}
        </Text>
      </View>
      {done ? (
        actionLabel ? (
          <Chip compact mode="flat" textStyle={{ fontSize: 12 }} style={{ backgroundColor: 'transparent' }} onPress={disabled ? undefined : onPress}>
            {actionLabel}
          </Chip>
        ) : null
      ) : !locked && actionLabel ? (
        <Text variant="labelLarge" style={{ color: theme.colors.primary }}>{actionLabel} ›</Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  progress: { height: 4, borderRadius: 2, marginBottom: 8 },
  h: { fontWeight: 'bold', marginBottom: 6 },
  subh: { marginTop: 12, marginBottom: 4, opacity: 0.8 },
  note: { marginBottom: 12, opacity: 0.7, lineHeight: 18 },
  input: { marginBottom: 12 },
  // Reads as not-yet-ready without being dead: still pressable, so tapping it
  // explains what's outstanding instead of doing nothing.
  incompleteBtn: { opacity: 0.55 },
  // Enough room for the 2–3 sentences underwriting actually wants. textAlignVertical
  // keeps the caret at the top on Android instead of vertically centred.
  multiline: { minHeight: 96, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 10 },
  flex1: { flex: 1 },
  flex2: { flex: 2 },
  next: { marginTop: 16 },
  consentRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, paddingRight: 8 },
  consentText: { flex: 1, fontSize: 11, lineHeight: 15, opacity: 0.75 },
  // Finix-mandated notices. Slightly more present than `note` — they're a
  // disclosure requirement, not a hint, and must not read as fine print.
  requiredNotice: { marginBottom: 12, lineHeight: 18, opacity: 0.9 },
  feeCard: { padding: 14, marginBottom: 14, borderRadius: 12, borderWidth: 1 },
  feeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5 },
  tosLine: { marginBottom: 4, lineHeight: 18 },
  link: { textDecorationLine: 'underline' },
  reviewRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  pickerWrap: { borderRadius: 10, marginTop: -4, marginBottom: 12, paddingHorizontal: 8 },
  dropdown: { marginTop: -6, marginBottom: 12, borderRadius: 10, borderWidth: 1, overflow: 'hidden' },
  dropdownItem: { paddingVertical: 14, paddingHorizontal: 16 },
  stageRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, marginBottom: 10, borderRadius: 12, borderWidth: 1 },
  ownerCard: { padding: 14, marginTop: 10, borderRadius: 12, borderWidth: 1 },
  ownerHead: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  ownerTally: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 4 },
  stageBadge: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  stageBadgeText: { fontSize: 14, fontWeight: '700' },
  modalCard: { margin: 16, borderRadius: 16, overflow: 'hidden' },
  modalScrollContent: { padding: 20 },
  modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, marginLeft: -4 },
});
