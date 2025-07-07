// Service for contacts CRUD
import { db } from './firebase';
import { collection, getDocs, query, where, doc, getDoc, addDoc, updateDoc, deleteDoc } from 'firebase/firestore';

export async function getContacts() {
  const user = JSON.parse(localStorage.getItem('user'));
  if (!user?.uid) return [];
  const q = query(collection(db, 'contacts'), where('userId', '==', user.uid));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

export async function getContact(id) {
  const ref = doc(db, 'contacts', id);
  const snap = await getDoc(ref);
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function addContact(data) {
  const user = JSON.parse(localStorage.getItem('user'));
  return addDoc(collection(db, 'contacts'), {
    ...data,
    userId: user?.uid || null,
    createdAt: new Date(),
  });
}

export async function updateContact(id, data) {
  return updateDoc(doc(db, 'contacts', id), data);
}

export async function deleteContact(id) {
  return deleteDoc(doc(db, 'contacts', id));
}

// Find existing contacts by email or phone for the current user
export async function findExistingContacts(contacts) {
  const user = JSON.parse(localStorage.getItem('user'));
  if (!user?.uid) return [];
  // Normalize all emails and phones for deduplication
  const emails = contacts.map(c => (c.email || '').trim().toLowerCase()).filter(Boolean);
  const mobilePhones = contacts.map(c => (c.mobilePhone || '').replace(/\D/g, '')).filter(Boolean);
  const homePhones = contacts.map(c => (c.homePhone || '').replace(/\D/g, '')).filter(Boolean);
  let found = [];
  // Batch Firestore 'in' queries in chunks of 10
  function chunk(arr, size) {
    const res = [];
    for (let i = 0; i < arr.length; i += size) res.push(arr.slice(i, i + size));
    return res;
  }
  for (const batch of chunk(emails, 10)) {
    const q = query(collection(db, 'contacts'), where('userId', '==', user.uid), where('email', 'in', batch));
    const snap = await getDocs(q);
    found = found.concat(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
  }
  for (const batch of chunk(mobilePhones, 10)) {
    const q = query(collection(db, 'contacts'), where('userId', '==', user.uid), where('mobilePhone', 'in', batch));
    const snap = await getDocs(q);
    found = found.concat(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
  }
  for (const batch of chunk(homePhones, 10)) {
    const q = query(collection(db, 'contacts'), where('userId', '==', user.uid), where('homePhone', 'in', batch));
    const snap = await getDocs(q);
    found = found.concat(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
  }
  // Remove duplicates by id
  const unique = {};
  for (const c of found) unique[c.id] = c;
  return Object.values(unique);
}

// Update last contacted date for a contact
export async function updateContactLastContacted(contactId, date = new Date()) {
  return updateDoc(doc(db, 'contacts', contactId), {
    lastContacted: date
  });
}

// Bulk update last contacted dates for multiple contacts
export async function updateMultipleContactsLastContacted(contactIds, date = new Date()) {
  const updates = contactIds.map(id => 
    updateDoc(doc(db, 'contacts', id), { lastContacted: date })
  );
  return Promise.all(updates);
}
