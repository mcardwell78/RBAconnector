// backfillTemplatesAndCampaignsPublic.js
// Sets all emailTemplates and campaigns to public: false (private) if not already set

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function backfill() {
  let updatedTemplates = 0;
  let updatedCampaigns = 0;

  // Email Templates
  const templatesSnap = await db.collection('emailTemplates').get();
  for (const doc of templatesSnap.docs) {
    const data = doc.data();
    if (typeof data.public === 'undefined') {
      await doc.ref.update({ public: false });
      updatedTemplates++;
      console.log(`Updated emailTemplate: ${doc.id}`);
    }
  }

  // Campaigns
  const campaignsSnap = await db.collection('campaigns').get();
  for (const doc of campaignsSnap.docs) {
    const data = doc.data();
    if (typeof data.public === 'undefined') {
      await doc.ref.update({ public: false });
      updatedCampaigns++;
      console.log(`Updated campaign: ${doc.id}`);
    }
  }

  console.log(`Done. Updated ${updatedTemplates} templates and ${updatedCampaigns} campaigns.`);
  process.exit(0);
}

backfill().catch(e => { console.error(e); process.exit(1); });
