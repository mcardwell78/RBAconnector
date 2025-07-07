// Script to backfill userId in all emailLogs documents
// Usage: node backfillEmailLogsUserId.js

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function main() {
  const snap = await db.collection('emailLogs').get();
  let fixed = 0;
  let skipped = 0;
  for (const doc of snap.docs) {
    const data = doc.data();
    // Fix if userId is missing or set to 'system'
    if (!data.userId || data.userId === 'system') {
      let userId = null;
      // Prefer campaignEnrollment if available
      if (data.enrollmentId) {
        const enrollSnap = await db.collection('campaignEnrollments').doc(data.enrollmentId).get();
        if (enrollSnap.exists) {
          userId = enrollSnap.data().userId || null;
        }
      }
      // Fallback to contact if needed
      if (!userId && data.contactId) {
        const contactSnap = await db.collection('contacts').doc(data.contactId).get();
        if (contactSnap.exists) {
          userId = contactSnap.data().userId || null;
        }
      }
      if (userId) {
        await doc.ref.update({ userId });
        fixed++;
        console.log(`Fixed emailLog: ${doc.id} -> userId: ${userId}`);
      } else {
        skipped++;
        console.warn(`Skipped emailLog: ${doc.id} (no userId could be determined)`);
      }
    }
  }
  console.log(`Done. Fixed ${fixed} logs. Skipped ${skipped} logs without userId.`);
}

main().catch(console.error);
