/**
 * HYBRID ARCHITECTURE
 * ─────────────────────────────────────────────────────────────────────────────
 * Firebase Realtime Database  →  live device state (outputs, health, analytics, status)
 *   RTDB path: devices/{deviceId}/
 *     status      "online" | "offline"
 *     lastSeen    unix ms
 *     outputs/    light2, light3, fan1, custom1, oledMessage, buzzer
 *     health/     rssi, heap, restartCount, uptime, wifiUptime, wifiStatus, firebaseStatus
 *     analytics/  light2Runtime, light3Runtime, fan1Runtime, customRuntime, energyUsage
 *     currentSense/ light2Current, light3Current, fan1Current, customCurrent (+ Mismatch flags)
 *
 * Firestore  →  persistent metadata & audit logs
 *   devices_meta/{autoId}   device registration (ownerId, name, room, etc.)
 *   activity_logs/{autoId}  every control action
 * ─────────────────────────────────────────────────────────────────────────────
 * NOTE: 4-channel configuration (Light2, Light3, Fan1, Custom1) — no Light1 or Fan2
 */

import {
  collection, doc, addDoc, getDoc, getDocs,
  setDoc, updateDoc, deleteDoc, onSnapshot,
  query, where, serverTimestamp, orderBy,
} from 'firebase/firestore';
import {
  ref, set, update, onValue, off,
  get, remove, child, DataSnapshot,
} from 'firebase/database';
import { db, rtdb } from './firebase';
import { sanitizeString, sanitizeMessage, sanitizeName, isValidDeviceId, isNonEmptyString } from '../lib/sanitize';

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
  light2: boolean;
  light3: boolean;
  fan1: boolean;
  custom1: boolean;
  oledMessage: string;
  buzzer: boolean;
  buzzerMode?: string; // 'single' | 'double' | 'alarm'
  // ── Future PWM / speed support (UI-ready, firmware pending) ──────────────
  light2Brightness?: number;   // 0-100
  light3Brightness?: number;
  fan1Speed?: number;          // 0-100
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
  light2Runtime: number;
  light3Runtime: number;
  fan1Runtime: number;
  customRuntime: number;
  energyUsage: number;
}

export interface DeviceCurrentSense {
  light2Current: number;
  light3Current: number;
  fan1Current: number;
  customCurrent: number;
  light2Mismatch: boolean;
  light3Mismatch: boolean;
  fan1Mismatch: boolean;
  customMismatch: boolean;
}

export interface DeviceNames {
  light2?: string;
  light3?: string;
  fan1?: string;
  custom1?: string;
}

export interface OutputMetadata {
  name: string;
  icon: string;
  color: string;
  visible?: boolean;
}

export interface DeviceOutputMetadata {
  light2?: OutputMetadata;
  light3?: OutputMetadata;
  fan1?: OutputMetadata;
  custom1?: OutputMetadata;
}

export interface ActivityLog {
  id: string;
  deviceId: string;
  action: string;
  performedBy: string;
  timestamp: unknown;
  outputId?: string; // Hardware output ID (light2, light3, fan1, custom1)
}

// ─── RTDB path helpers ────────────────────────────────────────────────────────

const rtdbDevice    = (did: string) => ref(rtdb, `devices/${did}`);
const rtdbOutputs   = (did: string) => ref(rtdb, `devices/${did}/outputs`);
const rtdbHealth    = (did: string) => ref(rtdb, `devices/${did}/health`);
const rtdbAnalytics = (did: string) => ref(rtdb, `devices/${did}/analytics`);
const rtdbNames     = (did: string) => ref(rtdb, `devices/${did}/metadata/names`);
const rtdbOutputMetadata = (did: string) => ref(rtdb, `devices/${did}/metadata/outputs`);
const rtdbCurrentSense = (did: string) => ref(rtdb, `devices/${did}/currentSense`);

// ─── Defaults ────────────────────────────────────────────────────────────────

export async function getDeviceOutputMetadata(deviceId: string): Promise<DeviceOutputMetadata> {
  try {
    const snap = await get(rtdbOutputMetadata(deviceId));
    const metadata = (snap.val() as DeviceOutputMetadata) || {};
    const merged = { ...defaultOutputMetadata(), ...metadata };
    return merged;
  } catch (err) {
    console.warn('[getDeviceOutputMetadata] Failed:', err);
    return defaultOutputMetadata();
  }
}

function defaultOutputs(): DeviceOutputs {
  return {
    light2: false, light3: false,
    fan1: false, custom1: false,
    oledMessage: '', buzzer: false, buzzerMode: 'single',
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
    light2Runtime: 0, light3Runtime: 0,
    fan1Runtime: 0, customRuntime: 0, energyUsage: 0,
  };
}

function defaultCurrentSense(): DeviceCurrentSense {
  return {
    light2Current: 0, light3Current: 0,
    fan1Current: 0, customCurrent: 0,
    light2Mismatch: false, light3Mismatch: false,
    fan1Mismatch: false, customMismatch: false,
  };
}

function defaultNames(): DeviceNames {
  return {
    light2: 'Light 2',
    light3: 'Light 3',
    fan1: 'Fan 1',
    custom1: 'Custom Device'
  };
}

function defaultOutputMetadata(): DeviceOutputMetadata {
  return {
    light2: { name: 'Light 2', icon: 'lightbulb', color: '#d97706', visible: true },
    light3: { name: 'Light 3', icon: 'lightbulb', color: '#d97706', visible: true },
    fan1: { name: 'Fan 1', icon: 'wind', color: '#2563eb', visible: false },
    custom1: { name: 'Custom Device', icon: 'zap', color: '#7c3aed', visible: false }
  };
}

// ─── Device registration ──────────────────────────────────────────────────────

export async function addDevice(data: Omit<Device, 'id' | 'updatedAt'>) {
  // ── Validate inputs before any write ──────────────────────────────────────
  const deviceId = sanitizeString(data.deviceId, 32).toUpperCase();
  if (!isValidDeviceId(deviceId)) {
    throw new Error(`Invalid device ID format: "${deviceId}". Expected A5X-HA-XXXX.`);
  }
  if (!isNonEmptyString(data.ownerId)) throw new Error('Missing ownerId.');
  if (!isNonEmptyString(data.name))    throw new Error('Device name is required.');
  if (!isNonEmptyString(data.room))    throw new Error('Room is required.');

  const safeName     = sanitizeName(data.name);
  const safeRoom     = sanitizeName(data.room);
  const safeLocation = sanitizeName(data.location);

  // ── Prevent duplicate device ID registration ──────────────────────────────
  const existing = await getDocs(
    query(collection(db, 'devices_meta'), where('deviceId', '==', deviceId))
  );
  if (!existing.empty) {
    throw new Error(`Device ID "${deviceId}" is already registered.`);
  }

  // 1. Seed RTDB node  — ESP32 reads outputs/, writes health/ + status
  await set(rtdbDevice(deviceId), {
    status: 'offline',
    lastSeen: 0,
    outputs: defaultOutputs(),
    health: defaultHealth(),
    analytics: defaultAnalytics(),
    metadata: {
      names: defaultNames(), // Keep for backward compatibility
      outputs: defaultOutputMetadata()
    }
  });

  // 2. Register in Firestore for listing by ownerId
  const metaRef = await addDoc(collection(db, 'devices_meta'), {
    deviceId,
    ownerId:   data.ownerId,
    name:      safeName,
    room:      safeRoom,
    location:  safeLocation,
    firmware:  data.firmware || 'v1.2.4',
    dexBotId:  data.dexBotId || '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await logActivity(deviceId, `Device "${safeName}" added to ${safeRoom}`, data.ownerId);
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
  // ── Verify ownership before deleting ────────────────────────────────────
  const snap = await getDoc(doc(db, 'devices_meta', metaId));
  if (!snap.exists()) throw new Error('Device not found.');
  if (snap.data().ownerId !== ownerId) throw new Error('Not authorized to delete this device.');

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

// ─── RTDB: currentSense ───────────────────────────────────────────────────────

export function subscribeToCurrentSense(
  deviceId: string,
  callback: (currentSense: DeviceCurrentSense) => void
): () => void {
  const r = rtdbCurrentSense(deviceId);
  const handler = (snap: DataSnapshot) => {
    // If currentSense node doesn't exist (older devices), return defaults
    // This prevents crashes on devices without current sensing hardware
    callback((snap.val() as DeviceCurrentSense) || defaultCurrentSense());
  };
  onValue(r, handler);
  return () => off(r, 'value', handler);
}

// ─── RTDB: device output metadata ───────────────────────────────────────────

export function subscribeToOutputMetadata(
  deviceId: string,
  callback: (metadata: DeviceOutputMetadata) => void
): () => void {
  const r = rtdbOutputMetadata(deviceId);
  const handler = (snap: DataSnapshot) => {
    const metadata = (snap.val() as DeviceOutputMetadata) || {};
    const merged = { ...defaultOutputMetadata(), ...metadata };
    callback(merged);
  };
  onValue(r, handler);
  return () => off(r, 'value', handler);
}

export async function updateOutputMetadata(
  deviceId: string,
  outputId: keyof DeviceOutputMetadata,
  name: string,
  icon: string,
  color: string,
  performedBy: string
): Promise<void> {
  // Sanitize and validate inputs
  const safeName = sanitizeName(name);
  if (!safeName || safeName.length === 0) {
    throw new Error('Output name cannot be empty');
  }
  if (safeName.length > 40) {
    throw new Error('Output name must be 40 characters or less');
  }

  // Validate icon against whitelist
  const allowedIcons = [
    'lightbulb', 'sun', 'moon', 'lamp', 'flashlight',
    'wind', 'air-vent', 'snowflake', 'thermometer', 'fan', 'flame',
    'zap', 'power', 'plug', 'cpu', 'settings',
    'bed', 'sofa', 'home', 'door', 'window',
    'book', 'monitor', 'tv', 'speaker', 'bell',
    'droplet', 'shower', 'hammer', 'wrench'
  ];
  
  if (!allowedIcons.includes(icon)) {
    throw new Error('Invalid icon selection');
  }

  // Validate color (hex format)
  if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
    throw new Error('Invalid color format');
  }
  
  // Get current metadata to preserve visibility flag
  const metadataRef = rtdbOutputMetadata(deviceId);
  const snap = await get(child(metadataRef, outputId));
  const current = snap.val() as OutputMetadata | null;
  
  // Update in RTDB, preserving visibility
  await update(metadataRef, {
    [outputId]: { 
      name: safeName, 
      icon, 
      color,
      visible: current?.visible ?? defaultOutputMetadata()[outputId]?.visible ?? false
    }
  });
  
  // Log the activity
  const defaultMeta = defaultOutputMetadata()[outputId];
  await logActivity(
    deviceId, 
    `Output "${defaultMeta?.name}" updated to "${safeName}" with ${icon} icon and ${color} color`, 
    performedBy
  );
}

export function getOutputMetadata(metadata: DeviceOutputMetadata, outputId: keyof DeviceOutputMetadata): OutputMetadata {
  return metadata[outputId] || defaultOutputMetadata()[outputId] || { name: outputId, icon: 'zap', color: '#7c3aed', visible: false };
}

export async function updateOutputVisibility(
  deviceId: string,
  outputId: keyof DeviceOutputMetadata,
  visible: boolean,
  performedBy: string
): Promise<void> {
  // Get current metadata for this output
  const metadataRef = rtdbOutputMetadata(deviceId);
  const snap = await get(child(metadataRef, outputId));
  const current = snap.val() as OutputMetadata | null;
  
  // Preserve existing metadata, only update visibility
  const updated = {
    ...(current || defaultOutputMetadata()[outputId]),
    visible
  };
  
  // Update in RTDB
  await update(metadataRef, {
    [outputId]: updated
  });
  
  // Log the activity
  await logActivity(
    deviceId, 
    `Output "${updated.name}" ${visible ? 'shown' : 'hidden'}`, 
    performedBy
  );
}

export async function removeOutput(
  deviceId: string,
  outputId: keyof DeviceOutputMetadata,
  performedBy: string
): Promise<void> {
  // Reset to default metadata with visible=false
  const defaultMeta = defaultOutputMetadata()[outputId];
  if (!defaultMeta) {
    throw new Error(`Unknown output ID: ${outputId}`);
  }
  
  // Update in RTDB - reset to defaults and hide
  await update(rtdbOutputMetadata(deviceId), {
    [outputId]: {
      name: defaultMeta.name,
      icon: defaultMeta.icon,
      color: defaultMeta.color,
      visible: false
    }
  });
  
  // Log the activity
  await logActivity(
    deviceId, 
    `Output "${defaultMeta.name}" removed`, 
    performedBy
  );
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
 * Delegates to analyticsService.resetTodayAnalytics.
 */
export async function resetAnalytics(deviceId: string): Promise<void> {
  const { resetTodayAnalytics } = await import('./analyticsService');
  await resetTodayAnalytics(deviceId);
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

const TRACKABLE_KEYS = new Set(['light2','light3','fan1','custom1']);

export async function setOutput(
  deviceId: string,
  key: keyof DeviceOutputs,
  value: boolean | string,
  performedBy: string,
  label?: string
): Promise<void> {
  // Sanitize string outputs (OLED message) to prevent malicious content
  const safeValue = typeof value === 'string' ? sanitizeMessage(value) : value;

  // Write to RTDB — ESP32 onValue listener picks this up instantly
  await update(rtdbOutputs(deviceId), { [key]: safeValue });

  // Runtime tracking — only for boolean trackable keys
  if (typeof safeValue === 'boolean' && TRACKABLE_KEYS.has(key as string)) {
    const { trackOutputChange } = await import('./analyticsService');
    await trackOutputChange(deviceId, key as 'light2'|'light3'|'fan1'|'custom1', safeValue).catch(err =>
      console.warn('[setOutput] trackOutputChange failed:', err)
    );
  }

  if (label) {
    // Pass the output ID for trackable boolean keys to enable color-matched notifications
    const outputId = (typeof safeValue === 'boolean' && TRACKABLE_KEYS.has(key as string)) 
      ? key as string 
      : undefined;
    await logActivity(deviceId, sanitizeString(label, 200), sanitizeName(performedBy), outputId);
  }
}

// ─── RTDB: write numeric output value (brightness / speed) ───────────────────
// Does NOT touch analytics — used only for slider values.

export async function setOutputValue(
  deviceId: string,
  key: 'light2Brightness' | 'light3Brightness' | 'fan1Speed',
  value: number
): Promise<void> {
  await update(rtdbOutputs(deviceId), { [key]: value });
}

// ─── Firestore: activity logs ─────────────────────────────────────────────────

export async function logActivity(
  deviceId: string,
  action: string,
  performedBy: string,
  outputId?: string
): Promise<void> {
  try {
    const logData: Record<string, unknown> = {
      deviceId,
      action,
      performedBy,
      timestamp: serverTimestamp(),
    };
    
    // Only add outputId if provided
    if (outputId) {
      logData.outputId = outputId;
    }
    
    await addDoc(collection(db, 'activity_logs'), logData);
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
    'light2', 'light3', 'fan1', 'custom1', 'oledMessage', 'buzzer', 'buzzerMode',
  ];
  const patch: Partial<DeviceOutputs> = {};
  outputKeys.forEach(k => {
    if (k in data) (patch as Record<string, unknown>)[k] = (data as Record<string, unknown>)[k];
  });
  
  // DEBUG: Log exact RTDB update
  console.log('[updateDeviceState] Sending to RTDB:', {
    path: `devices/${deviceId}/outputs`,
    patch,
    originalData: data
  });
  
  await update(rtdbOutputs(deviceId), patch);
  
  console.log('[updateDeviceState] RTDB update completed successfully');

  // Track runtime for trackable boolean keys via analyticsService
  type TK = 'light2'|'light3'|'fan1'|'custom1';
  const trackable: TK[] = ['light2','light3','fan1','custom1'];
  const changes: Partial<Record<TK, boolean>> = {};
  for (const k of trackable) {
    if (k in data && typeof (data as Record<string, unknown>)[k] === 'boolean') {
      changes[k] = (data as Record<string, unknown>)[k] as boolean;
    }
  }
  if (Object.keys(changes).length > 0) {
    const { trackBulkOutputChange } = await import('./analyticsService');
    await trackBulkOutputChange(deviceId, changes).catch(err =>
      console.warn('[updateDeviceState] trackBulkOutputChange failed:', err)
    );
  }

  if (label) await logActivity(deviceId, label, performedBy);
}

// DEBUG: Simple buzzer test function - bypasses UI complexity
export async function testBuzzer(deviceId: string, mode: 'single' | 'double' | 'alarm' = 'single'): Promise<void> {
  console.log('[testBuzzer] Direct RTDB test starting:', { deviceId, mode });
  
  const directPatch = {
    buzzer: true,
    buzzerMode: mode
  };
  
  console.log('[testBuzzer] Writing directly to RTDB:', {
    path: `devices/${deviceId}/outputs`,
    patch: directPatch
  });
  
  await update(rtdbOutputs(deviceId), directPatch);
  console.log('[testBuzzer] Direct RTDB write completed');
}

export interface LegacyDeviceState extends DeviceOutputs {
  deviceId: string;
}
export type DeviceState = LegacyDeviceState;
