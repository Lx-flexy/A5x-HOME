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
    headers: {
      // Allow Firebase OAuth popups (Google/Facebook signInWithPopup) to work
      // without Cross-Origin-Opener-Policy blocking window.closed checks.
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
      'Cross-Origin-Embedder-Policy': 'unsafe-none',
    },
  },
});
