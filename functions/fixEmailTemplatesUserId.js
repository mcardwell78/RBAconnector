// Script to ensure all emailTemplates have the correct userId field
// Usage: node fixEmailTemplatesUserId.js <YOUR_USER_ID>

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (!process.argv[2]) {
  console.error('Usage: node fixEmailTemplatesUserId.js <YOUR_USER_ID>');
  process.exit(1);
}

const USER_ID = process.argv[2];

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function fixTemplates() {
  const snap = await db.collection('emailTemplates').get();
  let fixed = 0;
  for (const doc of snap.docs) {
    const data = doc.data();
    if (!data.userId || data.userId !== USER_ID) {
      await doc.ref.update({ userId: USER_ID });
      fixed++;
      console.log(`Fixed template: ${doc.id}`);
    }
  }
  console.log(`Done. Fixed ${fixed} templates.`);
}

fixTemplates().catch(console.error);
