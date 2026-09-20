/**
 * Supabase Analytics Service — PostgreSQL Long-Term Storage
 * ═══════════════════════════════════════════════════════════════════════════
 * Supabase = SOLE persistence layer for analytics/history data
 * 
 * EXISTING SCHEMA (Do NOT modify):
 *   - runtime_sessions: ON→OFF session tracking
 *   - daily_runtime: Per-channel daily totals
 *   - daily_analytics: Daily summary (optional)
 * 
 * ARCHITECTURE:
 *   - Firebase RTDB: Live device state, device control, ESP32 communication
 *   - Supabase PostgreSQL: Analytics persistence, runtime sessions, history
 * 
 * CRITICAL RULES:
 *   1. NO Firebase imports in this file
 *   2. Supabase writes are NON-FATAL - device control continues if Supabase fails
 *   3. NO double-counting - each ON→OFF event creates ONE session
 *   4. Format conversion: hours→seconds, kWh→Wh for storage
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { supabase } from './supabase';

// ═══ In-Memory Session Tracking ═══════════════════════════════════════════
// Maps "${deviceId}:${channel}" → session_id
const activeSessions = new Map<string, number>();

function sessionKey(deviceId: string, channel: string): string {
  return `${deviceId}:${channel}`;
}

// ═══ TypeScript Interfaces (Matching EXISTING Supabase Schema) ════════════

/**
 * runtime_sessions table
 */
export interface RuntimeSession {
  id?: number;
  device_id: string;
  output_key: string; // 'light2' | 'light3' | 'fan1' | 'custom1'
  started_at: string; // ISO timestamp
  ended_at?: string | null;
  runtime_seconds?: number | null;
  energy_wh?: number | null;
  created_at?: string;
}

/**
 * daily_runtime table (per-channel schema)
 */
export interface DailyRuntime {
  device_id: string;
  channel: string; // 'light2' | 'light3' | 'fan1' | 'custom1'
  local_date: string; // 'YYYY-MM-DD'
  runtime_s: number; // seconds
  est_apparent_wh?: number | null;
  est_wh?: number | null;
  calc_version?: number | null;
}

/**
 * daily_analytics table (aggregated schema - optional)
 */
export interface DailyAnalytics {
  id?: number;
  device_id: string;
  date: string; // 'YYYY-MM-DD'
  light2_runtime?: number; // seconds
  light3_runtime?: number; // seconds
  fan1_runtime?: number; // seconds
  custom1_runtime?: number; // seconds
  energy_usage?: number; // Wh
  created_at?: string;
  updated_at?: string;
}

// ═══ Session Management ═══════════════════════════════════════════════════

/**
 * Start a runtime session (ON event).
 * 
 * @param deviceId Device ID
 * @param channel 'light2' | 'light3' | 'fan1' | 'custom1'
 * @returns Session ID or null if failed
 */
export async function startRuntimeSession(
  deviceId: string,
  channel: string
): Promise<number | null> {
  try {
    console.log(`[SUPABASE] startRuntimeSession: deviceId=${deviceId}, channel=${channel}`);
    
    const key = sessionKey(deviceId, channel);
    
    // Check if session already exists (prevent duplicates)
    const existingSessionId = activeSessions.get(key);
    if (existingSessionId) {
      console.log(`[SUPABASE] Session already active for ${deviceId}/${channel}, reusing ID ${existingSessionId}`);
      return existingSessionId;
    }
    
    const session: Omit<RuntimeSession, 'id' | 'created_at'> = {
      device_id: deviceId,
      output_key: channel,
      started_at: new Date().toISOString(),
      ended_at: null,
      runtime_seconds: null,
      energy_wh: null,
    };

    console.log(`[SUPABASE] Inserting session:`, session);
    
    const { data, error } = await supabase
      .from('runtime_sessions')
      .insert(session)
      .select('id')
      .single();

    if (error) {
      console.error(`[SUPABASE] Session start FAILED:`, {
        status: error.status,
        statusText: error.status === 401 ? 'Unauthorized' : 'Error',
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
        fullError: error,
      });
      
      // Specific diagnosis for 401 errors
      if (error.status === 401) {
        console.error('[SUPABASE] 401 Unauthorized - Possible causes:');
        
        if (error.code === 'PGRST301') {
          console.error('  - PGRST301: JWT token is invalid or could not be decoded');
          console.error('  - Check: Is the Authorization header being set incorrectly?');
          console.error('  - Check: Is Firebase Auth trying to override Supabase auth?');
        } else {
          console.error('  - API key may be invalid or expired');
          console.error('  - Check: VITE_SUPABASE_PUBLISHABLE_KEY in Vercel environment variables');
          console.error('  - Check: Project URL matches the API key');
        }
        
        console.error('[SUPABASE] Debug: Check Network tab for /rest/v1/runtime_sessions:');
        console.error('  - Verify "apikey" header is present');
        console.error('  - Verify "Authorization" header is NOT overriding the API key');
        console.error('  - Verify request URL uses correct Supabase project URL');
      }
      
      return null;
    }

    const sessionId = data?.id;
    if (!sessionId) {
      console.error(`[SUPABASE] Session insert returned success but no ID in response:`, data);
      return null;
    }
    
    activeSessions.set(key, sessionId);
    console.log(`[SUPABASE] Session started successfully: ID ${sessionId}`);
    
    return sessionId;
  } catch (err) {
    console.error('[SUPABASE] startRuntimeSession error:', err);
    return null;
  }
}

/**
 * Close a runtime session (OFF event).
 * Calculates runtime from session start timestamp if runtimeSeconds is 0.
 * 
 * @param deviceId Device ID
 * @param channel Channel name
 * @param runtimeSeconds Runtime in SECONDS (0 to auto-calculate from session)
 * @param energyWh Energy in Wh
 */
export async function closeRuntimeSession(
  deviceId: string,
  channel: string,
  runtimeSeconds: number,
  energyWh: number
): Promise<void> {
  try {
    console.log(`[SUPABASE] closeRuntimeSession: deviceId=${deviceId}, channel=${channel}, runtime=${runtimeSeconds}s, energy=${energyWh}Wh`);
    
    const key = sessionKey(deviceId, channel);
    const sessionId = activeSessions.get(key);
    
    if (!sessionId) {
      console.warn(`[SUPABASE] No active session for ${deviceId}/${channel}, skipping close`);
      return;
    }
    
    let finalRuntimeSeconds = runtimeSeconds;
    
    // If runtime is 0, calculate from session's started_at
    if (runtimeSeconds === 0) {
      const { data, error } = await supabase
        .from('runtime_sessions')
        .select('started_at')
        .eq('id', sessionId)
        .single();
      
      if (error || !data) {
        console.error(`[SUPABASE] Failed to fetch session started_at:`, error);
        finalRuntimeSeconds = 0;
      } else {
        const startedAt = new Date(data.started_at).getTime();
        const now = Date.now();
        finalRuntimeSeconds = Math.round((now - startedAt) / 1000);
        console.log(`[SUPABASE] Auto-calculated runtime: ${finalRuntimeSeconds}s from session start`);
      }
    }
    
    const cappedRuntime = Math.min(Math.round(finalRuntimeSeconds), 86400); // 24h max
    
    console.log(`[SUPABASE] Updating session ${sessionId}: runtime=${cappedRuntime}s, energy=${energyWh}Wh`);
    
    const { error } = await supabase
      .from('runtime_sessions')
      .update({
        ended_at: new Date().toISOString(),
        runtime_seconds: cappedRuntime,
        energy_wh: energyWh,
      })
      .eq('id', sessionId);

    if (error) {
      console.error(`[SUPABASE] Session close FAILED:`, {
        status: error.status,
        statusText: error.status === 401 ? 'Unauthorized' : 'Error',
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
        sessionId,
        fullError: error,
      });
      
      // Specific diagnosis for 401 errors
      if (error.status === 401 && error.code === 'PGRST301') {
        console.error('[SUPABASE] PGRST301: JWT token is invalid or could not be decoded');
        console.error('[SUPABASE] Check: Is Authorization header being set incorrectly?');
      }
      
      return;
    }
    
    activeSessions.delete(key);
    console.log(`[SUPABASE] Session closed successfully: ID ${sessionId}`);
  } catch (err) {
    console.error('[SUPABASE] closeRuntimeSession exception:', err);
  }
}

// ═══ Daily Runtime (Per-Channel) ══════════════════════════════════════════

/**
 * Upsert daily runtime for a single channel.
 * Uses EXISTING daily_runtime table with per-channel schema.
 * 
 * @param deviceId Device ID
 * @param channel Channel name
 * @param localDate Date string (YYYY-MM-DD)
 * @param runtimeSeconds Total runtime in SECONDS
 * @param energyWh Total energy in Wh
 */
export async function upsertDailyRuntime(
  deviceId: string,
  channel: string,
  localDate: string,
  runtimeSeconds: number,
  energyWh: number
): Promise<void> {
  try {
    console.log(`[SUPABASE] upsertDailyRuntime: deviceId=${deviceId}, channel=${channel}, date=${localDate}, runtime=${runtimeSeconds}s, energy=${energyWh}Wh`);
    
    const cappedRuntime = Math.min(Math.round(runtimeSeconds), 86400); // 24h max
    
    const record: DailyRuntime = {
      device_id: deviceId,
      channel,
      local_date: localDate,
      runtime_s: cappedRuntime,
      est_apparent_wh: energyWh,
      est_wh: energyWh,
      calc_version: 1,
    };

    console.log(`[SUPABASE] Upserting daily_runtime:`, record);
    
    const { error } = await supabase
      .from('daily_runtime')
      .upsert(record, {
        onConflict: 'device_id,channel,local_date',
      });

    if (error) {
      console.error(`[SUPABASE] Daily runtime upsert FAILED:`, {
        status: error.status,
        statusText: error.status === 401 ? 'Unauthorized' : 'Error',
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
        fullError: error,
      });
      
      // Specific diagnosis for 401 errors
      if (error.status === 401 && error.code === 'PGRST301') {
        console.error('[SUPABASE] PGRST301: JWT token is invalid or could not be decoded');
        console.error('[SUPABASE] Check: Is Authorization header being set incorrectly?');
      }
      
      throw error;
    }
    
    console.log(`[SUPABASE] Daily runtime upserted successfully: ${deviceId}/${channel}/${localDate}`);
  } catch (err) {
    console.error('[SUPABASE] upsertDailyRuntime error:', err);
    throw err; // Re-throw to be caught by caller's .catch()
  }
}

// ═══ Conversion Helpers ═══════════════════════════════════════════════════

/**
 * Convert Firebase hours to Supabase seconds.
 */
export function hoursToSeconds(hours: number): number {
  return Math.round(hours * 3600);
}

/**
 * Convert Supabase seconds to Firebase hours.
 */
export function secondsToHours(seconds: number): number {
  return seconds / 3600;
}

/**
 * Convert Firebase kWh to Supabase Wh.
 */
export function kwhToWh(kwh: number): number {
  return kwh * 1000;
}

/**
 * Convert Supabase Wh to Firebase kWh.
 */
export function whToKwh(wh: number): number {
  return wh / 1000;
}

// ═══ Read Operations (Historical Data) ════════════════════════════════════

/**
 * Get daily runtime records for a device.
 * 
 * @param deviceId Device ID
 * @param channel Optional channel filter
 * @param localDate Optional date filter (YYYY-MM-DD)
 * @returns Array of daily runtime records (per-channel)
 */
export async function getDailyRuntime(
  deviceId: string,
  channel?: string,
  localDate?: string
): Promise<DailyRuntime[]> {
  try {
    let query = supabase
      .from('daily_runtime')
      .select('*')
      .eq('device_id', deviceId);
    
    if (channel) {
      query = query.eq('channel', channel);
    }
    
    if (localDate) {
      query = query.eq('local_date', localDate);
    } else {
      // Default: last 30 days
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);
      const startDateStr = startDate.toISOString().split('T')[0];
      query = query.gte('local_date', startDateStr);
    }
    
    query = query.order('local_date', { ascending: false });

    const { data, error } = await query;

    if (error) {
      console.error('[SUPABASE] getDailyRuntime failed:', error);
      throw error;
    }

    return data || [];
  } catch (err) {
    console.error('[SUPABASE] getDailyRuntime error:', err);
    return [];
  }
}

/**
 * Aggregate per-channel daily_runtime records into daily totals.
 * Converts Supabase format (seconds, Wh) to Firebase format (hours, kWh).
 * 
 * @param deviceId Device ID
 * @param days Number of days
 * @returns Aggregated daily analytics in Firebase format
 */
export async function getAggregatedDailyAnalytics(
  deviceId: string,
  days: number = 30
): Promise<Array<{
  deviceId: string;
  date: string;
  light2Runtime: number; // hours
  light3Runtime: number; // hours
  fan1Runtime: number; // hours
  customRuntime: number; // hours
  energyUsage: number; // kWh
}>> {
  try {
    // Fetch all records for the device (no channel filter)
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateStr = startDate.toISOString().split('T')[0];

    const { data: records, error } = await supabase
      .from('daily_runtime')
      .select('*')
      .eq('device_id', deviceId)
      .gte('local_date', startDateStr)
      .order('local_date', { ascending: false });

    if (error) {
      console.error('[SUPABASE] getAggregatedDailyAnalytics failed:', error);
      return [];
    }

    if (!records) {
      return [];
    }
    
    // Group by date
    const byDate = new Map<string, DailyRuntime[]>();
    for (const record of records) {
      const existing = byDate.get(record.local_date) || [];
      existing.push(record);
      byDate.set(record.local_date, existing);
    }
    
    // Aggregate each date
    const result = [];
    for (const [date, dateRecords] of byDate.entries()) {
      const aggregated = {
        light2: 0,
        light3: 0,
        fan1: 0,
        custom1: 0,
        energy: 0,
      };
      
      for (const record of dateRecords) {
        const ch = record.channel;
        if (ch === 'light2' || ch === 'light3' || ch === 'fan1' || ch === 'custom1') {
          aggregated[ch] = record.runtime_s;
          aggregated.energy += record.est_wh || 0;
        }
      }
      
      result.push({
        deviceId,
        date,
        light2Runtime: secondsToHours(aggregated.light2),
        light3Runtime: secondsToHours(aggregated.light3),
        fan1Runtime: secondsToHours(aggregated.fan1),
        customRuntime: secondsToHours(aggregated.custom1),
        energyUsage: whToKwh(aggregated.energy),
      });
    }
    
    return result.sort((a, b) => b.date.localeCompare(a.date));
  } catch (err) {
    console.error('[SUPABASE] getAggregatedDailyAnalytics error:', err);
    return [];
  }
}
