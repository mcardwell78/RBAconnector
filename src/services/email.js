import { httpsCallable } from 'firebase/functions';
import { functions, db } from './firebase';
import { collection, getDocs, query, where, orderBy, addDoc, serverTimestamp } from 'firebase/firestore';

export const sendOneOffEmail = httpsCallable(functions, 'sendOneOffEmail');
// Create a single scheduled email (for bulk actions)
export const createScheduledEmail = httpsCallable(functions, 'createScheduledEmail');
// Manual trigger for testing scheduled email processing
export const processScheduledEmailsNow = httpsCallable(functions, 'processScheduledEmailsNow');
// Debug function to check scheduled emails
export async function getScheduledEmails() {
  const user = JSON.parse(localStorage.getItem('user'));
  if (!user?.uid) throw new Error('No authenticated user');
  
  try {
    const q = query(
      collection(db, 'scheduledEmails'), 
      where('userId', '==', user.uid),
      orderBy('scheduledFor', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      scheduledFor: doc.data().scheduledFor?.toDate?.() || doc.data().scheduledFor
    }));
  } catch (error) {
    console.error('Error fetching scheduled emails:', error);
    throw error;
  }
}

// Debug function to check time handling
export function debugTimeHandling(scheduleDate, scheduleTime) {
  console.log('=== TIME DEBUG ===');
  console.log('Input scheduleDate:', scheduleDate);
  console.log('Input scheduleTime:', scheduleTime);
  
  // Method 1: Using Date constructor with string
  const method1 = new Date(scheduleDate);
  if (scheduleTime) {
    const [hours, minutes] = scheduleTime.split(':');
    method1.setHours(parseInt(hours), parseInt(minutes), 0, 0);
  }
  
  // Method 2: Using Date constructor with numbers
  const [year, month, day] = scheduleDate.split('-').map(Number);
  const method2 = new Date(year, month - 1, day);
  if (scheduleTime) {
    const [hours, minutes] = scheduleTime.split(':');
    method2.setHours(parseInt(hours), parseInt(minutes), 0, 0);
  }
  
  const now = new Date();
  
  console.log('Current time:', now.toISOString(), '(Local:', now.toLocaleString(), ')');
  console.log('Method 1 (string):', method1.toISOString(), '(Local:', method1.toLocaleString(), ')');
  console.log('Method 2 (numbers):', method2.toISOString(), '(Local:', method2.toLocaleString(), ')');
  console.log('Method 1 > now?', method1 > now);
  console.log('Method 2 > now?', method2 > now);
  console.log('Timezone offset:', now.getTimezoneOffset(), 'minutes');
  
  return { method1, method2, now };
}

// Make it available globally for testing
window.debugTimeHandling = debugTimeHandling;

// Schedules campaign step emails in the scheduledEmails collection
export const createCampaignScheduledEmails = httpsCallable(functions, 'createCampaignScheduledEmails');
export const withdrawCampaignEnrollment = httpsCallable(functions, 'withdrawCampaignEnrollment');

export async function getTemplates() {
  const user = JSON.parse(localStorage.getItem('user'));
  try {
    console.log('[getTemplates] user:', user);
    if (!user || !user.uid) {
      console.error('[getTemplates] ERROR: No authenticated user found!');
      throw new Error('No authenticated user found');
    }
    const q = query(collection(db, 'emailTemplates'), where('userId', '==', user.uid), orderBy('createdAt', 'desc'));
    console.log('[getTemplates] query:', q);
    const snapshot = await getDocs(q);
    console.log('[getTemplates] snapshot:', snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (err) {
    console.error('[getTemplates] error:', err);
    throw err;
  }
}

export async function getEmailLogs() {
  const user = JSON.parse(localStorage.getItem('user'));
  try {
    console.log('[getEmailLogs] user:', user);
    const q = query(collection(db, 'emailLogs'), where('userId', '==', user.uid));
    console.log('[getEmailLogs] query:', q);
    const snapshot = await getDocs(q);
    console.log('[getEmailLogs] snapshot:', snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (err) {
    console.error('[getEmailLogs] error:', err);
    throw err;
  }
}

export async function addEmailTemplate(data) {
  const user = JSON.parse(localStorage.getItem('user'));
  try {
    console.log('[addEmailTemplate] user:', user, 'data:', data);
    const result = await addDoc(collection(db, 'emailTemplates'), {
      ...data,
      userId: user?.uid || null,
      createdAt: serverTimestamp(),
    });
    console.log('[addEmailTemplate] result:', result);
    return result;
  } catch (err) {
    console.error('[addEmailTemplate] error:', err);
    throw err;
  }
}

export async function getTemplatesSplit() {
  const user = JSON.parse(localStorage.getItem('user'));
  if (!user?.uid) return { privateTemplates: [], publicTemplates: [] };
  try {
    // Private templates (owned by user, not public)
    const privateQ = query(
      collection(db, 'emailTemplates'),
      where('userId', '==', user.uid),
      where('public', '==', false)
    );
    const privateSnap = await getDocs(privateQ);
    const privateTemplates = privateSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Public templates (shared)
    const publicQ = query(
      collection(db, 'emailTemplates'),
      where('public', '==', true)
    );
    const publicSnap = await getDocs(publicQ);
    const publicTemplates = publicSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    return { privateTemplates, publicTemplates };
  } catch (err) {
    console.error('[getTemplatesSplit] Firestore error:', err);
    throw err;
  }
}

// --- Add helper to get next scheduled email for a campaign enrollment ---
export async function getNextScheduledEmailForEnrollment(enrollmentId) {
  // Returns the next scheduled email doc (status 'pending' or 'scheduled') for a given enrollmentId, or null if none
  const user = JSON.parse(localStorage.getItem('user'));
  if (!user?.uid) return null;
  const q = query(
    collection(db, 'scheduledEmails'),
    where('campaignEnrollmentId', '==', enrollmentId),
    where('userId', '==', user.uid),
    where('status', 'in', ['pending', 'scheduled'])
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  // Find the earliest scheduledFor date
  let nextEmail = null;
  snap.docs.forEach(doc => {
    const data = doc.data();
    if (!nextEmail || (data.scheduledFor && data.scheduledFor.seconds < nextEmail.scheduledFor.seconds)) {
      nextEmail = { id: doc.id, ...data };
    }
  });
  return nextEmail;
}

// HTTP fallback for createScheduledEmail (in case callable function has CORS issues)
export async function createScheduledEmailHTTP(emailData) {
  console.log('[createScheduledEmailHTTP] Starting with data:', emailData);
  
  const user = JSON.parse(localStorage.getItem('user'));
  if (!user?.uid) {
    console.error('[createScheduledEmailHTTP] No authenticated user');
    throw new Error('No authenticated user');
  }
  
  console.log('[createScheduledEmailHTTP] User:', user);
  
  // Get Firebase auth token
  const { getAuth } = await import('firebase/auth');
  const auth = getAuth();
  const currentUser = auth.currentUser;
  
  console.log('[createScheduledEmailHTTP] Current user:', currentUser?.uid);
  
  if (!currentUser) {
    console.error('[createScheduledEmailHTTP] No current user');
    throw new Error('No current user');
  }
  
  const token = await currentUser.getIdToken();
  console.log('[createScheduledEmailHTTP] Got token:', token ? 'Yes' : 'No');
  
  if (!token) {
    console.error('[createScheduledEmailHTTP] No authentication token');
    throw new Error('No authentication token');
  }
  
  const url = 'https://us-central1-dc-power-connector.cloudfunctions.net/createScheduledEmailHTTP';
  console.log('[createScheduledEmailHTTP] Calling:', url);
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(emailData)
    });
    
    console.log('[createScheduledEmailHTTP] Response status:', response.status);
    console.log('[createScheduledEmailHTTP] Response ok:', response.ok);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[createScheduledEmailHTTP] Error response:', errorText);
      let error;
      try {
        error = JSON.parse(errorText);
      } catch (e) {
        error = { error: errorText };
      }
      throw new Error(error.error || 'Failed to create scheduled email');
    }
    
    const result = await response.json();
    console.log('[createScheduledEmailHTTP] Success:', result);
    return result;
  } catch (fetchError) {
    console.error('[createScheduledEmailHTTP] Fetch error:', fetchError);
    throw fetchError;
  }
}

// Temporary fallback: create scheduled email directly in Firestore
export async function createScheduledEmailDirectly(emailData) {
  console.log('[createScheduledEmailDirectly] Starting with data:', emailData);
  
  const { getAuth } = await import('firebase/auth');
  const { addDoc, collection, serverTimestamp } = await import('firebase/firestore');
  
  const auth = getAuth();
  const currentUser = auth.currentUser;
  
  if (!currentUser) {
    throw new Error('No authenticated user');
  }
  
  // Validate sendAt is in the future
  const scheduledDate = new Date(emailData.sendAt);
  const now = new Date();
  const bufferTime = new Date(now.getTime() + 30000); // 30 second buffer
  
  console.log('[createScheduledEmailDirectly] Scheduled date:', scheduledDate.toISOString());
  console.log('[createScheduledEmailDirectly] Current time:', now.toISOString());
  console.log('[createScheduledEmailDirectly] Is valid?', !isNaN(scheduledDate.getTime()) && scheduledDate > bufferTime);
  
  if (isNaN(scheduledDate.getTime()) || scheduledDate <= bufferTime) {
    throw new Error('sendAt must be a valid future date (at least 30 seconds from now)');
  }
  
  // Create scheduled email document directly in Firestore
  const scheduledEmail = {
    userId: currentUser.uid,
    contactId: emailData.contactId || null,
    templateId: emailData.templateId || null,
    to: emailData.to,
    subject: emailData.subject,
    body: emailData.body,
    scheduledFor: scheduledDate,
    status: 'pending',
    createdAt: serverTimestamp(),
    type: 'oneoff'
  };
  
  try {
    const docRef = await addDoc(collection(db, 'scheduledEmails'), scheduledEmail);
    console.log('[createScheduledEmailDirectly] Created scheduled email:', docRef.id, 'for', scheduledDate.toISOString());
    
    return { 
      success: true, 
      scheduledEmailId: docRef.id,
      scheduledFor: scheduledDate.toISOString()
    };
  } catch (error) {
    console.error('[createScheduledEmailDirectly] Error:', error);
    throw new Error('Failed to create scheduled email: ' + error.message);
  }
}

// Debug function to check scheduled emails status and logs
export async function debugScheduledEmails() {
  console.log('=== DEBUGGING SCHEDULED EMAILS ===');
  
  try {
    const { query, collection, getDocs, orderBy, limit } = await import('firebase/firestore');
    
    // Get recent scheduled emails
    const scheduledQuery = query(
      collection(db, 'scheduledEmails'),
      orderBy('createdAt', 'desc'),
      limit(10)
    );
    
    const scheduledSnapshot = await getDocs(scheduledQuery);
    console.log('📧 Recent Scheduled Emails:');
    
    scheduledSnapshot.forEach(doc => {
      const data = doc.data();
      console.log(`ID: ${doc.id}`);
      console.log(`To: ${data.to}`);
      console.log(`Subject: ${data.subject}`);
      console.log(`Status: ${data.status}`);
      console.log(`Scheduled For: ${data.scheduledFor?.toDate?.() || data.scheduledFor}`);
      console.log(`Created At: ${data.createdAt?.toDate?.() || data.createdAt}`);
      if (data.sentAt) console.log(`Sent At: ${data.sentAt?.toDate?.() || data.sentAt}`);
      if (data.failedAt) console.log(`Failed At: ${data.failedAt?.toDate?.() || data.failedAt}`);
      if (data.error) console.log(`Error: ${data.error}`);
      console.log('---');
    });
    
    // Get recent email logs to see if any were sent
    const logsQuery = query(
      collection(db, 'emailLogs'),
      orderBy('timestamp', 'desc'),
      limit(5)
    );
    
    const logsSnapshot = await getDocs(logsQuery);
    console.log('📨 Recent Email Logs:');
    
    logsSnapshot.forEach(doc => {
      const data = doc.data();
      console.log(`ID: ${doc.id}`);
      console.log(`To: ${data.to}`);
      console.log(`Subject: ${data.subject}`);
      console.log(`Status: ${data.status}`);
      console.log(`Sent At: ${data.timestamp?.toDate?.() || data.timestamp}`);
      if (data.scheduledEmailId) console.log(`Scheduled Email ID: ${data.scheduledEmailId}`);
      console.log('---');
    });
    
  } catch (error) {
    console.error('Error debugging scheduled emails:', error);
  }
}

// Manual trigger to test scheduled email processing
export async function triggerScheduledEmailProcessing() {
  console.log('[triggerScheduledEmailProcessing] Starting manual trigger...');
  
  try {
    const result = await processScheduledEmailsNow();
    console.log('[triggerScheduledEmailProcessing] Result:', result);
    return result;
  } catch (error) {
    console.error('[triggerScheduledEmailProcessing] Error:', error);
    throw error;
  }
}

// Debug SendGrid configuration
export const debugSendGridConfig = httpsCallable(functions, 'debugSendGridConfig');
