import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
  orderBy,
  writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';

// ─────────────────────────────────────────────────────────────────────────────
// FIREBASE STRUCTURE
//
// devices/{deviceId}           ← keyed by deviceId string (e.g. "A5X-HA-2647")
//   meta/                      ← written by web app
//     name, room, location, ownerId, firmware, status, createdAt, updatedAt
//   outputs/                   ← written by web app → read by ESP32
//     light1, light2, light3   boolean
//     fan1, fan2               boolean
//     custom1                  boolean
//     oledMessage              string
//     buzzer                   boolean
//     updatedAt
//   health/                    ← written by ESP32 → read by web app
//     rssi                     number  (dBm)
//     heap                     number  (bytes)
//     restartCount             number
//     uptime                   number  (seconds – device uptime)
//     wifiUptime               number  (seconds – wifi uptime)
//     wifiStatus               "connected"|"disconnected"
//     firebaseStatus           "connected"|"disconnected"
//     lastSeen                 Timestamp
//   analytics/                 ← written by web app, updated on each toggle-ON
//     light1Runtime            number (hours)
//     light2Runtime            number
//     light3Runtime            number
//     fan1Runtime              number
//     fan2Runtime              number
//     customRuntime            number
//     energyUsage              number (kWh)
//     updatedAt
//
// devices_meta/{autoId}        ← Firestore list for querying by ownerId
//   deviceId, ownerId, name, room, location, firmware, status, createdAt
//
// activity_logs/{autoId}
//   deviceId, action, performedBy, timestamp
// ─────────────────────────────────────────────────────────────────────────────

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Device {
  id: string;          // Firestore auto-id of devices_meta doc
  deviceId: string;    // e.g. "A5X-HA-2647"
  ownerId: string;
  name: string;
  room: string;
  location: string;
  status: 'online' | 'offline';
  dexBotId?: string;
  firmware: string;
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
  updatedAt?: unknown;
}

export interface DeviceHealth {
  rssi: number;
  heap: number;
  restartCount: number;
  uptime: number;
  wifiUptime: number;
  wifiStatus: 'connected' | 'disconnected';
  firebaseStatus: 'connected' | 'disconnected';
  lastSeen?: unknown;
}

export interface DeviceAnalyticsData {
  light1Runtime: number;
  light2Runtime: number;
  light3Runtime: number;
  fan1Runtime: number;
  fan2Runtime: number;
  customRuntime: number;
  energyUsage: number;
  updatedAt?: unknown;
}

export interface ActivityLog {
  id: string;
  deviceId: string;
  action: string;
  performedBy: string;
  timestamp: unknown;
}

// ─── Default factories ────────────────────────────────────────────────────────

function defaultOutputs(): Omit<DeviceOutputs, 'updatedAt'> {
  return {
    light1: false, light2: false, light3: false,
    fan1: false, fan2: false,
    custom1: false,
    oledMessage: '',
    buzzer: false,
  };
}

function defaultHealth(): DeviceHealth {
  return {
    rssi: 0, heap: 0, restartCount: 0,
    uptime: 0, wifiUptime: 0,
    wifiStatus: 'disconnected',
    firebaseStatus: 'disconnected',
  };
}

function defaultAnalytics(): Omit<DeviceAnalyticsData, 'updatedAt'> {
  return {
    light1Runtime: 0, light2Runtime: 0, light3Runtime: 0,
    fan1Runtime: 0, fan2Runtime: 0,
    customRuntime: 0, energyUsage: 0,
  };
}

// ─── Helper: sub-doc refs ─────────────────────────────────────────────────────

const outputsRef  = (did: string) => doc(db, 'devices', did, 'state', 'outputs');
const healthRef   = (did: string) => doc(db, 'devices', did, 'state', 'health');
const analyticsRef= (did: string) => doc(db, 'devices', did, 'state', 'analytics');

// ─── Device CRUD ──────────────────────────────────────────────────────────────

export async function addDevice(data: Omit<Device, 'id' | 'updatedAt'>) {
  // 1. Create the top-level device document (keyed by deviceId for ESP32 access)
  await setDoc(doc(db, 'devices', data.deviceId), {
    deviceId: data.deviceId,
    ownerId: data.ownerId,
    name: data.name,
    room: data.room,
    location: data.location,
    status: 'offline',
    dexBotId: data.dexBotId || '',
    firmware: data.firmware || 'v1.2.4',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // 2. Seed sub-collections under devices/{deviceId}/state/
  await setDoc(outputsRef(data.deviceId), {
    ...defaultOutputs(),
    updatedAt: serverTimestamp(),
  });
  await setDoc(healthRef(data.deviceId), {
    ...defaultHealth(),
    lastSeen: serverTimestamp(),
  });
  await setDoc(analyticsRef(data.deviceId), {
    ...defaultAnalytics(),
    updatedAt: serverTimestamp(),
  });

  // 3. Keep a queryable meta record (for listing devices by ownerId)
  const metaRef = await addDoc(collection(db, 'devices_meta'), {
    deviceId: data.deviceId,
    ownerId: data.ownerId,
    name: data.name,
    room: data.room,
    location: data.location,
    status: 'offline',
    firmware: data.firmware || 'v1.2.4',
    dexBotId: data.dexBotId || '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await logActivity(data.deviceId, `Device "${data.name}" added to ${data.room}`, data.ownerId);
  return metaRef.id;
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

export async function getDevice(metaId: string): Promise<Device | null> {
  const snap = await getDoc(doc(db, 'devices_meta', metaId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Device;
}

export async function updateDevice(metaId: string, deviceId: string, data: Partial<Omit<Device, 'id'>>) {
  const updates = { ...data, updatedAt: serverTimestamp() };
  await updateDoc(doc(db, 'devices_meta', metaId), updates);
  await updateDoc(doc(db, 'devices', deviceId), updates);
}

export async function deleteDevice(metaId: string, deviceId: string, ownerId: string) {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'devices_meta', metaId));
  // Note: subcollections must be deleted separately; delete parent doc for ESP32 access
  batch.delete(doc(db, 'devices', deviceId));
  await batch.commit();
  await logActivity(deviceId, 'Device removed', ownerId).catch(() => {});
}

// ─── Real-time: device list ───────────────────────────────────────────────────

export function subscribeToUserDevices(userId: string, callback: (devices: Device[]) => void) {
  const q = query(
    collection(db, 'devices_meta'),
    where('ownerId', '==', userId),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as Device)));
  });
}

// ─── Real-time: outputs ───────────────────────────────────────────────────────

export function subscribeToOutputs(deviceId: string, callback: (outputs: DeviceOutputs) => void) {
  return onSnapshot(outputsRef(deviceId), snap => {
    if (snap.exists()) callback(snap.data() as DeviceOutputs);
  });
}

// ─── Real-time: health ────────────────────────────────────────────────────────

export function subscribeToHealth(deviceId: string, callback: (health: DeviceHealth) => void) {
  return onSnapshot(healthRef(deviceId), snap => {
    if (snap.exists()) callback(snap.data() as DeviceHealth);
  });
}

// ─── Real-time: analytics ─────────────────────────────────────────────────────

export function subscribeToAnalytics(
  deviceId: string,
  callback: (analytics: DeviceAnalyticsData) => void
) {
  return onSnapshot(analyticsRef(deviceId), snap => {
    if (snap.exists()) callback(snap.data() as DeviceAnalyticsData);
  });
}

// ─── Real-time: activity logs ─────────────────────────────────────────────────

export function subscribeToActivityLogs(deviceId: string, callback: (logs: ActivityLog[]) => void) {
  const q = query(
    collection(db, 'activity_logs'),
    where('deviceId', '==', deviceId),
    orderBy('timestamp', 'desc')
  );
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as ActivityLog)));
  });
}

// ─── Output control ───────────────────────────────────────────────────────────

type OutputKey = keyof Omit<DeviceOutputs, 'updatedAt'>;

export async function setOutput(
  deviceId: string,
  key: OutputKey,
  value: boolean | string,
  performedBy: string,
  label?: string
) {
  await updateDoc(outputsRef(deviceId), {
    [key]: value,
    updatedAt: serverTimestamp(),
  });
  if (label) {
    await logActivity(deviceId, label, performedBy);
    if (typeof value === 'boolean' && value === true) {
      await incrementAnalytics(deviceId, key);
    }
  }
}

// ─── Analytics increment ──────────────────────────────────────────────────────

const WATT: Record<string, number> = {
  light1: 40, light2: 40, light3: 40,
  fan1: 25, fan2: 25,
  custom1: 30,
};

async function incrementAnalytics(deviceId: string, key: OutputKey) {
  if (typeof key !== 'string' || !(key in WATT)) return;
  try {
    const ref = analyticsRef(deviceId);
    const snap = await getDoc(ref);
    const cur = snap.data() || {};

    const runtimeField = key === 'custom1' ? 'customRuntime' : `${key}Runtime`;
    const prevRuntime = (cur[runtimeField] as number) || 0;
    const prevEnergy  = (cur.energyUsage  as number) || 0;
    const runtimeInc  = 0.5; // +0.5h estimated per toggle-ON
    const energyInc   = (WATT[key] / 1000) * runtimeInc;

    await updateDoc(ref, {
      [runtimeField]: prevRuntime + runtimeInc,
      energyUsage: prevEnergy + energyInc,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn('[incrementAnalytics] Failed:', err);
  }
}

// ─── Activity log write ───────────────────────────────────────────────────────

export async function logActivity(deviceId: string, action: string, performedBy: string) {
  try {
    await addDoc(collection(db, 'activity_logs'), {
      deviceId,
      action,
      performedBy,
      timestamp: serverTimestamp(),
    });
  } catch (err) {
    console.warn('[logActivity] Failed:', err);
  }
}

// ─── Compatibility shims (used by analyticsService / dashboard) ───────────────

export function subscribeToDeviceLogs(
  deviceId: string,
  callback: (logs: ActivityLog[]) => void
) {
  return subscribeToActivityLogs(deviceId, callback);
}

// Legacy flat-state subscriber kept for dashboard/dexbot pages
// Maps new nested outputs back to flat shape
export function subscribeToDeviceState(
  deviceId: string,
  callback: (state: LegacyDeviceState) => void
) {
  return subscribeToOutputs(deviceId, outputs => {
    callback({
      deviceId,
      light1: outputs.light1,
      light2: outputs.light2,
      light3: outputs.light3,
      fan1: outputs.fan1,
      fan2: outputs.fan2,
      custom1: outputs.custom1,
      oledMessage: outputs.oledMessage,
      buzzer: outputs.buzzer,
      updatedAt: outputs.updatedAt,
    });
  });
}

// Legacy updateDeviceState — maps flat calls to new setOutput
export async function updateDeviceState(
  deviceId: string,
  data: Partial<LegacyDeviceState>,
  performedBy: string,
  label?: string
) {
  const updates: Record<string, unknown> = { updatedAt: serverTimestamp() };
  const keys: (keyof LegacyDeviceState)[] = [
    'light1','light2','light3','fan1','fan2','custom1','oledMessage','buzzer'
  ];
  keys.forEach(k => {
    if (k in data) updates[k] = data[k];
  });
  await updateDoc(outputsRef(deviceId), updates);
  if (label) {
    await logActivity(deviceId, label, performedBy);
  }
}

export interface LegacyDeviceState {
  deviceId: string;
  light1: boolean;
  light2: boolean;
  light3: boolean;
  fan1: boolean;
  fan2: boolean;
  custom1: boolean;
  oledMessage: string;
  buzzer: boolean;
  updatedAt?: unknown;
}

// Keep old DeviceState alias pointing to LegacyDeviceState for pages not yet updated
export type DeviceState = LegacyDeviceState;
