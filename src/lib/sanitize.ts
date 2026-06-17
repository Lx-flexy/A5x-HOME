/**
 * Input sanitization and validation utilities.
 * Used throughout services to prevent malformed / malicious writes.
 */

// ── String sanitization ───────────────────────────────────────────────────────

/**
 * Strip null bytes and control characters from a string.
 * Trims whitespace and truncates to maxLength.
 */
export function sanitizeString(value: unknown, maxLength = 256): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // strip control chars
    .trim()
    .slice(0, maxLength);
}

/**
 * Sanitize a display message for OLED / bot screen.
 * Max 128 chars, printable ASCII + common unicode only.
 */
export function sanitizeMessage(value: unknown): string {
  return sanitizeString(value, 128);
}

/**
 * Sanitize a display name or label.
 */
export function sanitizeName(value: unknown): string {
  return sanitizeString(value, 100);
}

// ── Format validators ─────────────────────────────────────────────────────────

/** A5X-HA-XXXX  (device IDs) */
const DEVICE_ID_RE = /^A5X-HA-[A-Z0-9]{4}$/;

/** A5X-U-XXXXXX  (user IDs) */
const USER_ID_RE = /^A5X-U-[A-Z0-9]{6}$/;

/** Dex Bot IDs: alphanumeric, underscores, hyphens, 2-32 chars */
const BOT_ID_RE = /^[A-Za-z0-9_-]{2,32}$/;

/** Allowed emotion values */
const VALID_EMOTIONS = new Set([
  'happy', 'normal', 'cool', 'sleep', 'surprise', 'angry', 'robot',
  'neutral', 'sad', 'thinking', 'excited', 'alert',
]);

export function isValidDeviceId(id: unknown): id is string {
  return typeof id === 'string' && DEVICE_ID_RE.test(id.trim().toUpperCase());
}

export function isValidUserId(id: unknown): id is string {
  return typeof id === 'string' && USER_ID_RE.test(id.trim().toUpperCase());
}

export function isValidBotId(id: unknown): id is string {
  return typeof id === 'string' && BOT_ID_RE.test(id.trim());
}

export function isValidEmotion(emotion: unknown): emotion is string {
  return typeof emotion === 'string' && VALID_EMOTIONS.has(emotion.trim().toLowerCase());
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

// ── Rate limiting (client-side burst guard) ───────────────────────────────────

const _writeCounts = new Map<string, { count: number; windowStart: number }>();

/**
 * Allow at most `maxWrites` writes per `windowMs` milliseconds per key.
 * Returns true if the write is allowed, false if rate-limited.
 *
 * Keys are arbitrary strings — use e.g. `message:${uid}` or `emotion:${botId}`.
 */
export function allowWrite(key: string, maxWrites = 10, windowMs = 60_000): boolean {
  const now = Date.now();
  const entry = _writeCounts.get(key);

  if (!entry || now - entry.windowStart > windowMs) {
    _writeCounts.set(key, { count: 1, windowStart: now });
    return true;
  }

  if (entry.count >= maxWrites) {
    console.warn(`[rateLimit] Blocked write for key "${key}" (${entry.count}/${maxWrites} in window)`);
    return false;
  }

  entry.count++;
  return true;
}
