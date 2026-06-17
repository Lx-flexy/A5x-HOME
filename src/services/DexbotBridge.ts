/**
 * DexbotBridge
 * - Verifies bot ID against Dexbot Firebase RTDB (registered_bots/{botId})
 * - Saves linked bot record to HA Firebase RTDB (linked_bots/{botId})
 */

import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
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
  apiKey:            import.meta.env.VITE_DEXBOT_API_KEY             as string,
  authDomain:        import.meta.env.VITE_DEXBOT_AUTH_DOMAIN         as string,
  databaseURL:       import.meta.env.VITE_DEXBOT_DATABASE_URL        as string,
  projectId:         import.meta.env.VITE_DEXBOT_PROJECT_ID          as string,
  storageBucket:     import.meta.env.VITE_DEXBOT_STORAGE_BUCKET      as string,
  messagingSenderId: import.meta.env.VITE_DEXBOT_MESSAGING_SENDER_ID as string,
  appId:             import.meta.env.VITE_DEXBOT_APP_ID              as string,
};

// ── HA Firebase config ────────────────────────────────────────────────────────
const HA_CONFIG = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY             as string,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN         as string,
  databaseURL:       import.meta.env.VITE_FIREBASE_DATABASE_URL        as string,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID          as string,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET      as string,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID              as string,
};

// ── Safe app init ─────────────────────────────────────────────────────────────
function getOrCreateApp(name: string, config: object): FirebaseApp {
  return getApps().find(a => a.name === name) ?? initializeApp(config, name);
}

// ── DB instances ──────────────────────────────────────────────────────────────
let _dexbotDb: Database;
let _haDb: Database;

function getDexbotDb(): Database {
  if (!_dexbotDb) {
    if (!DEXBOT_CONFIG.databaseURL) {
      throw new Error('[DexbotBridge] VITE_DEXBOT_DATABASE_URL is not set in .env');
    }
    _dexbotDb = getDatabase(getOrCreateApp('dexbot-reader', DEXBOT_CONFIG));
  }
  return _dexbotDb;
}

function getHaDb(): Database {
  if (!_haDb) {
    if (!HA_CONFIG.databaseURL) {
      throw new Error('[DexbotBridge] VITE_FIREBASE_DATABASE_URL is not set in .env');
    }
    _haDb = getDatabase(getOrCreateApp('ha-bridge', HA_CONFIG));
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
   * Verify a bot ID exists in Dexbot RTDB — case-insensitive.
   * Checks registered_bots/ first, then bots/ as fallback.
   */
  async verifyDexbotId(botId: string): Promise<DexbotInfo | null> {
    try {
      const db  = getDexbotDb();
      const key = botId.trim();

      const tryPaths = async (root: string): Promise<DexbotInfo | null> => {
        // Try exact match, lowercase, and uppercase variants
        const variants = [key, key.toLowerCase(), key.toUpperCase()];
        for (const v of variants) {
          const snap = await get(ref(db, `${root}/${v}`));
          if (snap.exists()) {
            const data = snap.val();
            return { botId: v, ...(typeof data === 'object' && data !== null ? data : {}) };
          }
        }

        // Last resort: case-insensitive scan of root (avoids full tree download when possible)
        const allSnap = await get(ref(db, root));
        if (allSnap.exists()) {
          const all = allSnap.val() as Record<string, unknown>;
          const matchedKey = Object.keys(all).find(
            k => k.toLowerCase() === key.toLowerCase()
          );
          if (matchedKey) {
            const data = all[matchedKey];
            return { botId: matchedKey, ...(typeof data === 'object' && data !== null ? data : {}) };
          }
        }
        return null;
      };

      const result = (await tryPaths('registered_bots')) ?? (await tryPaths('bots'));
      return result;
    } catch (err) {
      console.error('[DexbotBridge] verifyDexbotId error:', err);
      throw err;
    }
  },

  /**
   * Save linked bot record to HA RTDB (linked_bots/{botId}).
   */
  async linkDexbot(botId: string, botData: DexbotInfo): Promise<void> {
    try {
      await set(ref(getHaDb(), `linked_bots/${botId}`), {
        botId,
        name:     (botData.name     as string) ?? botId,
        ip:       (botData.ip       as string) ?? '',
        ownerUid: (botData.ownerUid as string) ?? '',
        linkedAt: Date.now(),
      });
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
  },
};

export default DexbotBridge;
