import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';

export interface AnalyticsEntry {
  id: string;
  deviceId: string;
  date: string;
  lightRuntime: number;
  fanRuntime: number;
  energyUsage: number;
  dustbinOpenCount: number;
}

export interface ActivityLog {
  id: string;
  deviceId: string;
  action: string;
  performedBy: string;
  timestamp: unknown;
}

export async function getDeviceAnalytics(deviceId: string, days = 7): Promise<AnalyticsEntry[]> {
  const q = query(
    collection(db, 'analytics'),
    where('deviceId', '==', deviceId),
    orderBy('date', 'desc'),
    limit(days)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as AnalyticsEntry));
}

export async function getAllAnalytics(_userId: string, deviceIds: string[]): Promise<AnalyticsEntry[]> {
  if (deviceIds.length === 0) return [];
  const results: AnalyticsEntry[] = [];
  for (const deviceId of deviceIds) {
    const q = query(
      collection(db, 'analytics'),
      where('deviceId', '==', deviceId),
      orderBy('date', 'desc'),
      limit(30)
    );
    const snap = await getDocs(q);
    snap.docs.forEach(d => results.push({ id: d.id, ...d.data() } as AnalyticsEntry));
  }
  return results;
}

export async function getActivityLogs(deviceIds: string[], count = 20): Promise<ActivityLog[]> {
  if (deviceIds.length === 0) return [];
  const results: ActivityLog[] = [];
  for (const deviceId of deviceIds.slice(0, 3)) {
    const q = query(
      collection(db, 'activity_logs'),
      where('deviceId', '==', deviceId),
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
  });
}

export async function recordAnalytics(data: Omit<AnalyticsEntry, 'id'>) {
  return addDoc(collection(db, 'analytics'), {
    ...data,
    createdAt: serverTimestamp(),
  });
}
