// backfillScheduledEmailsScheduledFor.js
// Converts scheduledFor in scheduledEmails to Firestore Timestamp if not already

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function backfill() {
  const snap = await db.collection('scheduledEmails').get();
  let fixed = 0, skipped = 0;
  for (const doc of snap.docs) {
    const data = doc.data();
    let needsFix = false;
    let newScheduledFor = null;
    if (!data.scheduledFor) {
      skipped++;
      continue;
    }
    // Firestore Timestamp has toDate method
    if (typeof data.scheduledFor.toDate === 'function') {
      // Already a Timestamp
      continue;
    }
    // If it's a string or Date, convert
    if (typeof data.scheduledFor === 'string' || data.scheduledFor instanceof Date) {
      newScheduledFor = admin.firestore.Timestamp.fromDate(new Date(data.scheduledFor));
      needsFix = true;
    } else if (typeof data.scheduledFor === 'object' && data.scheduledFor._seconds) {
      // Legacy: Firestore Timestamp as plain object
      newScheduledFor = new admin.firestore.Timestamp(data.scheduledFor._seconds, data.scheduledFor._nanoseconds || 0);
      needsFix = true;
    } else {
      skipped++;
      continue;
    }
    if (needsFix && newScheduledFor) {
      await doc.ref.update({ scheduledFor: newScheduledFor });
      fixed++;
      console.log(`Fixed scheduledEmail: ${doc.id}`);
    }
  }
  console.log(`Done. Fixed ${fixed} scheduledEmails. Skipped ${skipped}.`);
}

backfill().catch(console.error);
