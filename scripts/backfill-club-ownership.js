// scripts/backfill-club-ownership.js
// Clubs inconsistently store ownership as either `owner`/`admins` or
// `clubOwner`/`clubAdmins`. The app reads `club.owner`/`club.admins`, so clubs
// that only have the `club*` variants break management UI (e.g. can't cancel
// events — `club.admins.includes()` throws on undefined). This backfills the
// app-read fields from the `club*` variants when missing (additive, non-destructive).
//
// Usage:
//   node scripts/backfill-club-ownership.js          # DRY RUN
//   node scripts/backfill-club-ownership.js --apply   # write
const admin = require('firebase-admin');
const path = require('path');
const sa = require(path.resolve(__dirname, '../service-account-key.json'));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

async function main() {
  const apply = process.argv.includes('--apply');
  const clubs = await db.collection('clubs').get();
  let changed = 0;
  for (const doc of clubs.docs) {
    const c = doc.data() || {};
    const update = {};
    if ((c.admins === undefined || c.admins === null) && Array.isArray(c.clubAdmins)) {
      update.admins = c.clubAdmins;
    }
    if ((c.owner === undefined || c.owner === null || c.owner === '') && c.clubOwner) {
      update.owner = c.clubOwner;
    }
    if (Object.keys(update).length === 0) continue;
    changed++;
    console.log(`${apply ? 'FIX ' : 'WOULD FIX '} ${doc.id} "${c.name || '-'}"  ${JSON.stringify(update)}`);
    if (apply) {
      update.updatedAt = admin.firestore.FieldValue.serverTimestamp();
      await doc.ref.update(update);
    }
  }
  console.log(`\n${apply ? 'Fixed' : 'Would fix'} ${changed} club(s).`);
  if (!apply && changed) console.log('Re-run with --apply to write.');
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
