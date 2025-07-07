// backfillScheduledEmailsUserId.js
// Adds userId to scheduledEmails if missing, using the related contact's userId

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function main() {
  const snap = await db.collection('scheduledEmails').get();
  let updated = 0, failed = 0, deleted = 0, skipped = 0;
  for (const doc of snap.docs) {
    const data = doc.data();
    // Delete obvious debug/test docs
    if (doc.id === 'debugTestWrite' || data.test === true || (typeof data.note === 'string' && (data.note.includes('debug') || data.note.includes('Firestore writes are working')))) {
      await doc.ref.delete();
      deleted++;
      console.log(`Deleted debug/test doc: ${doc.id}`);
      continue;
    }
    if (!data.userId && data.campaignEnrollmentId) {
      // Look up enrollment to get userId
      const enrollmentSnap = await db.collection('campaignEnrollments').doc(data.campaignEnrollmentId).get();
      if (enrollmentSnap.exists) {
        const userId = enrollmentSnap.data().userId;
        if (userId) {
          await doc.ref.update({ userId });
          updated++;
          console.log(`Backfilled userId for scheduledEmail ${doc.id} from campaignEnrollment ${data.campaignEnrollmentId}`);
        } else {
          failed++;
          console.warn(`campaignEnrollment ${data.campaignEnrollmentId} has no userId`);
        }
      } else {
        failed++;
        console.warn(`campaignEnrollment ${data.campaignEnrollmentId} not found`);
      }
    } else if (!data.userId && data.contactId) {
      // Fallback: Look up contact to get userId
      const contactSnap = await db.collection('contacts').doc(data.contactId).get();
      if (contactSnap.exists) {
        const userId = contactSnap.data().userId;
        if (userId) {
          await doc.ref.update({ userId });
          updated++;
          console.log(`Updated scheduledEmail ${doc.id} with userId ${userId} from contact ${data.contactId}`);
        } else {
          failed++;
          console.warn(`Contact ${data.contactId} has no userId`);
        }
      } else {
        failed++;
        console.warn(`Contact ${data.contactId} not found`);
      }
    } else if (!data.userId) {
      skipped++;
      console.warn(`No userId, campaignEnrollmentId, or contactId for scheduledEmail ${doc.id}`);
    }
  }
  console.log(`Done. Updated: ${updated}, Deleted: ${deleted}, Failed: ${failed}, Skipped: ${skipped}`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
