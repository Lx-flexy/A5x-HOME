/**
 * DexbotBridge — Home Automation project ke liye
 * Dexbot Firebase (Realtime DB) se bot ID verify karta hai,
 * phir HA Firebase (Realtime DB) mein linked_bots mein save karta hai.
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getDatabase, ref, get, set, remove, onValue, off, DataSnapshot } from 'firebase/database';

// ── Dexbot Firebase config (read-only — bot verify karne ke liye) ─────────────
const DEXBOT_CONFIG = {
  apiKey:            import.meta.env.VITE_DEXBOT_API_KEY,
  authDomain:        import.meta.env.VITE_DEXBOT_AUTH_DOMAIN,
  databaseURL:       import.meta.env.VITE_DEXBOT_DATABASE_URL,
  projectId:         import.meta.env.VITE_DEXBOT_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_DEXBOT_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_DEXBOT_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_DEXBOT_APP_ID,
};

// ── HA Firebase config (read + write) ────────────────────────────────────────
const HA_CONFIG = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL:       import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

// ── Firebase app initialize (duplicate avoid karne ke liye) ──────────────────
function getOrCreate(name: string, config: object) {
  return getApps().find((a) => a.name === name)
    ? getApp(name)
    : initializeApp(config, name);
}

const _dexbotDb = getDatabase(getOrCreate('dexbot-reader', DEXBOT_CONFIG));
const _haDb     = getDatabase(getOrCreate('home-auto',     HA_CONFIG));

// ── Types ─────────────────────────────────────────────────────────────────────
export interface DexbotInfo {
  botId: string;
  name?: string;
  ip?: string;
  ownerUid?: string;
}

export interface LinkedBot extends DexbotInfo {
  linkedAt: number;
}

// ── DexbotBridge Service ──────────────────────────────────────────────────────
const DexbotBridge = {
  /**
   * Dexbot Firebase mein bot ID exist karta hai check karo.
   * registered_bots/{botId} node read karta hai.
   */
  async verifyDexbotId(botId: string): Promise<DexbotInfo | null> {
    const snap = await get(ref(_dexbotDb, `registered_bots/${botId}`));
    if (!snap.exists()) return null;
    return { botId, ...snap.val() };
  },

  /**
   * HA Firebase mein dexbot bot ko link karo.
   * linked_bots/{botId} mein bot info save karta hai.
   */
  async linkDexbot(botId: string, botData: DexbotInfo): Promise<void> {
    await set(ref(_haDb, `linked_bots/${botId}`), {
      botId,
      name:     botData.name     ?? botId,
      ip:       botData.ip       ?? '',
      ownerUid: botData.ownerUid ?? '',
      linkedAt: Date.now(),
    });
  },

  /**
   * HA Firebase se check karo — ye bot pehle se linked hai?
   */
  async isAlreadyLinked(botId: string): Promise<boolean> {
    const snap = await get(ref(_haDb, `linked_bots/${botId}`));
    return snap.exists();
  },

  /**
   * Saare linked dexbots fetch karo.
   */
  async getLinkedBots(): Promise<LinkedBot[]> {
    const snap = await get(ref(_haDb, 'linked_bots'));
    if (!snap.exists()) return [];
    return Object.entries(snap.val() as Record<string, LinkedBot>).map(
      ([botId, data]) => ({ botId, ...data })
    );
  },

  /**
   * Real-time listener — linked bots change hone pe callback fire hoga.
   * Returns unsubscribe function.
   */
  listenToLinkedBots(callback: (bots: LinkedBot[]) => void): () => void {
    const r = ref(_haDb, 'linked_bots');
    const handler = (snap: DataSnapshot) => {
      if (!snap.exists()) { callback([]); return; }
      callback(
        Object.entries(snap.val() as Record<string, LinkedBot>).map(
          ([botId, data]) => ({ botId, ...data })
        )
      );
    };
    onValue(r, handler);
    return () => off(r, 'value', handler);
  },

  /**
   * Bot unlink karo HA DB se.
   */
  async unlinkDexbot(botId: string): Promise<void> {
    await remove(ref(_haDb, `linked_bots/${botId}`));
  },
};

export default DexbotBridge;
