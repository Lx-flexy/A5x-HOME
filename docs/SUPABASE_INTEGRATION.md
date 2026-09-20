# Supabase Integration — A5X HOME Analytics

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Database Schema](#database-schema)
4. [Environment Variables](#environment-variables)
5. [Data Flow](#data-flow)
6. [Security Model](#security-model)
7. [Migration Guide](#migration-guide)
8. [Local Development](#local-development)
9. [Deployment](#deployment)
10. [Troubleshooting](#troubleshooting)
11. [Future Enhancements](#future-enhancements)

---

## Overview

A5X HOME now uses a **hybrid architecture** for analytics storage:

- **Firebase Realtime Database (RTDB)**: Real-time IoT device state, live relay control, current day analytics
- **Firebase Firestore**: Legacy analytics storage (being phased out for historical reads)
- **Supabase PostgreSQL**: Long-term analytics, runtime sessions, scalable historical queries

This integration provides:
- ✅ Scalable historical analytics storage
- ✅ Session tracking (ON → OFF)
- ✅ Better query performance for 7-day/30-day analytics
- ✅ Future-ready architecture for advanced reporting
- ✅ Zero disruption to existing device control

---

## Architecture

### System Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         ESP32 Devices                            │
│                  (A5X-HA-XXXX Hardware)                          │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     │ WiFi + MQTT/WebSocket
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│              Firebase Realtime Database (RTDB)                   │
│  ────────────────────────────────────────────────────────────── │
│  • Live device state (outputs, health, status)                   │
│  • Relay control (light2, light3, fan1, custom1)                │
│  • Current sensing (real-time amperage)                          │
│  • Today's analytics (runtime in HOURS)                          │
│  • Heartbeat/online status                                       │
│  • onAt timestamps (devices currently ON)                        │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     │ React App subscribes to real-time updates
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                    React Frontend (Vite)                         │
│  ────────────────────────────────────────────────────────────── │
│  • DeviceService: Device control, outputs, health                │
│  • AnalyticsService: Runtime tracking, daily rollover            │
│  • Live UI updates via Firebase listeners                        │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     │ Dual persistence on analytics events
                     ▼
         ┌───────────┴───────────┐
         │                       │
         ▼                       ▼
┌──────────────────┐    ┌──────────────────────────┐
│ Firebase         │    │ Supabase PostgreSQL      │
│ Firestore        │    │                          │
│ (LEGACY)         │    │ • daily_analytics        │
│                  │    │ • runtime_sessions       │
│ • device_        │    │ • current_readings       │
│   analytics/     │    │                          │
│   {deviceId_     │    │ Runtime in SECONDS       │
│    YYYY-MM-DD}   │    │ Energy in Wh             │
│                  │    │ Indexed, RLS enabled     │
└──────────────────┘    └──────────────────────────┘
         │                       │
         │                       │
         └───────────┬───────────┘
                     │
                     │ Historical data reads (7d/30d)
                     ▼
         ┌──────────────────────┐
         │  Analytics UI        │
         │  ─────────────────── │
         │  • Today: RTDB       │
         │  • 7 Days: Supabase  │
         │  • 30 Days: Supabase │
         └──────────────────────┘
```

### Responsibilities

| Service | Purpose | Data Format | Use Case |
|---------|---------|-------------|----------|
| **Firebase RTDB** | Real-time device state | Runtime in HOURS (float) | Live device control, current day analytics |
| **Firebase Firestore** | Legacy analytics (being phased out) | Runtime in HOURS | Historical backup during migration |
| **Supabase PostgreSQL** | Long-term analytics | Runtime in SECONDS (int) | 7-day/30-day analytics, reporting, sessions |

---

## Database Schema

### Table 1: `daily_analytics`

Stores aggregated daily runtime and energy per device.

```sql
CREATE TABLE daily_analytics (
    id BIGSERIAL PRIMARY KEY,
    device_id TEXT NOT NULL,
    date DATE NOT NULL,
    
    -- Runtime in SECONDS (max 86400 = 24 hours)
    light2_runtime INTEGER NOT NULL DEFAULT 0 CHECK (light2_runtime >= 0 AND light2_runtime <= 86400),
    light3_runtime INTEGER NOT NULL DEFAULT 0 CHECK (light3_runtime >= 0 AND light3_runtime <= 86400),
    fan1_runtime INTEGER NOT NULL DEFAULT 0 CHECK (fan1_runtime >= 0 AND fan1_runtime <= 86400),
    custom1_runtime INTEGER NOT NULL DEFAULT 0 CHECK (custom1_runtime >= 0 AND custom1_runtime <= 86400),
    
    -- Energy in Wh (watt-hours)
    energy_usage NUMERIC(10, 3) NOT NULL DEFAULT 0 CHECK (energy_usage >= 0),
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(device_id, date)
);
```

**Indexes:**
- `idx_daily_analytics_device_date` on `(device_id, date DESC)`
- `idx_daily_analytics_date` on `(date DESC)`

### Table 2: `runtime_sessions`

Records individual ON → OFF sessions for each output.

```sql
CREATE TABLE runtime_sessions (
    id BIGSERIAL PRIMARY KEY,
    device_id TEXT NOT NULL,
    output_key TEXT NOT NULL CHECK (output_key IN ('light2', 'light3', 'fan1', 'custom1')),
    
    started_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ,
    
    runtime_seconds INTEGER CHECK (runtime_seconds >= 0 AND runtime_seconds <= 86400),
    energy_wh NUMERIC(10, 3) CHECK (energy_wh >= 0),
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CHECK (ended_at IS NULL OR ended_at >= started_at)
);
```

**Indexes:**
- `idx_runtime_sessions_device` on `(device_id, started_at DESC)`
- `idx_runtime_sessions_output` on `(output_key, started_at DESC)`

### Table 3: `current_readings` (Optional)

Stores sampled current sensor readings for historical analysis.

⚠️ **WARNING**: Do NOT write every sensor reading! Aggregate to 30-60 second intervals.

```sql
CREATE TABLE current_readings (
    id BIGSERIAL PRIMARY KEY,
    device_id TEXT NOT NULL,
    output_key TEXT NOT NULL CHECK (output_key IN ('light2', 'light3', 'fan1', 'custom1')),
    
    current_amp NUMERIC(6, 3) NOT NULL CHECK (current_amp >= 0 AND current_amp <= 30),
    voltage INTEGER NOT NULL DEFAULT 230 CHECK (voltage > 0 AND voltage <= 500),
    power_watt NUMERIC(8, 2) NOT NULL CHECK (power_watt >= 0),
    
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## Environment Variables

### Frontend Environment Variables

Add to `.env` file (and Vercel environment variables):

```env
# Supabase Configuration
VITE_SUPABASE_URL="https://mzmskujwpqmokbrdbwbh.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="your_publishable_key_here"
```

⚠️ **IMPORTANT**: Use the **publishable (anon) key**, NOT the service role key!

### Vercel Deployment

1. Go to **Vercel → Project → Settings → Environment Variables**
2. Add both variables
3. Enable for **Production**, **Preview**, AND **Development**
4. Redeploy application

---

## Data Flow

### 1. Device Turns ON

```
User taps relay button
  → deviceService.setOutput()
  → Firebase RTDB: devices/{deviceId}/outputs/{key} = true
  → analyticsService.trackOutputChange()
  → Firebase RTDB: devices/{deviceId}/onAt/{key} = unix_ms
  → (Future) supabaseAnalytics.createRuntimeSession()
```

### 2. Device Turns OFF

```
User taps relay button
  → deviceService.setOutput()
  → Firebase RTDB: devices/{deviceId}/outputs/{key} = false
  → analyticsService.trackOutputChange()
  → Calculate runtime: (now - onAt) / 3600 hours
  → Firebase RTDB: devices/{deviceId}/analytics/{key}Runtime += elapsed_hours
  → Firebase RTDB: devices/{deviceId}/onAt/{key} = null
  → (Future) supabaseAnalytics.closeRuntimeSession()
```

### 3. Midnight Rollover (IST 00:00)

```
analyticsService.ensureTodayWindow()
  → Read RTDB analytics (runtime in HOURS)
  → Persist to Firestore (legacy)
  → Persist to Supabase (convert HOURS → SECONDS)
  → Reset RTDB analytics to zero
  → Update analyticsDate to new day
  → Preserve onAt for devices still ON (set to midnight timestamp)
```

### 4. Analytics UI Loads

```
Today Tab:
  → Read from Firebase RTDB (live)
  → Calculate live runtime: stored + (now - onAt) for ON devices
  
7-Day / 30-Day Tab:
  → Read from Supabase PostgreSQL
  → Fallback to Firestore if Supabase unavailable
  → Convert SECONDS → HOURS for display
```

---

## Security Model

### Current Implementation (Development)

- **Frontend** uses Supabase **publishable key** (anon key)
- **RLS policies** allow all reads and writes (permissive for development)
- **Direct browser writes** to Supabase (temporary)

⚠️ **NOT SECURE FOR PRODUCTION**

### Future Production Architecture

```
React Frontend (Firebase Auth token)
  ↓
Supabase Edge Function (validates Firebase token)
  ↓
Supabase PostgreSQL (RLS enforces device ownership)
```

**Edge Function Pseudocode:**

```typescript
// supabase/functions/save-analytics/index.ts
import { createClient } from '@supabase/supabase-js'
import { verifyFirebaseToken } from './firebase-admin'

Deno.serve(async (req) => {
  // 1. Extract Firebase Auth token
  const authHeader = req.headers.get('Authorization')
  const token = authHeader?.replace('Bearer ', '')
  
  // 2. Verify Firebase token
  const firebaseUser = await verifyFirebaseToken(token)
  if (!firebaseUser) return new Response('Unauthorized', { status: 401 })
  
  // 3. Validate device ownership
  const { deviceId, analytics } = await req.json()
  const isOwner = await checkDeviceOwnership(firebaseUser.uid, deviceId)
  if (!isOwner) return new Response('Forbidden', { status: 403 })
  
  // 4. Write to Supabase using service role key
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const { error } = await supabase
    .from('daily_analytics')
    .upsert(analytics)
  
  if (error) return new Response(error.message, { status: 500 })
  return new Response('OK')
})
```

**Updated RLS Policies:**

```sql
-- Replace permissive policies with secure ones:

-- Only Edge Function (service role) can write
CREATE POLICY "Allow service role to write"
    ON daily_analytics FOR INSERT
    WITH CHECK (auth.role() = 'service_role');

-- Users can read their own devices' analytics
CREATE POLICY "Users can read own device analytics"
    ON daily_analytics FOR SELECT
    USING (
        device_id IN (
            SELECT device_id FROM devices_meta
            WHERE owner_id = auth.jwt() ->> 'sub'
        )
    );
```

---

## Migration Guide

### Step 1: Run SQL Migration

**Option A: Supabase Dashboard**

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Select your project: `mzmskujwpqmokbrdbwbh`
3. Navigate to **SQL Editor**
4. Copy contents of `supabase/migrations/001_initial_analytics.sql`
5. Paste and click **Run**

**Option B: Supabase CLI**

```bash
# Install Supabase CLI
npm install -g supabase

# Login
supabase login

# Link project
supabase link --project-ref mzmskujwpqmokbrdbwbh

# Run migration
supabase db push
```

### Step 2: Verify Tables Created

```sql
-- Run in Supabase SQL Editor
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('daily_analytics', 'runtime_sessions', 'current_readings');
```

Expected output:
```
daily_analytics
runtime_sessions
current_readings
```

### Step 3: Test Connection

```bash
# Run local dev server
npm run dev

# Open browser console
# Check for Supabase connection log (no errors)
```

### Step 4: Verify Data Persistence

1. Turn a device ON and OFF
2. Wait for midnight rollover (or manually trigger)
3. Check Supabase:

```sql
SELECT * FROM daily_analytics ORDER BY date DESC LIMIT 10;
```

---

## Local Development

### Prerequisites

- Node.js 18+
- npm or yarn
- Supabase account
- Firebase project

### Setup

1. **Clone repository**

```bash
git clone <repo>
cd a5x_home
```

2. **Install dependencies**

```bash
npm install
```

3. **Configure environment variables**

Create `.env` file:

```env
# Firebase
VITE_FIREBASE_API_KEY="..."
VITE_FIREBASE_AUTH_DOMAIN="..."
VITE_FIREBASE_DATABASE_URL="..."
VITE_FIREBASE_PROJECT_ID="..."
VITE_FIREBASE_STORAGE_BUCKET="..."
VITE_FIREBASE_MESSAGING_SENDER_ID="..."
VITE_FIREBASE_APP_ID="..."

# Supabase
VITE_SUPABASE_URL="https://mzmskujwpqmokbrdbwbh.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="your_key_here"
```

4. **Run migration** (see Migration Guide above)

5. **Start dev server**

```bash
npm run dev
```

6. **Open browser**

```
http://localhost:5173
```

---

## Deployment

### Vercel Deployment

1. **Environment Variables**

Add to Vercel dashboard:

```
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

Enable for all environments: Production, Preview, Development

2. **Deploy**

```bash
# Push to GitHub
git push origin main

# Vercel auto-deploys
# Or manual: vercel --prod
```

3. **Verify**

- Open production URL
- Check browser console for Supabase connection
- Navigate to Analytics → 7 Days tab
- Verify data loads from Supabase

---

## Troubleshooting

### Issue: "VITE_SUPABASE_URL is undefined"

**Solution:**

1. Check `.env` file exists in project root
2. Verify variable names (must start with `VITE_`)
3. Restart dev server: `npm run dev`
4. In Vercel: Add variables and redeploy

### Issue: "Table does not exist"

**Solution:**

1. Run SQL migration (see Migration Guide)
2. Verify in Supabase Dashboard → Database → Tables
3. Check connection in browser console

### Issue: "No data in 7-day/30-day tabs"

**Possible causes:**

1. **Supabase empty** (new deployment)
   - Wait for midnight rollover
   - Or manually flush: Call `flushDayToFirestore()` in console

2. **Migration not run**
   - Run `001_initial_analytics.sql`

3. **Supabase unreachable**
   - Check browser console for errors
   - Verify environment variables
   - Should auto-fallback to Firestore

### Issue: Device control stops working

**This should NEVER happen** — but if it does:

1. Check browser console for errors
2. Verify Firebase RTDB still working
3. Disable Supabase temporarily:

```typescript
// In analyticsService.ts, comment out Supabase calls:
// saveToSupabase(...).catch(...)
```

4. Report issue — Supabase is designed to fail gracefully

### Issue: "Invalid current reading" warnings

**Expected behavior**: Current sensor validation rejects invalid readings (< 0.01A or > 15A)

**Solution:**
- Check ESP32 current sensor calibration
- Verify ACS712 sensor connections
- Review sensor RMS calculation in firmware

---

## Future Enhancements

### Phase 1: Security Hardening (Q1 2027)

- [ ] Create Supabase Edge Function for analytics writes
- [ ] Validate Firebase Auth tokens in Edge Function
- [ ] Update RLS policies for device ownership
- [ ] Remove direct browser writes

### Phase 2: Runtime Session Tracking (Q2 2027)

- [ ] Enable `createRuntimeSession()` on device ON
- [ ] Enable `closeRuntimeSession()` on device OFF
- [ ] Build session history UI
- [ ] Detect interrupted sessions (device crashes)

### Phase 3: Advanced Analytics (Q3 2027)

- [ ] Energy cost calculation (per kWh pricing)
- [ ] Peak usage detection
- [ ] Predictive analytics (usage patterns)
- [ ] Export to CSV/PDF reports

### Phase 4: Current Sensor History (Q4 2027)

- [ ] Aggregate current readings (60-second intervals)
- [ ] Store in `current_readings` table
- [ ] Build power consumption graphs
- [ ] Anomaly detection (current spikes)

### Phase 5: Firestore Deprecation (2028)

- [ ] Migrate all historical Firestore data to Supabase
- [ ] Update all code to use Supabase only
- [ ] Remove Firestore analytics dependencies
- [ ] Archive Firestore data

---

## API Reference

### SupabaseAnalytics Service

#### `saveDailyAnalytics(deviceId, date, analytics)`

Persists daily analytics to Supabase.

**Parameters:**
- `deviceId` (string): Device ID
- `date` (string): Date in YYYY-MM-DD format
- `analytics` (object): Runtime in HOURS (auto-converted to SECONDS)

**Returns:** `Promise<void>`

**Example:**

```typescript
import { saveDailyAnalytics } from './services/supabaseAnalytics';

await saveDailyAnalytics('A5X-HA-2647', '2026-09-20', {
  light2Runtime: 5.5, // hours
  light3Runtime: 3.2,
  fan1Runtime: 8.0,
  customRuntime: 0,
  energyUsage: 1.25 // kWh
});
```

#### `getDailyAnalytics(deviceId, days)`

Fetches daily analytics from Supabase.

**Parameters:**
- `deviceId` (string): Device ID
- `days` (number): Number of days to fetch (default: 30)

**Returns:** `Promise<SupabaseDailyAnalytics[]>` (runtime in SECONDS)

#### `createRuntimeSession(deviceId, outputKey)`

Creates a new runtime session when device turns ON.

**Parameters:**
- `deviceId` (string): Device ID
- `outputKey` (string): 'light2' | 'light3' | 'fan1' | 'custom1'

**Returns:** `Promise<number | null>` (session ID)

#### `closeRuntimeSession(sessionId, runtimeSeconds, energyWh)`

Closes a runtime session when device turns OFF.

**Parameters:**
- `sessionId` (number): Session ID from `createRuntimeSession`
- `runtimeSeconds` (number): Duration in seconds
- `energyWh` (number): Energy consumed in Wh

**Returns:** `Promise<void>`

---

## Support

For issues or questions:

1. Check this documentation
2. Review browser console for errors
3. Check Supabase Dashboard → Logs
4. Check Firebase Console → Realtime Database
5. Open GitHub issue

---

## License

A5X HOME — Smart Home IoT Platform
© 2026 A5X Technologies
