/**
 * DexBot Chat Service
 * ─────────────────────────────────────────────────────────────────────────────
 * Dexbot RTDB paths (dexbot-5c352):
 *
 *   bots/{botId}/command        → Web writes → ESP32 reads & executes
 *   bots/{botId}/response       → ESP32 writes reply → web reads, then clears
 *   bots/{botId}/chat_history/  → Full chat log
 *   bots/{botId}/inbox/         → Display messages { from, to, text, timestamp }
 *   bots/{botId}/emotion        → Current emotion string
 */

import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
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
import { sanitizeMessage } from '../lib/sanitize';

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

function getOrCreateApp(name: string, config: object): FirebaseApp {
  return getApps().find(a => a.name === name) ?? initializeApp(config, name);
}

let _db: Database;
function getDb(): Database {
  if (!_db) {
    if (!DEXBOT_CONFIG.databaseURL) {
      throw new Error('[DexbotChat] VITE_DEXBOT_DATABASE_URL is not set in .env');
    }
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
  time: number;
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseSnap(snap: DataSnapshot): ChatMessage[] {
  if (!snap.exists()) return [];
  const raw = snap.val() as Record<string, Omit<ChatMessage, 'id'>>;
  return Object.entries(raw)
    .map(([id, m]) => ({
      id,
      from: m.from,
      text: sanitizeMessage(m.text),
      time: typeof m.time === 'number' ? m.time : 0,
    }))
    .sort((a, b) => a.time - b.time)
    .slice(-100);
}

// ── Chat Service ──────────────────────────────────────────────────────────────
const DexbotChatService = {

  /**
   * Send a command to the bot.
   * 1. Writes bots/{botId}/command  → ESP32 picks up via onValue
   * 2. Appends to bots/{botId}/chat_history as a 'user' message
   */
  async sendCommand(botId: string, text: string, senderName: string): Promise<void> {
    const db  = getDb();
    const now = Date.now();
    const safeText = sanitizeMessage(text);
    if (!safeText) return;

    await set(ref(db, `bots/${botId}/command`), {
      text:      safeText,
      from:      senderName,
      timestamp: now,
    });

    await push(ref(db, `bots/${botId}/chat_history`), {
      from: 'user',
      text: safeText,
      time: now,
    });
  },

  /**
   * Listen for ESP32 response at bots/{botId}/response.
   * Saves reply to chat_history, then clears the response node.
   */
  listenForResponse(botId: string): () => void {
    const db = getDb();
    const r  = ref(db, `bots/${botId}/response`);
    let processing = false;

    const handler = async (snap: DataSnapshot) => {
      if (!snap.exists() || processing) return;
      processing = true;

      try {
        const data = snap.val() as
          | { text?: string; message?: string; timestamp?: number }
          | string
          | null;

        if (!data) { processing = false; return; }

        const raw =
          typeof data === 'string'
            ? data
            : (data as { text?: string; message?: string }).text
              ?? (data as { text?: string; message?: string }).message
              ?? JSON.stringify(data);

        const text = sanitizeMessage(raw);
        const time =
          typeof data === 'object' && data !== null
            ? ((data as { timestamp?: number }).timestamp ?? Date.now())
            : Date.now();

        await push(ref(db, `bots/${botId}/chat_history`), { from: 'bot', text, time });
        await remove(r);
      } catch (err) {
        console.error('[DexbotChat] listenForResponse error:', err);
      } finally {
        processing = false;
      }
    };

    onValue(r, handler);
    return () => off(r, 'value', handler);
  },

  /** Real-time chat history listener. */
  listenToHistory(
    botId: string,
    callback: (msgs: ChatMessage[]) => void
  ): () => void {
    const db = getDb();
    const r  = ref(db, `bots/${botId}/chat_history`);
    const handler = (snap: DataSnapshot) => callback(parseSnap(snap));
    onValue(r, handler);
    return () => off(r, 'value', handler);
  },

  async getHistory(botId: string, _limit = 50): Promise<ChatMessage[]> {
    const snap = await get(ref(getDb(), `bots/${botId}/chat_history`));
    return parseSnap(snap);
  },

  async clearHistory(botId: string): Promise<void> {
    await remove(ref(getDb(), `bots/${botId}/chat_history`));
  },

  // ── Bot telemetry ───────────────────────────────────────────────────────────

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
        battery:     d.battery     as number  | undefined,
        cpu:         d.cpu         as number  | undefined,
        rssi:        d.rssi        as number  | undefined,
        temperature: d.temperature as number  | undefined,
        emotion:     d.emotion     as string  | undefined,
        ip:          d.ip          as string  | undefined,
        room:        d.room        as string  | undefined,
        uptime:      d.uptime      as string  | undefined,
        online:      d.online      as boolean | undefined,
      });
    };
    onValue(r, handler);
    return () => off(r, 'value', handler);
  },

  // ── Screen / Display ────────────────────────────────────────────────────────

  /**
   * Fetch bot IP from Dexbot RTDB.
   * Primary:  registered_bots/{botId}/ip
   * Fallback: bots/{botId}/wifi_status/ip_address
   */
  async getBotIp(botId: string): Promise<string | null> {
    const db = getDb();

    const regSnap = await get(ref(db, `registered_bots/${botId}/ip`));
    if (regSnap.exists() && regSnap.val()) return regSnap.val() as string;

    const wifiSnap = await get(ref(db, `bots/${botId}/wifi_status/ip_address`));
    if (wifiSnap.exists() && wifiSnap.val()) return wifiSnap.val() as string;

    return null;
  },

  /**
   * Send a message to the Dex Bot display screen.
   *
   * Pipeline (from Dex Bot source Firebase_Manager.js):
   *   Step 1 — RTDB write: outbox + inbox with matching push key
   *     { from, to, text, timestamp }
   *   Step 2 — HTTP POST to bot IP: POST /api/message/send { message, from }
   *     This is what triggers the display render.
   */
  async sendDisplayText(botId: string, text: string): Promise<void> {
    const db       = getDb();
    const now      = Date.now();
    const safeText = sanitizeMessage(text);
    if (!safeText) return;

    const FROM_LABEL  = 'A5X_Home';
    const messageData = { from: FROM_LABEL, to: botId, text: safeText, timestamp: now };

    // Step 1: RTDB write — outbox + inbox with matching key
    const outboxRef = push(ref(db, `bots/${FROM_LABEL}/messages`));
    const inboxRef  = ref(db, `bots/${botId}/inbox/${outboxRef.key}`);

    await set(outboxRef, messageData);
    await set(inboxRef,  messageData);

    // Step 2: HTTP POST to bot's local IP
    const botIp = await this.getBotIp(botId);
    if (!botIp) {
      // Message is in inbox — bot will process it on next sync
      console.warn(`[DexbotChat] No IP for bot "${botId}" — HTTP POST skipped`);
      return;
    }

    try {
      const res = await fetch(`http://${botIp}/api/message/send`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message: safeText, from: FROM_LABEL }),
        signal:  AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        console.warn(`[DexbotChat] HTTP POST returned ${res.status}`);
      }
    } catch (err) {
      // Non-fatal — RTDB write already succeeded
      console.warn(`[DexbotChat] HTTP POST failed (bot may be offline):`, err);
    }
  },

  async clearDisplay(botId: string): Promise<void> {
    await set(ref(getDb(), `bots/${botId}/displayText`), '');
  },

  listenToScreenHistory(
    botId: string,
    callback: (entries: { id: string; text: string; time: number }[]) => void
  ): () => void {
    const db = getDb();
    const r  = ref(db, `bots/${botId}/screen_history`);
    const handler = (snap: DataSnapshot) => {
      if (!snap.exists()) { callback([]); return; }
      const raw = snap.val() as Record<string, { text: string; time: number }>;
      callback(
        Object.entries(raw)
          .map(([id, v]) => ({ id, text: sanitizeMessage(v.text), time: v.time }))
          .sort((a, b) => b.time - a.time)
          .slice(0, 20)
      );
    };
    onValue(r, handler);
    return () => off(r, 'value', handler);
  },

  listenToDisplayText(
    botId: string,
    callback: (text: string) => void
  ): () => void {
    const r = ref(getDb(), `bots/${botId}/displayText`);
    const handler = (snap: DataSnapshot) =>
      callback(sanitizeMessage((snap.val() as string) ?? ''));
    onValue(r, handler);
    return () => off(r, 'value', handler);
  },

  // ── Emotion ─────────────────────────────────────────────────────────────────

  /**
   * Write emotion to Dexbot RTDB: bots/{botId}/emotion
   * ESP32 listens on this path and updates the face display.
   */
  async setEmotion(botId: string, emotion: string): Promise<void> {
    await set(ref(getDb(), `bots/${botId}/emotion`), emotion);
  },

  async resetEmotion(botId: string): Promise<void> {
    await set(ref(getDb(), `bots/${botId}/emotion`), 'neutral');
  },

  // ── Quick actions ─────────────────────────────────────────────────────────

  async sendQuickAction(botId: string, action: string): Promise<void> {
    await set(ref(getDb(), `bots/${botId}/quickAction`), {
      action:    sanitizeMessage(action),
      timestamp: Date.now(),
    });
  },
};

export default DexbotChatService;
