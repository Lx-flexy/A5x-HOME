import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
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

export const auth = getAuth(app);

// Firestore with persistent cache (multi-tab) + long-polling fallback.
// - persistentLocalCache: survives page refresh, works offline
// - experimentalForceLongPolling: fallback when WebChannel is blocked by ad-blockers
//   (fixes ERR_BLOCKED_BY_CLIENT for firestore.googleapis.com requests)
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
  experimentalForceLongPolling: true,
});

export const rtdb    = getDatabase(app);    // Realtime DB — live device state
export const storage = getStorage(app);

export default app;
