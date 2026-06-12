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

export interface DeviceState {
  deviceId: string;
  light: boolean;
  fan: boolean;
  dustbin: 'open' | 'closed';
  oledMessage: string;
  buzzer: boolean;
  updatedAt: unknown;
}

// ─── Schemas ──────────────────────────────────────────────────────────────────
// devices/{autoId}          — device metadata (ownerId, name, room, etc.)
// device_state/{deviceId}   — real-time control state (keyed by deviceId)
// activity_logs/{autoId}    — audit trail of every state change

// ─── Device CRUD ──────────────────────────────────────────────────────────────

export async function addDevice(data: Omit<Device, 'id' | 'updatedAt'>) {
  // Create device metadata doc
  const ref = await addDoc(collection(db, 'devices'), {
    deviceId: data.deviceId,
    ownerId: data.ownerId,
    name: data.name,
    room: data.room,
    location: data.location,
    status: data.status || 'offline',
    dexBotId: data.dexBotId || '',
    firmware: data.firmware || 'v1.0.0',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // Create initial device state doc (keyed by deviceId for fast IoT access)
  await setDoc(doc(db, 'device_state', data.deviceId), {
    deviceId: data.deviceId,
    light: false,
    fan: false,
    dustbin: 'closed',
    oledMessage: '',
    buzzer: false,
    updatedAt: serverTimestamp(),
  });

  // Log device addition
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
  await updateDoc(doc(db, 'devices', id), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteDevice(docId: string, deviceId: string, ownerId: string) {
  const batch = writeBatch(db);

  // Delete device metadata
  batch.delete(doc(db, 'devices', docId));

  // Delete device state
  batch.delete(doc(db, 'device_state', deviceId));

  await batch.commit();

  // Log deletion (after batch so it doesn't get rolled back)
  await logActivity(deviceId, `Device deleted`, ownerId).catch(() => {});
}

// ─── Real-time Subscriptions ──────────────────────────────────────────────────

export function subscribeToUserDevices(userId: string, callback: (devices: Device[]) => void) {
  const q = query(
    collection(db, 'devices'),
    where('ownerId', '==', userId),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(q, snap => {
    const devices = snap.docs.map(d => ({ id: d.id, ...d.data() } as Device));
    callback(devices);
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

export async function sendOledMessage(deviceId: string, message: string, performedBy: string) {
  await updateDoc(doc(db, 'device_state', deviceId), {
    oledMessage: message,
    updatedAt: serverTimestamp(),
  });
  await logActivity(deviceId, `OLED message set: "${message}"`, performedBy);
}

// ─── Activity Logs ────────────────────────────────────────────────────────────

export interface ActivityLog {
  id: string;
  deviceId: string;
  action: string;
  performedBy: string;
  timestamp: unknown;
}

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

// ─── Analytics Recording (called on every state change) ──────────────────────
// analytics/{autoId}
// {
//   deviceId, date, lightRuntime, fanRuntime, energyUsage, dustbinOpenCount, createdAt
// }
// We use a daily-aggregated doc keyed by deviceId+date to avoid unbounded writes.

async function recordAnalyticsOnStateChange(deviceId: string, change: Partial<DeviceState>) {
  try {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const analyticsId = `${deviceId}_${today}`;
    const ref = doc(db, 'analytics', analyticsId);
    const snap = await getDoc(ref);

    const updates: Record<string, unknown> = { updatedAt: serverTimestamp() };

    if (change.light !== undefined) {
      // Each toggle ON adds 0.5h estimated runtime increment
      if (change.light === true) {
        updates.lightRuntime = ((snap.data()?.lightRuntime || 0) as number) + 0.5;
        updates.energyUsage = ((snap.data()?.energyUsage || 0) as number) + 0.04; // ~40W bulb
      }
    }
    if (change.fan !== undefined && change.fan === true) {
      updates.fanRuntime = ((snap.data()?.fanRuntime || 0) as number) + 0.5;
      updates.energyUsage = ((snap.data()?.energyUsage || 0) as number) + 0.025; // ~25W fan
    }
    if (change.dustbin === 'open') {
      updates.dustbinOpenCount = ((snap.data()?.dustbinOpenCount || 0) as number) + 1;
    }

    if (snap.exists()) {
      await updateDoc(ref, updates);
    } else {
      await setDoc(ref, {
        deviceId,
        date: today,
        lightRuntime: 0,
        fanRuntime: 0,
        energyUsage: 0,
        dustbinOpenCount: 0,
        ...updates,
        createdAt: serverTimestamp(),
      });
    }
  } catch (err) {
    console.warn('[recordAnalyticsOnStateChange] Failed:', err);
  }
}
