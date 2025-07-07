// Backfill script to set the 'public' field on emailLogs based on campaignId
const admin = require('firebase-admin');
if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

async function main() {
  const logsSnap = await db.collection('emailLogs').get();
  let updated = 0, skipped = 0, failed = 0;
  for (const doc of logsSnap.docs) {
    const data = doc.data();
    // Only update if 'public' is missing or not a boolean
    if (typeof data.public === 'boolean') {
      skipped++;
      continue;
    }
    let isPublic = false;
    // Try to infer from campaignId if present
    if (data.campaignId) {
      try {
        const campaignSnap = await db.collection('campaigns').doc(data.campaignId).get();
        if (campaignSnap.exists) {
          const campaign = campaignSnap.data();
          isPublic = !!campaign.public;
        }
      } catch (e) {
        failed++;
        console.error(`Failed to fetch campaign for log ${doc.id}:`, e);
        continue;
      }
    }
    try {
      await doc.ref.update({ public: isPublic });
      updated++;
    } catch (e) {
      failed++;
      console.error(`Failed to update log ${doc.id}:`, e);
    }
  }
  console.log(`Backfill complete. Updated: ${updated}, Skipped: ${skipped}, Failed: ${failed}`);
}

main();
