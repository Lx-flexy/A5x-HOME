/**
 * HYBRID ARCHITECTURE
 * ─────────────────────────────────────────────────────────────────────────────
 * Firebase Realtime Database  →  live device state (outputs, health, analytics, status)
 *   RTDB path: devices/{deviceId}/
 *     status      "online" | "offline"
 *     lastSeen    unix ms
 *     outputs/    light1, light2, light3, fan1, fan2, custom1, oledMessage, buzzer
 *     health/     rssi, heap, restartCount, uptime, wifiUptime, wifiStatus, firebaseStatus
 *     analytics/  light1Runtime…customRuntime, energyUsage
 *
 * Firestore  →  persistent metadata & audit logs
 *   devices_meta/{autoId}   device registration (ownerId, name, room, etc.)
 *   activity_logs/{autoId}  every control action
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  collection, doc, addDoc, getDoc, getDocs,
  setDoc, updateDoc, deleteDoc, onSnapshot,
  query, where, serverTimestamp, orderBy,
} from 'firebase/firestore';
import {
  ref, set, update, onValue, off,
  get, remove, DataSnapshot,
} from 'firebase/database';
import { db, rtdb } from './firebase';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Device {
  id: string;        // Firestore devices_meta autoId
  deviceId: string;  // e.g. "A5X-HA-2647"
  ownerId: string;
  name: string;
  room: string;
  location: string;
  firmware: string;
  dexBotId?: string;
  createdAt: unknown;
  updatedAt?: unknown;
}

export interface DeviceOutputs {
  light1: boolean;
  light2: boolean;
  light3: boolean;
  fan1: boolean;
  fan2: boolean;
  custom1: boolean;
  oledMessage: string;
  buzzer: boolean;
}

export interface DeviceHealth {
  rssi: number;
  heap: number;
  restartCount: number;
  uptime: number;
  wifiUptime: number;
  wifiStatus: 'connected' | 'disconnected';
  firebaseStatus: 'connected' | 'disconnected';
  lastSeen?: number;
}

export interface DeviceAnalyticsData {
  light1Runtime: number;
  light2Runtime: number;
  light3Runtime: number;
  fan1Runtime: number;
  fan2Runtime: number;
  customRuntime: number;
  energyUsage: number;
}

export interface ActivityLog {
  id: string;
  deviceId: string;
  action: string;
  performedBy: string;
  timestamp: unknown;
}

// ─── RTDB path helpers ────────────────────────────────────────────────────────

const rtdbDevice    = (did: string) => ref(rtdb, `devices/${did}`);
const rtdbOutputs   = (did: string) => ref(rtdb, `devices/${did}/outputs`);
const rtdbHealth    = (did: string) => ref(rtdb, `devices/${did}/health`);
const rtdbAnalytics = (did: string) => ref(rtdb, `devices/${did}/analytics`);

// ─── Defaults ────────────────────────────────────────────────────────────────

function defaultOutputs(): DeviceOutputs {
  return {
    light1: false, light2: false, light3: false,
    fan1: false, fan2: false, custom1: false,
    oledMessage: '', buzzer: false,
  };
}

function defaultHealth(): DeviceHealth {
  return {
    rssi: 0, heap: 0, restartCount: 0,
    uptime: 0, wifiUptime: 0,
    wifiStatus: 'disconnected', firebaseStatus: 'disconnected',
  };
}

function defaultAnalytics(): DeviceAnalyticsData {
  return {
    light1Runtime: 0, light2Runtime: 0, light3Runtime: 0,
    fan1Runtime: 0, fan2Runtime: 0, customRuntime: 0, energyUsage: 0,
  };
}

// ─── Device registration ──────────────────────────────────────────────────────

export async function addDevice(data: Omit<Device, 'id' | 'updatedAt'>) {
  // 1. Seed RTDB node  — ESP32 reads outputs/, writes health/ + status
  await set(rtdbDevice(data.deviceId), {
    status: 'offline',
    lastSeen: 0,
    outputs: defaultOutputs(),
    health: defaultHealth(),
    analytics: defaultAnalytics(),
  });

  // 2. Register in Firestore for listing by ownerId
  const metaRef = await addDoc(collection(db, 'devices_meta'), {
    deviceId:  data.deviceId,
    ownerId:   data.ownerId,
    name:      data.name,
    room:      data.room,
    location:  data.location,
    firmware:  data.firmware || 'v1.2.4',
    dexBotId:  data.dexBotId || '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await logActivity(data.deviceId, `Device "${data.name}" added to ${data.room}`, data.ownerId);
  return metaRef.id;
}

export async function getDevice(metaId: string): Promise<Device | null> {
  const snap = await getDoc(doc(db, 'devices_meta', metaId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Device;
}

export async function getUserDevices(userId: string): Promise<Device[]> {
  const q = query(
    collection(db, 'devices_meta'),
    where('ownerId', '==', userId),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Device));
}

export async function updateDevice(metaId: string, data: Partial<Omit<Device, 'id'>>) {
  await updateDoc(doc(db, 'devices_meta', metaId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteDevice(metaId: string, deviceId: string, ownerId: string) {
  await remove(rtdbDevice(deviceId)).catch(() => {});
  await deleteDoc(doc(db, 'devices_meta', metaId));
  await logActivity(deviceId, 'Device removed', ownerId).catch(() => {});
}

// ─── Firestore: list devices (real-time) ──────────────────────────────────────
// Returns BOTH owned devices AND devices shared with this user via members collection.

export function subscribeToUserDevices(
  userId: string,
  callback: (devices: Device[]) => void
): () => void {
  let ownedDevices:  Device[] = [];
  let sharedDevices: Device[] = [];

  // Merge + deduplicate, owned first
  const emit = () => {
    const seen  = new Set<string>();
    const merged: Device[] = [];
    for (const d of [...ownedDevices, ...sharedDevices]) {
      if (!seen.has(d.id)) { seen.add(d.id); merged.push(d); }
    }
    callback(merged);
  };

  // 1. Owned devices (user is the owner)
  const ownedQ = query(
    collection(db, 'devices_meta'),
    where('ownerId', '==', userId),
    orderBy('createdAt', 'desc')
  );
  const unsubOwned = onSnapshot(ownedQ, snap => {
    ownedDevices = snap.docs.map(d => ({ id: d.id, ...d.data() } as Device));
    emit();
  });

  // 2. Shared devices (user is a member — look up via members collection)
  const membersQ = query(
    collection(db, 'members'),
    where('uid', '==', userId)
  );
  let unsubShared: (() => void) | null = null;

  const unsubMembers = onSnapshot(membersQ, async membersSnap => {
    // Unsubscribe previous shared device listener
    if (unsubShared) { unsubShared(); unsubShared = null; }

    const deviceIds = membersSnap.docs
      .map(d => d.data().deviceId as string)
      .filter(Boolean);

    if (deviceIds.length === 0) {
      sharedDevices = [];
      emit();
      return;
    }

    // Fetch devices_meta for each shared deviceId
    // Firestore 'in' limit is 30 — batch if needed
    const chunks: string[][] = [];
    for (let i = 0; i < deviceIds.length; i += 30) {
      chunks.push(deviceIds.slice(i, i + 30));
    }

    try {
      const results: Device[] = [];
      for (const chunk of chunks) {
        const q = query(
          collection(db, 'devices_meta'),
          where('deviceId', 'in', chunk)
        );
        const snap = await getDocs(q);
        snap.docs.forEach(d => results.push({ id: d.id, ...d.data() } as Device));
      }
      // Exclude devices already owned by this user
      sharedDevices = results.filter(d => d.ownerId !== userId);
      emit();
    } catch (err) {
      console.warn('[subscribeToUserDevices] shared fetch failed:', err);
      sharedDevices = [];
      emit();
    }
  });

  return () => {
    unsubOwned();
    unsubMembers();
    if (unsubShared) unsubShared();
  };
}

// ─── RTDB: outputs ────────────────────────────────────────────────────────────

export function subscribeToOutputs(
  deviceId: string,
  callback: (outputs: DeviceOutputs) => void
): () => void {
  const r = rtdbOutputs(deviceId);
  const handler = (snap: DataSnapshot) => {
    const val = snap.val() as DeviceOutputs | null;
    if (val) {
      callback(val);
    } else {
      set(r, defaultOutputs()).catch(() => {});
      callback(defaultOutputs());
    }
  };
  onValue(r, handler);
  return () => off(r, 'value', handler);
}

// ─── RTDB: health ─────────────────────────────────────────────────────────────

export function subscribeToHealth(
  deviceId: string,
  callback: (health: DeviceHealth) => void
): () => void {
  const r = rtdbHealth(deviceId);
  const handler = (snap: DataSnapshot) => {
    callback((snap.val() as DeviceHealth) || defaultHealth());
  };
  onValue(r, handler);
  return () => off(r, 'value', handler);
}

// ─── RTDB: analytics ──────────────────────────────────────────────────────────

export function subscribeToAnalytics(
  deviceId: string,
  callback: (analytics: DeviceAnalyticsData) => void
): () => void {
  const r = rtdbAnalytics(deviceId);
  const handler = (snap: DataSnapshot) => {
    callback((snap.val() as DeviceAnalyticsData) || defaultAnalytics());
  };
  onValue(r, handler);
  return () => off(r, 'value', handler);
}

/**
 * Subscribe to onAt timestamps — so UI can show live running clock
 * devices/{deviceId}/onAt/{key} = unix ms when device was turned ON
 */
export function subscribeToOnAt(
  deviceId: string,
  callback: (onAt: Record<string, number>) => void
): () => void {
  const r = ref(rtdb, `devices/${deviceId}/onAt`);
  const handler = (snap: DataSnapshot) => {
    callback((snap.val() as Record<string, number>) || {});
  };
  onValue(r, handler);
  return () => off(r, 'value', handler);
}

/**
 * Reset all analytics for a device back to zero.
 * Also clears onAt timestamps.
 */
export async function resetAnalytics(deviceId: string): Promise<void> {
  await set(rtdbAnalytics(deviceId), defaultAnalytics());
  await remove(ref(rtdb, `devices/${deviceId}/onAt`));
}

// ─── RTDB: device online/offline status ──────────────────────────────────────
// ESP32 writes devices/{deviceId}/health/lastSeen as unix SECONDS every ~10s.
// Online = (now_ms - lastSeen_seconds * 1000) < 30 000 ms

export const ONLINE_THRESHOLD_MS = 30_000;

/**
 * Subscribe to health/lastSeen.
 * Normalises the value to unix MILLISECONDS regardless of whether
 * the ESP32 sends seconds (≤ 2 147 483 647) or ms (> 2 147 483 647).
 * Returns 0 if never written — device shows Offline correctly.
 */
export function subscribeToLastSeen(
  deviceId: string,
  callback: (lastSeenMs: number) => void
): () => void {
  const r = ref(rtdb, `devices/${deviceId}/health/lastSeen`);
  const handler = (snap: DataSnapshot) => {
    const raw = (snap.val() as number) || 0;
    if (!raw) { callback(0); return; }
    const ms = raw < 4_102_444_800 ? raw * 1000 : raw;
    callback(ms);
  };
  onValue(r, handler);
  return () => off(r, 'value', handler);
}

/** Compat shim — derives online/offline from lastSeen */
export function subscribeToDeviceStatus(
  deviceId: string,
  callback: (status: 'online' | 'offline') => void
): () => void {
  return subscribeToLastSeen(deviceId, ms => {
    callback(ms > 0 && Date.now() - ms < ONLINE_THRESHOLD_MS ? 'online' : 'offline');
  });
}

/** One-shot helper — resolves to current online state */
export async function getDeviceOnlineStatus(deviceId: string): Promise<boolean> {
  const snap = await get(ref(rtdb, `devices/${deviceId}/health/lastSeen`));
  const raw = (snap.val() as number) || 0;
  if (!raw) return false;
  const ms = raw < 4_102_444_800 ? raw * 1000 : raw;
  return Date.now() - ms < ONLINE_THRESHOLD_MS;
}

// ─── RTDB: write output toggle ────────────────────────────────────────────────

const WATT: Record<string, number> = {
  light1: 40, light2: 40, light3: 40,
  fan1: 25, fan2: 25, custom1: 30,
};

// Path where we store the "turned ON at" timestamp for each output
// devices/{deviceId}/onAt/{key} = unix ms
const rtdbOnAt = (deviceId: string) => ref(rtdb, `devices/${deviceId}/onAt`);

export async function setOutput(
  deviceId: string,
  key: keyof DeviceOutputs,
  value: boolean | string,
  performedBy: string,
  label?: string
): Promise<void> {
  // Write to RTDB — ESP32 onValue listener picks this up instantly
  await update(rtdbOutputs(deviceId), { [key]: value });

  // Real-time runtime tracking for boolean outputs
  if (typeof value === 'boolean' && key in WATT) {
    if (value) {
      // Device turned ON → save "onAt" timestamp
      await update(rtdbOnAt(deviceId), { [key]: Date.now() });
    } else {
      // Device turned OFF → calculate elapsed time and add to analytics
      const onAtSnap = await get(ref(rtdb, `devices/${deviceId}/onAt/${key}`));
      const onAtMs   = (onAtSnap.val() as number) || 0;
      if (onAtMs > 0) {
        const elapsedHours = (Date.now() - onAtMs) / 3_600_000; // ms → hours
        if (elapsedHours > 0) {
          await addRuntimeToAnalytics(deviceId, key as string, elapsedHours);
        }
        // Clear onAt so it doesn't count again
        await update(rtdbOnAt(deviceId), { [key]: null });
      }
    }
  }

  if (label) {
    await logActivity(deviceId, label, performedBy);
  }
}

/**
 * Add actual elapsed hours to analytics runtime + energy.
 * Called when a device is turned OFF with exact duration.
 */
async function addRuntimeToAnalytics(
  deviceId: string,
  key: string,
  elapsedHours: number
): Promise<void> {
  try {
    const runtimeField = key === 'custom1' ? 'customRuntime' : `${key}Runtime`;
    const snap = await get(rtdbAnalytics(deviceId));
    const cur: DeviceAnalyticsData = (snap.val() as DeviceAnalyticsData) || defaultAnalytics();
    const prevRuntime = (cur[runtimeField as keyof DeviceAnalyticsData] as number) || 0;
    const prevEnergy  = cur.energyUsage || 0;
    await update(rtdbAnalytics(deviceId), {
      [runtimeField]: prevRuntime + elapsedHours,
      energyUsage:    prevEnergy  + (WATT[key] / 1000) * elapsedHours,
    });
  } catch (err) {
    console.warn('[addRuntimeToAnalytics] Failed:', err);
  }
}

// ─── Firestore: activity logs ─────────────────────────────────────────────────

export async function logActivity(
  deviceId: string,
  action: string,
  performedBy: string
): Promise<void> {
  try {
    await addDoc(collection(db, 'activity_logs'), {
      deviceId, action, performedBy,
      timestamp: serverTimestamp(),
    });
  } catch (err) {
    console.warn('[logActivity] Failed:', err);
  }
}

export function subscribeToActivityLogs(
  deviceId: string,
  callback: (logs: ActivityLog[]) => void
): () => void {
  const q = query(
    collection(db, 'activity_logs'),
    where('deviceId', '==', deviceId),
    orderBy('timestamp', 'desc')
  );
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as ActivityLog)));
  });
}

// ─── Legacy shims (DexBot / old pages still import these) ────────────────────

export { subscribeToActivityLogs as subscribeToDeviceLogs };

export function subscribeToDeviceState(
  deviceId: string,
  callback: (state: LegacyDeviceState) => void
): () => void {
  return subscribeToOutputs(deviceId, outputs => {
    callback({ deviceId, ...outputs });
  });
}

export async function updateDeviceState(
  deviceId: string,
  data: Partial<LegacyDeviceState>,
  performedBy = 'system',
  label?: string
): Promise<void> {
  const outputKeys: (keyof DeviceOutputs)[] = [
    'light1', 'light2', 'light3', 'fan1', 'fan2', 'custom1', 'oledMessage', 'buzzer',
  ];
  const patch: Partial<DeviceOutputs> = {};
  outputKeys.forEach(k => {
    if (k in data) (patch as Record<string, unknown>)[k] = (data as Record<string, unknown>)[k];
  });
  await update(rtdbOutputs(deviceId), patch);

  // Track runtime for each boolean key being changed
  const trackableKeys = ['light1','light2','light3','fan1','fan2','custom1'] as const;
  const now = Date.now();

  // Fetch all current onAt timestamps in one read
  const onAtSnap = await get(rtdbOnAt(deviceId));
  const onAtData = (onAtSnap.val() as Record<string, number>) || {};
  const onAtPatch: Record<string, number | null> = {};

  for (const k of trackableKeys) {
    if (!(k in data)) continue;
    const val = (data as Record<string, unknown>)[k];
    if (typeof val !== 'boolean') continue;

    if (val) {
      // Turning ON — record timestamp
      onAtPatch[k] = now;
    } else {
      // Turning OFF — calculate elapsed and add to analytics
      const onAtMs = onAtData[k] || 0;
      if (onAtMs > 0) {
        const elapsedHours = (now - onAtMs) / 3_600_000;
        if (elapsedHours > 0) {
          await addRuntimeToAnalytics(deviceId, k, elapsedHours);
        }
        onAtPatch[k] = null; // clear
      }
    }
  }

  if (Object.keys(onAtPatch).length > 0) {
    await update(rtdbOnAt(deviceId), onAtPatch);
  }

  if (label) await logActivity(deviceId, label, performedBy);
}

export interface LegacyDeviceState extends DeviceOutputs {
  deviceId: string;
}
export type DeviceState = LegacyDeviceState;
