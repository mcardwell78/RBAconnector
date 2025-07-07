// Simple script to check scheduled emails in Firebase
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';

// Your Firebase config
const firebaseConfig = {
  // Add your config here
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function checkScheduledEmails() {
  try {
    console.log('Checking scheduled emails...');
    
    // Get recent scheduled emails
    const q = query(
      collection(db, 'scheduledEmails'),
      orderBy('createdAt', 'desc'),
      limit(10)
    );
    
    const snapshot = await getDocs(q);
    console.log(`Found ${snapshot.size} recent scheduled emails:`);
    
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      console.log(`${doc.id}:`, {
        userId: data.userId,
        contactId: data.contactId,
        campaignId: data.campaignId,
        step: data.stepNumber,
        scheduledFor: data.scheduledFor?.toDate(),
        status: data.status,
        subject: data.subject?.substring(0, 50)
      });
    });
    
    // Check for pending emails
    const pendingQ = query(
      collection(db, 'scheduledEmails'),
      where('status', '==', 'pending'),
      limit(5)
    );
    
    const pendingSnapshot = await getDocs(pendingQ);
    console.log(`\nPending emails: ${pendingSnapshot.size}`);
    
  } catch (error) {
    console.error('Error:', error);
  }
}

// Uncomment to run:
// checkScheduledEmails();
