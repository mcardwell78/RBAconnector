// Backfill script to add missing 'body' field to campaign emailLogs from scheduledEmails
const admin = require('firebase-admin');
if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

async function main() {
  const logsSnap = await db.collection('emailLogs').get();
  let updated = 0, failed = 0, skipped = 0;
  for (const docSnap of logsSnap.docs) {
    const log = docSnap.data();
    // Only backfill campaign emails (not one-off) that are missing 'body'
    if (!log.campaignId || log.body) { skipped++; continue; }
    if (!log.scheduledEmailId) { skipped++; continue; }
    try {
      const schedSnap = await db.collection('scheduledEmails').doc(log.scheduledEmailId).get();
      if (!schedSnap.exists) { failed++; continue; }
      const sched = schedSnap.data();
      if (!sched.body) { failed++; continue; }
      await docSnap.ref.update({ body: sched.body });
      updated++;
    } catch (e) {
      console.error('Failed to update log', docSnap.id, e);
      failed++;
    }
  }
  console.log(`Backfill complete. Updated: ${updated}, Skipped: ${skipped}, Failed: ${failed}`);
  process.exit(0);
}

main();
