// deleteAllEmailLogs.js
// Deletes all documents in the emailLogs collection

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function main() {
  const snap = await db.collection('emailLogs').get();
  let deleted = 0;
  for (const doc of snap.docs) {
    await doc.ref.delete();
    deleted++;
    if (deleted % 100 === 0) console.log(`Deleted ${deleted} logs...`);
  }
  console.log(`Done. Deleted ${deleted} emailLogs.`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
