// Script to delete or fix malformed tasks in Firestore
// Deletes any /tasks doc missing userId or with non-string userId

const { initializeApp, applicationDefault, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./serviceAccountKey.json');

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

async function cleanBadTasks() {
  const snapshot = await db.collection('tasks').get();
  let deleted = 0;
  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (!('userId' in data) || typeof data.userId !== 'string') {
      console.log(`Deleting bad task: ${doc.id} (userId: ${data.userId})`);
      await doc.ref.delete();
      deleted++;
    }
  }
  console.log(`Done. Deleted: ${deleted} bad tasks.`);
}

cleanBadTasks().then(() => process.exit(0));
