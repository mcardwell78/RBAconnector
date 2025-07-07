// Backfill script to update sentCount/openCount on templates and emailSentCount/emailOpenedCount on contacts
const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

async function backfill() {
  // 1. Backfill template sentCount/openCount
  const templatesSnap = await db.collection('emailTemplates').get();
  for (const templateDoc of templatesSnap.docs) {
    const templateId = templateDoc.id;
    // Count sent
    const sentLogs = await db.collection('emailLogs').where('templateId', '==', templateId).where('status', '==', 'sent').get();
    const openLogs = await db.collection('emailLogs').where('templateId', '==', templateId).where('status', '==', 'opened').get();
    await templateDoc.ref.update({
      sentCount: sentLogs.size,
      openCount: openLogs.size
    });
    console.log(`Template ${templateId}: sentCount=${sentLogs.size}, openCount=${openLogs.size}`);
  }
  // 2. Backfill contact emailSentCount/emailOpenedCount
  const contactsSnap = await db.collection('contacts').get();
  for (const contactDoc of contactsSnap.docs) {
    const contactId = contactDoc.id;
    const sentLogs = await db.collection('emailLogs').where('contactId', '==', contactId).where('status', '==', 'sent').get();
    const openLogs = await db.collection('emailLogs').where('contactId', '==', contactId).where('status', '==', 'opened').get();
    await contactDoc.ref.update({
      emailSentCount: sentLogs.size,
      emailOpenedCount: openLogs.size
    });
    console.log(`Contact ${contactId}: emailSentCount=${sentLogs.size}, emailOpenedCount=${openLogs.size}`);
  }
  console.log('Backfill complete.');
}

backfill().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
