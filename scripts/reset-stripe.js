// One-time script to clear test Stripe data from all clubs
const admin = require("firebase-admin");
const serviceAccount = require("../service-account-key.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function resetStripe() {
  const snapshot = await db.collection("clubs").get();
  let count = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (data.stripeAccountId || data.stripeOnboardingComplete) {
      console.log(`Resetting: ${data.name} (${doc.id})`);
      await doc.ref.update({
        stripeAccountId: admin.firestore.FieldValue.delete(),
        stripeAccountStatus: admin.firestore.FieldValue.delete(),
        stripeOnboardingComplete: admin.firestore.FieldValue.delete(),
      });
      count++;
    }
  }

  console.log(`Done. Reset ${count} club(s).`);
  process.exit(0);
}

resetStripe().catch(console.error);
