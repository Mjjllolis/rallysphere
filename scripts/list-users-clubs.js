// scripts/list-users-clubs.js
// Read-only: dump all users and all clubs (with current owners) so you can
// decide who should own what. Run: node scripts/list-users-clubs.js
const admin = require('firebase-admin');
const path = require('path');
const serviceAccount = require(path.resolve(__dirname, '../service-account-key.json'));

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

function pick(obj, keys) {
  for (const k of keys) if (obj?.[k] != null && obj[k] !== '') return obj[k];
  return null;
}

async function main() {
  const [usersSnap, clubsSnap] = await Promise.all([
    db.collection('users').get(),
    db.collection('clubs').get(),
  ]);

  // ---------- USERS ----------
  const userById = new Map();
  const userRows = [];
  for (const doc of usersSnap.docs) {
    const d = doc.data();
    const name =
      pick(d?.profile || {}, ['displayName']) ||
      [pick(d?.profile || {}, ['firstName']), pick(d?.profile || {}, ['lastName'])]
        .filter(Boolean)
        .join(' ') ||
      pick(d, ['displayName']) ||
      [pick(d, ['firstName']), pick(d, ['lastName'])].filter(Boolean).join(' ') ||
      '';
    const email = pick(d?.profile || {}, ['email']) || pick(d, ['email']) || '';
    userById.set(doc.id, { id: doc.id, name, email });
    userRows.push({ id: doc.id, name, email });
  }

  userRows.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  console.log(`\n========== USERS (${userRows.length}) ==========`);
  console.log('UID'.padEnd(32) + ' | ' + 'Name'.padEnd(30) + ' | Email');
  console.log('-'.repeat(32) + '-+-' + '-'.repeat(30) + '-+-' + '-'.repeat(30));
  for (const u of userRows) {
    console.log(
      u.id.padEnd(32) + ' | ' + (u.name || '(no name)').padEnd(30).slice(0, 30) + ' | ' + u.email
    );
  }

  // ---------- CLUBS ----------
  const clubRows = [];
  for (const doc of clubsSnap.docs) {
    const d = doc.data();
    const ownerId = pick(d, ['clubOwner', 'owner', 'createdBy']);
    const owner = ownerId ? userById.get(ownerId) : null;
    clubRows.push({
      id: doc.id,
      name: pick(d, ['clubName', 'name']) || '(no name)',
      ownerId: ownerId || '',
      ownerName: owner?.name || (ownerId ? '(user not found)' : '(no owner)'),
      ownerEmail: owner?.email || '',
      adminIds: d.clubAdmins || d.admins || [],
    });
  }

  clubRows.sort((a, b) => a.name.localeCompare(b.name));

  console.log(`\n========== CLUBS (${clubRows.length}) ==========`);
  for (const c of clubRows) {
    console.log(`\n• ${c.name}`);
    console.log(`    club_id:      ${c.id}`);
    console.log(`    owner_id:     ${c.ownerId || '(none)'}`);
    console.log(`    owner:        ${c.ownerName}${c.ownerEmail ? ' <' + c.ownerEmail + '>' : ''}`);
    if (c.adminIds.length) {
      console.log(`    admin_ids:    ${c.adminIds.join(', ')}`);
    }
  }

  console.log(`\nDone. To reassign a club owner, copy the target user's UID and run:`);
  console.log(`  node scripts/set-club-owner.js <clubId> <userId>`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
