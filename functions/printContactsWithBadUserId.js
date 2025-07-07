// printContactsWithBadUserId.js
// Prints all contacts where userId is missing or not the correct UID

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

const CORRECT_UID = 'PgCYRmzRvBMKxlldWRGWld6ekaL2';

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function main() {
  const snap = await db.collection('contacts').get();
  let count = 0;
  for (const doc of snap.docs) {
    const data = doc.data();
    if (!data.userId || data.userId !== CORRECT_UID) {
      console.log(`Contact ${doc.id}: userId = ${data.userId}`);
      count++;
    }
  }
  if (count === 0) {
    console.log('All contacts have the correct userId.');
  } else {
    console.log(`${count} contacts have missing or incorrect userId.`);
  }
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
