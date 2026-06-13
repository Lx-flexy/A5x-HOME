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
const rtdbStatus    = (did: string) => ref(rtdb, `devices/${did}/status`);

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

export function subscribeToUserDevices(
  userId: string,
  callback: (devices: Device[]) => void
): () => void {
  const q = query(
    collection(db, 'devices_meta'),
    where('ownerId', '==', userId),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as Device)));
  });
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

// ─── RTDB: device online/offline status ──────────────────────────────────────

export function subscribeToDeviceStatus(
  deviceId: string,
  callback: (status: 'online' | 'offline') => void
): () => void {
  const r = rtdbStatus(deviceId);
  const handler = (snap: DataSnapshot) => {
    callback((snap.val() as 'online' | 'offline') || 'offline');
  };
  onValue(r, handler);
  return () => off(r, 'value', handler);
}

// ─── RTDB: write output toggle ────────────────────────────────────────────────

const WATT: Record<string, number> = {
  light1: 40, light2: 40, light3: 40,
  fan1: 25, fan2: 25, custom1: 30,
};

export async function setOutput(
  deviceId: string,
  key: keyof DeviceOutputs,
  value: boolean | string,
  performedBy: string,
  label?: string
): Promise<void> {
  // Write to RTDB — ESP32 onValue listener picks this up instantly
  await update(rtdbOutputs(deviceId), { [key]: value });

  if (label) {
    await logActivity(deviceId, label, performedBy);
    if (typeof value === 'boolean' && value === true && key in WATT) {
      await incrementAnalytics(deviceId, key as string);
    }
  }
}

async function incrementAnalytics(deviceId: string, key: string): Promise<void> {
  try {
    const runtimeField = key === 'custom1' ? 'customRuntime' : `${key}Runtime`;
    const snap = await get(rtdbAnalytics(deviceId));
    const cur: DeviceAnalyticsData = (snap.val() as DeviceAnalyticsData) || defaultAnalytics();
    const prevRuntime = (cur[runtimeField as keyof DeviceAnalyticsData] as number) || 0;
    const prevEnergy  = cur.energyUsage || 0;
    const inc = 0.5; // +0.5h estimated per toggle-ON
    await update(rtdbAnalytics(deviceId), {
      [runtimeField]: prevRuntime + inc,
      energyUsage: prevEnergy + (WATT[key] / 1000) * inc,
    });
  } catch (err) {
    console.warn('[incrementAnalytics] Failed:', err);
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
  if (label) await logActivity(deviceId, label, performedBy);
}

export interface LegacyDeviceState extends DeviceOutputs {
  deviceId: string;
}
export type DeviceState = LegacyDeviceState;
