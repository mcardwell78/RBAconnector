// printAllTasks.js
// Prints all tasks and their fields for debugging

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function main() {
  const snap = await db.collection('tasks').get();
  if (snap.empty) {
    console.log('No tasks found.');
    process.exit(0);
  }
  for (const doc of snap.docs) {
    const data = doc.data();
    console.log(`task ${doc.id}:`, JSON.stringify(data, null, 2));
  }
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
