// printTasksMissingUserId.js
// Prints all tasks missing userId or with a blank/incorrect value

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
    if (!('userId' in data) || !data.userId || typeof data.userId !== 'string') {
      found = true;
      console.log(`task ${doc.id} is missing userId or has invalid userId:`, JSON.stringify(data, null, 2));
    }
  }
  if (!found) {
    console.log('All tasks have a valid userId.');
  }
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
