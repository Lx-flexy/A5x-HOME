import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // Pre-bundle lucide-react so Vite serves it as a single chunk
    // instead of individual /icons/fingerprint.js etc. files that
    // ad-blockers mistakenly block.
    include: ['lucide-react'],
  },
  server: {
    host: true, // Network pe expose karo
    headers: {
      // Allow Firebase OAuth popups (Google/Facebook signInWithPopup) to work
      // without Cross-Origin-Opener-Policy blocking window.closed checks.
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
      'Cross-Origin-Embedder-Policy': 'unsafe-none',
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Service worker should be in root for Firebase Messaging
        assetFileNames: (assetInfo) => {
          if (assetInfo.name === 'firebase-messaging-sw.js') {
            return 'firebase-messaging-sw.js';
          }
          return 'assets/[name]-[hash][extname]';
        },
      },
    },
  },
});
