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

// Log key info for debugging (show first/last chars only)
console.log('[Supabase] Initializing with:', {
  url: supabaseUrl,
  keyPrefix: supabaseKey.substring(0, 20),
  keySuffix: supabaseKey.substring(supabaseKey.length - 10),
  keyLength: supabaseKey.length,
});

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
  global: {
    headers: {
      // Explicitly set apikey in headers for debugging
      // This should match the Authorization: Bearer <key> header
      'x-debug-apikey-prefix': supabaseKey.substring(0, 20),
    },
  },
});

// Log client initialization complete
console.log('[Supabase] Client initialized. Testing connectivity...');

// Test a simple query to verify auth works
supabase.from('runtime_sessions').select('id').limit(1).then(({ data, error }) => {
  if (error) {
    console.error('[Supabase] Initial connectivity test FAILED:', {
      status: error.status,
      code: error.code,
      message: error.message,
    });
    
    if (error.status === 401) {
      console.error('[Supabase] 401 UNAUTHORIZED detected at initialization!');
      console.error('[Supabase] This means the API key is invalid or the table does not allow anon access');
      console.error('[Supabase] Check:');
      console.error('  1. Is VITE_SUPABASE_PUBLISHABLE_KEY correct in Vercel?');
      console.error('  2. Does runtime_sessions table have RLS policies for anon role?');
      console.error('  3. Is the Supabase project URL correct?');
    }
  } else {
    console.log('[Supabase] Initial connectivity test OK');
  }
}).catch(err => {
  console.error('[Supabase] Initial connectivity test exception:', err);
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

// ── Helper: Diagnose RLS policies (for debugging 401 errors) ──────────────────
export async function diagnoseSupabaseRLS(): Promise<void> {
  console.log('[Supabase] Diagnosing RLS policies...');
  
  const tables = ['runtime_sessions', 'daily_runtime', 'daily_analytics'];
  
  for (const table of tables) {
    console.log(`[Supabase] Testing ${table}...`);
    
    // Test SELECT
    const { data: selectData, error: selectError } = await supabase
      .from(table)
      .select('*')
      .limit(1);
    
    if (selectError) {
      console.error(`[Supabase] ${table} SELECT failed:`, {
        code: selectError.code,
        message: selectError.message,
        status: selectError.status,
      });
    } else {
      console.log(`[Supabase] ${table} SELECT OK (rows: ${selectData?.length || 0})`);
    }
  }
  
  console.log('[Supabase] RLS diagnosis complete');
  console.log('[Supabase] If you see 401/PGRST301 errors, check:');
  console.log('[Supabase] 1. Supabase Dashboard → Authentication → Policies');
  console.log('[Supabase] 2. Enable RLS policies for INSERT/UPDATE/SELECT on runtime_sessions and daily_runtime');
  console.log('[Supabase] 3. Policy should allow "anon" role or be based on auth.uid()');
}

export default supabase;
