// Firestore CRUD for campaigns
import { db } from './firebase';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, query, orderBy, where, getDoc } from 'firebase/firestore';

const campaignsCollection = collection(db, 'campaigns');

export async function getCampaigns() {
  const user = JSON.parse(localStorage.getItem('user'));
  if (!user?.uid) return [];
  const q = query(campaignsCollection, where('userId', '==', user.uid), orderBy('createdAt', 'desc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

export async function getCampaign(id) {
  const ref = doc(db, 'campaigns', id);
  const snap = await getDoc(ref);
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// Utility to remove undefined fields from an object (deep for arrays/objects)
function removeUndefinedFields(obj) {
  if (Array.isArray(obj)) {
    return obj.map(removeUndefinedFields);
  } else if (obj && typeof obj === 'object') {
    return Object.entries(obj).reduce((acc, [k, v]) => {
      if (v !== undefined) {
        acc[k] = removeUndefinedFields(v);
      }
      return acc;
    }, {});
  }
  return obj;
}

export async function addCampaign(data) {
  const user = JSON.parse(localStorage.getItem('user'));
  // Remove undefined fields before saving
  const cleanData = removeUndefinedFields({
    ...data,
    userId: user?.uid || null,
    createdAt: new Date(),
    status: 'active',
  });
  return await addDoc(campaignsCollection, cleanData);
}

export async function updateCampaign(id, data) {
  // Remove undefined fields before updating
  const cleanData = removeUndefinedFields(data);
  return await updateDoc(doc(campaignsCollection, id), cleanData);
}

export async function deleteCampaign(id) {
  return await deleteDoc(doc(campaignsCollection, id));
}

export async function getCampaignsSplit() {
  const user = JSON.parse(localStorage.getItem('user'));
  if (!user?.uid) return { privateCampaigns: [], publicCampaigns: [] };
  try {
    // Private campaigns (owned by user, not public)
    const privateQ = query(
      campaignsCollection,
      where('userId', '==', user.uid),
      where('public', '==', false),
      orderBy('createdAt', 'desc')
    );
    const privateSnap = await getDocs(privateQ);
    const privateCampaigns = privateSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    // Public campaigns (shared)
    const publicQ = query(
      campaignsCollection,
      where('public', '==', true),
      orderBy('createdAt', 'desc')
    );
    const publicSnap = await getDocs(publicQ);
    const publicCampaigns = publicSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return { privateCampaigns, publicCampaigns };
  } catch (err) {
    console.error('[getCampaignsSplit] Firestore error:', err);
    throw err;
  }
}
