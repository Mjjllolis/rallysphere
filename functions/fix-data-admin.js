// Admin script to fix events and recalculate rally credits
// Run from functions folder with: node fix-data-admin.js

const admin = require('firebase-admin');

// Initialize with default credentials (uses ADC or service account)
admin.initializeApp({
  projectId: 'rally-sphere',
});

const db = admin.firestore();

async function fixEventsAndCredits() {
  console.log('Starting data fix...');

  const results = {
    eventsChecked: 0,
    eventsFixed: 0,
    creditsReset: 0,
    creditsAwarded: 0,
    eventErrors: [],
    creditErrors: [],
  };

  try {
    // Step 1: Load all clubs
    console.log("Loading all clubs...");
    const clubsSnapshot = await db.collection("clubs").get();
    const clubsByName = new Map();
    const clubsById = new Map();

    clubsSnapshot.docs.forEach((doc) => {
      const clubData = doc.data();
      const club = { id: doc.id, name: clubData.clubName || clubData.name, ...clubData };
      clubsById.set(doc.id, club);
      if (club.name) {
        clubsByName.set(club.name.toLowerCase(), club);
      }
    });

    console.log(`Loaded ${clubsById.size} clubs`);

    // Step 2: Fix all events
    console.log("Checking all events...");
    const eventsSnapshot = await db.collection("events").get();

    for (const eventDoc of eventsSnapshot.docs) {
      results.eventsChecked++;
      const event = eventDoc.data();
      const eventId = eventDoc.id;

      try {
        // Check if clubId is valid
        const currentClub = clubsById.get(event.clubId);

        if (!currentClub) {
          // Club doesn't exist - try to find by name
          const correctClub = clubsByName.get(event.clubName?.toLowerCase());

          if (correctClub) {
            console.log(`Fixing event ${eventId}: clubId ${event.clubId} -> ${correctClub.id}`);
            await db.collection("events").doc(eventId).update({
              clubId: correctClub.id,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            results.eventsFixed++;
          } else {
            results.eventErrors.push(`Event ${eventId}: Club not found - ${event.clubName}`);
          }
        } else if (currentClub.name !== event.clubName) {
          // Club exists but name doesn't match - try to find correct club by name
          const correctClub = clubsByName.get(event.clubName?.toLowerCase());

          if (correctClub && correctClub.id !== event.clubId) {
            console.log(`Fixing event ${eventId}: clubId ${event.clubId} -> ${correctClub.id} (name mismatch)`);
            await db.collection("events").doc(eventId).update({
              clubId: correctClub.id,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            results.eventsFixed++;
          }
        }
      } catch (error) {
        results.eventErrors.push(`Event ${eventId}: ${error.message}`);
      }
    }

    console.log(`Events checked: ${results.eventsChecked}, fixed: ${results.eventsFixed}`);

    // Step 3: Reset all rally credits
    console.log("Resetting all rally credits...");
    const creditsSnapshot = await db.collection("rallyCredits").get();

    for (const creditsDoc of creditsSnapshot.docs) {
      try {
        await db.collection("rallyCredits").doc(creditsDoc.id).update({
          totalCredits: 0,
          availableCredits: 0,
          usedCredits: 0,
          clubCredits: {},
          transactions: [],
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        results.creditsReset++;
      } catch (error) {
        results.creditErrors.push(`Reset ${creditsDoc.id}: ${error.message}`);
      }
    }

    console.log(`Credits reset: ${results.creditsReset}`);

    // Step 4: Recalculate credits based on event attendance
    // Reload events to get fixed data
    console.log("Recalculating rally credits from event attendance...");
    const freshEventsSnapshot = await db.collection("events").get();

    for (const eventDoc of freshEventsSnapshot.docs) {
      const event = eventDoc.data();
      const eventId = eventDoc.id;
      const clubId = event.clubId;
      const clubName = event.clubName || "Unknown Club";
      const eventName = event.title || "Unknown Event";
      const attendees = event.attendees || [];
      const rallyCredits = event.rallyCredits || 50; // Default to 50 if not set

      // Get the correct club to ensure we have the right name
      const club = clubsById.get(clubId);
      const finalClubName = club?.name || clubName;

      for (const attendeeId of attendees) {
        try {
          // Get or create credits document
          const creditsRef = db.collection("rallyCredits").doc(attendeeId);
          const creditsDoc = await creditsRef.get();

          let currentCredits;
          if (!creditsDoc.exists) {
            currentCredits = {
              userId: attendeeId,
              totalCredits: 0,
              availableCredits: 0,
              usedCredits: 0,
              clubCredits: {},
              transactions: [],
            };
          } else {
            currentCredits = creditsDoc.data();
          }

          // Add credits for this event
          const newClubCredits = { ...currentCredits.clubCredits };
          newClubCredits[clubId] = (newClubCredits[clubId] || 0) + rallyCredits;

          const transaction = {
            id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            userId: attendeeId,
            clubId: clubId,
            clubName: finalClubName,
            type: "earned",
            amount: rallyCredits,
            eventId: eventId,
            eventName: eventName,
            description: `Earned ${rallyCredits} credits for attending ${eventName}`,
            createdAt: new Date(),
          };

          const updatedCredits = {
            ...currentCredits,
            totalCredits: (currentCredits.totalCredits || 0) + rallyCredits,
            availableCredits: (currentCredits.availableCredits || 0) + rallyCredits,
            clubCredits: newClubCredits,
            transactions: [transaction, ...(currentCredits.transactions || [])].slice(0, 100),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          };

          await creditsRef.set(updatedCredits, { merge: true });
          results.creditsAwarded++;
        } catch (error) {
          results.creditErrors.push(`Award to ${attendeeId} for ${eventId}: ${error.message}`);
        }
      }
    }

    console.log(`Credits awarded: ${results.creditsAwarded}`);
    console.log("\n=== RESULTS ===");
    console.log(JSON.stringify(results, null, 2));

    return results;
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
}

fixEventsAndCredits()
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
