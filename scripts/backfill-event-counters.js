// scripts/backfill-event-counters.js
// Set attendeeCount / waitlistCount on every event doc from current array lengths.
// Idempotent — re-running on already-backfilled events is a no-op.
// Usage: node scripts/backfill-event-counters.js [--apply]
//   no --apply = dry-run (prints what would change)

const admin = require('firebase-admin');
const path = require('path');
const serviceAccount = require(path.resolve(__dirname, '../service-account-key.json'));

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const APPLY = process.argv.includes('--apply');

async function main() {
  const snap = await db.collection('events').get();
  console.log(`Scanning ${snap.size} events...`);

  let updated = 0;
  let skipped = 0;
  let batch = db.batch();
  let batchOps = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const attendeesLen = Array.isArray(data.attendees) ? data.attendees.length : 0;
    const waitlistLen = Array.isArray(data.waitlist) ? data.waitlist.length : 0;
    const currentAttendeeCount = typeof data.attendeeCount === 'number' ? data.attendeeCount : null;
    const currentWaitlistCount = typeof data.waitlistCount === 'number' ? data.waitlistCount : null;

    const needsAttendeeUpdate = currentAttendeeCount !== attendeesLen;
    const needsWaitlistUpdate = currentWaitlistCount !== waitlistLen;

    if (!needsAttendeeUpdate && !needsWaitlistUpdate) {
      skipped++;
      continue;
    }

    console.log(
      `  ${doc.id}: attendeeCount ${currentAttendeeCount} → ${attendeesLen}, waitlistCount ${currentWaitlistCount} → ${waitlistLen}`
    );

    if (APPLY) {
      batch.update(doc.ref, {
        attendeeCount: attendeesLen,
        waitlistCount: waitlistLen,
      });
      batchOps++;
      if (batchOps >= 400) {
        await batch.commit();
        batch = db.batch();
        batchOps = 0;
      }
    }

    updated++;
  }

  if (APPLY && batchOps > 0) {
    await batch.commit();
  }

  console.log('---');
  console.log(`Events scanned:     ${snap.size}`);
  console.log(`Events ${APPLY ? 'updated' : 'would update'}: ${updated}`);
  console.log(`Events unchanged:   ${skipped}`);
  if (!APPLY) {
    console.log('\nDry run — pass --apply to write.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
