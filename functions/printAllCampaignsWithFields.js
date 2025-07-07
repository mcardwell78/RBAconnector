// Print all campaigns with id, userId, and public fields, highlighting any with suspicious values
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();

async function printAllCampaigns() {
  const snap = await db.collection('campaigns').get();
  let bad = 0;
  snap.forEach(doc => {
    const d = doc.data();
    const id = doc.id;
    const userId = d.userId;
    const pub = d.public;
    let flag = '';
    if (typeof pub !== 'boolean') flag += ' [BAD public]';
    if (!userId || typeof userId !== 'string') flag += ' [BAD userId]';
    if (!pub && userId === undefined) flag += ' [NO public or userId]';
    if (flag) bad++;
    console.log(`id: ${id} | userId: ${userId} | public: ${pub} ${flag}`);
  });
  if (bad === 0) {
    console.log('All campaigns have valid userId and public fields.');
  } else {
    console.log(`Found ${bad} campaign(s) with suspicious fields.`);
  }
  process.exit(0);
}

printAllCampaigns().catch(e => { console.error(e); process.exit(1); });
