# Analytics Page Investigation Report — Step 0

**Date:** Investigation completed before implementation  
**Scope:** Analytics page data flow, Firebase architecture, and runtime-reset bug root cause

---

## 1. Current Analytics Page Firebase Reads

### Data Sources (Analytics.tsx)

The Analytics page currently uses **both RTDB and Firestore**:

#### RTDB Subscriptions (via `deviceService.ts`):
1. **`subscribeToAnalytics(deviceId)`** → `devices/{deviceId}/analytics`
   - Returns: `DeviceAnalyticsData` (light1Runtime, light2Runtime, light3Runtime, fan1Runtime, fan2Runtime, customRuntime, energyUsage)
   - All runtime values are in **hours** (float)
   - This is **today's accumulated off-time runtime** only

2. **`subscribeToOnAt(deviceId)`** → `devices/{deviceId}/onAt`
   - Returns: `Record<string, number>` (unix milliseconds when each channel turned ON)
   - Used to compute **live delta** for currently-ON devices
   - Cleared when device turns OFF

3. **`subscribeToLastSeen(deviceId)`** → `devices/{deviceId}/health/lastSeen`
   - Returns: unix milliseconds
   - Used for online/offline status only

#### Firestore Queries (via `analyticsService.ts`):
1. **`getDailyAnalytics(deviceId, days)`** → `device_analytics/{deviceId_YYYY-MM-DD}`
   - Returns array of `DailyAnalytics` documents
   - Used for **7-day and 30-day historical tabs**
   - Structure: `{ deviceId, date, light1Runtime...customRuntime, energyUsage, savedAt }`

### Current Display Logic:
- **"Today" tab:** Reads RTDB analytics (accumulated stored) + live delta from onAt
- **"7d" / "30d" tabs:** Reads Firestore history only
- Live runtime formula: `stored_hours + (now_ms - onAt_ms) / 3_600_000`

---

## 2. Data Flow Diagram

```
ESP32 Firmware (rtdb_service.cpp)
  ↓
  Writes to: devices/{deviceId}/outputs/{channel} = true/false
  ↓
Web App (deviceService.ts → setOutput)
  ↓
  Calls: analyticsService.trackOutputChange(deviceId, channel, boolean)
  ↓
analyticsService.trackOutputChange:
  - ON  → writes onAt timestamp to RTDB: devices/{deviceId}/onAt/{channel} = Date.now()
  - OFF → reads onAt, computes elapsed hours, adds to RTDB analytics, then flushes to Firestore
  ↓
RTDB: devices/{deviceId}/analytics/{channel}Runtime += elapsed_hours
  ↓
Firestore: device_analytics/{deviceId_YYYY-MM-DD} ← merged/upserted on every OFF event
  ↓
Analytics Page reads:
  - Today: RTDB analytics + live onAt delta
  - History: Firestore device_analytics
```

### Key Findings:
1. **No Cloud Function bridge** — all RTDB → Firestore writes happen **client-side** in `trackOutputChange`
2. **No firmware writes to `analytics/*Runtime`** — the firmware ONLY writes `outputs/{channel}`. The web app computes and stores runtime.
3. **Day rollover handled by `ensureTodayWindow`** — called before every analytics read/write
4. **Firestore flush happens on every OFF** — via `flushDayToFirestore` after computing elapsed time

---

## 3. Firmware RTDB Structure (from Task Prompt)

### Expected from Firmware:
```
outputs/light2, light3, fan1, custom1          (bool) ← firmware writes this
analytics/light2Runtime, light3Runtime, etc.   (uint32, cumulative seconds) ← NOT FOUND
analytics/energyUsage                           (float) ← NOT FOUND
currentSense/light2Current, light3Current, etc. (float, Amps) ← NOT FOUND
currentSense/light2Mismatch, etc.               (bool) ← NOT FOUND
```

### Actual Web App Implementation:
- **Firmware writes:** `outputs/{channel}` only (confirmed by deviceService comments)
- **Web app writes:** `analytics/*`, `onAt/*`, `analyticsDate`
- **No `currentSense` node exists** in current codebase (searched entire project — zero references)

### Channel Naming Mismatch:
- **Task prompt uses:** light2, light3, fan1, custom1 (4 channels)
- **Codebase uses:** light1, light2, light3, fan1, fan2, custom1 (6 channels)
- **CRITICAL:** The firmware spec from the task uses light2/light3 (no light1), but the web app has light1/light2/light3. Need clarification from user on actual hardware channel mapping.

---

## 4. Runtime Reset Bug — Root Cause Analysis

### The Bug:
User reports: "Turning a device OFF erases today's accumulated runtime"

### Investigation of `trackOutputChange`:

```typescript
export async function trackOutputChange(
  deviceId: string,
  key: TrackableKey,
  value: boolean
): Promise<void> {
  await ensureTodayWindow(deviceId);

  if (value) {
    // Turning ON — record start timestamp
    await update(rtdbOnAt(deviceId), { [key]: Date.now() });
  } else {
    // Turning OFF — compute elapsed and save
    const onAtSnap = await get(ref(rtdb, `devices/${deviceId}/onAt/${key}`));
    const onAtMs   = (onAtSnap.val() as number) || 0;

    if (onAtMs > 0) {
      const elapsed = (Date.now() - onAtMs) / 3_600_000; // hours
      if (elapsed > 0) {
        // Add to RTDB today counter ← THIS IS CORRECT (uses +=)
        const field = runtimeField(key);
        const curSnap = await get(rtdbAnalytics(deviceId));
        const cur = (curSnap.val() as Record<string, number>) || {};
        const prevRuntime = cur[field] || 0;
        const prevEnergy  = cur.energyUsage || 0;

        await update(rtdbAnalytics(deviceId), {
          [field]:      prevRuntime + elapsed,  // ← ACCUMULATES correctly
          energyUsage:  prevEnergy  + (WATT[key] / 1000) * elapsed,
        });

        // Also flush the updated day to Firestore immediately
        const today = todayStr();
        await flushDayToFirestore(deviceId, today);
      }
      // Clear onAt
      await update(rtdbOnAt(deviceId), { [key]: null });
    }
  }
}
```

### Verdict: **Web app code is CORRECT** — it accumulates, does not reset.

### Possible Causes of User-Reported Bug:

1. **Day rollover during user observation:**
   - `ensureTodayWindow` resets analytics at midnight
   - If user turned OFF device just after midnight, they'd see zero (correct behavior)

2. **Browser cache/stale data:**
   - Analytics page might show cached old value, then update to zero if RTDB was reset

3. **Multiple device writes racing:**
   - If firmware also writes to `analytics/*` (contradicting web app's expectation), it could overwrite instead of accumulate

4. **`ensureTodayWindow` corrupted-data detection:**
   - If any runtime value > 24h, it nukes everything to zero
   - Could trigger false-positive if clock skew or bad data

5. **Firmware writes to `analytics/*` directly:**
   - Task prompt says firmware writes `analytics/light2Runtime` as cumulative seconds
   - But web app expects to own that path and write hours
   - **CONFLICT:** If firmware writes seconds and web app reads as hours, math breaks
   - **CONFLICT:** If both write to same path, last-write-wins (no accumulation)

---

## 5. Energy Calculation Audit

### Current Formula (analyticsService.ts):

```typescript
const WATT: Record<string, number> = {
  light1: 40, light2: 40, light3: 40,
  fan1: 25, fan2: 25, custom1: 30,
};

// On device OFF:
energyUsage: prevEnergy + (WATT[key] / 1000) * elapsed

// where elapsed = (Date.now() - onAtMs) / 3_600_000  (hours)
```

### Formula Check:
- `Power (W) = 40W` (hardcoded, not using current × voltage)
- `Energy (kWh) = Power (kW) × Time (hours) = (40 / 1000) × elapsed`
- **Units:** Correct (kWh)
- **Problem:** Not using actual current from `currentSense` — uses placeholder wattage

### Correct Formula (per task requirements):
```
Power (W) = Voltage (230V) × Current (A)
Energy (Wh) = ∫ Power dt ≈ Σ (Power × Δt)
```

**Current implementation does NOT use real current** — it uses fixed wattage assumptions. To fix:
1. Read `currentSense/{channel}Current` in real-time
2. Sample periodically (e.g. every 10s)
3. Compute: `energy_delta_Wh = (230V × current_A × 10s) / 3600`
4. Accumulate into `energyUsage`

---

## 6. Missing Features (not yet implemented)

### currentSense Node:
- **Does not exist** in current codebase
- No RTDB listeners for `currentSense/*`
- No TypeScript interfaces for current/mismatch data
- **Action Required:** Add new data structures and listeners

### Cloud Functions:
- **No Cloud Functions folder** in project (checked root directory)
- No scheduled cleanup for old Firestore documents
- **Action Required:** Create Cloud Function for 7-day retention cleanup

### IST Timezone Handling:
- Current `todayStr()` uses **browser local time** (likely IST if user is in India)
- No explicit timezone offset logic
- Firmware NTP offset (19800 sec = UTC+5:30) not used in web app
- **Risk:** If user's browser is in different timezone, day boundaries won't match device
- **Action Required:** Use explicit IST offset for date calculations

---

## 7. Recommendations Before Implementation

### Critical Clarifications Needed from User:

1. **Channel Names:**
   - Firmware spec says: light2, light3, fan1, custom1 (4 channels)
   - Web app has: light1, light2, light3, fan1, fan2, custom1 (6 channels)
   - **Question:** What's the actual hardware? Does light1 exist?

2. **Firmware `analytics/*` Writes:**
   - Task says firmware writes `analytics/light2Runtime` as cumulative seconds
   - Web app expects to own `analytics/*` and write hours
   - **Question:** Does firmware actually write to `analytics/*`, or only `outputs/*`?

3. **Current Sensing Hardware:**
   - Task says `currentSense/*` exists in firmware
   - Not found in web app codebase
   - **Question:** Is current sensing deployed? If not, we need graceful degradation.

### Implementation Strategy:

1. **Add currentSense TypeScript interfaces and listeners** to deviceService
2. **Update Analytics page** to display live current + mismatch warnings
3. **Refactor energy calculation** to use actual current (with fallback to placeholder if currentSense missing)
4. **Fix timezone** to use explicit IST offset
5. **Create Cloud Function** for 7-day retention cleanup
6. **Update UI** with per-channel mismatch warnings (silent when healthy)

---

## 8. Data Model to Implement

### Firestore: `device_analytics/{deviceId}_{YYYY-MM-DD}`

```typescript
{
  deviceId: string;
  date: string;  // "YYYY-MM-DD" in IST
  light1RuntimeSec: number;  // Store seconds (not hours) to match firmware
  light2RuntimeSec: number;
  light3RuntimeSec: number;
  fan1RuntimeSec: number;
  fan2RuntimeSec: number;
  customRuntimeSec: number;
  light1EnergyWh: number;  // Wh (not kWh)
  light2EnergyWh: number;
  light3EnergyWh: number;
  fan1EnergyWh: number;
  fan2EnergyWh: number;
  customEnergyWh: number;
  savedAt: Timestamp;
}
```

**Change from Current:**
- Current stores runtime in **hours** (float)
- New schema stores runtime in **seconds** (integer) to match firmware units
- Current stores total `energyUsage` (kWh), new schema stores per-channel energy (Wh)

### RTDB: `devices/{deviceId}/currentSense`

```typescript
{
  light1Current: number;    // Amps
  light2Current: number;
  light3Current: number;
  fan1Current: number;
  fan2Current: number;
  customCurrent: number;
  light1Mismatch: boolean;  // true = relay ON but no current detected
  light2Mismatch: boolean;
  light3Mismatch: boolean;
  fan1Mismatch: boolean;
  fan2Mismatch: boolean;
  customMismatch: boolean;
}
```

---

## Summary

- **Data Flow:** ESP32 → RTDB outputs → Web app analytics → RTDB analytics → Firestore device_analytics
- **No Cloud Function bridge** — all writes are client-side
- **Runtime reset bug:** Code looks correct; likely user confusion about day rollover, or firmware conflict
- **Energy calculation:** Uses placeholder wattage (40W/25W/30W), not actual current
- **Missing:** currentSense listeners, Cloud Function cleanup, IST timezone handling
- **Channel naming conflict:** Task spec vs. actual codebase (light2/3 vs. light1/2/3)

**Next Step:** Await user confirmation on channel mapping and firmware behavior, then proceed with implementation.
