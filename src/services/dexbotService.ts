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
import DexbotBridge from './DexbotBridge';

export interface DexBot {
  id: string;
  dexBotId: string;
  ownerId: string;
  status: 'connected' | 'disconnected';
  linkedDevice: string;
  connectedAt?: unknown;
}

/**
 * Dexbot Firebase (Realtime DB) mein bot ID verify karta hai.
 * registered_bots/{botId} node check karta hai — Firestore nahi.
 */
export async function verifyDexBotExists(dexBotId: string): Promise<boolean> {
  const botData = await DexbotBridge.verifyDexbotId(dexBotId);
  return botData !== null;
}

export async function connectDexBot(dexBotId: string, ownerId: string, linkedDevice: string) {
  // Step 1: Dexbot Firebase (Realtime DB) mein verify karo
  const botData = await DexbotBridge.verifyDexbotId(dexBotId);
  if (!botData) {
    throw new Error('BOT_NOT_FOUND');
  }

  // Step 2: HA Realtime DB mein linked_bots mein save karo
  await DexbotBridge.linkDexbot(dexBotId, botData);

  // Step 3: HA Firestore mein bhi dex_bots record update karo (existing flow)
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
