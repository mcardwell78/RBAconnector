// Firestore CRUD for campaignEnrollments (per-contact campaign progress)
import { db } from './firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';

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
