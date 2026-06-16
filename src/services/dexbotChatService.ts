/**
 * DexBot Chat Service
 * ─────────────────────────────────────────────────────────────────────────────
 * Firebase RTDB ko WebSocket server ki tarah use karta hai.
 * No extra backend needed.
 *
 * Dexbot RTDB paths (dexbot-5c352):
 *   bots/{botId}/command        → User ka command (web writes, ESP32 reads)
 *   bots/{botId}/response       → Bot ka reply (ESP32 writes, web reads)
 *   bots/{botId}/chat_history/  → Chat log (web writes both sides)
 *
 * Message flow:
 *   User types → write bots/{botId}/command → ESP32 onValue listener picks up
 *   ESP32 executes → writes bots/{botId}/response
 *   Web listens to response → appends to chat + clears response node
 */

import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  getDatabase,
  ref,
  set,
  push,
  onValue,
  off,
  get,
  remove,
  Database,
  DataSnapshot,
} from 'firebase/database';

// ── Dexbot Firebase config ────────────────────────────────────────────────────
const DEXBOT_CONFIG = {
  apiKey:            import.meta.env.VITE_DEXBOT_API_KEY            as string,
  authDomain:        import.meta.env.VITE_DEXBOT_AUTH_DOMAIN        as string,
  databaseURL:       import.meta.env.VITE_DEXBOT_DATABASE_URL       as string,
  projectId:         import.meta.env.VITE_DEXBOT_PROJECT_ID         as string,
  storageBucket:     import.meta.env.VITE_DEXBOT_STORAGE_BUCKET     as string,
  messagingSenderId: import.meta.env.VITE_DEXBOT_MESSAGING_SENDER_ID as string,
  appId:             import.meta.env.VITE_DEXBOT_APP_ID             as string,
};

function getOrCreateApp(name: string, config: object): FirebaseApp {
  return getApps().find(a => a.name === name) ?? initializeApp(config, name);
}

let _db: Database;
function getDb(): Database {
  if (!_db) {
    _db = getDatabase(getOrCreateApp('dexbot-reader', DEXBOT_CONFIG));
  }
  return _db;
}

// ── Types ─────────────────────────────────────────────────────────────────────
export type MessageFrom = 'user' | 'bot' | 'system';

export interface ChatMessage {
  id: string;
  from: MessageFrom;
  text: string;
  time: number; // unix ms
}

export interface BotLiveData {
  battery?: number;
  cpu?: number;
  rssi?: number;
  temperature?: number;
  emotion?: string;
  ip?: string;
  room?: string;
  uptime?: string;
  online?: boolean;
}

// ── Chat Service ──────────────────────────────────────────────────────────────
const DexbotChatService = {

  /**
   * Send a command to the bot.
   * Writes to bots/{botId}/command — ESP32 onValue picks it up instantly.
   * Also saves to chat history.
   */
  async sendCommand(botId: string, text: string, senderName: string): Promise<void> {
    const db = getDb();
    const now = Date.now();

    // Write command node (ESP32 reads this)
    await set(ref(db, `bots/${botId}/command`), {
      text,
      from: senderName,
      timestamp: now,
    });

    // Save to chat history
    await push(ref(db, `bots/${botId}/chat_history`), {
      from: 'user',
      text,
      time: now,
    });
  },

  /**
   * Listen for bot responses.
   * ESP32 writes to bots/{botId}/response — we read it here.
   * After reading, clear the node so next response is fresh.
   */
  listenForResponse(
    botId: string,
    callback: (msg: ChatMessage) => void
  ): () => void {
    const db = getDb();
    const r  = ref(db, `bots/${botId}/response`);

    const handler = async (snap: DataSnapshot) => {
      if (!snap.exists()) return;
      const data = snap.val() as { text?: string; timestamp?: number } | string;

      const text = typeof data === 'string'
        ? data
        : (data as { text?: string }).text ?? JSON.stringify(data);

      const time = typeof data === 'object' && data !== null
        ? ((data as { timestamp?: number }).timestamp ?? Date.now())
        : Date.now();

      const msg: ChatMessage = {
        id:   `bot-${time}`,
        from: 'bot',
        text,
        time,
      };

      callback(msg);

      // Save bot reply to history
      await push(ref(db, `bots/${botId}/chat_history`), {
        from: 'bot',
        text,
        time,
      }).catch(() => {});

      // Clear response so it doesn't re-fire
      await remove(r).catch(() => {});
    };

    onValue(r, handler);
    return () => off(r, 'value', handler);
  },

  /**
   * Load last N messages from chat history.
   */
  async getHistory(botId: string, limit = 50): Promise<ChatMessage[]> {
    const db   = getDb();
    const snap = await get(ref(db, `bots/${botId}/chat_history`));
    if (!snap.exists()) return [];

    const raw = snap.val() as Record<string, Omit<ChatMessage, 'id'>>;
    const msgs: ChatMessage[] = Object.entries(raw)
      .map(([id, m]) => ({ id, ...m }))
      .sort((a, b) => a.time - b.time)
      .slice(-limit);

    return msgs;
  },

  /**
   * Real-time chat history listener.
   */
  listenToHistory(
    botId: string,
    callback: (msgs: ChatMessage[]) => void
  ): () => void {
    const db = getDb();
    const r  = ref(db, `bots/${botId}/chat_history`);

    const handler = (snap: DataSnapshot) => {
      if (!snap.exists()) { callback([]); return; }
      const raw = snap.val() as Record<string, Omit<ChatMessage, 'id'>>;
      const msgs: ChatMessage[] = Object.entries(raw)
        .map(([id, m]) => ({ id, ...m }))
        .sort((a, b) => a.time - b.time)
        .slice(-50);
      callback(msgs);
    };

    onValue(r, handler);
    return () => off(r, 'value', handler);
  },

  /**
   * Get live bot telemetry data (battery, CPU, RSSI etc.)
   */
  listenToBotData(
    botId: string,
    callback: (data: BotLiveData) => void
  ): () => void {
    const db = getDb();
    const r  = ref(db, `bots/${botId}`);

    const handler = (snap: DataSnapshot) => {
      if (!snap.exists()) { callback({}); return; }
      const d = snap.val() as Record<string, unknown>;
      callback({
        battery:     (d.battery     as number)  ?? undefined,
        cpu:         (d.cpu         as number)  ?? undefined,
        rssi:        (d.rssi        as number)  ?? undefined,
        temperature: (d.temperature as number)  ?? undefined,
        emotion:     (d.emotion     as string)  ?? undefined,
        ip:          (d.ip          as string)  ?? undefined,
        room:        (d.room        as string)  ?? undefined,
        uptime:      (d.uptime      as string)  ?? undefined,
        online:      (d.online      as boolean) ?? undefined,
      });
    };

    onValue(r, handler);
    return () => off(r, 'value', handler);
  },

  /**
   * Clear chat history for a bot.
   */
  async clearHistory(botId: string): Promise<void> {
    await remove(ref(getDb(), `bots/${botId}/chat_history`));
  },
};

export default DexbotChatService;
