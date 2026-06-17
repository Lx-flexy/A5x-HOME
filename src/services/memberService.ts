import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  query,
  where,
  serverTimestamp,
  updateDoc,
  getDoc,
  onSnapshot,
} from 'firebase/firestore';
import { db } from './firebase';
import { sanitizeName, isValidUserId, isNonEmptyString } from '../lib/sanitize';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Member {
  id: string;
  deviceId: string;
  userId: string;       // A5X-U-XXXXXX custom ID
  uid: string;          // Firebase Auth UID (for direct lookup)
  name: string;
  email: string;
  role: 'owner' | 'member';
  joinedAt: unknown;
}

// ─── Schema ───────────────────────────────────────────────────────────────────
// members/{autoId}
// {
//   deviceId, userId (A5X-U-XXXXXX), uid (Firebase UID), name, email, role, joinedAt
// }

// ─── Lookup user by A5X userId to validate before adding ─────────────────────

export async function findUserByA5xId(userId: string): Promise<{ uid: string; name: string; email: string } | null> {
  try {
    const q = query(collection(db, 'users'), where('userId', '==', userId));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const data = snap.docs[0].data();
    return { uid: data.uid, name: data.name, email: data.email };
  } catch (err) {
    console.warn('[findUserByA5xId] Failed:', err);
    return null;
  }
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

const MAX_MEMBERS_PER_DEVICE = 5;
const VALID_ROLES = new Set<string>(['owner', 'member']);

export async function addMember(data: Omit<Member, 'id' | 'joinedAt'>) {
  // ── Input validation ──────────────────────────────────────────────────────
  if (!isValidUserId(data.userId)) throw new Error('Invalid A5X User ID format.');
  if (!isNonEmptyString(data.uid))      throw new Error('Missing Firebase UID.');
  if (!isNonEmptyString(data.deviceId)) throw new Error('Missing device ID.');
  if (!VALID_ROLES.has(data.role))      throw new Error('Invalid role. Must be owner or member.');

  const safeName  = sanitizeName(data.name);
  const safeEmail = sanitizeName(data.email).toLowerCase().slice(0, 254);

  // ── Enforce max 5 members per device (server-side) ───────────────────────
  const currentMembers = await getDocs(
    query(collection(db, 'members'), where('deviceId', '==', data.deviceId))
  );
  if (currentMembers.size >= MAX_MEMBERS_PER_DEVICE) {
    throw new Error(`Maximum ${MAX_MEMBERS_PER_DEVICE} members per device allowed.`);
  }

  // ── Prevent duplicate members on same device ──────────────────────────────
  const existing = await getDocs(
    query(
      collection(db, 'members'),
      where('deviceId', '==', data.deviceId),
      where('userId', '==', data.userId.trim().toUpperCase())
    )
  );
  if (!existing.empty) throw new Error('This user is already a member of this device.');

  return addDoc(collection(db, 'members'), {
    deviceId: data.deviceId,
    userId:   data.userId.trim().toUpperCase(),
    uid:      data.uid,
    name:     safeName,
    email:    safeEmail,
    role:     data.role,
    joinedAt: serverTimestamp(),
  });
}

export async function getDeviceMembers(deviceId: string): Promise<Member[]> {
  try {
    const q = query(collection(db, 'members'), where('deviceId', '==', deviceId));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Member));
  } catch (err) {
    console.warn('[getDeviceMembers] Failed:', err);
    return [];
  }
}

export function subscribeToDeviceMembers(deviceId: string, callback: (members: Member[]) => void) {
  const q = query(collection(db, 'members'), where('deviceId', '==', deviceId));
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as Member)));
  });
}

export async function removeMember(memberId: string) {
  await deleteDoc(doc(db, 'members', memberId));
}

export async function updateMemberRole(memberId: string, role: 'owner' | 'member') {
  if (!VALID_ROLES.has(role)) throw new Error('Invalid role.');
  await updateDoc(doc(db, 'members', memberId), { role });
}

// ─── Get total member count across all user's devices ─────────────────────────

export async function getTotalMembersForUser(deviceIds: string[]): Promise<number> {
  if (deviceIds.length === 0) return 0;
  try {
    let total = 0;
    // Firestore 'in' queries are limited to 30 items; batch if needed
    const chunks: string[][] = [];
    for (let i = 0; i < deviceIds.length; i += 30) chunks.push(deviceIds.slice(i, i + 30));

    for (const chunk of chunks) {
      const q = query(collection(db, 'members'), where('deviceId', 'in', chunk));
      const snap = await getDocs(q);
      total += snap.size;
    }
    return total;
  } catch (err) {
    console.warn('[getTotalMembersForUser] Failed:', err);
    return 0;
  }
}
