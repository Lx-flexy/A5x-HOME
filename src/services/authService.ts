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

const googleProvider = new GoogleAuthProvider();
const facebookProvider = new FacebookAuthProvider();

// ─── User ID Generator ──────────────────────────────────────────────────────
function generateUserId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = 'A5X-U-';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// ─── Firestore User Document ─────────────────────────────────────────────────
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
) {
  try {
    const userRef = doc(db, 'users', uid);
    const existing = await getDoc(userRef);

    if (!existing.exists()) {
      // New user — create full document
      const userId = generateUserId();
      await setDoc(userRef, {
        userId,
        uid,
        name: data.name,
        email: data.email,
        phoneNumber: data.phoneNumber || '',
        provider: data.provider,
        photoURL: data.photoURL || '',
        notifications: {
          deviceOnline: true,
          deviceOffline: true,
          memberAdded: false,
          activityLog: true,
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return userId;
    }

    // Existing user — update name/photo if changed (OAuth re-logins)
    const updates: Record<string, unknown> = { updatedAt: serverTimestamp() };
    if (data.name && data.name !== existing.data().name) updates.name = data.name;
    if (data.photoURL && data.photoURL !== existing.data().photoURL) updates.photoURL = data.photoURL;
    await updateDoc(userRef, updates);

    return existing.data().userId;
  } catch (err) {
    console.warn('[saveUserToFirestore] Firestore write failed:', err);
    return null;
  }
}

// ─── Auth Methods ─────────────────────────────────────────────────────────────

export async function registerWithEmail(name: string, email: string, password: string) {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(credential.user, { displayName: name });
  await saveUserToFirestore(credential.user.uid, { name, email, provider: 'email' });
  return credential.user;
}

export async function loginWithEmail(email: string, password: string) {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

export async function loginWithGoogle() {
  const credential = await signInWithPopup(auth, googleProvider);
  const user = credential.user;
  await saveUserToFirestore(user.uid, {
    name: user.displayName || 'User',
    email: user.email || '',
    provider: 'google',
    photoURL: user.photoURL || '',
  });
  return user;
}

export async function loginWithFacebook() {
  const credential = await signInWithPopup(auth, facebookProvider);
  const user = credential.user;
  await saveUserToFirestore(user.uid, {
    name: user.displayName || 'User',
    email: user.email || '',
    provider: 'facebook',
    photoURL: user.photoURL || '',
  });
  return user;
}

export async function forgotPassword(email: string) {
  await sendPasswordResetEmail(auth, email);
}

export function setupRecaptcha(elementId: string) {
  return new RecaptchaVerifier(auth, elementId, { size: 'invisible' });
}

export async function sendPhoneOTP(phone: string, recaptchaVerifier: RecaptchaVerifier) {
  return signInWithPhoneNumber(auth, phone, recaptchaVerifier);
}

// ─── User Data CRUD ───────────────────────────────────────────────────────────

export async function getUserData(uid: string) {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    return snap.exists() ? snap.data() : null;
  } catch (err) {
    console.warn('[getUserData] Firestore read failed:', err);
    return null;
  }
}

export async function updateUserProfile(
  uid: string,
  data: { name?: string; phoneNumber?: string; photoURL?: string }
) {
  try {
    const userRef = doc(db, 'users', uid);
    await updateDoc(userRef, {
      ...data,
      updatedAt: serverTimestamp(),
    });
    // Also sync to Firebase Auth displayName
    if (data.name && auth.currentUser) {
      await updateProfile(auth.currentUser, {
        displayName: data.name,
        ...(data.photoURL ? { photoURL: data.photoURL } : {}),
      });
    }
  } catch (err) {
    console.warn('[updateUserProfile] Failed:', err);
    throw err;
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
  try {
    await updateDoc(doc(db, 'users', uid), {
      notifications: prefs,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn('[updateNotificationPreferences] Failed:', err);
    throw err;
  }
}

export async function logout() {
  await signOut(auth);
}
