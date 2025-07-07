// Backfill script to set createdAt to Firestore Timestamp for all emailTemplates
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function backfill() {
  const snap = await db.collection('emailTemplates').get();
  let fixed = 0;
  for (const doc of snap.docs) {
    const data = doc.data();
    if (!data.createdAt || !(data.createdAt.toDate)) {
      await doc.ref.update({ createdAt: admin.firestore.FieldValue.serverTimestamp() });
      fixed++;
      console.log(`Fixed createdAt for template: ${doc.id}`);
    }
  }
  console.log(`Done. Fixed ${fixed} templates.`);
}

backfill().catch(console.error);
