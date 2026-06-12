import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
} from 'firebase/firestore';
import { db } from './firebase';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AnalyticsEntry {
  id: string;
  deviceId: string;
  date: string;              // YYYY-MM-DD
  lightRuntime: number;      // hours
  fanRuntime: number;        // hours
  energyUsage: number;       // kWh
  dustbinOpenCount: number;
}

export interface ActivityLog {
  id: string;
  deviceId: string;
  action: string;
  performedBy: string;
  timestamp: unknown;
}

// ─── Analytics Queries ────────────────────────────────────────────────────────

export async function getDeviceAnalytics(deviceId: string, days = 7): Promise<AnalyticsEntry[]> {
  try {
    const q = query(
      collection(db, 'analytics'),
      where('deviceId', '==', deviceId),
      orderBy('date', 'desc'),
      limit(days)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as AnalyticsEntry));
  } catch (err) {
    console.warn('[getDeviceAnalytics] Failed:', err);
    return [];
  }
}

export async function getAllAnalytics(
  _userId: string,
  deviceIds: string[],
  tab: 'Today' | 'Weekly' | 'Monthly' = 'Weekly'
): Promise<AnalyticsEntry[]> {
  if (deviceIds.length === 0) return [];

  // Compute date range filter
  const now = new Date();
  let startDate: string;
  if (tab === 'Today') {
    startDate = now.toISOString().split('T')[0];
  } else if (tab === 'Weekly') {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    startDate = d.toISOString().split('T')[0];
  } else {
    const d = new Date(now);
    d.setDate(d.getDate() - 30);
    startDate = d.toISOString().split('T')[0];
  }

  try {
    const results: AnalyticsEntry[] = [];
    // Batch into chunks of 10 for 'in' query (Firestore limit: 30, but keep smaller)
    const chunks: string[][] = [];
    for (let i = 0; i < deviceIds.length; i += 10) chunks.push(deviceIds.slice(i, i + 10));

    for (const chunk of chunks) {
      const q = query(
        collection(db, 'analytics'),
        where('deviceId', 'in', chunk),
        where('date', '>=', startDate),
        orderBy('date', 'desc'),
        limit(30)
      );
      const snap = await getDocs(q);
      snap.docs.forEach(d => results.push({ id: d.id, ...d.data() } as AnalyticsEntry));
    }
    return results;
  } catch (err) {
    console.warn('[getAllAnalytics] Failed:', err);
    return [];
  }
}

// ─── Activity Logs ────────────────────────────────────────────────────────────

export async function getActivityLogs(deviceIds: string[], count = 20): Promise<ActivityLog[]> {
  if (deviceIds.length === 0) return [];
  try {
    const results: ActivityLog[] = [];
    const chunks: string[][] = [];
    for (let i = 0; i < deviceIds.length; i += 10) chunks.push(deviceIds.slice(i, i + 10));

    for (const chunk of chunks) {
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

export function subscribeToActivityLogs(
  deviceIds: string[],
  callback: (logs: ActivityLog[]) => void,
  count = 20
) {
  if (deviceIds.length === 0) {
    callback([]);
    return () => {};
  }
  // Subscribe to first device's logs (onSnapshot doesn't support 'in' + orderBy cross-collection well)
  // For full real-time, we take the first 3 devices
  const unsubscribers: (() => void)[] = [];
  const allLogs: Map<string, ActivityLog[]> = new Map();

  deviceIds.slice(0, 3).forEach(deviceId => {
    const q = query(
      collection(db, 'activity_logs'),
      where('deviceId', '==', deviceId),
      orderBy('timestamp', 'desc'),
      limit(count)
    );
    const unsub = onSnapshot(q, snap => {
      allLogs.set(deviceId, snap.docs.map(d => ({ id: d.id, ...d.data() } as ActivityLog)));
      const merged = Array.from(allLogs.values())
        .flat()
        .sort((a, b) => {
          const at = (a.timestamp as { seconds: number })?.seconds || 0;
          const bt = (b.timestamp as { seconds: number })?.seconds || 0;
          return bt - at;
        })
        .slice(0, count);
      callback(merged);
    });
    unsubscribers.push(unsub);
  });

  return () => unsubscribers.forEach(u => u());
}
