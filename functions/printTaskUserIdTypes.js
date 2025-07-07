// printTaskUserIdTypes.js
// Prints all tasks with their id and userId type for debugging

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function main() {
  const snap = await db.collection('tasks').get();
  let found = false;
  for (const doc of snap.docs) {
    const data = doc.data();
    let type = typeof data.userId;
    if (!('userId' in data)) type = 'MISSING';
    console.log(`task ${doc.id}: userId type = ${type}, value = ${data.userId}`);
    if (type !== 'string' || !data.userId) found = true;
  }
  if (!found) {
    console.log('All tasks have userId as a non-empty string.');
  }
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
