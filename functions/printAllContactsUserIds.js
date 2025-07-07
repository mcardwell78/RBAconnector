const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}
const db = admin.firestore();

console.log('Script started: printAllContactsUserIds');

async function printAllContacts() {
  try {
    const snap = await db.collection('contacts').get();
    if (snap.empty) {
      console.log('No contacts found in Firestore.');
      process.exit(0);
    }
    snap.forEach(doc => {
      const d = doc.data();
      const id = doc.id;
      const userId = d.userId;
      console.log(`Contact ID: ${id} | userId: ${userId}`);
    });
    process.exit(0);
  } catch (err) {
    console.error('Error fetching contacts:', err);
    process.exit(1);
  }
}

printAllContacts();