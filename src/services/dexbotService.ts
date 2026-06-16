import {
  collection,
  doc,
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
 * Connect flow:
 * 1. Dexbot RTDB ke registered_bots/{botId} mein verify karo
 * 2. HA RTDB ke linked_bots/{botId} mein save karo
 * 3. HA Firestore ke dex_bots/{botId} mein record rakho
 */
export async function connectDexBot(
  dexBotId: string,
  ownerId: string,
  linkedDevice: string
): Promise<void> {
  console.log('[dexbotService] connectDexBot called:', { dexBotId, ownerId, linkedDevice });

  // Step 1: Verify in Dexbot Firebase
  const botData = await DexbotBridge.verifyDexbotId(dexBotId);
  if (!botData) {
    throw new Error('BOT_NOT_FOUND');
  }

  // Step 2: Link in HA RTDB
  await DexbotBridge.linkDexbot(dexBotId, botData);

  // Step 3: Save in HA Firestore (linkedDevice can be empty string if no device)
  const docRef = doc(db, 'dex_bots', dexBotId);
  await setDoc(docRef, {
    dexBotId,
    ownerId,
    status: 'connected',
    linkedDevice: linkedDevice || '',
    connectedAt: serverTimestamp(),
  }, { merge: true });

  console.log('[dexbotService] connectDexBot success:', dexBotId);
}

export async function disconnectDexBot(dexBotId: string): Promise<void> {
  // Remove from HA RTDB
  await DexbotBridge.unlinkDexbot(dexBotId).catch(err =>
    console.warn('[dexbotService] unlinkDexbot warning:', err)
  );

  // Update Firestore status
  await updateDoc(doc(db, 'dex_bots', dexBotId), {
    status: 'disconnected',
  });

  console.log('[dexbotService] disconnectDexBot success:', dexBotId);
}

export async function getUserDexBots(ownerId: string): Promise<DexBot[]> {
  const q = query(collection(db, 'dex_bots'), where('ownerId', '==', ownerId));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as DexBot));
}
