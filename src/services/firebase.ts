import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { getDatabase } from 'firebase/database';
import { getStorage } from 'firebase/storage';

// ── Validate all required env vars at startup ─────────────────────────────────
const REQUIRED = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_DATABASE_URL',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
] as const;

for (const key of REQUIRED) {
  if (!import.meta.env[key]) {
    throw new Error(
      `[Firebase] ${key} is undefined. ` +
      `Add it in Vercel → Project → Settings → Environment Variables ` +
      `and enable it for Production, Preview, AND Development.`
    );
  }
}

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL:       import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);

// ── Auth ──────────────────────────────────────────────────────────────────────
export const auth = getAuth(app);

// ── Firestore ─────────────────────────────────────────────────────────────────
// Uses persistent multi-tab cache for offline support.
// No long-polling flags — Firestore uses WebSocket (gRPC) by default on modern
// browsers and is not affected by the RTDB long-polling CSP issue.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});

// ── Realtime Database ─────────────────────────────────────────────────────────
// IMPORTANT: forceLongPolling MUST be false (default).
// Long-polling injects <script> tags (JSONP) from dynamic GKE subdomains like
// s-gke-apse1-nssi3-*.asia-southeast1.firebasedatabase.app — these cannot be
// whitelisted in CSP because the subdomain changes dynamically.
// With forceLongPolling:false, RTDB uses WebSocket which works fine with CSP.
export const rtdb = getDatabase(app);

// ── Storage ───────────────────────────────────────────────────────────────────
export const storage = getStorage(app);

export default app;
