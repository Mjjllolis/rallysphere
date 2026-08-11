// scripts/reset-club-finix.js
// Clears stale SANDBOX Finix onboarding fields from clubs so they re-onboard in
// LIVE. A club's finixMerchantId/finixIdentityId created in sandbox 404s against
// the live API ("merchant not found" / "identity not found"). After clearing,
// the next onboarding (now in production) creates a fresh live merchant and the
// webhook repopulates these (bare) fields with live values.
//
// Usage:
//   node scripts/reset-club-finix.js                 # DRY RUN — lists affected clubs
//   node scripts/reset-club-finix.js --apply         # clears ALL clubs
//   node scripts/reset-club-finix.js --apply <clubId># clears one club
const admin = require('firebase-admin');
const path = require('path');
const serviceAccount = require(path.resolve(__dirname, '../service-account-key.json'));

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const FIELDS = [
  'finixMerchantId',
  'finixIdentityId',
  'finixMerchantAccountActive',
  'finixOnboardingComplete',
  'finixOnboardingDeclined',
  'finixOnboardingStatus',
  'finixOnboardingState',
  'finixOnboardingFormId',
  'finixOnboardingUrl',
  'finixOnboardingLinkExpiresAt',
  'finixOnboardingStartedAt',
  // Direct-API onboarding fields
  'finixOwnerIdentityIds',
  'finixPayoutPiId',
  'finixPayoutBankLast4',
  'finixOnboardingDraft',
  // Environment stamp. MUST be cleared with the ids it protects — leaving it
  // behind means assertClubEnv still thinks the club belongs to the old
  // environment and blocks the very re-onboarding this reset exists to enable.
  'finixEnv',
  // Underwriting follow-up state. Stale outcomes would otherwise show the club
  // an action list for a merchant that no longer exists.
  'finixActionRequired',
  'finixLastVerificationId',
  'finixLastResubmittedAt',
  'finixLastNotifiedState',
  'finixUploadedDocuments',
  // Legacy hosted-form leftovers.
  'finixOnboardingMode',
  'finixOnboardingFormStatus',
  // Consent records. Cleared deliberately: re-onboarding collects fresh consent
  // with a new IP/timestamp/user-agent, and createClubIdentity preserves an
  // existing value (`club.finixTosAcceptedAt || now`) — so a stale timestamp
  // would be attached to an application the club never saw terms for.
  'finixTosAcceptedAt',
  'finixFeesAcceptedAt',
  'finixAcceptedByUid',
];

async function main() {
  const apply = process.argv.includes('--apply');
  const clubIdArg = process.argv.slice(2).find((a) => !a.startsWith('--'));

  // Guard: `--apply` with no club id would wipe the payout account of EVERY
  // club, including live merchants that are working fine. A dry run over all
  // clubs is useful; a blind apply over all clubs never is.
  if (apply && !clubIdArg) {
    console.error(
      'Refusing to --apply to every club. Pass a club id:\n' +
        '  node scripts/reset-club-finix.js --apply <clubId>\n' +
        'Run without --apply to see which clubs would be affected.'
    );
    process.exit(1);
  }

  const snap = clubIdArg
    ? [await db.collection('clubs').doc(clubIdArg).get()]
    : (await db.collection('clubs').get()).docs;

  let affected = 0;
  for (const doc of snap) {
    if (!doc.exists) { console.log(`Club ${clubIdArg} not found`); continue; }
    const d = doc.data() || {};
    const present = FIELDS.filter((f) => d[f] != null);
    if (present.length === 0) continue;
    affected++;
    // Club docs store the name as `clubName`; `name` was always undefined here,
    // so every line printed "unnamed".
    console.log(`\n${apply ? 'CLEARING' : 'WOULD CLEAR'}  club ${doc.id}  (${d.clubName || d.name || 'unnamed'})`);
    console.log(`  env=${d.finixEnv || 'unstamped→treated as live'}  state=${d.finixOnboardingState || '-'}`);
    console.log(`  finixMerchantId=${d.finixMerchantId || '-'}  finixIdentityId=${d.finixIdentityId || '-'}  complete=${d.finixOnboardingComplete}`);
    console.log(`  fields to clear: ${present.join(', ')}`);
    if (apply) {
      const update = {};
      for (const f of FIELDS) update[f] = admin.firestore.FieldValue.delete();
      update.updatedAt = admin.firestore.FieldValue.serverTimestamp();
      await doc.ref.update(update);
    }
  }

  console.log(`\n${apply ? 'Cleared' : 'Would clear'} ${affected} club(s).`);
  if (!apply && affected > 0) console.log('Re-run with --apply to perform the reset.');
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
