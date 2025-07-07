import { db } from './firebase';
import { collection, getDocs, query, where, doc, getDoc, addDoc, updateDoc, deleteDoc } from 'firebase/firestore';

export async function getTasks() {
  const user = JSON.parse(localStorage.getItem('user'));
  if (!user?.uid) return [];
  const q = query(collection(db, 'tasks'), where('userId', '==', user.uid));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

export async function getTask(id) {
  const ref = doc(db, 'tasks', id);
  const snap = await getDoc(ref);
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function addTask(data) {
  const user = JSON.parse(localStorage.getItem('user'));
  return addDoc(collection(db, 'tasks'), {
    ...data,
    userId: user?.uid || null,
    createdAt: new Date(),
  });
}

export async function updateTask(id, data) {
  return updateDoc(doc(db, 'tasks', id), data);
}

export async function deleteTask(id) {
  return deleteDoc(doc(db, 'tasks', id));
}
