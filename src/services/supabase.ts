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

// ── Optional Supabase Configuration ───────────────────────────────────────────
// Supabase is OPTIONAL - only used for historical analytics (7/30 days tabs)
// Live monitoring works fully with Firebase RTDB only

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

// Check if Supabase is configured
const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

if (!isSupabaseConfigured) {
  console.warn(
    '[Supabase] Not configured - Historical analytics (7/30 days) disabled. ' +
    'Live monitoring (Today tab) works via Firebase RTDB.'
  );
}

// ── Initialize Supabase client (only if configured) ──────────────────────────
let supabaseClient: SupabaseClient | null = null;

if (isSupabaseConfigured) {
  // Validate URL format
  if (!supabaseUrl.startsWith('https://') || !supabaseUrl.includes('.supabase.co')) {
    console.error(
      `[Supabase] Invalid URL format: "${supabaseUrl}". ` +
      `Expected format: https://xxxxx.supabase.co`
    );
  } else {
    console.log('[Supabase] Initializing with:', {
      url: supabaseUrl,
      keyLength: supabaseKey.length,
    });

    supabaseClient = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
      db: {
        schema: 'public',
      },
    });

    console.log('[Supabase] Client initialized. Testing connectivity...');

    // Test connectivity (non-blocking)
    (async () => {
      try {
        const { error } = await supabaseClient!.from('runtime_sessions').select('id').limit(1);
        if (error) {
          console.error('[Supabase] Connectivity test failed:', error.message);
        } else {
          console.log('[Supabase] Connectivity test OK');
        }
      } catch (err) {
        console.error('[Supabase] Connectivity test exception:', err);
      }
    })();
  }
}

// Export client (can be null if not configured)
export const supabase = supabaseClient;

// ── Helper: Check if Supabase is available ────────────────────────────────────
export function isSupabaseAvailable(): boolean {
  return supabaseClient !== null;
}

// ── Helper: Check Supabase connectivity ───────────────────────────────────────
export async function checkSupabaseConnection(): Promise<boolean> {
  if (!supabaseClient) {
    console.warn('[Supabase] Not configured');
    return false;
  }
  
  try {
    const { error } = await supabaseClient.from('daily_analytics').select('id').limit(1);
    if (error) {
      if (error.code === '42P01') {
        console.warn('[Supabase] Table does not exist yet');
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
  if (!supabaseClient) {
    console.warn('[Supabase] Not configured - cannot diagnose RLS');
    return;
  }
  
  console.log('[Supabase] Diagnosing RLS policies...');
  
  const tables = ['runtime_sessions', 'daily_runtime', 'daily_analytics'];
  
  for (const table of tables) {
    console.log(`[Supabase] Testing ${table}...`);
    
    const { data: selectData, error: selectError } = await supabaseClient
      .from(table)
      .select('*')
      .limit(1);
    
    if (selectError) {
      console.error(`[Supabase] ${table} SELECT failed:`, {
        code: selectError.code,
        message: selectError.message,
      });
    } else {
      console.log(`[Supabase] ${table} SELECT OK (rows: ${selectData?.length || 0})`);
    }
  }
  
  console.log('[Supabase] RLS diagnosis complete');
}

export default supabaseClient;
