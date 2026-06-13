import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getDatabase } from 'firebase/database';
import { getStorage } from 'firebase/storage';

const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;

if (!apiKey) {
  throw new Error(
    '[Firebase] VITE_FIREBASE_API_KEY is undefined. ' +
    'Add all VITE_FIREBASE_* env vars in Vercel → Settings → Environment Variables.'
  );
}

const firebaseConfig = {
  apiKey,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL:       import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);

export const auth    = getAuth(app);
export const db      = getFirestore(app);   // Firestore — users, meta, logs, members
export const rtdb    = getDatabase(app);    // Realtime DB — live device state
export const storage = getStorage(app);

export default app;
