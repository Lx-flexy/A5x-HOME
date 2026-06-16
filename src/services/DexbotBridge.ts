/**
 * DexbotBridge
 * - Dexbot Firebase RTDB se bot ID verify karta hai (registered_bots/{botId})
 * - HA Firebase RTDB mein linked_bots/{botId} mein save karta hai
 */

import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  getDatabase,
  ref,
  get,
  set,
  remove,
  onValue,
  off,
  DataSnapshot,
  Database,
} from 'firebase/database';

// ── Dexbot Firebase config ────────────────────────────────────────────────────
const DEXBOT_CONFIG = {
  apiKey:            import.meta.env.VITE_DEXBOT_API_KEY        as string,
  authDomain:        import.meta.env.VITE_DEXBOT_AUTH_DOMAIN    as string,
  databaseURL:       import.meta.env.VITE_DEXBOT_DATABASE_URL   as string,
  projectId:         import.meta.env.VITE_DEXBOT_PROJECT_ID     as string,
  storageBucket:     import.meta.env.VITE_DEXBOT_STORAGE_BUCKET as string,
  messagingSenderId: import.meta.env.VITE_DEXBOT_MESSAGING_SENDER_ID as string,
  appId:             import.meta.env.VITE_DEXBOT_APP_ID         as string,
};

// ── HA Firebase config ────────────────────────────────────────────────────────
const HA_CONFIG = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY            as string,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN        as string,
  databaseURL:       import.meta.env.VITE_FIREBASE_DATABASE_URL       as string,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID         as string,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET     as string,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID             as string,
};

// ── Safe app init ─────────────────────────────────────────────────────────────
function getOrCreateApp(name: string, config: object): FirebaseApp {
  const existing = getApps().find(a => a.name === name);
  return existing ?? initializeApp(config, name);
}

// ── DB instances ──────────────────────────────────────────────────────────────
let _dexbotDb: Database;
let _haDb: Database;

function getDexbotDb(): Database {
  if (!_dexbotDb) {
    if (!DEXBOT_CONFIG.databaseURL) {
      throw new Error('[DexbotBridge] VITE_DEXBOT_DATABASE_URL is not set in .env');
    }
    const app = getOrCreateApp('dexbot-reader', DEXBOT_CONFIG);
    _dexbotDb = getDatabase(app);
  }
  return _dexbotDb;
}

function getHaDb(): Database {
  if (!_haDb) {
    if (!HA_CONFIG.databaseURL) {
      throw new Error('[DexbotBridge] VITE_FIREBASE_DATABASE_URL is not set in .env');
    }
    const app = getOrCreateApp('ha-bridge', HA_CONFIG);
    _haDb = getDatabase(app);
  }
  return _haDb;
}

// ── Types ─────────────────────────────────────────────────────────────────────
export interface DexbotInfo {
  botId: string;
  name?: string;
  ip?: string;
  ownerUid?: string;
  [key: string]: unknown;
}

export interface LinkedBot extends DexbotInfo {
  linkedAt: number;
}

// ── Bridge ────────────────────────────────────────────────────────────────────
const DexbotBridge = {

  /**
   * Dexbot RTDB mein bot ID dhundho — case-insensitive.
   * registered_bots/ aur bots/ dono check karta hai.
   * DB keys lowercase hain (dex_1, dex2) — input ka case ignore karo.
   */
  async verifyDexbotId(botId: string): Promise<DexbotInfo | null> {
    try {
      const db  = getDexbotDb();
      const key = botId.trim(); // original case preserve
      console.log(`[DexbotBridge] Verifying bot ID: "${key}"`);

      // Helper: try exact + lowercase + uppercase variants
      const tryPaths = async (root: string): Promise<DexbotInfo | null> => {
        const variants = [key, key.toLowerCase(), key.toUpperCase()];
        for (const v of variants) {
          const snap = await get(ref(db, `${root}/${v}`));
          console.log(`[DexbotBridge] ${root}/${v} exists:`, snap.exists());
          if (snap.exists()) {
            const data = snap.val();
            console.log('[DexbotBridge] Found bot data:', data);
            // Return with the actual matched key so linking uses correct casing
            return { botId: v, ...(typeof data === 'object' && data !== null ? data : {}) };
          }
        }

        // Last resort: fetch entire root and do case-insensitive key compare
        const allSnap = await get(ref(db, root));
        if (allSnap.exists()) {
          const all = allSnap.val() as Record<string, unknown>;
          const matchedKey = Object.keys(all).find(
            k => k.toLowerCase() === key.toLowerCase()
          );
          if (matchedKey) {
            const data = all[matchedKey];
            console.log(`[DexbotBridge] Case-insensitive match: ${root}/${matchedKey}`, data);
            return { botId: matchedKey, ...(typeof data === 'object' && data !== null ? data : {}) };
          }
        }
        return null;
      };

      // Try registered_bots first, then bots/ as fallback
      const result = (await tryPaths('registered_bots')) ?? (await tryPaths('bots'));
      if (!result) console.warn(`[DexbotBridge] Bot "${key}" not found in registered_bots/ or bots/`);
      return result;
    } catch (err) {
      console.error('[DexbotBridge] verifyDexbotId error:', err);
      throw err;
    }
  },

  /**
   * HA RTDB mein linked_bots/{botId} mein save karo.
   */
  async linkDexbot(botId: string, botData: DexbotInfo): Promise<void> {
    try {
      const db = getHaDb();
      await set(ref(db, `linked_bots/${botId}`), {
        botId,
        name:     (botData.name as string)     ?? botId,
        ip:       (botData.ip as string)       ?? '',
        ownerUid: (botData.ownerUid as string) ?? '',
        linkedAt: Date.now(),
      });
      console.log(`[DexbotBridge] Linked bot "${botId}" in HA RTDB`);
    } catch (err) {
      console.error('[DexbotBridge] linkDexbot error:', err);
      throw err;
    }
  },

  async isAlreadyLinked(botId: string): Promise<boolean> {
    const snap = await get(ref(getHaDb(), `linked_bots/${botId}`));
    return snap.exists();
  },

  async getLinkedBots(): Promise<LinkedBot[]> {
    const snap = await get(ref(getHaDb(), 'linked_bots'));
    if (!snap.exists()) return [];
    return Object.entries(snap.val() as Record<string, LinkedBot>).map(
      ([botId, data]) => ({ botId, ...data })
    );
  },

  listenToLinkedBots(callback: (bots: LinkedBot[]) => void): () => void {
    const r = ref(getHaDb(), 'linked_bots');
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

  async unlinkDexbot(botId: string): Promise<void> {
    await remove(ref(getHaDb(), `linked_bots/${botId}`));
    console.log(`[DexbotBridge] Unlinked bot "${botId}" from HA RTDB`);
  },
};

export default DexbotBridge;
