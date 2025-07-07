// printCampaignEnrollmentsWithBadUserId.js
// Prints all campaignEnrollments where userId is missing or does not match the related contact's userId

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function main() {
  const snap = await db.collection('campaignEnrollments').get();
  let bad = 0, total = 0;
  for (const doc of snap.docs) {
    total++;
    const data = doc.data();
    if (!data.userId) {
      console.log(`ENROLLMENT ${doc.id}: MISSING userId (contactId: ${data.contactId})`);
      bad++;
      continue;
    }
    // Check against contact's userId
    const contactSnap = await db.collection('contacts').doc(data.contactId).get();
    if (!contactSnap.exists) {
      console.log(`ENROLLMENT ${doc.id}: contactId ${data.contactId} NOT FOUND`);
      bad++;
      continue;
    }
    const contact = contactSnap.data();
    if (contact.userId !== data.userId) {
      console.log(`ENROLLMENT ${doc.id}: userId mismatch (enrollment: ${data.userId}, contact: ${contact.userId})`);
      bad++;
    }
  }
  console.log(`Checked ${total} enrollments. Found ${bad} with missing or mismatched userId.`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
