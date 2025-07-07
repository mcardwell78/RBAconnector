// One-time script to create user document for existing authenticated user
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function createCurrentUserDoc() {
  try {
    // Your current user ID from the console logs
    const userId = 'PgCYRmzRvBMKxlldWRGWld6ekaL2';
    const email = 'michaelcardwell@yahoo.com';
    
    // Check if user document already exists
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (userDoc.exists) {
      console.log('User document already exists:', userDoc.data());
      return;
    }
    
    // Create user document
    const userData = {
      uid: userId,
      email: email,
      name: 'Michael Cardwell', // You can change this to your preferred name
      displayName: 'Michael Cardwell',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    await db.collection('users').doc(userId).set(userData);
    console.log('Successfully created user document for:', email);
    console.log('User data:', userData);
    
  } catch (error) {
    console.error('Error creating user document:', error);
  }
}

createCurrentUserDoc()
  .then(() => {
    console.log('Script completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('Script failed:', error);
    process.exit(1);
  });
