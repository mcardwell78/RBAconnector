// Backfill script to set 'public' and 'type' fields on all emailLogs
// 'type' will be 'campaign' if campaignId exists, else 'oneoff'
// 'public' will be set from the related campaign if campaign, else from the log's own field or false

const { initializeApp, applicationDefault, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./serviceAccountKey.json');

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

async function backfill() {
  const logsSnap = await db.collection('emailLogs').get();
  let updated = 0, skipped = 0, failed = 0;
  for (const doc of logsSnap.docs) {
    const data = doc.data();
    let type = data.campaignId ? 'campaign' : 'oneoff';
    let publicVal = false;
    if (type === 'campaign' && data.campaignId) {
      // Fetch campaign to get public field
      try {
        const campSnap = await db.collection('campaigns').doc(data.campaignId).get();
        publicVal = !!campSnap.exists && !!campSnap.data().public;
      } catch (e) {
        console.error('Failed to fetch campaign', data.campaignId, e);
        failed++;
        continue;
      }
    } else {
      // For one-off, use log's own public field if present, else false
      publicVal = typeof data.public === 'boolean' ? data.public : false;
    }
    // Only update if missing or incorrect
    if (data.public !== publicVal || data.type !== type) {
      try {
        await doc.ref.update({ public: publicVal, type });
        updated++;
      } catch (e) {
        console.error('Failed to update log', doc.id, e);
        failed++;
      }
    } else {
      skipped++;
    }
  }
  console.log(`Backfill complete. Updated: ${updated}, Skipped: ${skipped}, Failed: ${failed}`);
}

backfill();
