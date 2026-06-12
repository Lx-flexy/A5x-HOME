import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  query,
  where,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { db } from './firebase';

export interface Member {
  id: string;
  deviceId: string;
  userId: string;
  name: string;
  role: 'owner' | 'member';
  joinedAt: unknown;
}

export async function addMember(data: Omit<Member, 'id' | 'joinedAt'>) {
  return addDoc(collection(db, 'members'), {
    ...data,
    joinedAt: serverTimestamp(),
  });
}

export async function getDeviceMembers(deviceId: string): Promise<Member[]> {
  const q = query(collection(db, 'members'), where('deviceId', '==', deviceId));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Member));
}

export async function removeMember(memberId: string) {
  await deleteDoc(doc(db, 'members', memberId));
}

export async function updateMemberRole(memberId: string, role: 'owner' | 'member') {
  await updateDoc(doc(db, 'members', memberId), { role });
}
