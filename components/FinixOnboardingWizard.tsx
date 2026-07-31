// components/FinixOnboardingWizard.tsx
// Club payout onboarding. Two paths, chosen up front:
//
//   1. HOSTED (default) — Finix's own onboarding form, opened in the browser.
//      Preferred because Finix maintains it: it handles multiple beneficial
//      owners, document uploads, and the UPDATE_REQUESTED loop where the club
//      answers underwriting directly. Our wizard can express none of those, and
//      Finix tunes required fields per application, so anything we hand-roll
//      drifts out of date silently.
//   2. IN-APP (secondary, kept) — the direct-API wizard below. Still the path
//      for clubs already mid-flow, and a fallback if the hosted form can't be
//      used. Not being removed; just no longer the default.
//
// The in-app path is a hub of three independent stages the admin completes in order:
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
import { View, StyleSheet, Platform, Pressable, ScrollView, useWindowDimensions, Linking } from 'react-native';
import { Text, TextInput, Button, useTheme, Checkbox, HelperText, Divider, ProgressBar, Chip, Portal, Modal, IconButton } from 'react-native-paper';
import DateTimePicker from '@react-native-community/datetimepicker';
import {
  createClubIdentity,
  addClubBankAccount,
  provisionClubMerchant,
  getSubMerchantStatus,
  getClubOnboardingFormLink,
  type FinixBusinessInput,
  type FinixPersonInput,
} from '../lib/finix';
import { updateClub } from '../lib/firebase';
import type { Club } from '../lib/firebase';
import FinixBankTokenizer from './FinixBankTokenizer';
import PaymentSecurityInfo from './PaymentSecurityInfo';
import FinixActionRequiredCard from './FinixActionRequiredCard';
import type { FinixActionRequired } from '../lib/finix';

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

type Addr = { line1: string; line2?: string; city: string; region: string; postalCode: string };
const emptyAddr: Addr = { line1: '', line2: '', city: '', region: '', postalCode: '' };

// The wizard is a hub with these views. 'hub' is the landing screen listing the
// three stages; the others are the individual sub-flows.
type View_ = 'hub' | 'profile' | 'bank' | 'submit' | 'status';

const fmtDate = (d: Date | null): string =>
  d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : '';

export default function FinixOnboardingWizard({ club, acceptedByUid, onComplete, themeName, embedded }: Props) {
  const theme = useTheme();
  const { height: winH } = useWindowDimensions();
  const isDark = themeName !== 'light';
  const draft = club.finixOnboardingDraft || {};
  // Outlined inputs mask the outline behind the floating label with this color;
  // match the card surface so labels don't get a black notch.
  const fieldBg = { backgroundColor: theme.colors.elevation.level1 };

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

  // --- Control person / primary owner (required fields only) ---
  const [owner, setOwner] = useState({
    firstName: draft.controlPerson?.firstName || '',
    lastName: draft.controlPerson?.lastName || '',
    taxId: '', // SSN — secure, never prefilled
    dob: null as Date | null, // never prefilled
    phone: draft.controlPerson?.phone || '',
    email: draft.controlPerson?.email || club.contactEmail || '',
    address: { ...emptyAddr, ...(draft.controlPerson?.address || {}) } as Addr,
  });

  const [bankLast4, setBankLast4] = useState<string | null>(club.finixPayoutBankLast4 || null);
  // Last 4 of the account owner's SSN, collected on the bank step and submitted
  // with the tokenized account. Required. Never persisted to Firestore.
  const [bankSsnLast4, setBankSsnLast4] = useState('');
  // Flips true the instant addClubBankAccount returns success, so the hub shows
  // the bank step done immediately — independent of the club re-fetch, which can
  // serve a stale cached doc that still lacks finixPayoutPiId.
  const [bankSaved, setBankSaved] = useState(false);
  // Which setup path this club is on. 'choose' is the fork shown before anything
  // exists; once either path has produced state at Finix the choice is fixed,
  // because a hosted form mints its own identity + merchant and can't be merged
  // with one the wizard already created.
  const [mode, setMode] = useState<'choose' | 'in_app' | 'hosted'>(
    club.finixOnboardingMode === 'hosted'
      ? 'hosted'
      : club.finixIdentityId || club.finixMerchantId
      ? 'in_app'
      : 'choose'
  );
  const [formStatus, setFormStatus] = useState<string>(club.finixOnboardingFormStatus || 'IN_PROGRESS');
  // What Finix is waiting on, if anything. Seeded from the club doc (written by
  // the webhook) and refreshed by every status check.
  const [actionRequired, setActionRequired] = useState<FinixActionRequired | null>(
    (club.finixActionRequired as FinixActionRequired) || null
  );

  const [agree, setAgree] = useState(!!club.finixTosAcceptedAt);
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
  const reviewLock = submitted && !statusActive;

  const today = new Date();
  const fail = (msg: string) => { setError(msg); setBusy(false); };

  const businessValid =
    biz.businessName.trim() && biz.businessType && biz.taxId.trim() && biz.phone.trim() &&
    biz.email.trim() && biz.url.trim() && Number(biz.annualCardVolume) > 0 && Number(biz.maxTransactionAmount) > 0 &&
    !!biz.incorporationDate &&
    // Underwriting narrative — a vague description is the #1 reason Finix comes
    // back with manual questions, so require a real one rather than defaulting.
    uw.businessDescription.trim().length >= 20 && Number(uw.averageTransactionAmount) > 0 &&
    biz.address.line1.trim() && biz.address.city.trim() && biz.address.region.trim() && biz.address.postalCode.trim();

  const ownerValid =
    owner.firstName.trim() && owner.lastName.trim() && owner.taxId.trim() && !!owner.dob &&
    owner.phone.trim() && owner.email.trim() &&
    owner.address.line1.trim() && owner.address.city.trim() && owner.address.region.trim() && owner.address.postalCode.trim();

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
      defaultStatementDescriptor: biz.businessName.trim().slice(0, 20),
      address: { ...biz.address, country: 'USA' },
    };
    const controlPerson: FinixPersonInput = {
      firstName: owner.firstName.trim(),
      lastName: owner.lastName.trim(),
      title: 'Owner',                       // default (field hidden)
      principalPercentageOwnership: 100,    // default (field hidden)
      taxId: owner.taxId.replace(/\D/g, ''),
      dob: fmtDate(owner.dob),
      phone: owner.phone.trim(),
      email: owner.email.trim(),
      address: { ...owner.address, country: 'USA' },
    };
    const res = await createClubIdentity({
      clubId: club.id,
      business,
      controlPerson,
      underwriting: {
        businessDescription: uw.businessDescription.trim() || undefined,
        averageCardTransferAmount: Number(uw.averageTransactionAmount)
          ? Math.round(Number(uw.averageTransactionAmount) * 100)
          : undefined,
        refundPolicy: uw.refundPolicy,
      },
      // IP is filled server-side from the request — the client can't see its own.
      consent: { userAgent: `RallySphere/${Platform.OS}`, merchantAgreementAccepted: true },
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
    const res = await addClubBankAccount(club.id, tokenId, bankSsnLast4);
    if (!res.success) return fail(res.error || 'Failed to add bank account');
    setBankSaved(true);
    setBankLast4(res.last4 || null);
    setBusy(false); setView('hub'); onComplete?.();
  };

  const submitApplication = async () => {
    if (!agree) { setError('Please accept the terms to submit.'); return; }
    setBusy(true); setError(null);
    const res = await provisionClubMerchant(club.id);
    if (!res.success) return fail(res.error || 'Failed to submit application');
    setMerchantState(res.onboardingState || 'PROVISIONING');
    setStatusActive(res.onboardingState === 'APPROVED');
    setBusy(false); setView('status'); onComplete?.();
  };

  // Mint a fresh hosted-form link and hand off to the browser. Same call covers
  // first open, resume, and answering an UPDATE_REQUESTED — the server decides.
  const openHostedForm = async () => {
    setBusy(true); setError(null);
    const res = await getClubOnboardingFormLink(club.id);
    if (!res.success) return fail(res.error || 'Failed to open Finix onboarding');
    setMode('hosted');
    setFormStatus(res.formStatus || 'IN_PROGRESS');
    setActionRequired(res.actionRequired || null);
    if (res.onboardingState) setMerchantState(res.onboardingState);
    if (res.merchantId && res.onboardingState === 'APPROVED') setStatusActive(true);
    if (res.linkUrl) {
      await Linking.openURL(res.linkUrl).catch(() => setError('Could not open the Finix page. Try again.'));
    }
    setBusy(false);
    onComplete?.();
  };

  const refreshHostedStatus = async () => {
    setBusy(true); setError(null);
    const res = await getClubOnboardingFormLink(club.id);
    if (!res.success) return fail(res.error || 'Failed to check status');
    setFormStatus(res.formStatus || formStatus);
    setActionRequired(res.actionRequired || null);
    if (res.onboardingState) setMerchantState(res.onboardingState);
    if (res.onboardingState === 'APPROVED') setStatusActive(true);
    setBusy(false);
    onComplete?.();
  };

  const refreshStatus = async () => {
    setBusy(true); setError(null);
    const res = await getSubMerchantStatus({ clubId: club.id, merchantId: club.finixMerchantId, identityId: club.finixIdentityId });
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
  const field = (label: string, value: string, onChangeText: (t: string) => void, extra?: any) => (
    <TextInput mode="outlined" label={label} value={value} onChangeText={onChangeText} style={[styles.input, fieldBg]} {...extra} />
  );

  const addrFields = (a: Addr, set: (a: Addr) => void) => (
    <>
      {field('Street address', a.line1, (t) => set({ ...a, line1: t }))}
      <View style={styles.row}>
        <TextInput mode="outlined" label="City" value={a.city} onChangeText={(t) => set({ ...a, city: t })} style={[styles.input, styles.flex2, fieldBg]} />
        <TextInput mode="outlined" label="State" value={a.region} maxLength={2} autoCapitalize="characters" onChangeText={(t) => set({ ...a, region: t.toUpperCase() })} style={[styles.input, styles.flex1, fieldBg]} />
      </View>
      {field('ZIP code', a.postalCode, (t) => set({ ...a, postalCode: t }), { keyboardType: 'number-pad' })}
    </>
  );

  return (
    <View>
      {/* ---------- FORK: where do you want to do this? ---------- */}
      {mode === 'choose' && (
        <View>
          <Text variant="titleMedium" style={styles.h}>Set up payouts</Text>
          <Text variant="bodySmall" style={styles.note}>
            Finix is our payment processor. Every club is verified by them before payouts can start.
          </Text>

          {/* Finix's own form is the default path. It handles the things our
              wizard can't: multiple owners, document uploads, and — when
              underwriting asks for more — letting the club answer directly
              instead of routing every request through RallySphere support. */}
          <PathCard
            title="Set up with Finix"
            subtitle="Opens Finix in your browser and walks you through it. If they need anything else later — a document, another owner's details — they ask you directly and you handle it there."
            actionLabel="Continue with Finix"
            recommended
            onPress={openHostedForm}
            loading={busy}
            disabled={busy}
          />

          {/* Kept as a secondary path, not removed: it's the only option for
              anything the hosted form can't express, and clubs mid-flow are
              still on it. */}
          <Button
            mode="text"
            compact
            disabled={busy}
            onPress={() => { setError(null); setMode('in_app'); }}
            style={{ marginTop: 4 }}
          >
            Or enter your details in RallySphere
          </Button>
          <Text variant="bodySmall" style={[styles.note, { marginTop: 4 }]}>
            Entering them here works too, but if Finix asks for documents afterwards they’ll come to us and
            we’ll have to pass them along — which is slower. You can still switch to Finix any time before
            your application is submitted.
          </Text>
          {error && <HelperText type="error" visible>{error}</HelperText>}
        </View>
      )}

      {/* ---------- HOSTED: the club is doing this on Finix's site ---------- */}
      {mode === 'hosted' && (
        <View>
          <Text variant="titleMedium" style={styles.h}>
            {statusActive ? 'Payouts active' : formStatus === 'UPDATE_REQUESTED' ? 'Finix needs more info' : 'Setting up with Finix'}
          </Text>
          <Text variant="bodySmall" style={styles.note}>
            {statusActive
              ? 'Your club can now receive payments.'
              : formStatus === 'UPDATE_REQUESTED'
              ? 'Finix has asked for additional information or documents. Open your form to see exactly what they need and upload it — no need to go through us.'
              : formStatus === 'COMPLETED'
              ? `Your application is with Finix. Status: ${merchantState}. Usually 1–2 business days.`
              : 'Your form is waiting on Finix’s site. Open it to finish — your progress is saved.'}
          </Text>

          {/* Hosted clubs can resolve this themselves — the button reopens the
              very form Finix flagged, with its uploaders attached. */}
          {!statusActive && actionRequired && (
            <FinixActionRequiredCard
              action={actionRequired}
              onResolve={openHostedForm}
              resolveLabel="Open my Finix form"
              loading={busy}
              style={{ marginBottom: 16 }}
            />
          )}

          {!statusActive && !actionRequired && (
            <Button
              mode="contained"
              icon="open-in-new"
              loading={busy}
              disabled={busy}
              onPress={openHostedForm}
              style={styles.next}
            >
              {formStatus === 'UPDATE_REQUESTED' ? 'Provide requested info' : formStatus === 'COMPLETED' ? 'Open my Finix form' : 'Continue on Finix'}
            </Button>
          )}
          <Button mode="outlined" icon="refresh" loading={busy} disabled={busy} onPress={refreshHostedStatus} style={styles.next}>
            Check status
          </Button>

          <PaymentSecurityInfo variant="payout" style={{ marginTop: 16 }} />
          {error && <HelperText type="error" visible>{error}</HelperText>}

          {!embedded && (
            <Button mode="text" onPress={() => onComplete?.()} style={{ marginTop: 16 }}>Save &amp; close</Button>
          )}
        </View>
      )}

      {/* ---------- HUB: the three stages (always visible; sub-steps are modal) ---------- */}
      {mode === 'in_app' && (
      <View>
          <ProgressBar progress={completedStages / 3} color={theme.colors.primary} style={styles.progress} />
          <Text variant="labelLarge" style={{ marginBottom: 16, color: theme.colors.onSurfaceVariant }}>
            {completedStages} of 3 complete
          </Text>

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

          {/* Escape hatch for anyone stuck mid-setup. Safe until the merchant
              exists (server refuses after that, to avoid a duplicate merchant). */}
          {!submitted && (
            <>
              <Button mode="text" compact icon="open-in-new" loading={busy} disabled={busy} onPress={openHostedForm} style={{ marginTop: 12 }}>
                Rather finish this on Finix’s site?
              </Button>
              {error && <HelperText type="error" visible>{error}</HelperText>}
            </>
          )}

          {!embedded && (
            <Button mode="text" onPress={() => onComplete?.()} style={{ marginTop: 16 }}>Save &amp; close</Button>
          )}
      </View>
      )}

      {/* Sub-steps open in a modal popup so they don't crowd the card — or the
          Benefits box behind it — while an application is in progress. */}
      <Portal>
        <Modal
          visible={view !== 'hub'}
          onDismiss={() => { setError(null); setView('hub'); }}
          contentContainerStyle={[styles.modalCard, { backgroundColor: theme.colors.elevation.level2 }]}
        >
          <ScrollView style={{ maxHeight: winH * 0.8 }} contentContainerStyle={styles.modalScrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {/* Always-visible back control. On the owner sub-step it steps back to
              the business sub-step; everywhere else it closes to the hub. */}
          <View style={styles.modalHead}>
            <Button
              mode="text"
              icon="chevron-left"
              compact
              contentStyle={{ marginLeft: -4 }}
              onPress={() => {
                setError(null);
                if (view === 'profile' && step === 1) setStep(0);
                else setView('hub');
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
            numberOfLines: 3,
            placeholder: 'e.g. Weekly league dues, tournament entry fees, and team jerseys for our members.',
          })}
          <Text variant="bodySmall" style={styles.note}>
            Finix reviews this by hand. The more specific you are, the less likely they come back with questions.
          </Text>

          <Text variant="labelLarge" style={styles.subh}>Business address</Text>
          {addrFields(biz.address, (a) => setBiz({ ...biz, address: a }))}

          <Button mode="contained" disabled={!businessValid} onPress={() => { setError(null); setStep(1); }} style={styles.next}>Continue</Button>
        </View>
      )}

      {/* ---------- PROFILE · STEP 1: OWNER ---------- */}
      {view === 'profile' && step === 1 && (
        <View>
          <Text variant="titleMedium" style={styles.h}>Owner / control person</Text>
          <Text variant="bodySmall" style={styles.note}>The primary person who controls the business — required by federal “know your customer” rules.</Text>
          <View style={styles.row}>
            <TextInput mode="outlined" label="First name" value={owner.firstName} onChangeText={(t) => setOwner({ ...owner, firstName: t })} style={[styles.input, styles.flex1, fieldBg]} />
            <TextInput mode="outlined" label="Last name" value={owner.lastName} onChangeText={(t) => setOwner({ ...owner, lastName: t })} style={[styles.input, styles.flex1, fieldBg]} />
          </View>
          <SecureField label="SSN" value={owner.taxId} onChangeText={(t) => setOwner({ ...owner, taxId: t })} fieldBg={fieldBg} />
          <DateField label="Date of birth" value={owner.dob} onChange={(d) => setOwner({ ...owner, dob: d })} fieldBg={fieldBg} maximumDate={today} dark={isDark} />
          {field('Phone', owner.phone, (t) => setOwner({ ...owner, phone: t }), { keyboardType: 'phone-pad' })}
          {field('Email', owner.email, (t) => setOwner({ ...owner, email: t }), { keyboardType: 'email-address', autoCapitalize: 'none' })}

          <Text variant="labelLarge" style={styles.subh}>Home address</Text>
          {addrFields(owner.address, (a) => setOwner({ ...owner, address: a }))}

          <Button mode="contained" loading={busy} disabled={!ownerValid || busy} onPress={submitIdentity} style={styles.next}>Continue</Button>
        </View>
      )}

      {/* ---------- BANK ACCOUNT ---------- */}
      {view === 'bank' && (
        <View>
          <Text variant="titleMedium" style={styles.h}>Payout bank account</Text>
          <Text variant="bodySmall" style={styles.note}>Where your payouts are deposited. Entered securely — account numbers never touch RallySphere’s servers.</Text>
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
          <Pressable onPress={() => setAgree(!agree)} style={styles.consentRow}>
            <Checkbox
              status={agree ? 'checked' : 'unchecked'}
              onPress={() => setAgree(!agree)}
              color={theme.colors.primary}
              uncheckedColor={theme.colors.onSurfaceVariant}
            />
            <Text variant="bodySmall" style={styles.consentText}>
              I confirm the information is accurate and I agree to the RallySphere and Finix merchant terms, fee schedule, and authorize a credit/identity check.
            </Text>
          </Pressable>
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
            <FinixActionRequiredCard action={actionRequired} style={{ marginBottom: 12, alignSelf: 'stretch' }} />
          )}
          {!statusActive && (
            <Button mode="outlined" loading={busy} disabled={busy} onPress={refreshStatus} icon="refresh" style={styles.next}>Check status</Button>
          )}
          <Button mode="contained" onPress={() => { setView('hub'); onComplete?.(); }} style={[styles.next, { elevation: 0, shadowOpacity: 0 }]}>Done</Button>
        </View>
      )}

            {error && <HelperText type="error" visible style={{ marginTop: 8 }}>{error}</HelperText>}
          </ScrollView>
        </Modal>
      </Portal>
    </View>
  );
}

// Secure text field (SSN / EIN) with a show/hide toggle.
function SecureField({ label, value, onChangeText, fieldBg }: { label: string; value: string; onChangeText: (t: string) => void; fieldBg: any }) {
  const [hidden, setHidden] = useState(true);
  return (
    <TextInput
      mode="outlined"
      label={label}
      value={value}
      onChangeText={onChangeText}
      secureTextEntry={hidden}
      keyboardType="number-pad"
      autoCapitalize="none"
      autoCorrect={false}
      textContentType="oneTimeCode"
      right={<TextInput.Icon icon={hidden ? 'eye-off' : 'eye'} forceTextInputFocus={false} onPress={() => setHidden((h) => !h)} />}
      style={[styles.input, fieldBg]}
    />
  );
}

// Date field backed by the native date picker. Tap to reveal an inline spinner.
function DateField({ label, value, onChange, fieldBg, maximumDate, dark }: { label: string; value: Date | null; onChange: (d: Date) => void; fieldBg: any; maximumDate?: Date; dark?: boolean }) {
  const [open, setOpen] = useState(false);
  const display = value ? value.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : '';
  return (
    <View>
      <Pressable onPress={() => setOpen((o) => !o)}>
        <View pointerEvents="none">
          <TextInput mode="outlined" label={label} editable={false} value={display} right={<TextInput.Icon icon="calendar" />} style={[styles.input, fieldBg]} />
        </View>
      </Pressable>
      {open && (
        <View style={[styles.pickerWrap, fieldBg]}>
          <DateTimePicker
            value={value || new Date(2000, 0, 1)}
            mode="date"
            display="spinner"
            maximumDate={maximumDate}
            themeVariant={dark ? 'dark' : 'light'}
            onChange={(_e, d) => {
              if (Platform.OS === 'android') setOpen(false);
              if (d) onChange(d);
            }}
          />
          {Platform.OS === 'ios' && (
            <Button mode="contained" onPress={() => setOpen(false)} style={{ alignSelf: 'flex-end', marginTop: 4 }} compact>Done</Button>
          )}
        </View>
      )}
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

// One of the two setup paths on the opening fork. Deliberately verbose about
// the consequence — who handles Finix's follow-up questions — because that's
// the only difference the club actually feels.
function PathCard({
  title, subtitle, actionLabel, recommended, onPress, loading, disabled,
}: {
  title: string;
  subtitle: string;
  actionLabel: string;
  recommended?: boolean;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.pathCard, { borderColor: recommended ? theme.colors.primary : theme.colors.outline, backgroundColor: theme.colors.elevation.level1 }]}>
      <View style={styles.pathHead}>
        <Text variant="titleSmall" style={{ fontWeight: '600', flex: 1, color: theme.colors.onSurface }}>{title}</Text>
        {recommended && (
          <Chip compact mode="flat" textStyle={{ fontSize: 11 }} style={{ backgroundColor: theme.colors.primaryContainer }}>
            Recommended
          </Chip>
        )}
      </View>
      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, lineHeight: 18, marginTop: 4 }}>
        {subtitle}
      </Text>
      <Button mode={recommended ? 'contained' : 'outlined'} onPress={onPress} loading={loading} disabled={disabled} style={{ marginTop: 12 }}>
        {actionLabel}
      </Button>
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
  row: { flexDirection: 'row', gap: 10 },
  flex1: { flex: 1 },
  flex2: { flex: 2 },
  next: { marginTop: 16 },
  consentRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, paddingRight: 8 },
  consentText: { flex: 1, fontSize: 11, lineHeight: 15, opacity: 0.75 },
  reviewRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  pickerWrap: { borderRadius: 10, marginTop: -4, marginBottom: 12, paddingHorizontal: 8 },
  dropdown: { marginTop: -6, marginBottom: 12, borderRadius: 10, borderWidth: 1, overflow: 'hidden' },
  dropdownItem: { paddingVertical: 14, paddingHorizontal: 16 },
  stageRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, marginBottom: 10, borderRadius: 12, borderWidth: 1 },
  pathCard: { padding: 16, marginBottom: 12, borderRadius: 12, borderWidth: 1 },
  pathHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stageBadge: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  stageBadgeText: { fontSize: 14, fontWeight: '700' },
  modalCard: { margin: 16, borderRadius: 16, overflow: 'hidden' },
  modalScrollContent: { padding: 20 },
  modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, marginLeft: -4 },
});
