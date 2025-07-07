// backfillCampaignEnrollmentsUserId.js
// One-time script to add userId to all campaignEnrollments documents in Firestore
// Usage: node backfillCampaignEnrollmentsUserId.js <your-uid>

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// If userId is missing, fetch from contact; otherwise, keep as is
async function backfill() {
  const snap = await db.collection('campaignEnrollments').get();
  let updated = 0, failed = 0;
  for (const doc of snap.docs) {
    const data = doc.data();
    if (!data.userId || typeof data.userId !== 'string' || data.userId.length < 10) {
      try {
        const contactSnap = await db.collection('contacts').doc(data.contactId).get();
        if (!contactSnap.exists) {
          console.warn(`Contact not found for enrollment ${doc.id}`);
          failed++;
          continue;
        }
        const contact = contactSnap.data();
        if (!contact.userId) {
          console.warn(`Contact ${data.contactId} has no userId for enrollment ${doc.id}`);
          failed++;
          continue;
        }
        await doc.ref.update({ userId: contact.userId });
        console.log(`Updated enrollment ${doc.id} with userId ${contact.userId}`);
        updated++;
      } catch (e) {
        console.error(`Failed to update enrollment ${doc.id}:`, e.message);
        failed++;
      }
    }
  }
  console.log(`Done. Updated: ${updated}, Failed: ${failed}`);
  process.exit(0);
}

backfill().catch(e => { console.error(e); process.exit(1); });
