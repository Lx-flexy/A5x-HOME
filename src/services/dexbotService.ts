import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  setDoc,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';

export interface DexBot {
  id: string;
  dexBotId: string;
  ownerId: string;
  status: 'connected' | 'disconnected';
  linkedDevice: string;
  connectedAt?: unknown;
}

export async function connectDexBot(dexBotId: string, ownerId: string, linkedDevice: string) {
  const ref = doc(db, 'dex_bots', dexBotId);
  await setDoc(ref, {
    dexBotId,
    ownerId,
    status: 'connected',
    linkedDevice,
    connectedAt: serverTimestamp(),
  });
}

export async function disconnectDexBot(dexBotId: string) {
  await updateDoc(doc(db, 'dex_bots', dexBotId), {
    status: 'disconnected',
  });
}

export async function getUserDexBots(ownerId: string): Promise<DexBot[]> {
  const q = query(collection(db, 'dex_bots'), where('ownerId', '==', ownerId));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as DexBot));
}

export async function getDexBot(dexBotId: string): Promise<DexBot | null> {
  const snap = await getDoc(doc(db, 'dex_bots', dexBotId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as DexBot;
}
