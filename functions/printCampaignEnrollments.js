// printCampaignEnrollments.js
// Script to print all userId values in campaignEnrollments
// Usage: node printCampaignEnrollments.js

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function printUserIds() {
  const snap = await db.collection('campaignEnrollments').get();
  if (snap.empty) {
    console.log('campaignEnrollments: (empty)');
    process.exit(0);
  }
  for (const doc of snap.docs) {
    const data = doc.data();
    console.log(`Doc ID: ${doc.id}, userId: ${data.userId}, campaignId: ${data.campaignId}`);
  }
  process.exit(0);
}

printUserIds().catch(e => { console.error(e); process.exit(1); });
