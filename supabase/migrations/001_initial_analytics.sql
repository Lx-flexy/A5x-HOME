-- ═══════════════════════════════════════════════════════════════════════════
-- A5X HOME — Supabase Analytics Schema Migration
-- ═══════════════════════════════════════════════════════════════════════════
-- Purpose: Long-term analytics storage for IoT device runtime and energy data
-- 
-- Architecture:
--   Firebase RTDB → Real-time device state, current day analytics
--   Supabase PostgreSQL → Historical analytics, runtime sessions, reporting
-- 
-- Security Model:
--   - RLS enabled on all tables
--   - Frontend uses publishable key (read-only for now)
--   - Writes should move to Edge Functions in production
-- 
-- Data Flow:
--   ESP32 → Firebase RTDB → analyticsService.ts → Supabase PostgreSQL
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- TABLE 1: daily_analytics
-- ───────────────────────────────────────────────────────────────────────────
-- Stores aggregated daily runtime and energy per device.
-- One record per device per day (UNIQUE constraint on device_id + date).
-- Runtime values stored in SECONDS for precision and consistency.
-- Energy values stored in Wh (watt-hours).
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS daily_analytics (
    id BIGSERIAL PRIMARY KEY,
    device_id TEXT NOT NULL,
    date DATE NOT NULL,
    
    -- Runtime in SECONDS (not hours) for precision
    -- Each channel capped at 86400 seconds (24 hours) per day
    light2_runtime INTEGER NOT NULL DEFAULT 0 CHECK (light2_runtime >= 0 AND light2_runtime <= 86400),
    light3_runtime INTEGER NOT NULL DEFAULT 0 CHECK (light3_runtime >= 0 AND light3_runtime <= 86400),
    fan1_runtime INTEGER NOT NULL DEFAULT 0 CHECK (fan1_runtime >= 0 AND fan1_runtime <= 86400),
    custom1_runtime INTEGER NOT NULL DEFAULT 0 CHECK (custom1_runtime >= 0 AND custom1_runtime <= 86400),
    
    -- Energy in Wh (watt-hours)
    energy_usage NUMERIC(10, 3) NOT NULL DEFAULT 0 CHECK (energy_usage >= 0),
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Unique constraint: one record per device per day
    UNIQUE(device_id, date)
);

-- Indexes for query performance
CREATE INDEX IF NOT EXISTS idx_daily_analytics_device_date ON daily_analytics(device_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_analytics_date ON daily_analytics(date DESC);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_daily_analytics_updated_at
    BEFORE UPDATE ON daily_analytics
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE daily_analytics IS 'Daily aggregated analytics per device — runtime in SECONDS, energy in Wh';
COMMENT ON COLUMN daily_analytics.light2_runtime IS 'Runtime in seconds (max 86400 = 24h)';
COMMENT ON COLUMN daily_analytics.light3_runtime IS 'Runtime in seconds (max 86400 = 24h)';
COMMENT ON COLUMN daily_analytics.fan1_runtime IS 'Runtime in seconds (max 86400 = 24h)';
COMMENT ON COLUMN daily_analytics.custom1_runtime IS 'Runtime in seconds (max 86400 = 24h)';
COMMENT ON COLUMN daily_analytics.energy_usage IS 'Total energy in Wh (watt-hours)';

-- ───────────────────────────────────────────────────────────────────────────
-- TABLE 2: runtime_sessions
-- ───────────────────────────────────────────────────────────────────────────
-- Records individual ON → OFF sessions for each output.
-- Used for detailed analytics, session tracking, and debugging.
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS runtime_sessions (
    id BIGSERIAL PRIMARY KEY,
    device_id TEXT NOT NULL,
    output_key TEXT NOT NULL CHECK (output_key IN ('light2', 'light3', 'fan1', 'custom1')),
    
    started_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ,
    
    -- Runtime in seconds (calculated: ended_at - started_at)
    runtime_seconds INTEGER CHECK (runtime_seconds >= 0 AND runtime_seconds <= 86400),
    
    -- Energy consumed during this session in Wh
    energy_wh NUMERIC(10, 3) CHECK (energy_wh >= 0),
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Validation: ended_at must be after started_at
    CHECK (ended_at IS NULL OR ended_at >= started_at)
);

-- Indexes for query performance
CREATE INDEX IF NOT EXISTS idx_runtime_sessions_device ON runtime_sessions(device_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_runtime_sessions_output ON runtime_sessions(output_key, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_runtime_sessions_started ON runtime_sessions(started_at DESC);

COMMENT ON TABLE runtime_sessions IS 'Individual ON→OFF sessions per output — detailed runtime tracking';
COMMENT ON COLUMN runtime_sessions.output_key IS 'Output channel: light2, light3, fan1, or custom1';
COMMENT ON COLUMN runtime_sessions.runtime_seconds IS 'Session duration in seconds (max 86400 = 24h)';
COMMENT ON COLUMN runtime_sessions.energy_wh IS 'Energy consumed during session in Wh';

-- ───────────────────────────────────────────────────────────────────────────
-- TABLE 3: current_readings (OPTIONAL)
-- ───────────────────────────────────────────────────────────────────────────
-- Stores sampled current sensor readings for historical analysis.
-- WARNING: Do NOT write current sensor data every few milliseconds!
-- Use sensible aggregation: 1 write per 30-60 seconds or on significant change.
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS current_readings (
    id BIGSERIAL PRIMARY KEY,
    device_id TEXT NOT NULL,
    output_key TEXT NOT NULL CHECK (output_key IN ('light2', 'light3', 'fan1', 'custom1')),
    
    -- Current sensor readings
    current_amp NUMERIC(6, 3) NOT NULL CHECK (current_amp >= 0 AND current_amp <= 30),
    voltage INTEGER NOT NULL DEFAULT 230 CHECK (voltage > 0 AND voltage <= 500),
    power_watt NUMERIC(8, 2) NOT NULL CHECK (power_watt >= 0),
    
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for query performance and time-series queries
CREATE INDEX IF NOT EXISTS idx_current_readings_device_time ON current_readings(device_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_current_readings_output_time ON current_readings(output_key, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_current_readings_time ON current_readings(recorded_at DESC);

COMMENT ON TABLE current_readings IS 'Sampled current sensor readings — AGGREGATE before writing (30-60s intervals)';
COMMENT ON COLUMN current_readings.current_amp IS 'Current in amperes (0-30A for ACS712-30A)';
COMMENT ON COLUMN current_readings.voltage IS 'Voltage in volts (typically 230V in India)';
COMMENT ON COLUMN current_readings.power_watt IS 'Calculated power: voltage × current';

-- ───────────────────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY (RLS)
-- ───────────────────────────────────────────────────────────────────────────
-- IMPORTANT: This app uses Firebase Auth, not Supabase Auth.
-- RLS policies below are PLACEHOLDER for future Edge Function integration.
-- 
-- Current Architecture:
--   - Frontend uses Supabase publishable key (anon key)
--   - Writes happen directly from browser (temporary — move to Edge Functions)
--   - Reads are unrestricted for now (users can read all analytics)
-- 
-- Future Production Architecture:
--   - Frontend → Supabase Edge Function → PostgreSQL
--   - Edge Function validates Firebase Auth token
--   - RLS policies enforce device ownership
-- ───────────────────────────────────────────────────────────────────────────

-- Enable RLS on all tables
ALTER TABLE daily_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE runtime_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE current_readings ENABLE ROW LEVEL SECURITY;

-- ───────────────────────────────────────────────────────────────────────────
-- TEMPORARY PERMISSIVE POLICIES (Development Phase)
-- ───────────────────────────────────────────────────────────────────────────
-- Allow all reads and writes using the anon key (publishable key).
-- 
-- WARNING: These policies are NOT SECURE for production.
-- Replace with proper Firebase Auth token validation in Edge Functions.
-- ───────────────────────────────────────────────────────────────────────────

-- Allow anonymous reads (all users can read analytics)
CREATE POLICY "Allow public read access to daily_analytics"
    ON daily_analytics FOR SELECT
    USING (true);

CREATE POLICY "Allow public read access to runtime_sessions"
    ON runtime_sessions FOR SELECT
    USING (true);

CREATE POLICY "Allow public read access to current_readings"
    ON current_readings FOR SELECT
    USING (true);

-- Allow anonymous writes (temporary — move to Edge Functions)
-- In production, these should be replaced with Edge Function-only access
CREATE POLICY "Allow public insert to daily_analytics"
    ON daily_analytics FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Allow public update to daily_analytics"
    ON daily_analytics FOR UPDATE
    USING (true);

CREATE POLICY "Allow public insert to runtime_sessions"
    ON runtime_sessions FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Allow public update to runtime_sessions"
    ON runtime_sessions FOR UPDATE
    USING (true);

CREATE POLICY "Allow public insert to current_readings"
    ON current_readings FOR INSERT
    WITH CHECK (true);

-- ───────────────────────────────────────────────────────────────────────────
-- HELPER FUNCTIONS
-- ───────────────────────────────────────────────────────────────────────────

-- Function: Get daily analytics for device (N days)
CREATE OR REPLACE FUNCTION get_device_analytics(
    p_device_id TEXT,
    p_days INTEGER DEFAULT 30
)
RETURNS TABLE (
    date DATE,
    light2_runtime INTEGER,
    light3_runtime INTEGER,
    fan1_runtime INTEGER,
    custom1_runtime INTEGER,
    energy_usage NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        da.date,
        da.light2_runtime,
        da.light3_runtime,
        da.fan1_runtime,
        da.custom1_runtime,
        da.energy_usage
    FROM daily_analytics da
    WHERE da.device_id = p_device_id
        AND da.date >= CURRENT_DATE - p_days
    ORDER BY da.date DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_device_analytics IS 'Fetch daily analytics for a device (last N days)';

-- Function: Get runtime sessions for device (date range)
CREATE OR REPLACE FUNCTION get_device_sessions(
    p_device_id TEXT,
    p_start_date TIMESTAMPTZ DEFAULT NOW() - INTERVAL '7 days',
    p_end_date TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE (
    output_key TEXT,
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    runtime_seconds INTEGER,
    energy_wh NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        rs.output_key,
        rs.started_at,
        rs.ended_at,
        rs.runtime_seconds,
        rs.energy_wh
    FROM runtime_sessions rs
    WHERE rs.device_id = p_device_id
        AND rs.started_at >= p_start_date
        AND rs.started_at <= p_end_date
    ORDER BY rs.started_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_device_sessions IS 'Fetch runtime sessions for a device (date range)';

-- ───────────────────────────────────────────────────────────────────────────
-- DATA RETENTION (Optional — implement later if needed)
-- ───────────────────────────────────────────────────────────────────────────
-- Consider adding automatic data retention policies:
-- - Keep current_readings for 30 days only
-- - Keep runtime_sessions for 90 days only
-- - Keep daily_analytics indefinitely (or 2+ years)
-- 
-- Example (not enabled by default):
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- SELECT cron.schedule('delete-old-current-readings', '0 2 * * *', $$
--   DELETE FROM current_readings WHERE recorded_at < NOW() - INTERVAL '30 days'
-- $$);
-- ───────────────────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION COMPLETE
-- ═══════════════════════════════════════════════════════════════════════════
-- 
-- Next Steps:
-- 1. Run this migration in Supabase SQL Editor or via Supabase CLI
-- 2. Verify tables created: daily_analytics, runtime_sessions, current_readings
-- 3. Test connection using checkSupabaseConnection() from supabase.ts
-- 4. Implement analytics persistence in supabaseAnalytics.ts
-- 
-- Security Hardening (Production):
-- 1. Create Supabase Edge Function for analytics writes
-- 2. Validate Firebase Auth token in Edge Function
-- 3. Replace permissive RLS policies with device ownership checks
-- 4. Remove direct browser writes (use Edge Function only)
-- 
-- ═══════════════════════════════════════════════════════════════════════════
