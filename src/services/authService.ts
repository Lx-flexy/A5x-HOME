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
} from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase';

const googleProvider = new GoogleAuthProvider();
const facebookProvider = new FacebookAuthProvider();

function generateUserId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = 'A5X-U-';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

async function saveUserToFirestore(uid: string, data: {
  name: string;
  email: string;
  phoneNumber?: string;
  provider: string;
}) {
  const userRef = doc(db, 'users', uid);
  const existing = await getDoc(userRef);
  if (!existing.exists()) {
    const userId = generateUserId();
    await setDoc(userRef, {
      userId,
      uid,
      name: data.name,
      email: data.email,
      phoneNumber: data.phoneNumber || '',
      provider: data.provider,
      createdAt: serverTimestamp(),
    });
    return userId;
  }
  return existing.data().userId;
}

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
  });
  return user;
}

export function setupRecaptcha(elementId: string) {
  return new RecaptchaVerifier(auth, elementId, { size: 'invisible' });
}

export async function sendPhoneOTP(phone: string, recaptchaVerifier: RecaptchaVerifier) {
  return signInWithPhoneNumber(auth, phone, recaptchaVerifier);
}

export async function getUserData(uid: string) {
  const userRef = doc(db, 'users', uid);
  const snap = await getDoc(userRef);
  return snap.exists() ? snap.data() : null;
}

export async function logout() {
  await signOut(auth);
}
