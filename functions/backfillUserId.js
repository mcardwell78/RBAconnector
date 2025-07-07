// backfillUserId.js
// One-time script to add userId to all user-owned documents in Firestore collections
// Usage: node backfillUserId.js <your-uid>

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json'); // Download from Firebase Console

if (process.argv.length < 3) {
  console.error('Usage: node backfillUserId.js <your-uid>');
  process.exit(1);
}

const USER_ID = process.argv[2];

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const collections = [
  'contacts',
  'campaigns',
  'tasks',
  'emailTemplates',
  'emailLogs',
];

async function backfill() {
  for (const col of collections) {
    const snap = await db.collection(col).get();
    let updated = 0;
    for (const doc of snap.docs) {
      const data = doc.data();
      if (!data.userId) {
        await doc.ref.update({ userId: USER_ID });
        updated++;
      }
    }
    console.log(`Collection ${col}: ${updated} documents updated.`);
  }
  process.exit(0);
}

backfill().catch(e => { console.error(e); process.exit(1); });
