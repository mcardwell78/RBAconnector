// printAllEmailLogsCount.js
// Prints the total number of emailLogs documents

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function main() {
  const snap = await db.collection('emailLogs').get();
  console.log(`Total emailLogs: ${snap.size}`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
