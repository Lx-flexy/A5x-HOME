/**
 * DexBot Chat Service
 * ─────────────────────────────────────────────────────────────────────────────
 * Firebase RTDB paths (dexbot-5c352):
 *
 *   bots/{botId}/command        → Web writes (ESP32 reads & executes)
 *   bots/{botId}/response       → ESP32 writes reply (web reads, then clears)
 *   bots/{botId}/chat_history/  → Full chat log (web appends user msgs;
 *                                  listenForResponse appends bot replies)
 *
 * Single source of truth: listenToHistory drives the UI.
 * listenForResponse only saves the bot reply into chat_history — the history
 * listener then picks it up automatically. No duplicate handling needed.
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

// ── Helper ────────────────────────────────────────────────────────────────────
function parseSnap(snap: DataSnapshot): ChatMessage[] {
  if (!snap.exists()) return [];
  const raw = snap.val() as Record<string, Omit<ChatMessage, 'id'>>;
  return Object.entries(raw)
    .map(([id, m]) => ({ id, from: m.from, text: m.text ?? '', time: m.time ?? 0 }))
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

    // Command node — ESP32 listens here
    await set(ref(db, `bots/${botId}/command`), {
      text,
      from: senderName,
      timestamp: now,
    });

    // User message in history
    await push(ref(db, `bots/${botId}/chat_history`), {
      from: 'user',
      text,
      time: now,
    });
  },

  /**
   * Listen for ESP32 response at bots/{botId}/response.
   *
   * When ESP32 writes a response:
   *   1. Save it to chat_history as a 'bot' message
   *   2. Clear the response node so it doesn't re-fire
   *
   * The UI listens to chat_history (listenToHistory), so it will automatically
   * show the bot reply — no separate callback needed for the UI.
   *
   * Returns an unsubscribe function.
   */
  listenForResponse(botId: string): () => void {
    const db = getDb();
    const r  = ref(db, `bots/${botId}/response`);

    let processing = false; // prevent re-entrant saves

    const handler = async (snap: DataSnapshot) => {
      if (!snap.exists() || processing) return;
      processing = true;

      try {
        const data = snap.val() as
          | { text?: string; message?: string; timestamp?: number }
          | string
          | null;

        if (!data) { processing = false; return; }

        const text =
          typeof data === 'string'
            ? data
            : (data as { text?: string; message?: string }).text
              ?? (data as { text?: string; message?: string }).message
              ?? JSON.stringify(data);

        const time =
          typeof data === 'object' && data !== null
            ? ((data as { timestamp?: number }).timestamp ?? Date.now())
            : Date.now();

        // Save bot reply to history — listenToHistory will push it to the UI
        await push(ref(db, `bots/${botId}/chat_history`), {
          from: 'bot',
          text,
          time,
        });

        // Clear response node so it doesn't fire again
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

  /**
   * Real-time chat history listener — single source of truth for the UI.
   * Fires every time a user message or bot reply is added to chat_history.
   */
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

  /**
   * One-time fetch of chat history (used for RTDB reachability check).
   */
  async getHistory(botId: string, _limit = 50): Promise<ChatMessage[]> {
    const snap = await get(ref(getDb(), `bots/${botId}/chat_history`));
    return parseSnap(snap);
  },

  /**
   * Clear all chat history for a bot.
   */
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
   * Fetch the bot's current IP address from Dexbot RTDB.
   * Checks registered_bots/{botId}/ip first, then bots/{botId}/wifi_status/ip_address.
   * Returns null if not found.
   */
  async getBotIp(botId: string): Promise<string | null> {
    const db = getDb();

    // Primary: registered_bots/{botId}/ip (always set at registration)
    const regSnap = await get(ref(db, `registered_bots/${botId}/ip`));
    if (regSnap.exists() && regSnap.val()) {
      console.log(`[DexbotChatService] getBotIp — registered_bots/${botId}/ip = "${regSnap.val()}"`);
      return regSnap.val() as string;
    }

    // Fallback: bots/{botId}/wifi_status/ip_address (written by firmware when online)
    const wifiSnap = await get(ref(db, `bots/${botId}/wifi_status/ip_address`));
    if (wifiSnap.exists() && wifiSnap.val()) {
      console.log(`[DexbotChatService] getBotIp — bots/${botId}/wifi_status/ip_address = "${wifiSnap.val()}"`);
      return wifiSnap.val() as string;
    }

    console.warn(`[DexbotChatService] getBotIp — no IP found for bot "${botId}"`);
    return null;
  },

  /**
   * Send a message to the Dex Bot display screen.
   *
   * Exact pipeline from Dex Bot source (Firebase_Manager.js + MessagingPage.jsx):
   *
   *   Step 1 — RTDB write (bot-to-bot inbox protocol):
   *     push(bots/{fromBotId}/messages, messageData)       — sender outbox
   *     set(bots/{toBotId}/inbox/{sameKey}, messageData)   — recipient inbox (same key)
   *     messageData = { from, to, text, timestamp }
   *
   *   Step 2 — HTTP POST to bot's IP (this is what triggers the display):
   *     POST http://{botIp}/api/message/send
   *     body: { message: text, from: fromLabel }
   *
   * NOTE: Emotion uses the same HTTP approach: POST /api/emotion { emotion }
   * The RTDB emotion write (bots/{botId}/emotion) is done by the firmware itself,
   * not by the web dashboard — emotion works because the firmware reads its own
   * RTDB state, while messages require the HTTP push.
   */
  async sendDisplayText(botId: string, text: string): Promise<void> {
    const db  = getDb();
    const now = Date.now();
    const FROM_LABEL = 'A5X_Home';

    console.log(`[DexbotChatService] sendDisplayText ─────────────────────────`);
    console.log(`[DexbotChatService]   to      : "${botId}"`);
    console.log(`[DexbotChatService]   from    : "${FROM_LABEL}"`);
    console.log(`[DexbotChatService]   message : "${text}"`);

    const messageData = { from: FROM_LABEL, to: botId, text, timestamp: now };

    // ── Step 1: RTDB write — outbox + inbox with matching key ────────────────
    const outboxRef = push(ref(db, `bots/${FROM_LABEL}/messages`));
    const inboxRef  = ref(db, `bots/${botId}/inbox/${outboxRef.key}`);

    await set(outboxRef, messageData);
    console.log(`[DexbotChatService] ✅ RTDB outbox written — bots/${FROM_LABEL}/messages/${outboxRef.key}`);

    await set(inboxRef, messageData);
    console.log(`[DexbotChatService] ✅ RTDB inbox written  — bots/${botId}/inbox/${outboxRef.key}`);

    // ── Step 2: HTTP POST to bot IP — this is what triggers the display ──────
    const botIp = await this.getBotIp(botId);

    if (!botIp) {
      console.warn(`[DexbotChatService] ⚠️  No IP for bot "${botId}" — skipping HTTP POST. Message is in inbox but may not display until bot polls.`);
      return;
    }

    const url = `http://${botIp}/api/message/send`;
    const body = JSON.stringify({ message: text, from: FROM_LABEL });

    console.log(`[DexbotChatService] HTTP POST → ${url}`);
    console.log(`[DexbotChatService]   body: ${body}`);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(8000),
      });

      if (res.ok) {
        console.log(`[DexbotChatService] ✅ HTTP POST succeeded — status ${res.status} — message should now appear on bot display`);
      } else {
        console.warn(`[DexbotChatService] ⚠️  HTTP POST returned ${res.status} — bot may not have displayed the message`);
      }
    } catch (err) {
      // Non-fatal: RTDB write already succeeded. Bot will see message via inbox
      // next time it syncs, but the immediate display push failed.
      console.warn(`[DexbotChatService] ⚠️  HTTP POST failed (bot offline or unreachable at ${botIp}):`, err);
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
          .map(([id, v]) => ({ id, text: v.text, time: v.time }))
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
    const handler = (snap: DataSnapshot) => callback((snap.val() as string) ?? '');
    onValue(r, handler);
    return () => off(r, 'value', handler);
  },

  // ── Emotion ─────────────────────────────────────────────────────────────────

  /**
   * Set the bot's facial expression.
   * Writes to Dexbot RTDB: bots/{botId}/emotion
   * ESP32 listens on this path and updates its display immediately.
   */
  async setEmotion(botId: string, emotion: string): Promise<void> {
    console.log(`[DexbotChatService] setEmotion — bots/${botId}/emotion = "${emotion}"`);
    await set(ref(getDb(), `bots/${botId}/emotion`), emotion);
    console.log(`[DexbotChatService] ✅ Emotion written to Dexbot RTDB`);
  },

  async resetEmotion(botId: string): Promise<void> {
    await set(ref(getDb(), `bots/${botId}/emotion`), 'neutral');
  },

  // ── Quick actions ────────────────────────────────────────────────────────────

  async sendQuickAction(botId: string, action: string): Promise<void> {
    await set(ref(getDb(), `bots/${botId}/quickAction`), {
      action,
      timestamp: Date.now(),
    });
  },
};

export default DexbotChatService;
