// backfillTasksStatus.js
// Adds a default status ('pending') to all tasks missing a status field

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function main() {
  const snap = await db.collection('tasks').get();
  let updated = 0;
  for (const doc of snap.docs) {
    const data = doc.data();
    if (typeof data.status === 'undefined' || data.status === null) {
      await doc.ref.update({ status: 'pending' });
      updated++;
      console.log(`Updated task ${doc.id} with status 'pending'`);
    }
  }
  console.log(`Done. Updated ${updated} tasks.`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
