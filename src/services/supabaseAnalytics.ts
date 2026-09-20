/**
 * Supabase Analytics Service — PostgreSQL Long-Term Storage
 * ═══════════════════════════════════════════════════════════════════════════
 * Bridges Firebase RTDB analytics → Supabase PostgreSQL for long-term storage.
 * 
 * EXISTING SCHEMA (Do NOT modify):
 *   - runtime_sessions: ON→OFF session tracking
 *   - daily_runtime: Per-channel daily totals
 *   - daily_analytics: Daily summary (optional)
 * 
 * CRITICAL RULES:
 *   1. Firebase is PRIMARY - all calculations happen in Firebase first
 *   2. Supabase writes are NON-FATAL - device control works if Supabase fails
 *   3. NO double-counting - use Firebase calculation result, persist to Supabase
 *   4. Format conversion: Firebase hours→Supabase seconds, Firebase kWh→Supabase Wh
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
      console.error(`[SUPABASE] Session start failed:`, error);
      return null;
    }

    const sessionId = data?.id;
    if (sessionId) {
      activeSessions.set(key, sessionId);
      console.log(`[SUPABASE] Session started: ID ${sessionId}`);
    } else {
      console.warn(`[SUPABASE] Session insert succeeded but no ID returned`);
    }
    
    return sessionId;
  } catch (err) {
    console.error('[SUPABASE] startRuntimeSession error:', err);
    return null;
  }
}

/**
 * Close a runtime session (OFF event).
 * 
 * @param deviceId Device ID
 * @param channel Channel name
 * @param runtimeSeconds Runtime in SECONDS (converted from Firebase hours)
 * @param energyWh Energy in Wh (converted from Firebase kWh)
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
    
    const cappedRuntime = Math.min(Math.round(runtimeSeconds), 86400); // 24h max
    
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
      console.error(`[SUPABASE] Session close failed:`, error);
      return;
    }
    
    activeSessions.delete(key);
    console.log(`[SUPABASE] Session closed successfully`);
  } catch (err) {
    console.error('[SUPABASE] closeRuntimeSession error:', err);
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
      console.error(`[SUPABASE] Daily runtime upsert failed:`, error);
      throw error;
    }
    
    console.log(`[SUPABASE] Daily runtime upserted successfully`);
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
 * @param days Number of days to fetch
 * @returns Array of daily runtime records (per-channel)
 */
export async function getDailyRuntime(
  deviceId: string,
  days: number = 30
): Promise<DailyRuntime[]> {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateStr = startDate.toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('daily_runtime')
      .select('*')
      .eq('device_id', deviceId)
      .gte('local_date', startDateStr)
      .order('local_date', { ascending: false });

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
    const records = await getDailyRuntime(deviceId, days);
    
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
