// backfillEmailEventsUserIdMissingOnly.js
// Updates only emailEvents with missing userId, setting it to the correct UID

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

const CORRECT_UID = 'PgCYRmzRvBMKxlldWRGWld6ekaL2';

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function main() {
  const snap = await db.collection('emailEvents').get();
  let updated = 0;
  for (const doc of snap.docs) {
    const data = doc.data();
    if (!data.userId) {
      await doc.ref.update({ userId: CORRECT_UID });
      console.log(`Updated emailEvent ${doc.id}`);
      updated++;
    }
  }
  if (updated === 0) {
    console.log('No emailEvents needed updating.');
  } else {
    console.log(`${updated} emailEvents updated with userId.`);
  }
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
