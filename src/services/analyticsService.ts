/**
 * analyticsService — Firestore only (activity logs, historical records)
 * Live runtime analytics are read directly from RTDB via deviceService.
 */
import {
  collection, getDocs, query, where, orderBy, limit, onSnapshot,
} from 'firebase/firestore';
import { db } from './firebase';

export interface ActivityLog {
  id: string;
  deviceId: string;
  action: string;
  performedBy: string;
  timestamp: unknown;
}

// ─── Activity logs (one-time fetch) ──────────────────────────────────────────

export async function getActivityLogs(deviceIds: string[], count = 20): Promise<ActivityLog[]> {
  if (!deviceIds.length) return [];
  try {
    const results: ActivityLog[] = [];
    // chunk to 10 to stay under Firestore 'in' limit
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
    return results
      .sort((a, b) => {
        const at = (a.timestamp as { seconds: number })?.seconds || 0;
        const bt = (b.timestamp as { seconds: number })?.seconds || 0;
        return bt - at;
      })
      .slice(0, count);
  } catch (err) {
    console.warn('[getActivityLogs] Failed:', err);
    return [];
  }
}

// ─── Activity logs (real-time, multi-device) ──────────────────────────────────

export function subscribeToActivityLogs(
  deviceIds: string[],
  callback: (logs: ActivityLog[]) => void,
  count = 20
): () => void {
  if (!deviceIds.length) { callback([]); return () => {}; }

  const unsubscribers: (() => void)[] = [];
  const allLogs = new Map<string, ActivityLog[]>();

  const merge = () => {
    const merged = Array.from(allLogs.values())
      .flat()
      .sort((a, b) => {
        const at = (a.timestamp as { seconds: number })?.seconds || 0;
        const bt = (b.timestamp as { seconds: number })?.seconds || 0;
        return bt - at;
      })
      .slice(0, count);
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

// ─── Shim types kept for Analytics page ──────────────────────────────────────

export interface AnalyticsEntry {
  id?: string;
  deviceId: string;
  date?: string;
  lightRuntime: number;
  fanRuntime: number;
  energyUsage: number;
  dustbinOpenCount: number;
}

/** No-op shim — Analytics page will read from RTDB directly */
export async function getAllAnalytics(
  _userId: string,
  _deviceIds: string[],
  _tab = 'Weekly'
): Promise<AnalyticsEntry[]> {
  return [];
}
