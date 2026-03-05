// One-time script to delete all clubs and events except specified clubs
const admin = require("firebase-admin");
const serviceAccount = require("../service-account-key.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// Clubs to KEEP (case-insensitive match)
const KEEP_CLUBS = [
  "rallysphere",
  "padel club",
  "jay's ruy club",
  "inf",
];

async function cleanup() {
  // --- CLUBS ---
  const clubsSnapshot = await db.collection("clubs").get();
  const keepClubIds = [];
  let clubsDeleted = 0;

  for (const doc of clubsSnapshot.docs) {
    const data = doc.data();
    const name = (data.name || "").toLowerCase().trim();
    const shouldKeep = KEEP_CLUBS.some(k => name === k || name.includes(k));

    if (shouldKeep) {
      console.log(`KEEPING club: ${data.name} (${doc.id})`);
      keepClubIds.push(doc.id);
      // Also reset Stripe fields on kept clubs
      if (data.stripeAccountId || data.stripeOnboardingComplete) {
        await doc.ref.update({
          stripeAccountId: admin.firestore.FieldValue.delete(),
          stripeAccountStatus: admin.firestore.FieldValue.delete(),
          stripeOnboardingComplete: admin.firestore.FieldValue.delete(),
        });
        console.log(`  -> Reset Stripe fields`);
      }
    } else {
      console.log(`DELETING club: ${data.name} (${doc.id})`);
      await doc.ref.delete();
      clubsDeleted++;
    }
  }

  // --- EVENTS ---
  const eventsSnapshot = await db.collection("events").get();
  let eventsDeleted = 0;
  let eventsKept = 0;

  for (const doc of eventsSnapshot.docs) {
    const data = doc.data();
    if (keepClubIds.includes(data.clubId)) {
      console.log(`KEEPING event: ${data.title} (${doc.id})`);
      eventsKept++;
    } else {
      console.log(`DELETING event: ${data.title} (${doc.id})`);
      await doc.ref.delete();
      eventsDeleted++;
    }
  }

  // --- STORE ITEMS (delete all) ---
  const storeSnapshot = await db.collection("storeItems").get();
  let storeDeleted = 0;

  for (const doc of storeSnapshot.docs) {
    const data = doc.data();
    console.log(`DELETING store item: ${data.name || data.title} (${doc.id})`);
    await doc.ref.delete();
    storeDeleted++;
  }

  console.log(`\nDone.`);
  console.log(`Clubs: kept ${keepClubIds.length}, deleted ${clubsDeleted}`);
  console.log(`Events: kept ${eventsKept}, deleted ${eventsDeleted}`);
  console.log(`Store items: deleted ${storeDeleted}`);
  process.exit(0);
}

cleanup().catch(console.error);
