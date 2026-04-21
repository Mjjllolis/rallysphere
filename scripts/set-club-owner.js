// scripts/set-club-owner.js
// Reassign a single club's owner and ensure they're in the admins list.
// Usage: node scripts/set-club-owner.js <clubId> <userId> [--apply]
//   no --apply = dry-run (prints what would change)
const admin = require('firebase-admin');
const path = require('path');
const serviceAccount = require(path.resolve(__dirname, '../service-account-key.json'));

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const [, , clubId, userId, ...rest] = process.argv;
const APPLY = rest.includes('--apply');

if (!clubId || !userId) {
  console.error('Usage: node scripts/set-club-owner.js <clubId> <userId> [--apply]');
  process.exit(1);
}

async function main() {
  const [clubSnap, userSnap] = await Promise.all([
    db.collection('clubs').doc(clubId).get(),
    db.collection('users').doc(userId).get(),
  ]);

  if (!clubSnap.exists) {
    console.error(`Club not found: ${clubId}`);
    process.exit(1);
  }
  if (!userSnap.exists) {
    console.error(`User not found: ${userId}`);
    process.exit(1);
  }

  const club = clubSnap.data();
  const user = userSnap.data();
  const prevOwner = club.clubOwner || club.owner || club.createdBy || null;
  const admins = new Set(club.clubAdmins || club.admins || []);
  admins.add(userId);
  const members = new Set(club.clubMembers || club.members || []);
  members.add(userId);

  console.log(`Club:          ${club.clubName || club.name} (${clubId})`);
  console.log(`Current owner: ${prevOwner || '(none)'}`);
  console.log(`New owner:     ${userId}  (${user.profile?.email || user.email || '(no email)'})`);
  console.log(`Admins after:  ${[...admins].join(', ')}`);

  if (!APPLY) {
    console.log('\nDry-run. Re-run with --apply to persist.');
    process.exit(0);
  }

  await db
    .collection('clubs')
    .doc(clubId)
    .update({
      clubOwner: userId,
      owner: userId,
      clubAdmins: [...admins],
      admins: [...admins],
      clubMembers: [...members],
      members: [...members],
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

  console.log('\n✓ Updated.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
