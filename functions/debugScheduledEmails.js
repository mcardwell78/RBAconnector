// Debug script to check scheduled emails
const admin = require('firebase-admin');

// Initialize Firebase Admin (if not already initialized)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(require('./serviceAccountKey.json'))
  });
}

const db = admin.firestore();

async function checkScheduledEmails() {
  try {
    console.log('Checking scheduled emails...');
    
    // Get all scheduled emails
    const snapshot = await db.collection('scheduledEmails').limit(10).get();
    
    console.log(`Found ${snapshot.size} scheduled emails:`);
    
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      console.log(`ID: ${doc.id}`);
      console.log(`  User: ${data.userId}`);
      console.log(`  Contact: ${data.contactId}`);
      console.log(`  Campaign: ${data.campaignId}`);
      console.log(`  Step: ${data.stepNumber}`);
      console.log(`  Scheduled For: ${data.scheduledFor ? data.scheduledFor.toDate() : 'N/A'}`);
      console.log(`  Status: ${data.status}`);
      console.log(`  Created: ${data.createdAt ? data.createdAt.toDate() : 'N/A'}`);
      console.log('---');
    });
    
    // Check for emails scheduled in the next hour
    const nextHour = new Date();
    nextHour.setHours(nextHour.getHours() + 1);
    
    const upcomingSnapshot = await db.collection('scheduledEmails')
      .where('status', '==', 'pending')
      .where('scheduledFor', '<=', nextHour)
      .get();
    
    console.log(`\nEmails scheduled in next hour: ${upcomingSnapshot.size}`);
    
  } catch (error) {
    console.error('Error checking scheduled emails:', error);
  }
}

checkScheduledEmails();
