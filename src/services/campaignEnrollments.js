// Firestore CRUD for campaignEnrollments (per-contact campaign progress)
import { db } from './firebase';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, query, where, getDoc, serverTimestamp } from 'firebase/firestore';

export async function getEnrollmentsForCampaign(campaignId) {
  const user = JSON.parse(localStorage.getItem('user'));
  if (!user?.uid) return [];
  const q = query(
    collection(db, 'campaignEnrollments'),
    where('campaignId', '==', campaignId),
    where('userId', '==', user.uid)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

// Accept reEnrollChoice as an optional second argument
export async function enrollContacts(campaignId, contactIds, reEnrollChoice = {}) {
  const user = JSON.parse(localStorage.getItem('user'));
  const userId = user?.uid || null;
  if (!userId) {
    return { enrolled: [], skipped: [], error: new Error('You are not logged in or your session has expired. Please log in again.') };
  }
  // Debug log for permissions troubleshooting
  console.log('enrollContacts debug:', { userId, campaignId, contactIds, reEnrollChoice });
  // Fetch existing enrollments for this campaign and user
  const q = query(
    collection(db, 'campaignEnrollments'),
    where('campaignId', '==', campaignId),
    where('userId', '==', userId)
  );
  const snapshot = await getDocs(q);
  // Map contactId to enrollment info
  const enrollmentMap = {};
  snapshot.docs.forEach(doc => {
    const d = doc.data();
    enrollmentMap[d.contactId] = { id: doc.id, status: d.status, currentStep: d.currentStep };
  });
  const alreadyEnrolled = new Set(Object.keys(enrollmentMap));
  const toEnroll = contactIds.filter(id => !alreadyEnrolled.has(id));
  const needsAction = contactIds.filter(id => alreadyEnrolled.has(id));
  // Log the keys and values for reEnrollChoice and enrollment state
  console.log('enrollContacts contactIds:', contactIds);
  console.log('enrollContacts alreadyEnrolled:', Array.from(alreadyEnrolled));
  console.log('enrollContacts needsAction:', needsAction);
  console.log('enrollContacts reEnrollChoice keys:', Object.keys(reEnrollChoice));
  const skipped = [];
  const results = [];
  let error = null;
  // Handle new enrollments
  for (const contactId of toEnroll) {
    try {
      // Optionally, fetch the contact and check userId matches
      const contactRef = doc(collection(db, 'contacts'), contactId);
      const contactSnap = await getDoc(contactRef);
      if (!contactSnap.exists) throw new Error(`Contact ${contactId} not found.`);
      const contactData = contactSnap.data();
      if (contactData.userId !== userId) throw new Error(`Contact ${contactId} does not belong to the current user.`);
      // Check for re-enroll choice
      let currentStep = 0;
      if (reEnrollChoice[contactId]?.mode === 'resume') {
        // Try to find the last incomplete step for this contact/campaign
        // (Assume the UI passes the correct step in reEnrollChoice[contactId].lastStep if needed)
        currentStep = reEnrollChoice[contactId].lastStep || 0;
      }
      const enrollmentData = {
        campaignId,
        contactId,
        userId,
        currentStep,
        status: 'active',
        lastAction: null,
        engagement: {},
        nextSend: null,
        createdAt: serverTimestamp(), // Ensure createdAt is set
      };
      try {
        const res = await addDoc(collection(db, 'campaignEnrollments'), enrollmentData);
        console.log(`[enrollContacts] Created new enrollment for contactId=${contactId}:`, res.id);
        results.push(res);
      } catch (e) {
        error = e;
        console.error(`[enrollContacts] Error creating enrollment for contactId=${contactId}:`, e);
        // Defensive: push error to results for visibility
        results.push({ error: e, contactId });
        break;
      }
    } catch (e) {
      error = e;
      break;
    }
  }
  // Handle re-enrollment for already enrolled contacts (withdrawn/completed)
  for (const contactId of needsAction) {
    const choice = reEnrollChoice[contactId];
    console.log(`[enrollContacts] For contactId=${contactId}, reEnrollChoice:`, choice);
    if (!choice) {
      console.log(`[enrollContacts] Skipping contactId=${contactId} (no reEnrollChoice)`);
      skipped.push(contactId);
      continue;
    }
    try {
      // Mark ALL previous enrollments as completed before re-enrolling
      const prevEnrollments = snapshot.docs.filter(docSnap => docSnap.data().contactId === contactId);
      for (const docSnap of prevEnrollments) {
        const prev = docSnap.data();
        if (prev.status !== 'completed') {
          await updateDoc(doc(collection(db, 'campaignEnrollments'), docSnap.id), { status: 'completed' });
          console.log(`[enrollContacts] Marked previous enrollment as completed for contactId=${contactId}, enrollmentId=${docSnap.id}`);
        } else {
          console.log(`[enrollContacts] Previous enrollment already completed for contactId=${contactId}, enrollmentId=${docSnap.id}`);
        }
      }
      // Create a new enrollment for re-enroll
      let currentStep = 0;
      if (choice.mode === 'resume') {
        currentStep = choice.lastStep || 0;
      }
      const enrollmentData = {
        campaignId,
        contactId,
        userId,
        currentStep,
        status: 'active',
        lastAction: null,
        engagement: {},
        nextSend: null,
        createdAt: serverTimestamp(), // Ensure createdAt is set
      };
      try {
        const res = await addDoc(collection(db, 'campaignEnrollments'), enrollmentData);
        console.log(`[enrollContacts] Created new enrollment for contactId=${contactId}:`, res.id);
        results.push(res);
      } catch (e) {
        error = e;
        console.error(`[enrollContacts] Error creating enrollment for contactId=${contactId}:`, e);
        // Defensive: push error to results for visibility
        results.push({ error: e, contactId });
        break;
      }
    } catch (e) {
      error = e;
      console.error(`[enrollContacts] Error re-enrolling contactId=${contactId}:`, e);
      break;
    }
  }
  // For contacts that need action (withdrawn/completed), return their enrollment info
  const reEnrollInfo = needsAction.map(id => ({
    contactId: id,
    enrollment: enrollmentMap[id] || null
  }));
  // Log the final result before returning
  console.log('[enrollContacts] Returning:', { enrolled: results.map(r => r.id), skipped, error, reEnrollInfo });
  // Defensive: If nothing was enrolled or updated, throw a clear error
  if (results.length === 0 && skipped.length === 0) {
    const msg = '[enrollContacts] No enrollments were created or updated. This may mean the contact is already enrolled, or the reEnrollChoice was missing or invalid.';
    console.error(msg, { contactIds, reEnrollChoice, alreadyEnrolled: Array.from(alreadyEnrolled), needsAction, toEnroll });
    return { enrolled: [], skipped, error: new Error(msg), reEnrollInfo };
  }
  if (error) {
    return { enrolled: results.map(r => r.id), skipped, error, reEnrollInfo };
  }
  return { enrolled: results.map(r => r.id), skipped, error: null, reEnrollInfo };
}

// Bulk enroll/queue contacts for a campaign
export async function bulkEnrollOrQueueContacts(campaignId, contactIds, options = {}) {
  // options: { queueIfAlreadyEnrolled: true, initialDelay: {value, unit, time}, stepDelays: [...] }
  const user = JSON.parse(localStorage.getItem('user'));
  const userId = user?.uid || null;
  if (!userId) {
    return { enrolled: [], queued: [], skipped: [], error: new Error('You are not logged in or your session has expired. Please log in again.') };
  }
  const q = query(
    collection(db, 'campaignEnrollments'),
    where('campaignId', '==', campaignId),
    where('userId', '==', userId)
  );
  const snapshot = await getDocs(q);
  const enrollmentMap = {};
  snapshot.docs.forEach(doc => {
    const d = doc.data();
    enrollmentMap[d.contactId] = { id: doc.id, status: d.status, currentStep: d.currentStep };
  });
  const alreadyEnrolled = new Set(Object.keys(enrollmentMap));
  const toEnroll = contactIds.filter(id => !alreadyEnrolled.has(id));
  const toQueue = options.queueIfAlreadyEnrolled ? contactIds.filter(id => alreadyEnrolled.has(id)) : [];
  const skipped = !options.queueIfAlreadyEnrolled ? contactIds.filter(id => alreadyEnrolled.has(id)) : [];
  const enrolled = [];
  const queued = [];
  let error = null;
  // Enroll new contacts as active
  for (const contactId of toEnroll) {
    try {
      const contactRef = doc(collection(db, 'contacts'), contactId);
      const contactSnap = await getDoc(contactRef);
      if (!contactSnap.exists) throw new Error(`Contact ${contactId} not found.`);
      const contactData = contactSnap.data();
      if (contactData.userId !== userId) throw new Error(`Contact ${contactId} does not belong to the current user.`);
      const enrollmentData = {
        campaignId,
        contactId,
        userId,
        currentStep: 0,
        status: 'active',
        lastAction: null,
        engagement: {},
        nextSend: null,
        createdAt: serverTimestamp(),
        stepDelays: options.stepDelays || undefined
      };
      const res = await addDoc(collection(db, 'campaignEnrollments'), enrollmentData);
      enrolled.push(res.id);
    } catch (e) {
      error = e;
      break;
    }
  }
  // Queue already-enrolled contacts if requested
  for (const contactId of toQueue) {
    try {
      const contactRef = doc(collection(db, 'contacts'), contactId);
      const contactSnap = await getDoc(contactRef);
      if (!contactSnap.exists) throw new Error(`Contact ${contactId} not found.`);
      const contactData = contactSnap.data();
      if (contactData.userId !== userId) throw new Error(`Contact ${contactId} does not belong to the current user.`);
      const enrollmentData = {
        campaignId,
        contactId,
        userId,
        currentStep: 0,
        status: 'queued',
        lastAction: null,
        engagement: {},
        nextSend: null,
        createdAt: serverTimestamp(),
        stepDelays: options.stepDelays || undefined,
        initialDelay: options.initialDelay || undefined
      };
      const res = await addDoc(collection(db, 'campaignEnrollments'), enrollmentData);
      queued.push(res.id);
    } catch (e) {
      error = e;
      break;
    }
  }
  return { enrolled, queued, skipped, error };
}

export async function updateEnrollment(id, data) {
  try {
    console.log('[updateEnrollment] id:', id, 'data:', data);
    const result = await updateDoc(doc(collection(db, 'campaignEnrollments'), id), data);
    console.log('[updateEnrollment] success:', result);
    return result;
  } catch (e) {
    console.error('[updateEnrollment] error:', e, 'id:', id, 'data:', data);
    throw e;
  }
}

export async function removeEnrollment(id) {
  return await deleteDoc(doc(collection(db, 'campaignEnrollments'), id));
}

// Get scheduled email stats for a campaign enrollment
export async function getScheduledEmailStatsForEnrollment(enrollmentId) {
  const user = JSON.parse(localStorage.getItem('user'));
  if (!user?.uid) return { sent: 0, total: 0, endDate: null };
  const q = query(
    collection(db, 'scheduledEmails'),
    where('campaignEnrollmentId', '==', enrollmentId),
    where('userId', '==', user.uid)
  );
  const snap = await getDocs(q);
  let sent = 0;
  let total = 0;
  let endDate = null;
  snap.docs.forEach(doc => {
    const d = doc.data();
    total++;
    if (d.status === 'sent') sent++;
    if (!endDate || (d.scheduledFor && d.scheduledFor.toDate && d.scheduledFor.toDate() > endDate)) {
      endDate = d.scheduledFor && d.scheduledFor.toDate ? d.scheduledFor.toDate() : endDate;
    }
  });
  return { sent, total, endDate };
}

// Get all enrollments for a contact (across all campaigns, for current user)
export async function getEnrollmentsForContact(contactId) {
  const user = JSON.parse(localStorage.getItem('user'));
  if (!user?.uid) return [];
  const q = query(
    collection(db, 'campaignEnrollments'),
    where('contactId', '==', contactId),
    where('userId', '==', user.uid)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}
