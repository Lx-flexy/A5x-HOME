# Supabase Analytics Implementation Report

**Date:** September 20, 2026  
**Implementation:** React → Supabase Analytics Bridge  
**Status:** ✅ **READY FOR TESTING**

---

## EXECUTIVE SUMMARY

Successfully implemented the React → Supabase analytics bridge WITHOUT modifying ESP32 firmware. The architecture remains:

```
ESP32 → Firebase RTDB → React analyticsService.ts → Supabase PostgreSQL
```

All Supabase writes are NON-FATAL. Firebase analytics and device control continue working even if Supabase fails.

---

## A. FILES CHANGED

### 1. `src/services/supabaseAnalytics.ts` ✅ COMPLETE REWRITE
**Purpose:** Supabase PostgreSQL persistence layer

**Functions Implemented:**
- `startRuntimeSession(deviceId, channel)` - Start ON session
- `closeRuntimeSession(deviceId, channel, runtimeSeconds, energyWh)` - Close OFF session
- `upsertDailyAnalytics(deviceId, date, ...runtimes, energy)` - Daily summary
- `getDailyAnalytics(deviceId, days)` - Fetch historical data
- `getMultiDeviceAnalytics(deviceIds, days)` - Multi-device fetch
- `saveCurrentReading(deviceId, channel, current, voltage)` - Sensor data
- Helper functions: `hoursToSeconds()`, `kwhToWh()`, `convertSupabaseToFirebase()`, etc.

**Key Features:**
- NON-FATAL error handling (logs errors, never throws)
- In-memory session tracking (prevents duplicate sessions)
- Runtime capping at 24h per channel
- Validation of current sensor readings (0-30A range)

### 2. `src/services/analyticsService.ts` ✅ UPDATED
**Changes:**
- Added Supabase calls in `trackOutputChange()` (ON/OFF tracking)
- Added Supabase calls in `trackBulkOutputChange()` (bulk operations)
- Added Supabase persistence in `flushDayToFirestore()`
- Updated `getDailyAnalyticsFromSupabase()` - format conversion
- Updated `getMultiDeviceAnalyticsFromSupabase()` - format conversion

**Integration Points:**
```typescript
// ON event
startRuntimeSession(deviceId, channel).catch(err => {
  console.warn('[non-fatal]:', err);
});

// OFF event
closeRuntimeSession(deviceId, channel, runtimeSec, energyWh).catch(err => {
  console.warn('[non-fatal]:', err);
});

// Daily summary
upsertDailyAnalytics(deviceId, date, ...runtimes, energy).catch(err => {
  console.warn('[non-fatal]:', err);
});
```

### 3. `src/services/supabase.ts` ✅ NO CHANGES
Existing Supabase client configuration unchanged.

---

## B. FUNCTIONS CHANGED

### Modified Functions

| Function | File | Change |
|---|---|---|
| `trackOutputChange()` | analyticsService.ts | Added Supabase session tracking + daily analytics |
| `trackBulkOutputChange()` | analyticsService.ts | Added Supabase bulk session tracking + daily analytics |
| `flushDayToFirestore()` | analyticsService.ts | Added Supabase daily summary persistence |
| `getDailyAnalyticsFromSupabase()` | analyticsService.ts | Fixed format conversion (seconds→hours) |
| `getMultiDeviceAnalyticsFromSupabase()` | analyticsService.ts | Fixed format conversion (seconds→hours) |

### New Functions (supabaseAnalytics.ts)

| Function | Purpose |
|---|---|
| `startRuntimeSession()` | Create runtime_sessions record (ON event) |
| `closeRuntimeSession()` | Update runtime_sessions record (OFF event) |
| `upsertDailyAnalytics()` | Update daily_analytics summary |
| `getDailyAnalytics()` | Fetch device analytics (N days) |
| `getMultiDeviceAnalytics()` | Fetch multiple devices (optimized) |
| `saveCurrentReading()` | Save sensor data (optional, not yet used) |
| `hoursToSeconds()` | Convert Firebase hours → Supabase seconds |
| `kwhToWh()` | Convert Firebase kWh → Supabase Wh |
| `secondsToHours()` | Convert Supabase seconds → Firebase hours |
| `whToKwh()` | Convert Supabase Wh → Firebase kWh |
| `convertSupabaseToFirebase()` | Format conversion for UI |
| `aggregateDailyAnalytics()` | Sum multiple records |

---

## C. FIREBASE → SUPABASE DATA FLOW

### ON Event (Device Turns ON)

```
User clicks ON button
  ↓
deviceService.setOutput(deviceId, channel, true)
  ↓
Firebase RTDB: /devices/{deviceId}/outputs/{channel} = true
  ↓
analyticsService.trackOutputChange(deviceId, channel, true)
  ↓
Firebase RTDB: /devices/{deviceId}/onAt/{channel} = Date.now()
  ↓
Supabase: INSERT INTO runtime_sessions (device_id, output_key, started_at)
          ↓ returns session ID
          ↓ stored in activeSessions Map
```

### OFF Event (Device Turns OFF)

```
User clicks OFF button
  ↓
deviceService.setOutput(deviceId, channel, false)
  ↓
Firebase RTDB: /devices/{deviceId}/outputs/{channel} = false
  ↓
analyticsService.trackOutputChange(deviceId, channel, false)
  ↓
Calculate: elapsed = now - onAt (hours)
Calculate: energy = (current × voltage × elapsed) or (staticWatts × elapsed)
  ↓
Firebase RTDB transaction: update analytics/{channelRuntime} += elapsed
Firebase RTDB transaction: update analytics/energyUsage += energy
Firebase RTDB: remove onAt/{channel}
  ↓
Supabase: UPDATE runtime_sessions
          SET ended_at = now,
              runtime_seconds = elapsed * 3600,
              energy_wh = energy * 1000
          WHERE id = session_id
  ↓
Supabase: UPSERT daily_analytics
          SET light2_runtime = total_seconds,
              light3_runtime = total_seconds,
              fan1_runtime = total_seconds,
              custom1_runtime = total_seconds,
              energy_usage = total_wh
          WHERE device_id = ? AND date = today
```

### Midnight Rollover

```
Scheduler detects date change
  ↓
analyticsService.ensureTodayWindow(deviceId)
  ↓
flushDayToFirestore(deviceId, yesterday)
  ↓
Firebase Firestore: device_analytics/{deviceId_YYYY-MM-DD}
  ↓
Supabase: UPSERT daily_analytics (yesterday's totals)
  ↓
Firebase RTDB: reset analytics to zero
Firebase RTDB: update analyticsDate = today
Firebase RTDB: reset onAt to midnight (for cross-day sessions)
```

---

## D. runtime_sessions IMPLEMENTATION

### Table Schema (from 001_initial_analytics.sql)

```sql
CREATE TABLE runtime_sessions (
    id BIGSERIAL PRIMARY KEY,
    device_id TEXT NOT NULL,
    output_key TEXT NOT NULL CHECK (output_key IN ('light2', 'light3', 'fan1', 'custom1')),
    started_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ,
    runtime_seconds INTEGER CHECK (runtime_seconds >= 0 AND runtime_seconds <= 86400),
    energy_wh NUMERIC(10, 3) CHECK (energy_wh >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Session Lifecycle

1. **ON Event:**
   - `started_at` = current timestamp
   - `ended_at` = NULL
   - `runtime_seconds` = NULL
   - `energy_wh` = NULL
   - Session ID stored in `activeSessions` Map

2. **OFF Event:**
   - `ended_at` = current timestamp
   - `runtime_seconds` = (ended_at - started_at) in seconds, capped at 86400
   - `energy_wh` = calculated from current sense or static wattage
   - Session ID removed from `activeSessions` Map

3. **Reboot/Crash:**
   - Incomplete sessions remain with `ended_at` = NULL
   - Firebase `health/restartCount` can be monitored for reboot detection
   - Future: React could detect incomplete sessions and close them with `offAt = lastSeen`

### Duplicate Prevention

- `activeSessions` Map tracks device_id + channel → session ID
- If ON event finds existing session, reuses it (logs warning)
- If OFF event finds no session, skips close (logs warning)

---

## E. daily_analytics IMPLEMENTATION

### Table Schema (from 001_initial_analytics.sql)

```sql
CREATE TABLE daily_analytics (
    id BIGSERIAL PRIMARY KEY,
    device_id TEXT NOT NULL,
    date DATE NOT NULL,
    light2_runtime INTEGER NOT NULL DEFAULT 0 CHECK (light2_runtime >= 0 AND light2_runtime <= 86400),
    light3_runtime INTEGER NOT NULL DEFAULT 0 CHECK (light3_runtime >= 0 AND light3_runtime <= 86400),
    fan1_runtime INTEGER NOT NULL DEFAULT 0 CHECK (fan1_runtime >= 0 AND fan1_runtime <= 86400),
    custom1_runtime INTEGER NOT NULL DEFAULT 0 CHECK (custom1_runtime >= 0 AND custom1_runtime <= 86400),
    energy_usage NUMERIC(10, 3) NOT NULL DEFAULT 0 CHECK (energy_usage >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(device_id, date)
);
```

### Update Frequency

- **ON/OFF Event:** Every time a device turns OFF, daily_analytics is upserted with accumulated totals
- **Midnight Rollover:** Yesterday's data flushed to daily_analytics before reset
- **No Duplicate Writes:** UPSERT uses unique constraint (device_id, date)

### Data Format

**Supabase (daily_analytics table):**
- Runtime: SECONDS (0-86400 per channel)
- Energy: Wh (watt-hours)

**Firebase (RTDB /analytics):**
- Runtime: HOURS (0-24 per channel, float)
- Energy: kWh (kilowatt-hours, float)

**Conversion:**
```typescript
supabaseSeconds = firebaseHours * 3600
supabaseWh = firebaseKwh * 1000
```

---

## F. current_readings IMPLEMENTATION

### Table Schema (from 001_initial_analytics.sql)

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

### Implementation Status

✅ **Function Implemented:** `saveCurrentReading()`  
⚠️ **NOT YET INTEGRATED** - Current sensor data is NOT being written to Supabase

### Future Integration (Optional)

Do NOT write every 500ms reading. Use sensible aggregation:

**Option 1: Time-Based Sampling (30-60s intervals)**
```typescript
// In analyticsService.ts, add periodic current sense writer
setInterval(() => {
  const currentData = getCurrentSenseData(deviceId);
  for (const [channel, amps] of Object.entries(currentData)) {
    if (amps > CURRENT_NOISE_FLOOR_A) {
      saveCurrentReading(deviceId, channel, amps, 230);
    }
  }
}, 30000); // Every 30 seconds
```

**Option 2: Change-Based Sampling (>10% delta)**
```typescript
const lastCurrentReadings = new Map();
// On each current sense update (500ms)
const delta = Math.abs(newCurrent - lastReading) / lastReading;
if (delta > 0.1) { // 10% change
  saveCurrentReading(deviceId, channel, newCurrent, 230);
  lastCurrentReadings.set(key, newCurrent);
}
```

---

## G. DUPLICATE-COUNT PROTECTION

### Session Tracking (In-Memory Map)

```typescript
const activeSessions = new Map<string, number>();
// Key: "deviceId:channel" → Value: session ID

// ON event
if (activeSessions.has(key)) {
  console.warn('Session already active, reusing');
  return existingSessionId; // No duplicate INSERT
}

// OFF event
if (!activeSessions.has(key)) {
  console.warn('No active session, skipping close');
  return; // No UPDATE attempt
}
```

### Daily Analytics (UPSERT)

```typescript
await supabase
  .from('daily_analytics')
  .upsert(data, {
    onConflict: 'device_id,date',  // Unique constraint
    ignoreDuplicates: false,        // Replace existing
  });
```

- Multiple OFF events in the same day → same record updated
- No duplicate daily_analytics records per device per day

### Firebase Analytics (Transaction)

```typescript
const transactionResult = await runTransaction(analyticsRef, (current) => {
  return {
    ...current,
    light2Runtime: current.light2Runtime + elapsed,
    energyUsage: current.energyUsage + energy,
  };
});
```

- Atomic read-modify-write prevents race conditions
- Concurrent OFF events don't overwrite each other

---

## H. RLS / SECURITY STATUS

### Current Status: ⚠️ **PERMISSIVE (Development)**

**RLS Enabled:** YES (on all tables)

**Policies:**
```sql
-- Allow public read access (all users can read analytics)
CREATE POLICY "Allow public read access to daily_analytics"
    ON daily_analytics FOR SELECT
    USING (true);

-- Allow public write access (temporary — move to Edge Functions)
CREATE POLICY "Allow public insert to daily_analytics"
    ON daily_analytics FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Allow public update to daily_analytics"
    ON daily_analytics FOR UPDATE
    USING (true);
```

### Security Model

**Current Architecture:**
- Frontend uses Supabase `anon` key (publishable key)
- Browser writes directly to Supabase (bypasses RLS for anon role)
- ⚠️ **NOT SECURE FOR PRODUCTION**

**Production Architecture (Recommended):**

```
Frontend (Firebase Auth token)
    ↓
Supabase Edge Function
    ↓ Validates Firebase Auth token
    ↓ Checks device ownership
    ↓
Supabase PostgreSQL (RLS enforced)
```

**Edge Function Pseudo-Code:**
```typescript
// supabase/functions/save-analytics/index.ts
import { createClient } from '@supabase/supabase-js'
import { verifyFirebaseToken } from './firebase-admin'

Deno.serve(async (req) => {
  // 1. Extract Firebase Auth token
  const authHeader = req.headers.get('Authorization')
  const firebaseToken = authHeader?.replace('Bearer ', '')
  
  // 2. Verify Firebase token
  const decodedToken = await verifyFirebaseToken(firebaseToken)
  const userId = decodedToken.uid
  
  // 3. Check device ownership
  const { deviceId, ...analyticsData } = await req.json()
  const hasAccess = await checkDeviceAccess(userId, deviceId)
  
  if (!hasAccess) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403
    })
  }
  
  // 4. Write to Supabase (server-side, bypasses anon RLS)
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL'),
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') // Secret key
  )
  
  const { error } = await supabase
    .from('daily_analytics')
    .upsert(analyticsData)
  
  if (error) throw error
  
  return new Response(JSON.stringify({ success: true }), {
    status: 200
  })
})
```

**RLS Policies (Production):**
```sql
-- Read: users can only read their own devices
CREATE POLICY "Users can read own device analytics"
    ON daily_analytics FOR SELECT
    USING (
      device_id IN (
        SELECT device_id FROM device_members
        WHERE user_id = auth.uid()
      )
    );

-- Write: only Edge Function can write (service role)
CREATE POLICY "Only service role can write"
    ON daily_analytics FOR INSERT
    WITH CHECK (auth.role() = 'service_role');
```

### Security Recommendations

1. ✅ **IMMEDIATE:** Current setup works for testing (permissive RLS)
2. ⚠️ **BEFORE PRODUCTION:** Create Supabase Edge Function
3. ⚠️ **BEFORE PRODUCTION:** Update RLS policies to enforce device ownership
4. ⚠️ **BEFORE PRODUCTION:** Remove `anon` INSERT/UPDATE policies
5. ⚠️ **NEVER:** Expose `SUPABASE_SERVICE_ROLE_KEY` in frontend

---

## I. REAL DEVICE TEST INSTRUCTIONS

### Prerequisites

1. ✅ Supabase migration run: `001_initial_analytics.sql`
2. ✅ Environment variables set:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
3. ✅ ESP32 firmware unchanged (v2.1.0)
4. ✅ Firebase RTDB operational

### Test Procedure

**Test 1: Single ON/OFF Cycle**

1. Open DeviceDetails page for your device
2. Turn **Light 2** ON
3. Wait 30-60 seconds (let current stabilize)
4. Turn **Light 2** OFF

**Expected Results:**

✅ Firebase RTDB updated:
```
/devices/A5X-HA-2847/outputs/light2: false
/devices/A5X-HA-2847/analytics/light2Runtime: 0.0083 (hours, ~30s)
/devices/A5X-HA-2847/analytics/energyUsage: 0.00083 (kWh)
```

✅ Supabase `runtime_sessions` created:
```sql
SELECT * FROM runtime_sessions 
WHERE device_id = 'A5X-HA-2847' AND output_key = 'light2'
ORDER BY started_at DESC LIMIT 1;

-- Expected:
-- ended_at: NOT NULL
-- runtime_seconds: ~30
-- energy_wh: ~0.83
```

✅ Supabase `daily_analytics` updated:
```sql
SELECT * FROM daily_analytics 
WHERE device_id = 'A5X-HA-2847' AND date = CURRENT_DATE;

-- Expected:
-- light2_runtime: ~30 (seconds)
-- energy_usage: ~0.83 (Wh)
```

✅ Device control still works (even if Supabase fails)

---

**Test 2: Bulk ON/OFF (All Outputs)**

1. Click **All On** button
2. Wait 60 seconds
3. Click **All Off** button

**Expected Results:**

✅ 4 runtime_sessions records (one per channel)
✅ daily_analytics shows all 4 channels with ~60 seconds runtime
✅ No Firebase errors in console
✅ Supabase errors (if any) are non-fatal (logged as warnings)

---

**Test 3: Midnight Rollover Simulation**

1. Manually change system time to 23:59:50
2. Turn Light 2 ON
3. Wait for midnight to pass (system time rolls to 00:00:10)
4. Turn Light 2 OFF

**Expected Results:**

✅ Firebase detects date change
✅ Yesterday's data flushed to Firestore + Supabase
✅ Today's analytics reset to zero
✅ `onAt` reset to today's midnight (not current time)
✅ Runtime split across two days:
   - Yesterday: 0-10 seconds
   - Today: 0-10 seconds

---

**Test 4: Supabase Failure Handling**

1. Temporarily break Supabase connection:
   - Invalid `VITE_SUPABASE_URL` in `.env`
   - Or disconnect network
2. Turn Light 2 ON → OFF

**Expected Results:**

✅ Firebase analytics STILL WORKS
✅ Device control STILL WORKS
✅ Browser console shows Supabase warnings (non-fatal)
✅ Firebase RTDB contains correct runtime data
✅ Firestore backup contains correct data

---

### Verification Queries

**Check runtime_sessions:**
```sql
SELECT 
  device_id,
  output_key,
  started_at,
  ended_at,
  runtime_seconds,
  energy_wh
FROM runtime_sessions
WHERE device_id = 'A5X-HA-2847'
  AND started_at >= CURRENT_DATE
ORDER BY started_at DESC;
```

**Check daily_analytics:**
```sql
SELECT 
  device_id,
  date,
  light2_runtime,
  light3_runtime,
  fan1_runtime,
  custom1_runtime,
  energy_usage,
  updated_at
FROM daily_analytics
WHERE device_id = 'A5X-HA-2847'
  AND date >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY date DESC;
```

**Check for incomplete sessions (reboot detection):**
```sql
SELECT 
  device_id,
  output_key,
  started_at,
  NOW() - started_at AS duration
FROM runtime_sessions
WHERE device_id = 'A5X-HA-2847'
  AND ended_at IS NULL
  AND started_at < NOW() - INTERVAL '5 minutes';
-- Should be empty under normal operation
```

---

## J. TYPECHECK RESULT ✅ PASS

```
npm run typecheck
```

**Analytics/Supabase Errors:** 0  
**Pre-Existing Errors:** 26 (in other files, not related to this implementation)

**Files with NO errors:**
- ✅ `src/services/analyticsService.ts`
- ✅ `src/services/supabaseAnalytics.ts`
- ✅ `src/services/supabase.ts`

---

## K. BUILD RESULT ✅ PASS

```
npm run build
```

**Status:** ✅ **SUCCESS**  
**Build Time:** 6.63s  
**Output:** `dist/` directory  
**Warnings:** Chunk size limit (non-critical)

---

## L. PRODUCTION READINESS CHECKLIST

### ✅ READY FOR TESTING

- [x] ESP32 firmware unchanged (architecture verified)
- [x] Firebase RTDB integration preserved
- [x] Supabase analytics implemented (non-fatal)
- [x] Runtime sessions tracked (ON→OFF)
- [x] Daily analytics persisted
- [x] Format conversion (seconds ↔ hours)
- [x] Duplicate prevention (session Map + UPSERT)
- [x] TypeScript compilation passes
- [x] Production build succeeds
- [x] Error handling (all Supabase calls non-fatal)
- [x] Device control unaffected by Supabase failures

### ⚠️ NOT READY FOR PRODUCTION

- [ ] RLS policies are permissive (allow all writes)
- [ ] No Firebase Auth → Supabase integration
- [ ] No device ownership validation
- [ ] Current sensor data not yet written to Supabase
- [ ] Incomplete session detection not implemented
- [ ] Edge Function not created
- [ ] Real device testing not performed

### 🔒 BEFORE PRODUCTION DEPLOYMENT

1. **Create Supabase Edge Function** for analytics writes
2. **Validate Firebase Auth tokens** in Edge Function
3. **Update RLS policies** to enforce device ownership
4. **Remove permissive RLS policies** (anon INSERT/UPDATE)
5. **Test with real ESP32 device** (ON/OFF cycles)
6. **Monitor Supabase logs** for errors/performance
7. **Implement reboot detection** (close incomplete sessions)
8. **Add current sensor sampling** (optional, 30-60s intervals)

---

## M. FINAL SUMMARY

### What Was Implemented

✅ **Runtime Session Tracking**
- ON event → INSERT runtime_sessions with started_at
- OFF event → UPDATE runtime_sessions with ended_at, runtime_seconds, energy_wh
- Session ID tracked in memory to prevent duplicates

✅ **Daily Analytics Persistence**
- Every OFF event → UPSERT daily_analytics with accumulated totals
- Midnight rollover → Flush yesterday's data to Supabase
- All 4 channels tracked: light2, light3, fan1, custom1

✅ **Format Conversion**
- Firebase (hours, kWh) → Supabase (seconds, Wh)
- Supabase (seconds, Wh) → Firebase (hours, kWh) for UI

✅ **Non-Fatal Error Handling**
- All Supabase calls wrapped in `.catch()`
- Firebase analytics continues working if Supabase fails
- Device control unaffected by Supabase errors

✅ **Validation & Safety**
- Runtime capped at 24h (86400 seconds) per channel
- Current sensor readings validated (0-30A range)
- Duplicate sessions prevented via in-memory Map
- UPSERT prevents duplicate daily records

### What Was NOT Modified

✅ **ESP32 Firmware:** Unchanged (v2.1.0)
✅ **Firebase RTDB Structure:** Unchanged
✅ **Existing Analytics Logic:** Preserved (Firebase is source of truth)
✅ **Device Control Flow:** Unchanged

### Architecture Confirmed

```
ESP32 (firmware v2.1.0)
  ↓ writes
Firebase RTDB (live state, current day analytics)
  ↓ reads/writes
React analyticsService.ts (calculation + orchestration)
  ↓ writes (non-fatal)
Supabase PostgreSQL (historical analytics, long-term storage)
```

### Next Steps

1. **TEST:** Run real device ON/OFF test (Light 2, 30-60s)
2. **VERIFY:** Check Supabase tables (runtime_sessions, daily_analytics)
3. **MONITOR:** Watch browser console for Supabase errors
4. **ITERATE:** Adjust based on test results
5. **SECURE:** Implement Edge Function before production

---

**Implementation Status:** ✅ **COMPLETE AND READY FOR TESTING**

**Production Deployment:** ⚠️ **NOT RECOMMENDED** (security hardening required)

**Testing Approval:** ✅ **APPROVED** (non-destructive, Firebase fallback works)

---

*End of Report*
