import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  FacebookAuthProvider,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signOut,
  updateProfile,
  sendPasswordResetEmail,
} from 'firebase/auth';
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { sanitizeName, isNonEmptyString } from '../lib/sanitize';

const googleProvider   = new GoogleAuthProvider();
const facebookProvider = new FacebookAuthProvider();

// Force account selection on every Google login (prevents silent re-use of wrong account)
googleProvider.setCustomParameters({ prompt: 'select_account' });

// ─── Validation helpers ───────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function assertValidEmail(email: unknown): void {
  if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
    throw new Error('Invalid email address.');
  }
}

function assertPasswordStrength(password: unknown): void {
  if (typeof password !== 'string' || password.length < 8) {
    throw new Error('Password must be at least 8 characters.');
  }
}

// ─── User ID Generator ────────────────────────────────────────────────────────
// Uses crypto.getRandomValues for cryptographic randomness instead of Math.random
function generateUserId(): string {
  const chars  = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes  = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let result = 'A5X-U-';
  for (let i = 0; i < 6; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

// ─── Firestore User Document ──────────────────────────────────────────────────
// Schema: users/{uid}
// {
//   userId:        string   (A5X-U-XXXXXX)
//   uid:           string   (Firebase Auth UID)
//   name:          string
//   email:         string
//   phoneNumber:   string
//   provider:      "email" | "google" | "facebook" | "phone"
//   photoURL:      string
//   notifications: { deviceOnline, deviceOffline, memberAdded, activityLog }
//   createdAt:     Timestamp
//   updatedAt:     Timestamp
// }

async function saveUserToFirestore(
  uid: string,
  data: {
    name: string;
    email: string;
    phoneNumber?: string;
    provider: string;
    photoURL?: string;
  }
): Promise<string | null> {
  try {
    const userRef  = doc(db, 'users', uid);
    const existing = await getDoc(userRef);

    if (!existing.exists()) {
      // New user — create full document with sanitized data
      const userId = generateUserId();
      await setDoc(userRef, {
        userId,
        uid,
        name:        sanitizeName(data.name) || 'User',
        email:       data.email.trim().toLowerCase().slice(0, 254),
        phoneNumber: data.phoneNumber || '',
        provider:    data.provider,
        photoURL:    data.photoURL || '',
        notifications: {
          deviceOnline:  true,
          deviceOffline: true,
          memberAdded:   false,
          activityLog:   true,
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return userId;
    }

    // Existing user — update name/photo if changed (OAuth re-logins)
    // Only update safe string fields; never overwrite uid, email, or provider
    const updates: Record<string, unknown> = { updatedAt: serverTimestamp() };
    const safeName  = sanitizeName(data.name);
    if (safeName && safeName !== existing.data().name) updates.name = safeName;
    if (data.photoURL && data.photoURL !== existing.data().photoURL) {
      updates.photoURL = data.photoURL;
    }
    await updateDoc(userRef, updates);

    return existing.data().userId as string;
  } catch (err) {
    // Non-fatal: auth still works without Firestore profile
    return null;
  }
}

// ─── Auth Methods ─────────────────────────────────────────────────────────────

export async function registerWithEmail(name: string, email: string, password: string) {
  // ── Validate before touching Firebase ─────────────────────────────────────
  if (!isNonEmptyString(name)) throw new Error('Name is required.');
  assertValidEmail(email);
  assertPasswordStrength(password);

  const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
  await updateProfile(credential.user, { displayName: sanitizeName(name) });
  await saveUserToFirestore(credential.user.uid, {
    name:  sanitizeName(name),
    email: email.trim().toLowerCase(),
    provider: 'email',
  });
  return credential.user;
}

export async function loginWithEmail(email: string, password: string) {
  assertValidEmail(email);
  if (!isNonEmptyString(password)) throw new Error('Password is required.');

  const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
  return credential.user;
}

export async function loginWithGoogle() {
  const credential = await signInWithPopup(auth, googleProvider);
  const user = credential.user;
  await saveUserToFirestore(user.uid, {
    name:     user.displayName || 'User',
    email:    user.email       || '',
    provider: 'google',
    photoURL: user.photoURL    || '',
  });
  return user;
}

export async function loginWithFacebook() {
  const credential = await signInWithPopup(auth, facebookProvider);
  const user = credential.user;
  await saveUserToFirestore(user.uid, {
    name:     user.displayName || 'User',
    email:    user.email       || '',
    provider: 'facebook',
    photoURL: user.photoURL    || '',
  });
  return user;
}

export async function forgotPassword(email: string) {
  assertValidEmail(email);
  await sendPasswordResetEmail(auth, email.trim());
}

export function setupRecaptcha(elementId: string) {
  return new RecaptchaVerifier(auth, elementId, { size: 'invisible' });
}

export async function sendPhoneOTP(phone: string, recaptchaVerifier: RecaptchaVerifier) {
  if (!isNonEmptyString(phone)) throw new Error('Phone number is required.');
  return signInWithPhoneNumber(auth, phone.trim(), recaptchaVerifier);
}

// ─── User Data CRUD ───────────────────────────────────────────────────────────

export async function getUserData(uid: string) {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    return snap.exists() ? snap.data() : null;
  } catch {
    return null;
  }
}

export async function updateUserProfile(
  uid: string,
  data: { name?: string; phoneNumber?: string; photoURL?: string }
) {
  // ── Validate — never allow overwriting uid, email, or provider ────────────
  if (!isNonEmptyString(uid)) throw new Error('Missing user ID.');

  const patch: Record<string, unknown> = { updatedAt: serverTimestamp() };

  if (data.name !== undefined) {
    const safeName = sanitizeName(data.name);
    if (!isNonEmptyString(safeName)) throw new Error('Name cannot be empty.');
    patch.name = safeName;
  }
  if (data.phoneNumber !== undefined) {
    // Basic phone — allow digits, +, spaces, dashes only
    const safePhone = data.phoneNumber.replace(/[^0-9+\-\s()]/g, '').slice(0, 20);
    patch.phoneNumber = safePhone;
  }
  if (data.photoURL !== undefined) {
    // Only allow http(s) URLs or empty string for photoURL
    const isValidUrl = data.photoURL === '' ||
      /^https?:\/\/.{1,2000}/.test(data.photoURL);
    if (!isValidUrl) throw new Error('Invalid photo URL.');
    patch.photoURL = data.photoURL.slice(0, 2000);
  }

  const userRef = doc(db, 'users', uid);
  await updateDoc(userRef, patch);

  // Sync display name to Firebase Auth
  if (patch.name && auth.currentUser) {
    await updateProfile(auth.currentUser, {
      displayName: patch.name as string,
      ...(patch.photoURL !== undefined ? { photoURL: patch.photoURL as string } : {}),
    });
  }
}

export async function updateNotificationPreferences(
  uid: string,
  prefs: {
    deviceOnline?: boolean;
    deviceOffline?: boolean;
    memberAdded?: boolean;
    activityLog?: boolean;
  }
) {
  if (!isNonEmptyString(uid)) throw new Error('Missing user ID.');

  // Coerce all values to boolean — reject non-boolean inputs
  const safePrefs: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(prefs)) {
    if (typeof v !== 'boolean') throw new Error(`Notification pref "${k}" must be boolean.`);
    safePrefs[k] = v;
  }

  await updateDoc(doc(db, 'users', uid), {
    notifications: safePrefs,
    updatedAt: serverTimestamp(),
  });
}

export async function logout() {
  await signOut(auth);
}
