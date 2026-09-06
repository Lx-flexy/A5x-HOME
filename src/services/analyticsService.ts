/**
 * Analytics Service — Firestore + RTDB
 * ─────────────────────────────────────────────────────────────────────────────
 * Architecture:
 *
 * RTDB: devices/{deviceId}/
 *   onAt/{key}   = unix ms when device was turned ON (cleared on OFF)
 *   analytics/   = today's accumulated runtime (SECONDS, int) — resets each day
 *   analyticsDate = "YYYY-MM-DD" of the current analytics window
 *
 * Firestore: device_analytics/{deviceId_YYYY-MM-DD}
 *   deviceId, date, light2Runtime .. customRuntime, energyUsage, savedAt
 *   One document per device per day — upserted when device turns OFF or at midnight.
 *
 * NOTE: 4-channel configuration (Light2, Light3, Fan1, Custom1) — no Light1 or Fan2
 * Runtime stored in SECONDS (matching firmware), displayed in hours/minutes
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  collection, doc, getDoc, getDocs, setDoc, query,
  where, orderBy, limit, onSnapshot, serverTimestamp,
} from 'firebase/firestore';
import {
  ref, get, set, update, remove, onValue, off, DataSnapshot, runTransaction,
} from 'firebase/database';
import { db, rtdb } from './firebase';

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
  light2Runtime: number;
  light3Runtime: number;
  fan1Runtime: number;
  customRuntime: number;
  energyUsage: number;
  savedAt?: unknown;
}

// For backwards compat with Analytics page
export interface AnalyticsEntry extends DailyAnalytics {
  lightRuntime: number;
  fanRuntime: number;
  dustbinOpenCount: number;
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

function docId(deviceId: string, date: string): string {
  return `${deviceId}_${date}`;
}

// ─── RTDB helpers ─────────────────────────────────────────────────────────────

const rtdbAnalytics    = (did: string) => ref(rtdb, `devices/${did}/analytics`);
const rtdbOnAt         = (did: string) => ref(rtdb, `devices/${did}/onAt`);
const rtdbAnalyticsDate = (did: string) => ref(rtdb, `devices/${did}/analyticsDate`);
const rtdbCurrentSense = (did: string) => ref(rtdb, `devices/${did}/currentSense`);

// Power consumption constants
const NOMINAL_VOLTAGE = 230; // Volts (Indian standard)
const WATT: Record<string, number> = {
  light2: 40, light3: 40,
  fan1: 25, custom1: 30,
};

const TRACKABLE = ['light2','light3','fan1','custom1'] as const;
type TrackableKey = typeof TRACKABLE[number];

function runtimeField(key: string): string {
  return key === 'custom1' ? 'customRuntime' : `${key}Runtime`;
}

// ─── Day rollover — call before any analytics read/write ─────────────────────

/**
 * Check if the stored analytics date matches today.
 * If not, flush current RTDB analytics to Firestore and reset.
 * Returns today's date string.
 */
export async function ensureTodayWindow(deviceId: string): Promise<void> {
  const today = todayStr();
  const dateSnap = await get(rtdbAnalyticsDate(deviceId));
  const storedDate = dateSnap.val() as string | null;

  if (storedDate === today) {
    // Same day window — sanity check analytics values and onAt timestamps

    // 1. Remove stale onAt (> 24h old — from previous sessions or old code)
    const onAtSnap = await get(rtdbOnAt(deviceId));
    if (onAtSnap.exists()) {
      const onAtData = onAtSnap.val() as Record<string, number>;
      const cutoff = Date.now() - 24 * 3_600_000;
      const patch: Record<string, null> = {};
      let hasStale = false;
      for (const [k, ms] of Object.entries(onAtData)) {
        if (ms < cutoff) { patch[k] = null; hasStale = true; }
      }
      if (hasStale) await update(rtdbOnAt(deviceId), patch);
    }

    // 2. Sanity check: no single channel runtime should exceed 24h in a day
    const analyticsSnap = await get(rtdbAnalytics(deviceId));
    if (analyticsSnap.exists()) {
      const data = analyticsSnap.val() as Record<string, number>;
      const MAX_DAILY_HOURS = 24;
      const hasGarbage = Object.values(data).some(v => typeof v === 'number' && v > MAX_DAILY_HOURS);
      if (hasGarbage) {
        // Data is corrupted — reset today's window
        await set(rtdbAnalytics(deviceId), {
          light2Runtime: 0, light3Runtime: 0,
          fan1Runtime: 0, customRuntime: 0, energyUsage: 0,
        });
        await remove(rtdbOnAt(deviceId));
        // Re-seed onAt for currently ON devices
        const outputsSnap = await get(ref(rtdb, `devices/${deviceId}/outputs`));
        if (outputsSnap.exists()) {
          const outputs = outputsSnap.val() as Record<string, boolean>;
          const newOnAt: Record<string, number> = {};
          let any = false;
          for (const k of TRACKABLE) {
            if (outputs[k] === true) { newOnAt[k] = Date.now(); any = true; }
          }
          if (any) await update(rtdbOnAt(deviceId), newOnAt);
        }
      }
    }
    return;
  }

  // Date changed or first ever load — flush old and reset clean
  if (storedDate) {
    await flushDayToFirestore(deviceId, storedDate);
  }

  await set(rtdbAnalytics(deviceId), {
    light2Runtime: 0, light3Runtime: 0,
    fan1Runtime: 0, customRuntime: 0, energyUsage: 0,
  });
  await set(rtdbAnalyticsDate(deviceId), today);
  await remove(rtdbOnAt(deviceId));

  const outputsSnap = await get(ref(rtdb, `devices/${deviceId}/outputs`));
  if (outputsSnap.exists()) {
    const outputs = outputsSnap.val() as Record<string, boolean>;
    const newOnAt: Record<string, number> = {};
    let any = false;
    for (const k of TRACKABLE) {
      if (outputs[k] === true) { newOnAt[k] = Date.now(); any = true; }
    }
    if (any) await update(rtdbOnAt(deviceId), newOnAt);
  }
}

/**
 * Save current RTDB analytics to Firestore for the given date.
 */
async function flushDayToFirestore(deviceId: string, date: string): Promise<void> {
  try {
    const snap = await get(rtdbAnalytics(deviceId));
    if (!snap.exists()) return;
    const data = snap.val() as Omit<DailyAnalytics, 'id' | 'deviceId' | 'date' | 'savedAt'>;

    // Only save if there's any non-zero data
    const hasData = Object.values(data).some(v => (v as number) > 0);
    if (!hasData) return;

    const id = docId(deviceId, date);
    await setDoc(doc(db, 'device_analytics', id), {
      deviceId,
      date,
      ...data,
      savedAt: serverTimestamp(),
    }, { merge: true });
  } catch (err) {
    console.warn('[analytics] flushDayToFirestore failed:', err);
  }
}

// ─── Runtime tracking ─────────────────────────────────────────────────────────

/**
 * Called when a device output changes.
 * ON  → set onAt timestamp
 * OFF → compute elapsed, add to today's RTDB analytics, flush to Firestore
 * 
 * NOTE: Energy is primarily accumulated by server-side Cloud Function (every 60s).
 * This OFF-event calculation is a final cleanup to capture the last partial period.
 * 
 * CRITICAL: Uses RTDB transaction to prevent race condition with server-side tick.
 * Without transaction, OFF-event and server-side tick could both read the same
 * lastTickMs and double-count the overlapping time window.
 */
export async function trackOutputChange(
  deviceId: string,
  key: TrackableKey,
  value: boolean
): Promise<void> {
  await ensureTodayWindow(deviceId);

  if (value) {
    // Turning ON — record start timestamp
    await update(rtdbOnAt(deviceId), { [key]: Date.now() });
  } else {
    // Turning OFF — atomically compute and update energy using transaction
    const onAtSnap = await get(ref(rtdb, `devices/${deviceId}/onAt/${key}`));
    const onAtMs   = (onAtSnap.val() as number) || 0;

    if (onAtMs > 0) {
      const now = Date.now();
      
      // Read current sense data (outside transaction since read-only reference data)
      let currentData: Record<string, number> | null = null;
      try {
        const currentSnap = await get(rtdbCurrentSense(deviceId));
        if (currentSnap.exists()) {
          currentData = currentSnap.val() as Record<string, number>;
        }
      } catch {
        // currentSense not available
      }

      // Use transaction to atomically read lastTickMs and update energyTick + analytics
      const tickRef = ref(rtdb, `devices/${deviceId}/energyTick/${key}`);
      
      await runTransaction(tickRef, (lastTickMs) => {
        // Abort if channel was already turned off by another concurrent operation
        if (lastTickMs === null) return null;
        
        const tickMs = lastTickMs || onAtMs;
        const elapsed = (now - onAtMs) / 3_600_000; // hours
        const elapsedSinceTick = (now - tickMs) / 3_600_000;
        
        if (elapsed <= 0 || elapsedSinceTick <= 0) {
          return null; // Abort transaction
        }

        // Calculate energy delta for time since last server tick
        let energyDelta = 0;
        if (currentData) {
          const currentField = `${key}Current`;
          const actualCurrent = currentData[currentField];
          if (actualCurrent && actualCurrent > 0.01 && actualCurrent < 15) {
            const powerW = NOMINAL_VOLTAGE * actualCurrent;
            energyDelta = (powerW / 1000) * elapsedSinceTick;
          } else {
            energyDelta = (WATT[key] / 1000) * elapsedSinceTick;
          }
        } else {
          energyDelta = (WATT[key] / 1000) * elapsedSinceTick;
        }

        // Store computed values for post-transaction analytics update
        (tickRef as any)._offEventData = { elapsed, energyDelta, key };
        
        // Clear tick tracking (marks channel as OFF)
        return null;
      });

      // After transaction commits, update analytics and onAt
      const offData = (tickRef as any)._offEventData;
      if (offData) {
        const field = runtimeField(key);
        const curSnap = await get(rtdbAnalytics(deviceId));
        const cur = (curSnap.val() as Record<string, number>) || {};
        
        await update(rtdbAnalytics(deviceId), {
          [field]: (cur[field] || 0) + offData.elapsed,
          energyUsage: (cur.energyUsage || 0) + offData.energyDelta,
        });

        const today = todayStr();
        await flushDayToFirestore(deviceId, today);
        
        // Clean up temp data
        delete (tickRef as any)._offEventData;
      }
      
      // Clear onAt (marks channel as OFF in state tracking)
      await update(rtdbOnAt(deviceId), { [key]: null });
    }
  }
}

/**
 * Bulk version for All On/Off buttons.
 * 
 * CRITICAL: Uses RTDB transaction for each OFF event to prevent race condition
 * with server-side tick. Sequential processing (not parallel) to avoid deadlocks.
 */
export async function trackBulkOutputChange(
  deviceId: string,
  changes: Partial<Record<TrackableKey, boolean>>
): Promise<void> {
  await ensureTodayWindow(deviceId);

  const now = Date.now();
  const onAtSnap = await get(rtdbOnAt(deviceId));
  const onAtData = (onAtSnap.val() as Record<string, number>) || {};
  const onAtPatch: Record<string, number | null> = {};

  // Read current sense data once (shared across all channels)
  let currentData: Record<string, number> | null = null;
  try {
    const currentSnap = await get(rtdbCurrentSense(deviceId));
    if (currentSnap.exists()) {
      currentData = currentSnap.val() as Record<string, number>;
    }
  } catch {
    // currentSense not available
  }

  // Collect OFF events that need transaction-based energy calculation
  const offEvents: Array<{ key: TrackableKey; onAtMs: number }> = [];
  
  for (const [k, val] of Object.entries(changes) as [TrackableKey, boolean][]) {
    if (val) {
      // Turning ON
      onAtPatch[k] = now;
    } else {
      // Turning OFF
      const onAtMs = onAtData[k] || 0;
      if (onAtMs > 0) {
        offEvents.push({ key: k, onAtMs });
        onAtPatch[k] = null; // Will clear after energy calculation
      }
    }
  }

  // Process OFF events sequentially using transactions (to prevent deadlocks)
  const energyUpdates: Array<{ field: string; runtime: number; energy: number }> = [];
  
  for (const { key, onAtMs } of offEvents) {
    const tickRef = ref(rtdb, `devices/${deviceId}/energyTick/${key}`);
    
    await runTransaction(tickRef, (lastTickMs) => {
      // Abort if already cleared
      if (lastTickMs === null) return null;
      
      const tickMs = lastTickMs || onAtMs;
      const elapsed = (now - onAtMs) / 3_600_000;
      const elapsedSinceTick = (now - tickMs) / 3_600_000;
      
      if (elapsed <= 0 || elapsedSinceTick <= 0) {
        return null; // Abort
      }

      // Calculate energy delta
      let energyDelta = 0;
      if (currentData) {
        const currentField = `${key}Current`;
        const actualCurrent = currentData[currentField];
        if (actualCurrent && actualCurrent > 0.01 && actualCurrent < 15) {
          const powerW = NOMINAL_VOLTAGE * actualCurrent;
          energyDelta = (powerW / 1000) * elapsedSinceTick;
        } else {
          energyDelta = (WATT[key] / 1000) * elapsedSinceTick;
        }
      } else {
        energyDelta = (WATT[key] / 1000) * elapsedSinceTick;
      }

      // Store for batch analytics update
      energyUpdates.push({
        field: runtimeField(key),
        runtime: elapsed,
        energy: energyDelta,
      });
      
      // Clear tick (marks OFF)
      return null;
    });
  }

  // Batch update analytics after all transactions complete
  if (energyUpdates.length > 0) {
    const curSnap = await get(rtdbAnalytics(deviceId));
    const cur = (curSnap.val() as Record<string, number>) || {};
    const analyticsPatch: Record<string, number> = {};
    
    let totalEnergy = cur.energyUsage || 0;
    for (const update of energyUpdates) {
      analyticsPatch[update.field] = (cur[update.field] || 0) + update.runtime;
      totalEnergy += update.energy;
    }
    analyticsPatch['energyUsage'] = totalEnergy;
    
    await update(rtdbAnalytics(deviceId), analyticsPatch);
    await flushDayToFirestore(deviceId, todayStr());
  }

  // Update onAt states (all ON/OFF changes)
  if (Object.keys(onAtPatch).length > 0) {
    await update(rtdbOnAt(deviceId), onAtPatch);
  }
}

// ─── RTDB subscriptions (for DeviceDetails live clock) ───────────────────────

export function subscribeToTodayAnalytics(
  deviceId: string,
  callback: (data: Record<string, number>) => void
): () => void {
  const r = rtdbAnalytics(deviceId);
  const handler = (snap: DataSnapshot) => {
    callback((snap.val() as Record<string, number>) || {});
  };
  onValue(r, handler);
  return () => off(r, 'value', handler);
}

export function subscribeToOnAt(
  deviceId: string,
  callback: (onAt: Record<string, number>) => void
): () => void {
  const r = rtdbOnAt(deviceId);
  const handler = (snap: DataSnapshot) => {
    callback((snap.val() as Record<string, number>) || {});
  };
  onValue(r, handler);
  return () => off(r, 'value', handler);
}

// ─── Firestore history reads ──────────────────────────────────────────────────

export async function getDailyAnalytics(
  deviceId: string,
  days: number
): Promise<DailyAnalytics[]> {
  try {
    const q = query(
      collection(db, 'device_analytics'),
      where('deviceId', '==', deviceId),
      orderBy('date', 'desc'),
      limit(days)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as DailyAnalytics));
  } catch (err) {
    console.warn('[analytics] getDailyAnalytics failed:', err);
    return [];
  }
}

export async function getTodayAnalytics(deviceId: string): Promise<DailyAnalytics | null> {
  try {
    const snap = await getDoc(doc(db, 'device_analytics', docId(deviceId, todayStr())));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as DailyAnalytics;
  } catch (err) {
    console.warn('[analytics] getTodayAnalytics failed:', err);
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

// ─── Reset ────────────────────────────────────────────────────────────────────

export async function resetTodayAnalytics(deviceId: string): Promise<void> {
  const today = todayStr();
  // Zero RTDB
  await set(rtdbAnalytics(deviceId), {
    light2Runtime: 0, light3Runtime: 0,
    fan1Runtime: 0, customRuntime: 0, energyUsage: 0,
  });
  await set(rtdbAnalyticsDate(deviceId), today);
  await remove(rtdbOnAt(deviceId));

  // Zero today's Firestore record if it exists
  try {
    await setDoc(doc(db, 'device_analytics', docId(deviceId, today)), {
      deviceId, date: today,
      light2Runtime: 0, light3Runtime: 0,
      fan1Runtime: 0, customRuntime: 0, energyUsage: 0,
      savedAt: serverTimestamp(),
    });
  } catch { /* ignore */ }

  // Restart onAt for currently-ON devices
  const outputsSnap = await get(ref(rtdb, `devices/${deviceId}/outputs`));
  if (outputsSnap.exists()) {
    const outputs = outputsSnap.val() as Record<string, boolean>;
    const newOnAt: Record<string, number | null> = {};
    let any = false;
    for (const k of TRACKABLE) {
      if (outputs[k] === true) { newOnAt[k] = Date.now(); any = true; }
    }
    if (any) await update(rtdbOnAt(deviceId), newOnAt);
  }
}

// ─── Activity logs ────────────────────────────────────────────────────────────

export async function getActivityLogs(deviceIds: string[], count = 20): Promise<ActivityLog[]> {
  if (!deviceIds.length) return [];
  try {
    const results: ActivityLog[] = [];
    for (let i = 0; i < deviceIds.length; i += 10) {
      const chunk = deviceIds.slice(i, i + 10);
      const q = query(
        collection(db, 'activity_logs'),
        where('deviceId', 'in', chunk),
        orderBy('timestamp', 'desc'),
        limit(count)
      );
      const snap = await getDocs(q);
      snap.docs.forEach(d => results.push({ id: d.id, ...d.data() } as ActivityLog));
    }
    return results.sort((a, b) => {
      const at = (a.timestamp as { seconds: number })?.seconds || 0;
      const bt = (b.timestamp as { seconds: number })?.seconds || 0;
      return bt - at;
    }).slice(0, count);
  } catch (err) {
    console.warn('[getActivityLogs] Failed:', err);
    return [];
  }
}

export function subscribeToActivityLogs(
  deviceIds: string[],
  callback: (logs: ActivityLog[]) => void,
  count = 20
): () => void {
  if (!deviceIds.length) { callback([]); return () => {}; }
  const unsubscribers: (() => void)[] = [];
  const allLogs = new Map<string, ActivityLog[]>();
  const merge = () => {
    const merged = Array.from(allLogs.values()).flat()
      .sort((a, b) => {
        const at = (a.timestamp as { seconds: number })?.seconds || 0;
        const bt = (b.timestamp as { seconds: number })?.seconds || 0;
        return bt - at;
      }).slice(0, count);
    callback(merged);
  };
  deviceIds.slice(0, 5).forEach(deviceId => {
    const q = query(
      collection(db, 'activity_logs'),
      where('deviceId', '==', deviceId),
      orderBy('timestamp', 'desc'),
      limit(count)
    );
    const unsub = onSnapshot(q, snap => {
      allLogs.set(deviceId, snap.docs.map(d => ({ id: d.id, ...d.data() } as ActivityLog)));
      merge();
    });
    unsubscribers.push(unsub);
  });
  return () => unsubscribers.forEach(u => u());
}

// ─── Legacy shim ──────────────────────────────────────────────────────────────
export async function getAllAnalytics(): Promise<AnalyticsEntry[]> { return []; }

/**
 * One-time cleanup — call on app load to wipe stale/corrupted RTDB analytics.
 * Resets analytics for any device whose stored values exceed 24h (physically impossible
 * for a single day). This clears the garbage "1470h" values from old data.
 */
export async function resetCorruptedAnalyticsIfNeeded(deviceId: string): Promise<void> {
  try {
    const analyticsSnap = await get(rtdbAnalytics(deviceId));
    if (!analyticsSnap.exists()) return;

    const data = analyticsSnap.val() as Record<string, number>;
    const MAX_DAILY_HOURS = 24;
    const isCorrupted = Object.values(data).some(
      v => typeof v === 'number' && v > MAX_DAILY_HOURS
    );

    if (!isCorrupted) return;

    // Corrupted — reset everything and start fresh from today
    await set(rtdbAnalytics(deviceId), {
      light2Runtime: 0, light3Runtime: 0,
      fan1Runtime: 0, customRuntime: 0, energyUsage: 0,
    });
    await set(rtdbAnalyticsDate(deviceId), todayStr());
    await remove(rtdbOnAt(deviceId));

    // Re-seed onAt for any channels currently ON
    const outputsSnap = await get(ref(rtdb, `devices/${deviceId}/outputs`));
    if (outputsSnap.exists()) {
      const outputs = outputsSnap.val() as Record<string, boolean>;
      const newOnAt: Record<string, number> = {};
      let any = false;
      for (const k of TRACKABLE) {
        if (outputs[k] === true) { newOnAt[k] = Date.now(); any = true; }
      }
      if (any) await update(rtdbOnAt(deviceId), newOnAt);
    }
  } catch {
    // Non-fatal — analytics will self-correct on next ensureTodayWindow call
  }
}
