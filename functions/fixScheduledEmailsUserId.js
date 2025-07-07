const admin = require('firebase-admin');
admin.initializeApp();

const db = admin.firestore();

async function fixScheduledEmailsUserId() {
  const scheduledEmailsSnap = await db.collection('scheduledEmails').get();
  let fixed = 0, checked = 0, failed = 0;

  for (const doc of scheduledEmailsSnap.docs) {
    checked++;
    const data = doc.data();
    if (data.userId && typeof data.userId === 'string' && data.userId.length > 0) continue;

    // Try to get userId from related campaignEnrollment
    let userId = null;
    if (data.enrollmentId) {
      const enrollmentSnap = await db.collection('campaignEnrollments').doc(data.enrollmentId).get();
      if (enrollmentSnap.exists) {
        const enrollment = enrollmentSnap.data();
        userId = enrollment.userId;
      }
    }
    // Optionally, try to get userId from contactId if available
    if (!userId && data.contactId) {
      const contactSnap = await db.collection('contacts').doc(data.contactId).get();
      if (contactSnap.exists) {
        const contact = contactSnap.data();
        userId = contact.userId;
      }
    }
    if (userId) {
      await doc.ref.update({ userId });
      fixed++;
      console.log(`Fixed userId for scheduledEmail ${doc.id}: ${userId}`);
    } else {
      failed++;
      console.warn(`Could not fix userId for scheduledEmail ${doc.id}`);
    }
  }
  console.log(`Checked: ${checked}, Fixed: ${fixed}, Failed: ${failed}`);
}

fixScheduledEmailsUserId().then(() => {
  console.log('Done.');
  process.exit(0);
}).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
