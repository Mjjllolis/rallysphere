// scripts/backfill-event-cover-aspect-ratio.js
// Set coverImageAspectRatio (width / height) on every event doc that has a coverImage
// but no ratio yet, so the home feed can size the cover before the image loads.
// Idempotent — events that already have a ratio are skipped.
// Usage: node scripts/backfill-event-cover-aspect-ratio.js [--apply]
//   no --apply = dry-run (prints what would change)

const admin = require('firebase-admin');
const path = require('path');
const { imageSize } = require('image-size');
const serviceAccount = require(path.resolve(__dirname, '../service-account-key.json'));

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const APPLY = process.argv.includes('--apply');

async function measure(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const { width, height, orientation } = imageSize(Buffer.from(await res.arrayBuffer()));
  if (!width || !height) throw new Error('no dimensions');
  // EXIF orientations 5-8 are rotated 90°, so the displayed shape is swapped
  return orientation >= 5 && orientation <= 8 ? height / width : width / height;
}

async function main() {
  const snap = await db.collection('events').get();
  console.log(`Scanning ${snap.size} events...`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;
  let batch = db.batch();
  let batchOps = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    if (!data.coverImage || typeof data.coverImageAspectRatio === 'number') {
      skipped++;
      continue;
    }

    let ratio;
    try {
      ratio = await measure(data.coverImage);
    } catch (err) {
      console.log(`  ${doc.id}: FAILED (${err.message}) — leaving unset`);
      failed++;
      continue;
    }

    console.log(`  ${doc.id}: coverImageAspectRatio → ${ratio.toFixed(4)}`);
    updated++;

    if (APPLY) {
      batch.update(doc.ref, { coverImageAspectRatio: ratio });
      batchOps++;
      if (batchOps >= 400) {
        await batch.commit();
        batch = db.batch();
        batchOps = 0;
      }
    }
  }

  if (APPLY && batchOps > 0) await batch.commit();

  console.log(
    `${APPLY ? 'Applied' : 'Dry run'}: ${updated} to update, ${skipped} skipped, ${failed} failed.`
  );
  if (!APPLY && updated > 0) console.log('Re-run with --apply to write.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
