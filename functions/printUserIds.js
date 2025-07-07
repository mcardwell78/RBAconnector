// printUserIds.js
// Script to print all userId values in each document of your main collections
// Usage: node printUserIds.js

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

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

async function printUserIds() {
  for (const col of collections) {
    const snap = await db.collection(col).get();
    console.log(`\nCollection: ${col}`);
    if (snap.empty) {
      console.log('  (empty)');
      continue;
    }
    for (const doc of snap.docs) {
      const data = doc.data();
      console.log(`  Doc ID: ${doc.id}, userId: ${data.userId}`);
    }
  }
  process.exit(0);
}

printUserIds().catch(e => { console.error(e); process.exit(1); });
