/**
 * Session Tracker - Client-side runtime tracking
 * ═════════════════════════════════════════════════════════════════════════════
 * Tracks when devices are turned ON in browser localStorage
 * Calculates "today's runtime" without needing firmware changes
 * 
 * localStorage structure:
 * {
 *   "deviceId": {
 *     "light2": 1697456123456,  // unix timestamp (ms) when turned ON
 *     "light3": 0,               // 0 = OFF
 *     "fan1": 1697456234567,
 *     "custom1": 0
 *   }
 * }
 * ═════════════════════════════════════════════════════════════════════════════
 */

const STORAGE_KEY = 'a5x_session_tracker';
const MIDNIGHT_CHECK_INTERVAL = 60000; // Check every minute for midnight

interface SessionData {
  [deviceId: string]: {
    light2?: number;
    light3?: number;
    fan1?: number;
    custom1?: number;
  };
}

// ─── Storage helpers ──────────────────────────────────────────────────────────

function loadSessions(): SessionData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as SessionData;
  } catch (err) {
    console.warn('[SessionTracker] Failed to load sessions:', err);
    return {};
  }
}

function saveSessions(data: SessionData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    console.error('[SessionTracker] Failed to save sessions:', err);
  }
}

// ─── Session tracking ─────────────────────────────────────────────────────────

/**
 * Track device turned ON
 * Stores current timestamp for runtime calculation
 */
export function trackDeviceOn(
  deviceId: string,
  channel: 'light2' | 'light3' | 'fan1' | 'custom1'
): void {
  const sessions = loadSessions();
  
  if (!sessions[deviceId]) {
    sessions[deviceId] = {};
  }
  
  const now = Date.now();
  sessions[deviceId][channel] = now;
  
  saveSessions(sessions);
  
  console.log(`[SessionTracker] ${deviceId}/${channel} turned ON at ${new Date(now).toISOString()}`);
}

/**
 * Track device turned OFF
 * Removes timestamp (sets to 0)
 */
export function trackDeviceOff(
  deviceId: string,
  channel: 'light2' | 'light3' | 'fan1' | 'custom1'
): void {
  const sessions = loadSessions();
  
  if (!sessions[deviceId]) {
    sessions[deviceId] = {};
  }
  
  sessions[deviceId][channel] = 0;
  
  saveSessions(sessions);
  
  console.log(`[SessionTracker] ${deviceId}/${channel} turned OFF`);
}

/**
 * Get session runtime for a device channel (in hours)
 * Returns hours since device was turned ON
 * Returns 0 if device is OFF or never tracked
 */
export function getSessionRuntime(
  deviceId: string,
  channel: 'light2' | 'light3' | 'fan1' | 'custom1'
): number {
  const sessions = loadSessions();
  const deviceSession = sessions[deviceId];
  
  if (!deviceSession) return 0;
  
  const onAtMs = deviceSession[channel] || 0;
  
  if (onAtMs <= 0) {
    // Device is OFF
    return 0;
  }
  
  // Calculate hours since ON
  const now = Date.now();
  const elapsedMs = now - onAtMs;
  const hours = elapsedMs / 3_600_000;
  
  // Validate (prevent negative or impossible values)
  if (!isFinite(hours) || hours < 0) {
    console.warn(`[SessionTracker] Invalid runtime for ${deviceId}/${channel}: ${hours}h`);
    return 0;
  }
  
  // Cap at 24h (physical impossibility)
  return Math.min(hours, 24);
}

/**
 * Get all session runtimes for a device (in hours)
 */
export function getAllSessionRuntimes(deviceId: string): {
  light2: number;
  light3: number;
  fan1: number;
  custom1: number;
} {
  return {
    light2: getSessionRuntime(deviceId, 'light2'),
    light3: getSessionRuntime(deviceId, 'light3'),
    fan1: getSessionRuntime(deviceId, 'fan1'),
    custom1: getSessionRuntime(deviceId, 'custom1'),
  };
}

// ─── Midnight reset ───────────────────────────────────────────────────────────

let midnightCheckTimer: NodeJS.Timeout | null = null;
let lastCheckDate = new Date().toDateString();

/**
 * Check if midnight has passed and reset all sessions
 * Called automatically every minute by startMidnightReset()
 */
function checkMidnightReset(): void {
  const now = new Date();
  const currentDate = now.toDateString();
  
  if (currentDate !== lastCheckDate) {
    // Date changed - it's a new day!
    console.log('[SessionTracker] Midnight detected - resetting all sessions');
    
    // Clear all ON timestamps (reset to 0)
    const sessions = loadSessions();
    Object.keys(sessions).forEach(deviceId => {
      sessions[deviceId] = {
        light2: 0,
        light3: 0,
        fan1: 0,
        custom1: 0,
      };
    });
    saveSessions(sessions);
    
    lastCheckDate = currentDate;
  }
}

/**
 * Start automatic midnight reset checker
 * Call this once when app initializes
 */
export function startMidnightReset(): void {
  if (midnightCheckTimer) {
    // Already running
    return;
  }
  
  console.log('[SessionTracker] Starting midnight reset checker');
  
  // Check immediately
  checkMidnightReset();
  
  // Then check every minute
  midnightCheckTimer = setInterval(checkMidnightReset, MIDNIGHT_CHECK_INTERVAL);
}

/**
 * Stop midnight reset checker
 * Call this when app unmounts (cleanup)
 */
export function stopMidnightReset(): void {
  if (midnightCheckTimer) {
    clearInterval(midnightCheckTimer);
    midnightCheckTimer = null;
    console.log('[SessionTracker] Stopped midnight reset checker');
  }
}

// ─── Manual reset (for testing) ───────────────────────────────────────────────

/**
 * Manually reset all session data
 * Useful for testing or admin tools
 */
export function resetAllSessions(): void {
  console.log('[SessionTracker] Manually resetting all sessions');
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Manually reset sessions for a specific device
 */
export function resetDeviceSessions(deviceId: string): void {
  console.log(`[SessionTracker] Manually resetting sessions for ${deviceId}`);
  const sessions = loadSessions();
  delete sessions[deviceId];
  saveSessions(sessions);
}
