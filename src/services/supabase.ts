/**
 * Supabase Client — PostgreSQL for Long-Term Analytics
 * ─────────────────────────────────────────────────────────────────────────────
 * Architecture:
 * - Firebase RTDB: Real-time IoT/device state, live control, current day analytics
 * - Supabase PostgreSQL: Historical analytics, runtime sessions, long-term storage
 * 
 * This client uses the PUBLISHABLE key (safe for frontend).
 * Database writes should eventually move to Edge Functions for security.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ── Validate required environment variables ───────────────────────────────────
const REQUIRED = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'] as const;

for (const key of REQUIRED) {
  if (!import.meta.env[key]) {
    throw new Error(
      `[Supabase] ${key} is undefined. ` +
      `Add it in Vercel → Project → Settings → Environment Variables ` +
      `and enable it for Production, Preview, AND Development.`
    );
  }
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

// Validate URL format
if (!supabaseUrl.startsWith('https://') || !supabaseUrl.includes('.supabase.co')) {
  throw new Error(
    `[Supabase] Invalid VITE_SUPABASE_URL format: "${supabaseUrl}". ` +
    `Expected format: https://xxxxx.supabase.co`
  );
}

// ── Initialize Supabase client ────────────────────────────────────────────────
export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey, {
  auth: {
    // IMPORTANT: This app uses Firebase Auth, not Supabase Auth
    // Supabase is used only for database (analytics storage)
    // No authentication integration needed
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
  // Use connection pooling for better performance
  db: {
    schema: 'public',
  },
});

// ── Helper: Check Supabase connectivity ───────────────────────────────────────
export async function checkSupabaseConnection(): Promise<boolean> {
  try {
    const { error } = await supabase.from('daily_analytics').select('id').limit(1);
    if (error) {
      // Table might not exist yet — that's okay during initial setup
      if (error.code === '42P01') {
        console.warn('[Supabase] Table does not exist yet. Run migration: supabase/migrations/001_initial_analytics.sql');
        return false;
      }
      console.error('[Supabase] Connection check failed:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[Supabase] Connection check error:', err);
    return false;
  }
}

export default supabase;
