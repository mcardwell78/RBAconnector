// printEmailTemplatesWithBadFields.js
// Prints all emailTemplates with missing or bad userId or public fields

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function main() {
  const snap = await db.collection('emailTemplates').get();
  let bad = 0;
  for (const doc of snap.docs) {
    const data = doc.data();
    let issues = [];
    if (!data.userId || typeof data.userId !== 'string' || !data.userId.trim()) {
      issues.push('missing or invalid userId');
    }
    if (typeof data.public === 'undefined') {
      issues.push('missing public field');
    }
    if (issues.length > 0) {
      console.log(`Template ${doc.id}: ${issues.join(', ')}`);
      console.log('  Data:', data);
      bad++;
    }
  }
  if (bad === 0) {
    console.log('All emailTemplates have valid userId and public fields.');
  } else {
    console.log(`${bad} emailTemplates have missing or bad fields.`);
  }
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
