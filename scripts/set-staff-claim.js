// scripts/set-staff-claim.js
// Grants or revokes the `staff: true` custom claim that unlocks the Finix
// sandbox override (see isRallysphereStaff / ALLOW_SANDBOX_OVERRIDE in
// functions/src/index.ts).
//
// Why a claim: RallySphere authenticates by phone (SMS OTP), so Firebase Auth
// accounts have no email — the original email-domain staff check could never
// pass for anyone. A custom claim rides in the ID token, works for phone
// accounts, and cannot be set by the client.
//
// IMPORTANT: claims are baked into the ID token at issue time. After running
// this, the user must sign out and back in (or force a token refresh) before
// the change takes effect. Nothing happens to an already-issued token.
//
// Usage:
//   node scripts/set-staff-claim.js +12256503021            # DRY RUN
//   node scripts/set-staff-claim.js +12256503021 --apply    # grant staff
//   node scripts/set-staff-claim.js <uid> --apply --remove  # revoke staff
const admin = require('firebase-admin');
const path = require('path');
const serviceAccount = require(path.resolve(__dirname, '../service-account-key.json'));

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const remove = args.includes('--remove');
  const target = args.find((a) => !a.startsWith('--'));

  if (!target) {
    console.error(
      'Pass a uid or a phone number in E.164 form:\n' +
        '  node scripts/set-staff-claim.js +12256503021 --apply\n' +
        '  node scripts/set-staff-claim.js <uid> --apply --remove'
    );
    process.exit(1);
  }

  // Accept either a uid or a phone number, so you don't have to look the uid up
  // first — the number is what a human actually knows.
  const user = target.startsWith('+')
    ? await admin.auth().getUserByPhoneNumber(target)
    : await admin.auth().getUser(target);

  const existing = user.customClaims || {};
  // Preserve any unrelated claims — blindly replacing the object would silently
  // drop whatever else has been set on this account.
  const next = { ...existing };
  if (remove) delete next.staff;
  else next.staff = true;

  console.log(`\n${apply ? 'SETTING' : 'WOULD SET'} claims on ${user.uid}`);
  console.log(`  ${user.displayName || 'no name'}  ${user.phoneNumber || user.email || '-'}`);
  console.log(`  before: ${JSON.stringify(existing)}`);
  console.log(`  after:  ${JSON.stringify(next)}`);

  if (!apply) {
    console.log('\nRe-run with --apply to perform the change.');
    process.exit(0);
  }

  await admin.auth().setCustomUserClaims(user.uid, next);
  console.log('\nDone. The user must SIGN OUT AND BACK IN before the new token carries this claim.');
  process.exit(0);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
