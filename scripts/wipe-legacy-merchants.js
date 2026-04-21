// scripts/wipe-legacy-merchants.js
// One-time migration: clear legacy Braintree / Stripe merchant + onboarding
// fields from every club document so every club re-onboards on Finix.
//
// Why: the Finix migration is a rip-and-replace (no parallel run / no flag).
// Any residual stripeAccountId / stripeOnboardingComplete / braintree* field
// on a club document will make the club appear "already connected" in
// FinixPayoutsSetup.tsx-era code, because older code paths may still read
// those fields, and downstream reports (e.g. admin dashboards) could misread
// onboarding state.
//
// Usage (from repo root):
//   node scripts/wipe-legacy-merchants.js               # dry-run: prints what would change
//   node scripts/wipe-legacy-merchants.js --apply       # actually writes
//
// Requires: service-account-key.json at repo root.

const admin = require('firebase-admin');
const path = require('path');
const serviceAccount = require(path.resolve(__dirname, '../service-account-key.json'));

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
const DEL = admin.firestore.FieldValue.delete();

const APPLY = process.argv.includes('--apply');

// Fields to strip from /clubs/*
const CLUB_LEGACY_FIELDS = [
  // Stripe-era
  'stripeAccountId',
  'stripeAccountStatus',
  'stripeOnboardingComplete',
  'stripeChargesEnabled',
  'stripePayoutsEnabled',
  'stripeDetailsSubmitted',
  // Braintree-era
  'braintreeMerchantId',
  'braintreeMerchantAccountId',
  'braintreeSubMerchantId',
  'braintreeStatus',
  'braintreeOnboardingComplete',
  'braintreeOnboardingStatus',
  'braintreeDisbursementEnabled',
  'braintreeSubscriptionId',
];

// Fields to strip from /users/* (legacy customer records)
const USER_LEGACY_FIELDS = [
  'stripeCustomerId',
  'braintreeCustomerId',
  'braintreePaymentMethodToken',
];

async function wipeCollection(collectionName, fields) {
  const snap = await db.collection(collectionName).get();
  let touched = 0;
  let untouched = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const patch = {};
    for (const f of fields) {
      if (Object.prototype.hasOwnProperty.call(data, f)) patch[f] = DEL;
    }
    const present = Object.keys(patch);
    if (present.length === 0) {
      untouched++;
      continue;
    }
    console.log(`[${collectionName}/${doc.id}] clearing: ${present.join(', ')}`);
    if (APPLY) {
      patch.updatedAt = admin.firestore.FieldValue.serverTimestamp();
      await doc.ref.update(patch);
    }
    touched++;
  }
  console.log(`\n${collectionName}: ${touched} document(s) ${APPLY ? 'updated' : 'would update'}, ${untouched} untouched.`);
  return { touched, untouched };
}

async function main() {
  console.log(APPLY ? 'APPLY mode — writes will occur.' : 'DRY-RUN — no writes. Pass --apply to persist.');
  const clubs = await wipeCollection('clubs', CLUB_LEGACY_FIELDS);
  const users = await wipeCollection('users', USER_LEGACY_FIELDS);
  console.log('\nSummary:');
  console.log(`  clubs:  ${clubs.touched} touched / ${clubs.untouched} untouched`);
  console.log(`  users:  ${users.touched} touched / ${users.untouched} untouched`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
