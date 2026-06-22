import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { getDatabase } from 'firebase/database';
import { getStorage } from 'firebase/storage';

// ── Validate all required env vars at startup ─────────────────────────────────
// If any are missing, throw immediately with a clear message so the
// Vercel deployment log shows exactly what is wrong.
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
      `and make sure it is enabled for Production, Preview, AND Development.`
    );
  }
}

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  // authDomain MUST be the Firebase project domain, not the Vercel domain.
  // This is what Google OAuth uses to redirect back after login.
  // If you have a custom domain, add it to Firebase Console →
  // Authentication → Settings → Authorized Domains.
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
// persistentLocalCache  → survives page refresh, works offline
// experimentalForceLongPolling → fallback when WebChannel is blocked
//   (fixes ERR_BLOCKED_BY_CLIENT on some networks / ad-blockers)
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
  // Auto-detect transport: uses WebSocket where available (no CSP issues),
  // falls back to long-polling only if WebSocket is blocked.
  // This replaces experimentalForceLongPolling which caused CSP violations
  // because RTDB long-polling uses <script> tag injection (JSONP).
  experimentalAutoDetectLongPolling: true,
});

export const rtdb    = getDatabase(app);
export const storage = getStorage(app);

export default app;
