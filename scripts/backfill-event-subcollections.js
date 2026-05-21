// scripts/backfill-event-subcollections.js
// Mirror every event's attendees[] / waitlist[] arrays into subcollection docs
// at events/{eventId}/attendees/{userId} and events/{eventId}/waitlist/{userId}.
// Idempotent (set with merge); safe to re-run.
// Usage: node scripts/backfill-event-subcollections.js [--apply]
//   no --apply = dry-run (prints what would change)

const admin = require('firebase-admin');
const path = require('path');
const serviceAccount = require(path.resolve(__dirname, '../service-account-key.json'));

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const APPLY = process.argv.includes('--apply');

async function backfillEvent(eventDoc) {
  const data = eventDoc.data();
  const attendees = Array.isArray(data.attendees) ? data.attendees : [];
  const waitlist = Array.isArray(data.waitlist) ? data.waitlist : [];

  let attendeesWritten = 0;
  let waitlistWritten = 0;
  let batch = db.batch();
  let batchOps = 0;

  const flushIfNeeded = async () => {
    if (batchOps >= 400) {
      if (APPLY) await batch.commit();
      batch = db.batch();
      batchOps = 0;
    }
  };

  for (const userId of attendees) {
    if (!userId) continue;
    const ref = eventDoc.ref.collection('attendees').doc(userId);
    batch.set(ref, { userId, joinedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    batchOps++;
    attendeesWritten++;
    await flushIfNeeded();
  }

  for (const userId of waitlist) {
    if (!userId) continue;
    const ref = eventDoc.ref.collection('waitlist').doc(userId);
    batch.set(ref, { userId, joinedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    batchOps++;
    waitlistWritten++;
    await flushIfNeeded();
  }

  if (batchOps > 0 && APPLY) await batch.commit();

  return { attendeesWritten, waitlistWritten };
}

async function main() {
  const snap = await db.collection('events').get();
  console.log(`Scanning ${snap.size} events...`);

  let totalEvents = 0;
  let totalAttendees = 0;
  let totalWaitlist = 0;

  for (const doc of snap.docs) {
    const { attendeesWritten, waitlistWritten } = await backfillEvent(doc);
    if (attendeesWritten || waitlistWritten) {
      console.log(`  ${doc.id}: ${attendeesWritten} attendees, ${waitlistWritten} waitlist`);
      totalEvents++;
      totalAttendees += attendeesWritten;
      totalWaitlist += waitlistWritten;
    }
  }

  console.log('---');
  console.log(`Events with entries: ${totalEvents}`);
  console.log(`Attendee docs ${APPLY ? 'written' : 'would write'}: ${totalAttendees}`);
  console.log(`Waitlist docs ${APPLY ? 'written' : 'would write'}: ${totalWaitlist}`);
  if (!APPLY) {
    console.log('\nDry run — pass --apply to write.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
