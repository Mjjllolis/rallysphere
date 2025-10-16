// Quick script to check club data in Firestore
const admin = require('firebase-admin');

// Initialize Firebase Admin
admin.initializeApp({
  projectId: 'rally-sphere'
});

const db = admin.firestore();

async function checkClub() {
  try {
    const clubId = 'GA4d849qpVM7d28MDcyc';
    const clubDoc = await db.collection('clubs').doc(clubId).get();

    if (!clubDoc.exists) {
      console.log('❌ Club not found!');
      return;
    }

    const data = clubDoc.data();
    console.log('\n✅ Club found!');
    console.log('Club name:', data.clubName || data.name);
    console.log('Stripe Account ID:', data.stripeAccountId || 'NOT SET');
    console.log('Onboarding Complete:', data.stripeOnboardingComplete || false);
    console.log('Account Status:', data.stripeAccountStatus || 'none');
    console.log('\nAll fields:', Object.keys(data).sort());
  } catch (error) {
    console.error('Error:', error);
  }

  process.exit(0);
}

checkClub();
