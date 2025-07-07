// deleteOrphanedCampaignEnrollments.js
// Deletes campaignEnrollments that reference missing contacts

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function main() {
  const snap = await db.collection('campaignEnrollments').get();
  let deleted = 0, failed = 0;
  for (const doc of snap.docs) {
    const data = doc.data();
    const contactSnap = await db.collection('contacts').doc(data.contactId).get();
    if (!contactSnap.exists) {
      try {
        await doc.ref.delete();
        console.log(`Deleted orphaned enrollment ${doc.id} (contactId: ${data.contactId})`);
        deleted++;
      } catch (e) {
        console.error(`Failed to delete enrollment ${doc.id}:`, e.message);
        failed++;
      }
    }
  }
  console.log(`Done. Deleted: ${deleted}, Failed: ${failed}`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
