# Analytics Bug - Comprehensive Fix Plan

## Overview

This document outlines the MINIMAL, SURGICAL fixes required to resolve the analytics runtime bugs while preserving the existing architecture.

## Fix Strategy

**DO NOT:**
- Rewrite the entire analytics system
- Change UI design/layout
- Modify Firebase structure unnecessarily  
- Change device control logic

**DO:**
- Fix unit consistency (hours vs seconds)
- Add proper validation layers
- Fix midnight rollover logic
- Calibrate ACS712 readings
- Improve mismatch detection

---

## FIX #1: Runtime Unit Consistency 🔴 CRITICAL

### Current Bug
```typescript
// Documentation claims seconds, code uses hours:
const elapsed = (now - onAtMs) / 3_600_000; // hours
await update(rtdbAnalytics(deviceId), {
  [field]: (cur[field] || 0) + elapsed,  // ← Stores HOURS not seconds!
});
```

### Decision: Keep HOURS (Easier Migration)

**Rationale:**
- Existing RTDB data is already in hours
- Changing to seconds requires migrating all existing data
- Hours work fine if implemented correctly
- Display logic already expects hours

### Changes Required

#### File: `src/services/analyticsService.ts`

**Line 17:** Update documentation
```typescript
// OLD:
// * Runtime stored in SECONDS (matching firmware), displayed in hours/minutes

// NEW:
// * Runtime stored in HOURS (decimal) in RTDB, displayed in hours/minutes format
```

**Line 323-327:** Add validation before storing
```typescript
// OLD:
await update(rtdbAnalytics(deviceId), {
  [field]: (cur[field] || 0) + elapsed,
  energyUsage: (cur.energyUsage || 0) + energyDelta,
});

// NEW:
// Validate: elapsed must be reasonable (0-24h for single session)
const validatedElapsed = Math.max(0, Math.min(elapsed, 24));
const newRuntime = (cur[field] || 0) + validatedElapsed;

// Safety: daily runtime for single channel cannot exceed 24h
if (newRuntime > 24) {
  console.warn(`[trackOutputChange] Runtime exceeds 24h: ${newRuntime}h for ${key}. Capping to 24h.`);
  // This indicates a bug - log but don't break functionality
}

await update(rtdbAnalytics(deviceId), {
  [field]: Math.min(newRuntime, 24),  // Hard cap at 24h per channel per day
  energyUsage: (cur.energyUsage || 0) + energyDelta,
});
```

**Line 126-141:** Fix sanity check threshold
```typescript
// OLD:
const MAX_DAILY_HOURS = 24;
const hasGarbage = Object.values(data).some(v => typeof v === 'number' && v > MAX_DAILY_HOURS);

// NEW:
const MAX_DAILY_HOURS = 24.5;  // Small buffer for clock skew/rounding
const hasGarbage = Object.values(data).some(v => {
  // Energy can be large, only check runtime fields
  if (typeof v !== 'number') return false;
  return v > MAX_DAILY_HOURS && v !== data.energyUsage;
});
```

---

## FIX #2: Midnight Rollover - onAt Reset 🔴 CRITICAL

### Current Bug
```typescript
// ensureTodayWindow() resets analytics but DOESN'T properly reset onAt
await remove(rtdbOnAt(deviceId));  // ← Removes ALL onAt
// Then re-seeds, but uses Date.now() which might be WRONG if device was ON yesterday
```

### Fix

#### File: `src/services/analyticsService.ts`

**Line 160-176:** Fix onAt re-seeding logic
```typescript
// OLD:
await set(rtdbAnalytics(deviceId), {
  light2Runtime: 0, light3Runtime: 0,
  fan1Runtime: 0, customRuntime: 0, energyUsage: 0,
});
await set(rtdbAnalyticsDate(deviceId), today);
await remove(rtdbOnAt(deviceId));

const outputsSnap = await get(ref(rtdb, `devices/${deviceId}/outputs`));
if (outputsSnap.exists()) {
  const outputs = outputsSnap.val() as Record<string, boolean>;
  const newOnAt: Record<string, number> = {};
  let any = false;
  for (const k of TRACKABLE) {
    if (outputs[k] === true) { newOnAt[k] = Date.now(); any = true; }
  }
  if (any) await update(rtdbOnAt(deviceId), newOnAt);
}

// NEW:
await set(rtdbAnalytics(deviceId), {
  light2Runtime: 0, light3Runtime: 0,
  fan1Runtime: 0, customRuntime: 0, energyUsage: 0,
});
await set(rtdbAnalyticsDate(deviceId), today);

// CRITICAL FIX: Reset onAt to START OF TODAY (midnight IST), not current time
// This ensures cross-midnight sessions don't accumulate > 24h
const midnightToday = getTodayMidnightMs();  // Helper function to add

const outputsSnap = await get(ref(rtdb, `devices/${deviceId}/outputs`));
if (outputsSnap.exists()) {
  const outputs = outputsSnap.val() as Record<string, boolean>;
  const newOnAt: Record<string, number> = {};
  for (const k of TRACKABLE) {
    // For devices currently ON, set onAt to midnight (start of today)
    // This correctly attributes only TODAY's runtime, not yesterday's
    if (outputs[k] === true) {
      newOnAt[k] = midnightToday;  // ← KEY FIX
    } else {
      newOnAt[k] = null;  // Explicitly clear if OFF
    }
  }
  await set(rtdbOnAt(deviceId), newOnAt);  // Use set, not update
}
```

**Add helper function (after line 72):**
```typescript
/**
 * Get midnight (00:00:00) of today in IST timezone as unix ms.
 * Used for onAt reset during date rollover to prevent accumulating > 24h.
 */
export function getTodayMidnightMs(): number {
  const now = new Date(Date.now() + IST_OFFSET_MS);
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const date = now.getUTCDate();
  
  // Midnight UTC of this IST day
  const midnightUTC = Date.UTC(year, month, date, 0, 0, 0, 0);
  
  // Convert back to IST
  return midnightUTC - IST_OFFSET_MS;
}
```

---

## FIX #3: Live Runtime Validation

### Fix

#### File: `src/pages/analytics/Analytics.tsx`

**Line 196-200:** Add validation to liveRuntime calculation
```typescript
// OLD:
const liveRuntime = (deviceId: string, key: string, stored: number): number => {
  const onAtMs = onAtMap[deviceId]?.[key] || 0;
  const liveHours = onAtMs > 0 ? (now - onAtMs) / 3_600_000 : 0;
  return stored + liveHours;
};

// NEW:
const liveRuntime = (deviceId: string, key: string, stored: number): number => {
  // Validate stored value
  if (stored < 0 || stored > 24) {
    console.warn(`[Analytics] Invalid stored runtime: ${stored}h for ${key}. Capping to 24h.`);
    stored = Math.max(0, Math.min(stored, 24));
  }
  
  const onAtMs = onAtMap[deviceId]?.[key] || 0;
  if (onAtMs <= 0) return stored;
  
  // Calculate live delta
  const elapsed = now - onAtMs;
  
  // Sanity check: elapsed must be reasonable
  if (elapsed < 0) {
    console.error(`[Analytics] Negative elapsed time for ${key}. Clock skew detected.`);
    return stored;
  }
  
  const liveHours = elapsed / 3_600_000;
  
  // Cap total at 24h for single channel
  const total = stored + liveHours;
  if (total > 24) {
    console.warn(`[Analytics] Runtime exceeds 24h: ${total}h for ${key}. Displaying capped value.`);
    return 24;  // Display cap, don't modify stored data
  }
  
  return stored + liveHours;
};
```

---

## FIX #4: Current Sensor Calibration (ESP32 Firmware)

### Issue
Reading 11.84A is unrealistic for typical home appliances.

### Root Causes
1. Wrong ACS712 variant assumption
2. No AC RMS calculation
3. Single ADC sample instead of averaged RMS
4. Possible zero-point calibration error

### Fix (Firmware - Pseudocode)

```cpp
// Configuration
#define ACS712_VARIANT ACS712_5A  // Or 20A/30A - VERIFY HARDWARE!
#define ACS712_PIN 34
#define ADC_SAMPLES 100  // Sample over ~2 AC cycles (40ms @ 50Hz)
#define ADC_RESOLUTION 4095.0
#define ADC_VREF 3.3
#define ACS712_ZERO_CURRENT_V 2.5  // Nominal, should be calibrated

// Sensitivity values for different variants
const float SENSITIVITY_5A = 0.185;   // V/A
const float SENSITIVITY_20A = 0.100;  // V/A
const float SENSITIVITY_30A = 0.066;  // V/A

// Choose based on actual hardware
const float SENSITIVITY = SENSITIVITY_5A;

// BEFORE FIRST USE: Calibrate zero point
float calibrateZeroPoint() {
  // Ensure ALL loads are OFF
  float sum = 0;
  for (int i = 0; i < 1000; i++) {
    int rawValue = analogRead(ACS712_PIN);
    float voltage = (rawValue / ADC_RESOLUTION) * ADC_VREF;
    sum += voltage;
    delay(1);
  }
  return sum / 1000.0;  // Average = true zero
}

// Call once at startup, store in EEPROM/NVS
float ZERO_POINT = calibrateZeroPoint();

// Read RMS current (AC-aware)
float readCurrentRMS() {
  float sumSquares = 0;
  int validSamples = 0;
  
  // Sample over ~2 AC cycles for proper RMS
  for (int i = 0; i < ADC_SAMPLES; i++) {
    int rawValue = analogRead(ACS712_PIN);
    float voltage = (rawValue / ADC_RESOLUTION) * ADC_VREF;
    float currentInstantaneous = (voltage - ZERO_POINT) / SENSITIVITY;
    
    // Accumulate squares for RMS
    sumSquares += currentInstantaneous * currentInstantaneous;
    validSamples++;
    
    delayMicroseconds(400);  // 100 samples over 40ms = 400µs spacing
  }
  
  if (validSamples == 0) return 0.0;
  
  // RMS = √(mean of squares)
  float rms = sqrt(sumSquares / validSamples);
  
  // Noise floor filter: readings < 0.05A are likely noise
  if (rms < 0.05) return 0.0;
  
  // Sanity check: clip unrealistic values
  if (rms > 15.0) {
    Serial.println("WARNING: Current reading > 15A, possible sensor error");
    return 0.0;  // Don't send garbage data
  }
  
  return rms;
}

// In main loop (every 5-10 seconds):
void updateCurrentSense() {
  float light2Current = readCurrentRMS();  // Read from ACS712 on light2 circuit
  // ... repeat for light3, fan1, custom
  
  // Update Firebase RTDB
  Firebase.setFloat(rtdb, "devices/" + deviceId + "/currentSense/light2Current", light2Current);
  
  // Mismatch detection (with debounce)
  bool relayState = digitalRead(RELAY_LIGHT2_PIN);
  if (relayState == HIGH && light2Current < 0.05) {
    light2MismatchCount++;
    if (light2MismatchCount > 5) {  // 5 consecutive low readings
      Firebase.setBool(rtdb, "devices/" + deviceId + "/currentSense/light2Mismatch", true);
    }
  } else {
    light2MismatchCount = 0;  // Reset counter
    Firebase.setBool(rtdb, "devices/" + deviceId + "/currentSense/light2Mismatch", false);
  }
}
```

### Web App Changes (Current Clamping)

#### File: `src/pages/analytics/Analytics.tsx`

**Line 48-55:** Add current validation
```typescript
function fmtCurrent(amps: number): string {
  // Validate input
  if (isNaN(amps) || !isFinite(amps)) return '0.00 A';
  
  // Clamp to realistic range
  if (amps < 0) amps = 0;
  if (amps > 15) {
    console.warn(`Unrealistic current reading: ${amps}A. Clamping to 15A.`);
    amps = 15;
  }
  
  // Clamp near-zero readings to exactly 0 (sensor noise floor)
  if (amps < 0.01) return '0.00 A';
  
  // Format to 2 decimal places
  return `${amps.toFixed(2)} A`;
}
```

---

## FIX #5: Energy Calculation Validation

### Fix

#### File: `src/services/analyticsService.ts`

**Line 304-326:** Add validation to energy calculation
```typescript
// Calculate energy delta for time since last server tick
let energyDelta = 0;

// Validate current data
if (currentData) {
  const currentField = `${key}Current`;
  const actualCurrent = currentData[currentField];
  
  // VALIDATION: Current must be in realistic range
  const isValidCurrent = actualCurrent && 
                         !isNaN(actualCurrent) && 
                         isFinite(actualCurrent) &&
                         actualCurrent >= 0.01 &&  // Above noise floor
                         actualCurrent < 15;       // Below danger threshold
  
  if (isValidCurrent) {
    const powerW = NOMINAL_VOLTAGE * actualCurrent;
    
    // VALIDATION: Power must be reasonable
    if (powerW > 0 && powerW < 5000) {  // Max 5kW
      energyDelta = (powerW / 1000) * elapsedSinceTick;
    } else {
      console.warn(`[trackOutputChange] Unrealistic power: ${powerW}W. Using nominal.`);
      energyDelta = (WATT[key] / 1000) * elapsedSinceTick;
    }
  } else {
    // Invalid current - fall back to nominal wattage
    energyDelta = (WATT[key] / 1000) * elapsedSinceTick;
  }
} else {
  // No current sense data available
  energyDelta = (WATT[key] / 1000) * elapsedSinceTick;
}

// VALIDATION: Energy delta must be reasonable
if (isNaN(energyDelta) || !isFinite(energyDelta) || energyDelta < 0) {
  console.error(`[trackOutputChange] Invalid energy delta: ${energyDelta}. Skipping.`);
  energyDelta = 0;
}

// For a single OFF event, energy should not exceed device's max possible consumption
const maxPossibleEnergy = (5 * elapsedSinceTick);  // 5kW max
if (energyDelta > maxPossibleEnergy) {
  console.warn(`[trackOutputChange] Energy delta ${energyDelta} exceeds maximum possible ${maxPossibleEnergy}. Capping.`);
  energyDelta = maxPossibleEnergy;
}
```

---

## FIX #6: Mismatch Detection Logic

### Current Bug
- No debounce → false alarms on startup/transients
- No recovery logic → once flagged, stays flagged forever

### Fix (ESP32 Firmware - Pseudocode)

```cpp
// Per-channel mismatch tracking
struct MismatchState {
  int consecutiveLowCount;
  int consecutiveOkCount;
  bool isMismatch;
};

MismatchState light2State = {0, 0, false};
// ... repeat for light3, fan1, custom

const int DEBOUNCE_THRESHOLD = 5;  // 5 consecutive readings
const int RECOVERY_THRESHOLD = 3;   // 3 consecutive OK readings

void updateMismatchDetection() {
  // Example for light2
  bool relayOn = digitalRead(RELAY_LIGHT2_PIN) == HIGH;
  float current = readCurrentRMS();
  
  if (relayOn) {
    if (current < 0.05) {  // Below threshold
      light2State.consecutiveLowCount++;
      light2State.consecutiveOkCount = 0;
      
      if (light2State.consecutiveLowCount >= DEBOUNCE_THRESHOLD) {
        light2State.isMismatch = true;
      }
    } else {  // Current OK
      light2State.consecutiveOkCount++;
      light2State.consecutiveLowCount = 0;
      
      if (light2State.consecutiveOkCount >= RECOVERY_THRESHOLD) {
        light2State.isMismatch = false;  // Auto-recover
      }
    }
  } else {
    // Relay OFF - clear mismatch
    light2State.isMismatch = false;
    light2State.consecutiveLowCount = 0;
    light2State.consecutiveOkCount = 0;
  }
  
  // Update Firebase
  Firebase.setBool(rtdb, "devices/" + deviceId + "/currentSense/light2Mismatch", 
                   light2State.isMismatch);
}
```

---

## FIX #7: Display Formatting Safety

### Fix

#### File: `src/pages/analytics/Analytics.tsx`

**Line 31-42:** Add validation to fmtRuntime
```typescript
function fmtRuntime(h: number): string {
  // Validate input
  if (isNaN(h) || !isFinite(h) || h < 0) {
    console.warn(`[fmtRuntime] Invalid runtime: ${h}. Displaying 0.`);
    return '0s';
  }
  
  // Cap at reasonable maximum for display
  if (h > 24) {
    console.warn(`[fmtRuntime] Runtime ${h}h exceeds 24h. Displaying capped value.`);
    h = 24;
  }
  
  if (!h || h <= 0) return '0s';
  const totalSec = Math.round(h * 3600);
  if (totalSec < 60) return `${totalSec}s`;
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  const ss = Math.round(((h - hh) * 60 - mm) * 60);
  if (hh === 0) return ss > 0 ? `${mm}m ${ss}s` : `${mm}m`;
  return mm > 0 ? `${hh}h ${mm}m` : `${hh}h`;
}
```

---

## Testing Checklist

After implementing fixes, test these scenarios:

### Runtime Tests
- [ ] Device OFF all day → Today runtime = 0h
- [ ] Light ON for 10 minutes → Light runtime ≈ 10m (±1m tolerance)
- [ ] Fan ON for 45 minutes → Fan runtime ≈ 45m
- [ ] Device ON at 23:50, check at 00:10 next day → Today shows only 10m
- [ ] Device running 24h straight → Today shows exactly 24h (not 24h 30m)
- [ ] Multiple ON/OFF cycles → Total adds up correctly
- [ ] Page refresh doesn't duplicate runtime

### Midnight Rollover Tests
- [ ] Device ON before midnight, still ON after → old day saved to Firestore, new day starts at 0h
- [ ] onAt timestamp reset to midnight, not current time
- [ ] Cross-midnight session: old day gets remaining hours, new day gets hours after midnight

### Current Sensor Tests
- [ ] With valid current (0.5A) → displays "0.50 A"
- [ ] With invalid current (-5A) → displays "0.00 A"
- [ ] With unrealistic current (20A) → displays "15.00 A" (capped)
- [ ] With noise (0.005A) → displays "0.00 A"
- [ ] Current unavailable → no crash, falls back to nominal wattage

### Energy Tests
- [ ] With valid current → energy = voltage × current × hours
- [ ] With invalid current → energy = nominal wattage × hours
- [ ] Energy never negative
- [ ] Energy never NaN/Infinity

### Mismatch Tests
- [ ] Relay ON, current OK → no mismatch
- [ ] Relay ON, current zero for 1 reading → no mismatch (debounce)
- [ ] Relay ON, current zero for 6 readings → mismatch = true
- [ ] Mismatch true, then current returns → mismatch clears after 3 OK readings
- [ ] Relay OFF → mismatch always false

### Edge Cases
- [ ] Wi-Fi disconnected for 10 minutes → no absurd runtime jump after reconnect
- [ ] Browser/tab closed and reopened → runtime continues correctly
- [ ] Multiple tabs open → no duplicate accumulation
- [ ] Clock skew (device time ≠ server time) → handled gracefully

---

## Implementation Order

1. **CRITICAL FIXES FIRST** (Can deploy immediately):
   - Fix #1: Runtime validation (prevent > 24h)
   - Fix #2: Midnight onAt reset
   - Fix #3: Live runtime validation

2. **DEPLOY AND MONITOR** (Wait 24h to see if fixes work)

3. **SENSOR CALIBRATION** (Requires hardware access):
   - Fix #4: ACS712 RMS calculation
   - Fix #6: Mismatch debounce

4. **POLISH**:
   - Fix #5: Energy validation (depends on Fix #4)
   - Fix #7: Display formatting

---

## Data Migration

### For Existing Corrupt Data

Add one-time cleanup function:

```typescript
// In analyticsService.ts
export async function oneTimeCleanupCorruptData(deviceId: string): Promise<void> {
  console.log(`[oneTimeCleanup] Resetting analytics for device: ${deviceId}`);
  
  // Force reset to clean state
  await set(rtdbAnalytics(deviceId), {
    light2Runtime: 0,
    light3Runtime: 0,
    fan1Runtime: 0,
    customRuntime: 0,
    energyUsage: 0,
  });
  
  await set(rtdbAnalyticsDate(deviceId), todayStr());
  await remove(rtdbOnAt(deviceId));
  
  // Re-seed onAt for currently ON devices
  const outputsSnap = await get(ref(rtdb, `devices/${deviceId}/outputs`));
  if (outputsSnap.exists()) {
    const outputs = outputsSnap.val() as Record<string, boolean>;
    const midnight = getTodayMidnightMs();
    const newOnAt: Record<string, number | null> = {};
    
    for (const k of TRACKABLE) {
      newOnAt[k] = outputs[k] === true ? midnight : null;
    }
    
    await set(rtdbOnAt(deviceId), newOnAt);
  }
  
  console.log(`[oneTimeCleanup] Cleanup complete for device: ${deviceId}`);
}
```

Call from Analytics page on mount:
```typescript
// In Analytics.tsx useEffect:
useEffect(() => {
  if (!devices.length) return;
  
  // One-time cleanup for all devices
  devices.forEach(dev => {
    oneTimeCleanupCorruptData(dev.deviceId).catch(console.error);
  });
}, [devices]);
```

**After 24 hours of clean data**, remove this cleanup code.

---

## Expected Results After Fix

```
✅ Today Runtime: 8h 23m        (Realistic - sum of all channels)
✅ Light Runtime: 4h 12m         (Light2 + Light3)
✅ Fan Runtime: 2h 45m           (Fan1 only)
✅ Light 2 Runtime: 3h 30m       (Single channel, < 24h)
✅ Light 3 Runtime: 42m          (Single channel, < 24h)
✅ Custom Runtime: 1h 36m        (Single channel, < 24h)
✅ Energy: 2.341 kWh             (Realistic for 8h operation)
✅ Light 2 Current: 0.42 A       (Realistic for 40W bulb @ 230V)
```

---

## Files to Modify

1. `src/services/analyticsService.ts` - Core fixes
2. `src/pages/analytics/Analytics.tsx` - Display validation
3. `src/pages/devices/DeviceDetails.tsx` - Same validation as Analytics
4. **ESP32 Firmware** (if accessible) - ACS712 calibration & mismatch logic

## Files NOT to Touch

- Device control UI
- Firebase Auth
- Member management
- Notifications
- DexBot
- Any unrelated features

---

## Summary

The 11275h bug is caused by:
1. Runtime stored in HOURS but accumulated without validation
2. onAt timestamps not reset at midnight
3. No 24h cap per channel
4. ACS712 reading wrong due to lack of RMS calculation
5. No input validation anywhere

Fixes are SURGICAL and MINIMAL - only touch calculation/validation logic, not architecture.
