/**
 * Analytics Service — Pure Event-Based Architecture
 * ═════════════════════════════════════════════════════════════════════════════
 * ARCHITECTURE:
 *
 * ESP32 → Firebase → React/Device Control → Analytics Events → Supabase
 *
 * RESPONSIBILITIES:
 * - Firebase: Live device state, device control, ESP32 communication
 * - Supabase: Analytics persistence, runtime sessions, history
 *
 * This service receives analytics EVENTS from deviceService and persists them
 * to Supabase. It does NOT access Firebase/Firestore directly.
 *
 * EVENT FLOW:
 * 1. Firebase listener (deviceService) detects output state change
 * 2. deviceService calls trackOutputChange(event) with state data
 * 3. analyticsService persists to Supabase (runtime_sessions, daily_runtime)
 *
 * CRITICAL RULES:
 * - NO Firebase database imports in this file
 * - NO Firestore imports in this file
 * - Analytics writes go through supabaseAnalytics.ts ONLY
 * - Analytics reads come from Supabase ONLY
 *
 * NOTE: 4-channel configuration (Light2, Light3, Fan1, Custom1) — no Light1 or Fan2
 * ═════════════════════════════════════════════════════════════════════════════
 */

import {
  startRuntimeSession,
  closeRuntimeSession,
  getAggregatedDailyAnalytics,
  secondsToHours,
  kwhToWh,
  whToKwh,
} from './supabaseAnalytics';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ActivityLog {
  id: string;
  deviceId: string;
  action: string;
  performedBy: string;
  timestamp: unknown;
  outputId?: string; // Hardware output ID (light2, light3, fan1, custom1)
}

export interface DailyAnalytics {
  id?: string;
  deviceId: string;
  date: string;        // "YYYY-MM-DD"
  light2Runtime: number; // hours
  light3Runtime: number;
  fan1Runtime: number;
  customRuntime: number;
  energyUsage: number; // kWh
  savedAt?: unknown;
}

// For backwards compat with Analytics page
export interface AnalyticsEntry extends DailyAnalytics {
  lightRuntime: number;
  fanRuntime: number;
  dustbinOpenCount: number;
}

// Analytics event interface (input from deviceService)
export interface OutputChangeEvent {
  deviceId: string;
  channel: 'light2' | 'light3' | 'fan1' | 'custom1';
  isOn: boolean;
  timestamp: number; // unix ms
  currentAmps?: number; // optional current sensor reading
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

// IST offset: UTC +5:30 = 19800 seconds (matching firmware NTP_OFFSET_SEC)
const IST_OFFSET_MS = 19800 * 1000;

/**
 * Get today's date string in IST timezone (YYYY-MM-DD).
 * Matches the device's local clock (firmware uses NTP_OFFSET_SEC = 19800).
 */
export function todayStr(): string {
  const now = new Date(Date.now() + IST_OFFSET_MS);
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2,'0')}-${String(now.getUTCDate()).padStart(2,'0')}`;
}

// ─── Power consumption constants ──────────────────────────────────────────────

const NOMINAL_VOLTAGE = 230; // Volts (Indian standard)
const WATT: Record<string, number> = {
  light2: 40, light3: 40,
  fan1: 25, custom1: 30,
};

// ─── Runtime tracking (event-based) ───────────────────────────────────────────

/**
 * Track output state change event.
 * 
 * ON event:
 *   - Start runtime session in Supabase
 * 
 * OFF event:
 *   - Calculate runtime and energy
 *   - Close runtime session in Supabase
 *   - Update daily totals in Supabase
 * 
 * This function receives state data as input from deviceService.
 * It does NOT read Firebase.
 */
export async function trackOutputChange(event: OutputChangeEvent): Promise<void> {
  const { deviceId, channel, isOn, timestamp, currentAmps } = event;

  if (isOn) {
    // Turning ON — start Supabase runtime session
    console.log(`[Analytics] Output ON: ${deviceId}/${channel} at ${new Date(timestamp).toISOString()}`);
    
    try {
      const sessionId = await startRuntimeSession(deviceId, channel);
      if (sessionId) {
        console.log(`[Analytics] Session started successfully: ID ${sessionId}`);
      } else {
        console.error(`[Analytics] Failed to start session for ${deviceId}/${channel} - sessionId is null`);
        console.error('[Analytics] Check Supabase logs above for detailed error information');
      }
    } catch (err) {
      console.error('[Analytics] Exception starting session (non-fatal):', err);
    }
  } else {
    // Turning OFF — close session and update daily totals
    console.log(`[Analytics] Output OFF: ${deviceId}/${channel} at ${new Date(timestamp).toISOString()}`);
    
    try {
      // closeRuntimeSession will find the open session and calculate runtime
      // Energy calculation: We pass 0 and let closeRuntimeSession calculate based on actual runtime
      // The function will fetch the session, calculate runtime, then calculate energy
      
      // For now, pass 0 for energy - closeRuntimeSession will calculate it
      // TODO: Enhance closeRuntimeSession to calculate energy internally
      await closeRuntimeSession(deviceId, channel, 0, 0);
      
      console.log(`[Analytics] Session close initiated for ${deviceId}/${channel}`);
      
    } catch (err) {
      console.error('[Analytics] Failed to close session (non-fatal):', err);
    }
  }
}

/**
 * Track bulk output changes (e.g., "All On" / "All Off" buttons).
 * Processes multiple channel changes in parallel.
 */
export async function trackBulkOutputChange(
  deviceId: string,
  changes: Partial<Record<'light2' | 'light3' | 'fan1' | 'custom1', boolean>>,
  timestamp: number = Date.now()
): Promise<void> {
  console.log(`[Analytics] Bulk output change for ${deviceId}:`, changes);
  
  // Process each channel change as individual event
  const events: OutputChangeEvent[] = Object.entries(changes).map(([channel, isOn]) => ({
    deviceId,
    channel: channel as 'light2' | 'light3' | 'fan1' | 'custom1',
    isOn: isOn!,
    timestamp,
  }));
  
  // Process in parallel (non-blocking, non-fatal)
  await Promise.allSettled(events.map(event => trackOutputChange(event)));
}

// ─── History reads (from Supabase) ────────────────────────────────────────────

/**
 * Get daily analytics for a device (last N days).
 * Reads from Supabase daily_runtime aggregated by day.
 */
export async function getDailyAnalytics(
  deviceId: string,
  days: number
): Promise<DailyAnalytics[]> {
  try {
    const records = await getAggregatedDailyAnalytics(deviceId, days);
    
    // Convert from Supabase format (seconds, Wh) to DailyAnalytics (hours, kWh)
    return records.map(record => ({
      id: `${record.deviceId}_${record.date}`,
      deviceId: record.deviceId,
      date: record.date,
      light2Runtime: secondsToHours(record.light2Runtime),
      light3Runtime: secondsToHours(record.light3Runtime),
      fan1Runtime: secondsToHours(record.fan1Runtime),
      customRuntime: secondsToHours(record.customRuntime),
      energyUsage: whToKwh(record.energyUsage),
      savedAt: undefined,
    }));
  } catch (err) {
    console.warn('[Analytics] getDailyAnalytics failed:', err);
    return [];
  }
}

/**
 * Get today's analytics for a device.
 */
export async function getTodayAnalytics(deviceId: string): Promise<DailyAnalytics | null> {
  try {
    const today = todayStr();
    const records = await getAggregatedDailyAnalytics(deviceId, 1);
    const todayRecord = records.find(r => r.date === today);
    
    if (!todayRecord) return null;
    
    return {
      id: `${deviceId}_${today}`,
      deviceId,
      date: today,
      light2Runtime: secondsToHours(todayRecord.light2Runtime),
      light3Runtime: secondsToHours(todayRecord.light3Runtime),
      fan1Runtime: secondsToHours(todayRecord.fan1Runtime),
      customRuntime: secondsToHours(todayRecord.customRuntime),
      energyUsage: whToKwh(todayRecord.energyUsage),
    };
  } catch (err) {
    console.warn('[Analytics] getTodayAnalytics failed:', err);
    return null;
  }
}

/**
 * Aggregate daily records into a summary.
 * Sums up all runtime fields from the provided records.
 */
export function aggregateDailyRecords(records: DailyAnalytics[]): Omit<DailyAnalytics, 'id' | 'deviceId' | 'date' | 'savedAt'> {
  return records.reduce((acc, r) => ({
    light2Runtime: acc.light2Runtime + (r.light2Runtime || 0),
    light3Runtime: acc.light3Runtime + (r.light3Runtime || 0),
    fan1Runtime:   acc.fan1Runtime   + (r.fan1Runtime   || 0),
    customRuntime: acc.customRuntime + (r.customRuntime  || 0),
    energyUsage:   acc.energyUsage   + (r.energyUsage   || 0),
  }), {
    light2Runtime: 0, light3Runtime: 0,
    fan1Runtime: 0, customRuntime: 0, energyUsage: 0,
  });
}

/**
 * Get multi-device analytics from Supabase (optimized query).
 * 
 * @param deviceIds Array of device IDs
 * @param days Number of days to fetch
 * @returns Array of daily analytics for all devices
 */
export async function getMultiDeviceAnalyticsFromSupabase(
  deviceIds: string[],
  days: number
): Promise<DailyAnalytics[]> {
  if (deviceIds.length === 0) return [];
  
  try {
    // Fetch from Supabase for each device (parallel)
    const results = await Promise.all(
      deviceIds.map(deviceId => getDailyAnalytics(deviceId, days))
    );
    
    // Flatten results
    return results.flat();
  } catch (err) {
    console.warn('[Analytics] Multi-device Supabase read failed:', err);
    return [];
  }
}

// ─── Activity logs (audit trail, not analytics) ───────────────────────────────
// NOTE: Activity logs are audit trails stored in Firestore (deviceService manages them)
// These are re-exported for backwards compatibility but are NOT analytics data

export async function getActivityLogs(deviceIds: string[], count = 20): Promise<ActivityLog[]> {
  // Delegate to deviceService (Firestore audit logs, not analytics)
  const { getActivityLogs: getFirestoreLogs } = await import('./deviceService');
  return getFirestoreLogs(deviceIds, count);
}

export function subscribeToActivityLogs(
  deviceIds: string[],
  callback: (logs: ActivityLog[]) => void,
  count = 20
): () => void {
  // Delegate to deviceService (Firestore audit logs, not analytics)
  const unsubscribers: (() => void)[] = [];
  
  import('./deviceService').then(({ subscribeToActivityLogs: subscribeFirestore }) => {
    const unsub = subscribeFirestore(deviceIds, callback, count);
    unsubscribers.push(unsub);
  }).catch(err => {
    console.error('[Analytics] Failed to subscribe to activity logs:', err);
  });
  
  return () => unsubscribers.forEach(u => u());
}

// ─── Legacy/Deprecated Functions ──────────────────────────────────────────────
// These functions are kept for backwards compatibility but are no-ops or delegate to deviceService
// They should be removed from calling code over time

/**
 * DEPRECATED: Legacy function for backwards compatibility.
 * 
 * @deprecated Use getMultiDeviceAnalyticsFromSupabase() or getDailyAnalytics() instead.
 */
export async function getAllAnalytics(): Promise<AnalyticsEntry[]> { 
  return []; 
}

/**
 * DEPRECATED: Day rollover is handled by Cloud Function.
 * This is a no-op kept for backwards compatibility.
 * 
 * @deprecated Remove calls to this function. Cloud Function handles rollover automatically.
 */
export async function ensureTodayWindow(_deviceId: string): Promise<void> {
  // No-op: Day rollover handled by Cloud Function
  // Analytics are now event-driven and stored in Supabase
}

/**
 * DEPRECATED: Analytics corruption is prevented by proper Supabase persistence.
 * This is a no-op kept for backwards compatibility.
 * 
 * @deprecated Remove calls to this function. Supabase handles data integrity.
 */
export async function resetCorruptedAnalyticsIfNeeded(_deviceId: string): Promise<void> {
  // No-op: Analytics now in Supabase, corruption prevented at source
}

/**
 * DEPRECATED: Reset analytics via deviceService if needed.
 * This logs a warning and does nothing.
 * 
 * @deprecated Use deviceService.resetAnalytics() directly if reset is truly needed.
 */
export async function resetTodayAnalytics(_deviceId: string): Promise<void> {
  console.warn('[Analytics] resetTodayAnalytics called - analytics are now managed via Supabase, reset may not be meaningful');
  // Could implement Supabase reset if needed, but typically not required
  // Analytics are event-driven and self-correcting
}

/**
 * DEPRECATED: Subscribe to live analytics via deviceService (Firebase RTDB).
 * Analytics service doesn't maintain live state subscriptions.
 * 
 * @deprecated Use deviceService.subscribeToAnalytics() directly for Firebase RTDB live data.
 */
export function subscribeToTodayAnalytics(
  deviceId: string,
  callback: (data: Record<string, number>) => void
): () => void {
  console.warn('[Analytics] subscribeToTodayAnalytics called - use deviceService.subscribeToAnalytics instead');
  
  // Delegate to Firebase via deviceService (Firebase maintains live state)
  import('./deviceService').then(({ subscribeToAnalytics }) => {
    const unsub = subscribeToAnalytics(deviceId, analytics => {
      callback({
        light2Runtime: analytics.light2Runtime,
        light3Runtime: analytics.light3Runtime,
        fan1Runtime: analytics.fan1Runtime,
        customRuntime: analytics.customRuntime,
        energyUsage: analytics.energyUsage,
      });
    });
    return unsub;
  }).catch(err => {
    console.error('[Analytics] Failed to subscribe to live analytics:', err);
  });
  
  return () => {};
}

/**
 * DEPRECATED: Subscribe to onAt via deviceService (Firebase RTDB).
 * Analytics service doesn't maintain live state subscriptions.
 * 
 * @deprecated Use deviceService.subscribeToOnAt() directly for Firebase RTDB live data.
 */
export function subscribeToOnAt(
  deviceId: string,
  callback: (onAt: Record<string, number>) => void
): () => void {
  console.warn('[Analytics] subscribeToOnAt called - use deviceService.subscribeToOnAt instead');
  
  // Delegate to Firebase via deviceService (Firebase maintains live state)
  import('./deviceService').then(({ subscribeToOnAt: subscribeFirebaseOnAt }) => {
    const unsub = subscribeFirebaseOnAt(deviceId, callback);
    return unsub;
  }).catch(err => {
    console.error('[Analytics] Failed to subscribe to onAt:', err);
  });
  
  return () => {};
}
