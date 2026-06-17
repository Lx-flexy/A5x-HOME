import {
  collection,
  doc,
  getDocs,
  updateDoc,
  setDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import DexbotBridge from './DexbotBridge';
import DexbotChatService from './dexbotChatService';

export interface DexBot {
  id: string;
  dexBotId: string;
  ownerId: string;
  status: 'connected' | 'disconnected';
  linkedDevice: string;
  currentMessage: string;
  currentEmotion: string;
  updatedAt?: Timestamp | null;
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

  // Step 3: Save in HA Firestore with full MVP document structure
  const docRef = doc(db, 'dex_bots', dexBotId);
  await setDoc(docRef, {
    dexBotId,
    ownerId,
    status: 'connected',
    linkedDevice: linkedDevice || '',
    currentMessage: '',
    currentEmotion: 'normal',
    connectedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
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
    updatedAt: serverTimestamp(),
  });

  console.log('[dexbotService] disconnectDexBot success:', dexBotId);
}

export async function getUserDexBots(ownerId: string): Promise<DexBot[]> {
  const q = query(collection(db, 'dex_bots'), where('ownerId', '==', ownerId));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as DexBot));
}

/**
 * Realtime listener for a single bot document.
 * Returns an unsubscribe function.
 */
export function subscribeToDexBot(
  dexBotId: string,
  callback: (bot: DexBot | null) => void
): () => void {
  const docRef = doc(db, 'dex_bots', dexBotId);
  return onSnapshot(docRef, (snap) => {
    if (!snap.exists()) { callback(null); return; }
    callback({ id: snap.id, ...snap.data() } as DexBot);
  });
}

/**
 * Send a message to the Dex Bot display screen.
 *
 * ROOT CAUSE (from reading actual Dex Bot source — Firebase_Manager.js):
 *
 *   The Dex Bot software sends messages via TWO steps:
 *     1. RTDB write: push(bots/{from}/messages) + set(bots/{to}/inbox/{sameKey})
 *     2. HTTP POST:  POST http://{botIp}/api/message/send { message, from }
 *
 *   Step 2 is what TRIGGERS the display. The RTDB write alone does nothing
 *   visible — it's just the message log. The firmware renders via HTTP.
 *
 *   Emotion also uses HTTP: POST /api/emotion { emotion }
 *   Emotion "worked" only because the firmware independently polls
 *   bots/{botId}/emotion from RTDB — not because the web app wrote it.
 *
 * This function delegates to DexbotChatService.sendDisplayText() which
 * performs both the RTDB write and the HTTP POST to the bot's IP.
 */
export async function sendBotMessage(dexBotId: string, message: string): Promise<void> {
  console.log(`[dexbotService] sendBotMessage ─────────────────────────────────`);
  console.log(`[dexbotService]   botId   : "${dexBotId}"`);
  console.log(`[dexbotService]   message : "${message}"`);

  // ── 1. RTDB write + HTTP POST to bot (the actual display trigger) ───────────
  await DexbotChatService.sendDisplayText(dexBotId, message);
  console.log(`[dexbotService] ✅ sendDisplayText complete`);

  // ── 2. Update HA Firestore dashboard state ──────────────────────────────────
  await updateDoc(doc(db, 'dex_bots', dexBotId), {
    currentMessage: message,
    updatedAt: serverTimestamp(),
  });
  console.log(`[dexbotService] ✅ Firestore dex_bots/${dexBotId}/currentMessage updated`);
}

/**
 * Update the bot's current emotion — writes to:
 *   1. HA Firestore  dex_bots/{dexBotId}/currentEmotion  (dashboard state)
 *   2. Dexbot RTDB   bots/{dexBotId}/emotion             (ESP32 realtime listener)
 *
 * Step 2 is what actually reaches the bot — the RTDB write is handled by
 * DexbotChatService.setEmotion() which targets the Dexbot Firebase project.
 */
export async function updateBotEmotion(dexBotId: string, emotion: string): Promise<void> {
  console.log(`[dexbotService] updateBotEmotion — botId="${dexBotId}" emotion="${emotion}"`);

  // ── 1. Write to HA Firestore (dashboard state) ─────────────────────────────
  await updateDoc(doc(db, 'dex_bots', dexBotId), {
    currentEmotion: emotion,
    updatedAt: serverTimestamp(),
  });
  console.log(`[dexbotService] ✅ Firestore updated — dex_bots/${dexBotId}/currentEmotion = "${emotion}"`);

  // ── 2. Write to Dexbot RTDB — this is what the ESP32 actually listens to ───
  await DexbotChatService.setEmotion(dexBotId, emotion);
  console.log(`[dexbotService] ✅ Dexbot RTDB updated — bots/${dexBotId}/emotion = "${emotion}"`);
}
