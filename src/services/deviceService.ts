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
} from 'firebase/firestore';
import { db } from './firebase';

export interface Device {
  id: string;
  deviceId: string;
  ownerId: string;
  name: string;
  room: string;
  location: string;
  status: 'online' | 'offline';
  dexBotId?: string;
  createdAt: unknown;
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

export async function addDevice(data: Omit<Device, 'id'>) {
  const ref = await addDoc(collection(db, 'devices'), {
    ...data,
    createdAt: serverTimestamp(),
  });

  await setDoc(doc(db, 'device_state', data.deviceId), {
    deviceId: data.deviceId,
    light: false,
    fan: false,
    dustbin: 'closed',
    oledMessage: '',
    buzzer: false,
    updatedAt: serverTimestamp(),
  });

  return ref.id;
}

export async function getUserDevices(userId: string): Promise<Device[]> {
  const q = query(collection(db, 'devices'), where('ownerId', '==', userId), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Device));
}

export async function getDevice(id: string): Promise<Device | null> {
  const snap = await getDoc(doc(db, 'devices', id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Device;
}

export async function updateDevice(id: string, data: Partial<Device>) {
  await updateDoc(doc(db, 'devices', id), data);
}

export async function deleteDevice(id: string) {
  await deleteDoc(doc(db, 'devices', id));
}

export function subscribeToDeviceState(deviceId: string, callback: (state: DeviceState) => void) {
  return onSnapshot(doc(db, 'device_state', deviceId), snap => {
    if (snap.exists()) {
      callback(snap.data() as DeviceState);
    }
  });
}

export async function updateDeviceState(deviceId: string, data: Partial<DeviceState>) {
  await updateDoc(doc(db, 'device_state', deviceId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function sendOledMessage(deviceId: string, message: string) {
  await updateDoc(doc(db, 'device_state', deviceId), {
    oledMessage: message,
    updatedAt: serverTimestamp(),
  });
}

export async function logActivity(deviceId: string, action: string, performedBy: string) {
  await addDoc(collection(db, 'activity_logs'), {
    deviceId,
    action,
    performedBy,
    timestamp: serverTimestamp(),
  });
}

export function subscribeToUserDevices(userId: string, callback: (devices: Device[]) => void) {
  const q = query(collection(db, 'devices'), where('ownerId', '==', userId));
  return onSnapshot(q, snap => {
    const devices = snap.docs.map(d => ({ id: d.id, ...d.data() } as Device));
    callback(devices);
  });
}

export function subscribeToActivityLogs(deviceId: string, callback: (logs: unknown[]) => void) {
  const q = query(
    collection(db, 'activity_logs'),
    where('deviceId', '==', deviceId),
    orderBy('timestamp', 'desc')
  );
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}
