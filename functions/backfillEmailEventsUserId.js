// Script to backfill userId on all emailEvents
// Usage: node backfillEmailEventsUserId.js <YOUR_USER_ID>

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (!process.argv[2]) {
  console.error('Usage: node backfillEmailEventsUserId.js <YOUR_USER_ID>');
  process.exit(1);
}

const USER_ID = process.argv[2];

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function backfill() {
  const snap = await db.collection('emailEvents').get();
  let fixed = 0;
  for (const doc of snap.docs) {
    const data = doc.data();
    if (!data.userId || data.userId !== USER_ID) {
      await doc.ref.update({ userId: USER_ID });
      fixed++;
      console.log(`Fixed emailEvent: ${doc.id}`);
    }
  }
  console.log(`Done. Fixed ${fixed} emailEvents.`);
}

backfill().catch(console.error);
