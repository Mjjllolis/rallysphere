// scripts/nuke-users.js
//
// Deletes all auth users and all user-owned Firestore collections.
// KEEPS: clubs, events, featuredEvents, storeItems, proSubscriptions (product level),
// waiverSignatures (event sub-collections), and anything not listed below.
//
// Usage: node scripts/nuke-users.js
// Requires: ./service-account-key.json

const admin = require('firebase-admin');
const readline = require('readline');
const serviceAccount = require('../service-account-key.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

const auth = admin.auth();
const db = admin.firestore();

// Collections to clear entirely.
const COLLECTIONS_TO_DELETE = [
    'users',
    'storeOrders',
    'ticketOrders',
    'rallyCreditRedemptions',
    'payments',
    'userProSubscriptions',
    'clubSubscriptions',
    'clubJoinRequests',
];

const BATCH_SIZE = 400; // Firestore batch limit is 500, leave headroom.

async function countCollection(name) {
    const snap = await db.collection(name).count().get();
    return snap.data().count;
}

async function deleteCollection(name) {
    const collRef = db.collection(name);
    let total = 0;
    while (true) {
        const snap = await collRef.limit(BATCH_SIZE).get();
        if (snap.empty) break;
        const batch = db.batch();
        snap.docs.forEach((doc) => batch.delete(doc.ref));
        await batch.commit();
        total += snap.size;
        process.stdout.write(`\r  ${name}: deleted ${total}`);
    }
    process.stdout.write('\n');
    return total;
}

async function listAllAuthUsers() {
    const uids = [];
    let pageToken;
    do {
        const res = await auth.listUsers(1000, pageToken);
        res.users.forEach((u) => uids.push(u.uid));
        pageToken = res.pageToken;
    } while (pageToken);
    return uids;
}

async function deleteAllAuthUsers(uids) {
    // admin.auth().deleteUsers accepts up to 1000 at a time.
    let deleted = 0;
    let failed = 0;
    for (let i = 0; i < uids.length; i += 1000) {
        const chunk = uids.slice(i, i + 1000);
        const res = await auth.deleteUsers(chunk);
        deleted += res.successCount;
        failed += res.failureCount;
        if (res.errors && res.errors.length) {
            res.errors.slice(0, 3).forEach((e) => {
                console.warn(`  auth error (uid ${chunk[e.index]}): ${e.error.message}`);
            });
        }
        process.stdout.write(`\r  auth users: deleted ${deleted} / ${uids.length}${failed ? ` (failed ${failed})` : ''}`);
    }
    process.stdout.write('\n');
    return { deleted, failed };
}

function confirm(prompt) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => {
        rl.question(prompt, (answer) => { rl.close(); resolve(answer.trim()); });
    });
}

(async () => {
    const projectId = serviceAccount.project_id;
    console.log('\n=========================================================');
    console.log(` Firestore project : ${projectId}`);
    console.log(' KEEPS             : clubs, events, featuredEvents, storeItems, proSubscriptions (and anything else)');
    console.log(' DELETES           : auth users + the following collections:');
    COLLECTIONS_TO_DELETE.forEach((c) => console.log(`                     - ${c}`));
    console.log('=========================================================\n');

    // Pre-flight counts
    console.log('Counting...');
    const counts = {};
    for (const name of COLLECTIONS_TO_DELETE) {
        try {
            counts[name] = await countCollection(name);
        } catch (err) {
            counts[name] = `ERROR (${err.message})`;
        }
    }
    const authUids = await listAllAuthUsers();

    console.log(`\n  auth users      : ${authUids.length}`);
    for (const name of COLLECTIONS_TO_DELETE) {
        console.log(`  ${name.padEnd(16)}: ${counts[name]}`);
    }

    const answer = await confirm(`\nType "DELETE ${projectId}" to confirm: `);
    if (answer !== `DELETE ${projectId}`) {
        console.log('Aborted. Nothing was deleted.');
        process.exit(0);
    }

    console.log('\n--- Deleting Firestore collections ---');
    for (const name of COLLECTIONS_TO_DELETE) {
        try {
            await deleteCollection(name);
        } catch (err) {
            console.error(`  ${name}: ${err.message}`);
        }
    }

    console.log('\n--- Deleting Auth users ---');
    if (authUids.length === 0) {
        console.log('  (no auth users)');
    } else {
        await deleteAllAuthUsers(authUids);
    }

    console.log('\n✔ Done.\n');
    process.exit(0);
})().catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
});
