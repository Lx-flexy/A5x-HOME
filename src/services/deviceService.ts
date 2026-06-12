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

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Device {
  id: string;
  deviceId: string;
  ownerId: string;
  name: string;
  room: string;
  location: string;
  status: 'online' | 'offline';
  dexBotId?: string;
  firmware?: string;
  createdAt: unknown;
  updatedAt?: unknown;
}

// Full ESP32 firmware v1 state schema
export interface DeviceState {
  deviceId: string;
  // Lights
  light1: boolean;
  light2: boolean;
  light3: boolean;
  // Fans
  fan1: boolean;
  fan2: boolean;
  // Custom device
  custom1: boolean;
  // OLED
  oledMessage: string;
  // Buzzer
  buzzer: boolean;
  // Device health (written by firmware over Firebase)
  wifiStatus: 'connected' | 'disconnected';
  firebaseStatus: 'connected' | 'disconnected';
  rssi: number;           // dBm  e.g. -58
  freeHeap: number;       // bytes
  deviceUptime: number;   // seconds
  wifiUptime: number;     // seconds
  restartCount: number;
  updatedAt: unknown;
}

// Per-device daily analytics (keyed: deviceId_YYYY-MM-DD)
export interface DeviceAnalytics {
  deviceId: string;
  date: string;
  light1Runtime: number;   // hours
  light2Runtime: number;
  light3Runtime: number;
  fan1Runtime: number;
  fan2Runtime: number;
  custom1Runtime: number;
  totalRuntime: number;
  energyUsage: number;     // kWh
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ActivityLog {
  id: string;
  deviceId: string;
  action: string;
  performedBy: string;
  timestamp: unknown;
}

// ─── Initial state factory ────────────────────────────────────────────────────

function initialDeviceState(deviceId: string): Omit<DeviceState, 'updatedAt'> {
  return {
    deviceId,
    light1: false,
    light2: false,
    light3: false,
    fan1: false,
    fan2: false,
    custom1: false,
    oledMessage: '',
    buzzer: false,
    wifiStatus: 'disconnected',
    firebaseStatus: 'disconnected',
    rssi: 0,
    freeHeap: 0,
    deviceUptime: 0,
    wifiUptime: 0,
    restartCount: 0,
  };
}

// ─── Device CRUD ──────────────────────────────────────────────────────────────

export async function addDevice(data: Omit<Device, 'id' | 'updatedAt'>) {
  const ref = await addDoc(collection(db, 'devices'), {
    deviceId: data.deviceId,
    ownerId: data.ownerId,
    name: data.name,
    room: data.room,
    location: data.location,
    status: data.status || 'offline',
    dexBotId: data.dexBotId || '',
    firmware: data.firmware || 'v1.2.4',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await setDoc(doc(db, 'device_state', data.deviceId), {
    ...initialDeviceState(data.deviceId),
    updatedAt: serverTimestamp(),
  });

  await logActivity(data.deviceId, `Device "${data.name}" added to ${data.room}`, data.ownerId);
  return ref.id;
}

export async function getUserDevices(userId: string): Promise<Device[]> {
  const q = query(
    collection(db, 'devices'),
    where('ownerId', '==', userId),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Device));
}

export async function getDevice(id: string): Promise<Device | null> {
  const snap = await getDoc(doc(db, 'devices', id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Device;
}

export async function updateDevice(id: string, data: Partial<Omit<Device, 'id'>>) {
  await updateDoc(doc(db, 'devices', id), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteDevice(docId: string, deviceId: string, ownerId: string) {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'devices', docId));
  batch.delete(doc(db, 'device_state', deviceId));
  await batch.commit();
  await logActivity(deviceId, 'Device deleted', ownerId).catch(() => {});
}

// ─── Real-time Subscriptions ──────────────────────────────────────────────────

export function subscribeToUserDevices(userId: string, callback: (devices: Device[]) => void) {
  const q = query(
    collection(db, 'devices'),
    where('ownerId', '==', userId),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as Device)));
  });
}

export function subscribeToDeviceState(deviceId: string, callback: (state: DeviceState) => void) {
  return onSnapshot(doc(db, 'device_state', deviceId), snap => {
    if (snap.exists()) callback(snap.data() as DeviceState);
  });
}

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

export function subscribeToDeviceAnalytics(
  deviceId: string,
  callback: (entries: DeviceAnalytics[]) => void,
  days = 7
) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const startDate = cutoff.toISOString().split('T')[0];

  const q = query(
    collection(db, 'analytics'),
    where('deviceId', '==', deviceId),
    where('date', '>=', startDate),
    orderBy('date', 'desc')
  );
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as unknown as DeviceAnalytics)));
  });
}

// ─── Device State Control ─────────────────────────────────────────────────────

export async function updateDeviceState(
  deviceId: string,
  data: Partial<DeviceState>,
  performedBy: string,
  actionLabel?: string
) {
  await updateDoc(doc(db, 'device_state', deviceId), {
    ...data,
    updatedAt: serverTimestamp(),
  });

  if (actionLabel) {
    await logActivity(deviceId, actionLabel, performedBy);
    await recordAnalyticsOnStateChange(deviceId, data);
  }
}

// ─── Activity Logs ────────────────────────────────────────────────────────────

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

// ─── Analytics Recording ──────────────────────────────────────────────────────
// Daily aggregated doc: analytics/{deviceId_YYYY-MM-DD}
// Each toggle-ON adds estimated runtime increment + energy cost

const ENERGY = {
  light: 0.04,   // kWh per 0.5h (~40W bulb)
  fan: 0.025,    // kWh per 0.5h (~25W fan)
  custom: 0.03,  // kWh per 0.5h (~30W custom)
};

async function recordAnalyticsOnStateChange(deviceId: string, change: Partial<DeviceState>) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const analyticsId = `${deviceId}_${today}`;
    const ref = doc(db, 'analytics', analyticsId);
    const snap = await getDoc(ref);
    const cur = snap.data() || {};

    const updates: Record<string, unknown> = { updatedAt: serverTimestamp() };
    let energyDelta = 0;
    let runtimeDelta = 0;

    const check = (key: keyof Partial<DeviceState>, field: string, energy: number) => {
      if (change[key] === true) {
        const prev = (cur[field] as number) || 0;
        updates[field] = prev + 0.5;
        energyDelta += energy;
        runtimeDelta += 0.5;
      }
    };

    check('light1', 'light1Runtime', ENERGY.light);
    check('light2', 'light2Runtime', ENERGY.light);
    check('light3', 'light3Runtime', ENERGY.light);
    check('fan1',   'fan1Runtime',   ENERGY.fan);
    check('fan2',   'fan2Runtime',   ENERGY.fan);
    check('custom1','custom1Runtime',ENERGY.custom);

    if (Object.keys(updates).length <= 1) return; // only updatedAt — skip

    updates.energyUsage  = ((cur.energyUsage  as number) || 0) + energyDelta;
    updates.totalRuntime = ((cur.totalRuntime  as number) || 0) + runtimeDelta;

    if (snap.exists()) {
      await updateDoc(ref, updates);
    } else {
      await setDoc(ref, {
        deviceId,
        date: today,
        light1Runtime: 0, light2Runtime: 0, light3Runtime: 0,
        fan1Runtime: 0, fan2Runtime: 0, custom1Runtime: 0,
        totalRuntime: 0, energyUsage: 0,
        ...updates,
        createdAt: serverTimestamp(),
      });
    }
  } catch (err) {
    console.warn('[recordAnalyticsOnStateChange] Failed:', err);
  }
}

// ─── Legacy helpers (keep for analyticsService.ts compatibility) ──────────────
export { subscribeToActivityLogs as subscribeToDeviceLogs };
