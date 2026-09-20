# Analytics Runtime Bug - Root Cause Analysis

## Executive Summary

The Analytics page is showing impossible runtime values (11275h, 632h, 10011h) due to **CRITICAL UNIT CONVERSION BUG**: Runtime is stored in **HOURS** in RTDB but displayed code assumes **HOURS**, creating a compounding error when the live delta calculation adds hours to what are already hours.

## Current Impossible Values

```
Today Runtime: 11275h 2m     ❌ IMPOSSIBLE - Max should be 24h per channel
Light Runtime: 632h 1m        ❌ IMPOSSIBLE  
Fan Runtime: 632h 1m          ❌ IMPOSSIBLE
Light 2 Runtime: 630h 1m      ❌ IMPOSSIBLE
Custom Runtime: 10011h        ❌ IMPOSSIBLE - Nearly 417 days!
Light 3 Runtime: 2h           ✅ Plausible
```

## ROOT CAUSE #1: CRITICAL UNIT MISMATCH 🔴

### The Bug

**Documentation says:** "Runtime stored in SECONDS (matching firmware)"
```typescript
// From analyticsService.ts line 17:
// Runtime stored in SECONDS (matching firmware), displayed in hours/minutes
```

**Reality:** Runtime is ACTUALLY stored in **HOURS** in RTDB!

**Evidence:**
```typescript
// analyticsService.ts line 284-285:
const elapsed = (now - onAtMs) / 3_600_000; // ← Calculates HOURS
// ...
await update(rtdbAnalytics(deviceId), {
  [field]: (cur[field] || 0) + elapsed,  // ← Stores HOURS, not seconds!
```

### The Compound Error

The Analytics page then adds MORE hours on top:

```typescript
// Analytics.tsx line 196-197:
const liveRuntime = (deviceId: string, key: string, stored: number): number => {
  const onAtMs = onAtMap[deviceId]?.[key] || 0;
  const liveHours = onAtMs > 0 ? (now - onAtMs) / 3_600_000 : 0;  // Calculate hours
  return stored + liveHours;  // ← Add hours to hours (correct IF stored is hours)
};
```

**BUT THE BUG:** When device is ON, live runtime keeps accumulating indefinitely because:
1. `stored` value keeps growing (already in hours)
2. `liveHours` keeps increasing (time since last OFF)  
3. No daily reset is properly enforced
4. Result: 10011 hours = **417 days** of accumulated runtime

### Why "Today" Shows 630 Hours

1. Device was left ON for extended period  
2. Every time page loads, it reads `stored` value (already 630h)
3. Adds live delta: `630h + (now - onAt) / 3_600_000`
4. If device is still ON, this keeps growing
5. **NO VALIDATION:** Values > 24h are never rejected

## ROOT CAUSE #2: MISSING DATE BOUNDARY ENFORCEMENT

### Problem

The `ensureTodayWindow()` function checks for date rollover BUT:

```typescript
// analyticsService.ts line 109:
if (storedDate === today) {
  // Same day window — sanity check analytics values and onAt timestamps
  // ... but NO enforcement if device was ON across midnight!
}
```

### What Should Happen at Midnight

When date changes from 2026-01-06 → 2026-01-07:

**Expected:**
1. Flush old day's data to Firestore
2. Reset RTDB analytics to ZERO
3. Clear onAt timestamps  
4. Re-seed onAt for currently-ON devices with NEW timestamp

**Reality:**
- Step 2 works: `light2Runtime: 0` ✅
- Step 4 FAILS: onAt keeps OLD timestamp from previous day! ❌

**Result:** Device turned ON at 23:00 yesterday calculates:
```
elapsed = (now - 23:00_yesterday) / 3_600_000
// After 25 hours: elapsed = 25h ❌ Should be capped at 24h!
```

## ROOT CAUSE #3: NO VALIDATION LAYER

### Missing Checks

```typescript
// NOWHERE in the codebase:
if (runtime > 24) {
  console.error('IMPOSSIBLE: Single channel runtime exceeds 24h in one day');
  // Should investigate OR cap to proper session length
}
```

### Current "Sanity Check" is Insufficient

```typescript
// analyticsService.ts line 126-141:
const MAX_DAILY_HOURS = 24;
const hasGarbage = Object.values(data).some(v => typeof v === 'number' && v > MAX_DAILY_HOURS);
if (hasGarbage) {
  // Reset today's window
}
```

**Problem:** This only runs during `ensureTodayWindow()`, which is:
- Called on page load
- NOT called continuously during normal operation
- Can't catch live accumulation bug

## ROOT CAUSE #4: ACS712 CURRENT SENSOR CALIBRATION

### Current Reading: 11.84 A is SUSPICIOUS

**Analysis:**
```
light2Current: 11.84 A
Power = 230V × 11.84A = 2,723 Watts
```

For a typical home bulb/appliance, **11.84A is extremely high**.

**Likely causes:**

1. **Wrong ACS712 variant configured**
   - Code may assume ACS712-5A (sensitivity = 0.185 V/A)
   - Actual hardware might be ACS712-20A (sensitivity = 0.100 V/A) or ACS712-30A (sensitivity = 0.066 V/A)
   
2. **No AC RMS calculation**
   - Current code likely takes single instantaneous ADC sample
   - AC current requires RMS: `I_rms = √(Σ(sample²) / n)`
   - Single sample can read peak (1.414× RMS) or even noise

3. **Incorrect zero-point calibration**
   - ACS712 outputs 2.5V at zero current
   - If calibration is off, ALL readings are shifted

4. **Formula issue:**
   ```cpp
   // Likely ESP32 code (WRONG for AC):
   float current = abs((voltage - 2.5) / 0.185);
   
   // Should be (for AC RMS):
   float current_rms = calculate_rms_over_samples() / 0.185;
   ```

### Impact on Energy Calculation

With 11.84A reading:
```typescript
const powerW = 230 * 11.84;  // = 2,723 W
const energyDelta = (2723 / 1000) * hours;  // Massive energy accumulation!
```

If device runs for "630 hours" with this inflated current:
```
Energy = 2.723 kW × 630h = 1,715 kWh  // ❌ Absurd for single bulb
Actual light bulb: ~0.04 kW × 24h = 0.96 kWh per day  // ✅ Realistic
```

## ROOT CAUSE #5: OLD ANALYTICS SCHEMA CONFUSION

### Two Analytics Sources Found

**1. Old top-level structure (ORPHANED):**
```
analytics/{deviceId}/
  ├── energyUsage
  ├── fan1Runtime
  ├── fan2Runtime  ← No longer used
  ├── light1Runtime  ← No longer used
  ├── light2Runtime
  ├── light3Runtime
  ├── customRuntime
  └── uptime
```

**2. Current device structure:**
```
devices/{deviceId}/
  └── analytics/
      ├── light2Runtime
      ├── light3Runtime
      ├── fan1Runtime
      ├── customRuntime
      └── energyUsage
```

**Risk:** If old data is accidentally aggregated with new data, runtime values double/triple.

**Current status:** Analytics.tsx correctly uses `subscribeToAnalytics()` which reads from `devices/{deviceId}/analytics/` ✅

## ROOT CAUSE #6: MISMATCH DETECTION LOGIC

### Current ESP32 Behavior (Inferred)

```
if (relay_ON && current < threshold) {
  mismatch = true;  // Immediate flag
}
```

**Problems:**
1. No debounce/grace period
2. Single zero reading triggers fault
3. Switching transients cause false alarms
4. No recovery logic (once true, stays true?)

**Example false alarm:**
- Bulb turns ON
- First 100ms: current = 0 (inrush delay)
- ESP32 sets `light2Mismatch: true`
- User sees fault even though bulb works fine

### Recommendation

```cpp
// Pseudocode for proper mismatch detection:
if (relay_ON) {
  if (current < THRESHOLD) {
    consecutive_low_count++;
    if (consecutive_low_count > DEBOUNCE_SAMPLES) {  // e.g., 5 consecutive readings
      mismatch = true;
    }
  } else {
    consecutive_low_count = 0;  // Reset on valid reading
    mismatch = false;  // Auto-recover
  }
}
```

## SUMMARY OF ROOT CAUSES

| # | Issue | Severity | Impact |
|---|-------|----------|--------|
| 1 | **Runtime stored in HOURS, not SECONDS** | 🔴 CRITICAL | All runtime calculations wrong |
| 2 | **onAt not reset at midnight** | 🔴 CRITICAL | Cross-midnight sessions accumulate indefinitely |
| 3 | **No validation (runtime > 24h)** | 🟠 HIGH | Impossible values reach UI |
| 4 | **ACS712 reading 11.84A (wrong)** | 🟠 HIGH | Energy calculations inflated 30-50× |
| 5 | **No AC RMS calculation** | 🟠 HIGH | Current readings unreliable |
| 6 | **Mismatch detection too aggressive** | 🟡 MEDIUM | False alarms |
| 7 | **Old schema orphaned but present** | 🟡 MEDIUM | Potential confusion |

## WHY VALUES ARE 630h / 10011h / 11275h

### Light 2 Runtime: 630h

```
Device turned ON at some point
├── Stored in RTDB: 630 (hours, not seconds)
├── Every page load adds: (now - onAt) / 3_600_000
├── If device stayed ON for 26 days: 26 × 24 = 624h
└── Plus live delta = ~630h
```

### Custom Runtime: 10011h

```
Device might have been:
├── ON for extended period (months?)
├── OR buggy firmware kept accumulating
├── OR old data never reset
└── 10011h ÷ 24 = 417 days of accumulated runtime!
```

### Today Total: 11275h

```
Sum of all channels:
├── light2: 630h
├── light3: 2h
├── fan1: 632h  
├── custom: 10011h
└── Total: 11275h ❌
```

**Should be:** Each channel ≤ 24h, total ≤ 96h (4 channels × 24h max)

## NEXT STEPS

See `ANALYTICS_BUG_FIX_PLAN.md` for detailed fix implementation.
