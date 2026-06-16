/**
 * Analytics Service — Firestore + RTDB
 * ─────────────────────────────────────────────────────────────────────────────
 * Architecture:
 *
 * RTDB: devices/{deviceId}/
 *   onAt/{key}   = unix ms when device was turned ON (cleared on OFF)
 *   analytics/   = today's accumulated runtime (hours, float) — resets each day
 *   analyticsDate = "YYYY-MM-DD" of the current analytics window
 *
 * Firestore: device_analytics/{deviceId_YYYY-MM-DD}
 *   deviceId, date, light1Runtime .. customRuntime, energyUsage, savedAt
 *   One document per device per day — upserted when device turns OFF or at midnight.
 *
 * DeviceDetails shows: today's live runtime (RTDB onAt + today's stored)
 * Analytics page shows: Today / Last 7 days / Last 30 days (Firestore history)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  collection, doc, getDoc, getDocs, setDoc, query,
  where, orderBy, limit, onSnapshot, serverTimestamp,
} from 'firebase/firestore';
import {
  ref, get, set, update, remove, onValue, off, DataSnapshot,
} from 'firebase/database';
import { db, rtdb } from './firebase';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ActivityLog {
  id: string;
  deviceId: string;
  action: string;
  performedBy: string;
  timestamp: unknown;
}

export interface DailyAnalytics {
  id?: string;
  deviceId: string;
  date: string;        // "YYYY-MM-DD"
  light1Runtime: number;
  light2Runtime: number;
  light3Runtime: number;
  fan1Runtime: number;
  fan2Runtime: number;
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

export function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function docId(deviceId: string, date: string): string {
  return `${deviceId}_${date}`;
}

// ─── RTDB helpers ─────────────────────────────────────────────────────────────

const rtdbAnalytics    = (did: string) => ref(rtdb, `devices/${did}/analytics`);
const rtdbOnAt         = (did: string) => ref(rtdb, `devices/${did}/onAt`);
const rtdbAnalyticsDate = (did: string) => ref(rtdb, `devices/${did}/analyticsDate`);

const WATT: Record<string, number> = {
  light1: 40, light2: 40, light3: 40,
  fan1: 25, fan2: 25, custom1: 30,
};

const TRACKABLE = ['light1','light2','light3','fan1','fan2','custom1'] as const;
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
          light1Runtime: 0, light2Runtime: 0, light3Runtime: 0,
          fan1Runtime: 0, fan2Runtime: 0, customRuntime: 0, energyUsage: 0,
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
    light1Runtime: 0, light2Runtime: 0, light3Runtime: 0,
    fan1Runtime: 0, fan2Runtime: 0, customRuntime: 0, energyUsage: 0,
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
    // Turning OFF — compute elapsed and save
    const onAtSnap = await get(ref(rtdb, `devices/${deviceId}/onAt/${key}`));
    const onAtMs   = (onAtSnap.val() as number) || 0;

    if (onAtMs > 0) {
      const elapsed = (Date.now() - onAtMs) / 3_600_000; // hours
      if (elapsed > 0) {
        // Add to RTDB today counter
        const field = runtimeField(key);
        const curSnap = await get(rtdbAnalytics(deviceId));
        const cur = (curSnap.val() as Record<string, number>) || {};
        const prevRuntime = cur[field] || 0;
        const prevEnergy  = cur.energyUsage || 0;

        await update(rtdbAnalytics(deviceId), {
          [field]:      prevRuntime + elapsed,
          energyUsage:  prevEnergy  + (WATT[key] / 1000) * elapsed,
        });

        // Also flush the updated day to Firestore immediately
        const today = todayStr();
        await flushDayToFirestore(deviceId, today);
      }
      // Clear onAt
      await update(rtdbOnAt(deviceId), { [key]: null });
    }
  }
}

/**
 * Bulk version for All On/Off buttons.
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

  const curSnap = await get(rtdbAnalytics(deviceId));
  const cur = (curSnap.val() as Record<string, number>) || {};
  const analyticsPatch: Record<string, number> = {};

  for (const [k, val] of Object.entries(changes) as [TrackableKey, boolean][]) {
    if (val) {
      onAtPatch[k] = now;
    } else {
      const onAtMs = onAtData[k] || 0;
      if (onAtMs > 0) {
        const elapsed = (now - onAtMs) / 3_600_000;
        if (elapsed > 0) {
          const field = runtimeField(k);
          analyticsPatch[field] = (cur[field] || 0) + elapsed;
          analyticsPatch['energyUsage'] = (analyticsPatch['energyUsage'] ?? cur['energyUsage'] ?? 0) + (WATT[k] / 1000) * elapsed;
        }
        onAtPatch[k] = null;
      }
    }
  }

  if (Object.keys(analyticsPatch).length > 0) {
    await update(rtdbAnalytics(deviceId), analyticsPatch);
    await flushDayToFirestore(deviceId, todayStr());
  }
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
    light1Runtime: acc.light1Runtime + (r.light1Runtime || 0),
    light2Runtime: acc.light2Runtime + (r.light2Runtime || 0),
    light3Runtime: acc.light3Runtime + (r.light3Runtime || 0),
    fan1Runtime:   acc.fan1Runtime   + (r.fan1Runtime   || 0),
    fan2Runtime:   acc.fan2Runtime   + (r.fan2Runtime   || 0),
    customRuntime: acc.customRuntime + (r.customRuntime  || 0),
    energyUsage:   acc.energyUsage   + (r.energyUsage   || 0),
  }), {
    light1Runtime: 0, light2Runtime: 0, light3Runtime: 0,
    fan1Runtime: 0, fan2Runtime: 0, customRuntime: 0, energyUsage: 0,
  });
}

// ─── Reset ────────────────────────────────────────────────────────────────────

export async function resetTodayAnalytics(deviceId: string): Promise<void> {
  const today = todayStr();
  // Zero RTDB
  await set(rtdbAnalytics(deviceId), {
    light1Runtime: 0, light2Runtime: 0, light3Runtime: 0,
    fan1Runtime: 0, fan2Runtime: 0, customRuntime: 0, energyUsage: 0,
  });
  await set(rtdbAnalyticsDate(deviceId), today);
  await remove(rtdbOnAt(deviceId));

  // Zero today's Firestore record if it exists
  try {
    await setDoc(doc(db, 'device_analytics', docId(deviceId, today)), {
      deviceId, date: today,
      light1Runtime: 0, light2Runtime: 0, light3Runtime: 0,
      fan1Runtime: 0, fan2Runtime: 0, customRuntime: 0, energyUsage: 0,
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
