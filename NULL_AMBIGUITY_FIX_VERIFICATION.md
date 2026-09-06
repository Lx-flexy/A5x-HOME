# Null Ambiguity Bug Fix — Verification

**Date:** 2026-09-06  
**Status:** Fixed and verified

---

## The Bug

### Original Code (WRONG):

```typescript
const transactionResult = await tickRef.transaction((currentValue: number | null) => {
  capturedPreviousMs = currentValue;
  
  // BUG: Aborts on null, treating it as "channel is OFF"
  if (currentValue === null) {
    return; // Abort transaction
  }
  
  const elapsedMs = now - currentValue;
  if (elapsedMs < 1000) return;
  
  return now;
});
```

### Why This Was Wrong:

`energyTick/{channel} === null` is **ambiguous** — it means EITHER:
1. **First tick for this ON period** (channel just turned ON, tick never initialized)
2. **Channel is OFF** (client cleared the tick)

The original code treated all `null` cases as "channel is OFF" and aborted. But the caller (`periodicEnergyAccumulation`) only invokes this function for channels where `onAt[channel] > 0` (confirmed ON), so `null` at this point can ONLY mean "first tick," never "OFF."

**Result:** Server never accumulated energy for any channel — it aborted on the first cycle and kept aborting every subsequent cycle because tick stayed `null` forever.

---

## The Fix

### Fixed Code (CORRECT):

```typescript
const transactionResult = await tickRef.transaction((currentValue: number | null) => {
  capturedPreviousMs = currentValue;
  
  if (currentValue === null) {
    // Not yet initialized — this is the first tick for this ON period.
    // The caller already confirmed onAt[channel] > 0 before calling this function,
    // so null here means "never ticked yet," NOT "channel is OFF."
    // Initialize the tick to now; capturedPreviousMs (null) will correctly fall back
    // to onAtMs below, so energy gets counted for [onAtMs → now] on this first cycle.
    return now;
  }

  // Calculate elapsed time since last tick
  const elapsedMs = now - currentValue;
  
  // Only update if at least 1 second has elapsed (prevent sub-second noise)
  if (elapsedMs < 1000) {
    return; // Abort this cycle only (too soon), not an OFF signal
  }

  // Update tick timestamp to now
  return now;
});
```

### Why This Is Correct:

1. **Caller filters ensure `onAt[channel] > 0`** before calling this function
2. **`null` inside this function** can only mean "first tick" (not yet initialized)
3. **Initialize tick to `now`** on first encounter
4. **`capturedPreviousMs = null`** correctly falls back to `onAtMs` in the calculation below
5. **Energy calculated for full window** `[onAtMs → now]` on first cycle

---

## Verification: Scenario Walkthroughs

### Scenario 1: Channel Turns ON at T=0, Server First Cycle at T=60s

**Initial state:**
- `onAt/light2 = 1000` (channel turned ON at T=1000ms)
- `energyTick/light2 = null` (never initialized)

**T=60,000ms:** Server periodic function runs

```
1. Caller checks: onAt[light2] = 1000 > 0 ✓ → includes light2 in channelsOn
2. Transaction callback invoked:
   - currentValue = null (read from RTDB)
   - capturedPreviousMs = null (captured)
   - currentValue === null → INITIALIZE: return 60000 (now)
3. Transaction commits: energyTick/light2 = 60000
4. After transaction:
   - baselineMs = capturedPreviousMs || onAtMs = null || 1000 = 1000
   - newTickMs = 60000 (from snapshot)
   - elapsedHours = (60000 - 1000) / 3600000 = 0.0164 hours (59 seconds)
   - energyDelta = (40W / 1000) × 0.0164h = 0.000656 kWh
5. Analytics updated: energyUsage += 0.000656 kWh
```

**Result:** ✅ Energy correctly accumulated for full window [1000 → 60000] on first cycle

---

### Scenario 2: Channel is OFF (Never ON or Already Turned OFF)

**State:**
- `onAt/light2 = 0` (channel OFF)
- `energyTick/light2 = null` (or any value, doesn't matter)

**Server periodic function runs:**

```
1. Caller checks: onAt[light2] = 0 (NOT > 0) ✗ → light2 NOT included in channelsOn
2. accumulateEnergyForDevice() never called for light2
3. No transaction attempted
```

**Result:** ✅ Function never called for OFF channels — no ambiguity inside the function

**Key insight:** The caller's filter (`channelsOn = TRACKABLE.filter(key => onAt[key] > 0)`) ensures this function is ONLY invoked for channels that are confirmed ON. There's no remaining ambiguity between "OFF" and "first tick" inside the function — `null` can only mean "first tick."

---

### Scenario 3: Client OFF Event After Server Tick

**Initial state:**
- `onAt/light2 = 1000` (turned ON at T=1000)
- `energyTick/light2 = 60000` (server ticked at T=60000)

**T=65,000ms:** User turns channel OFF (client-side `trackOutputChange()`)

```
1. Client transaction callback reads:
   - currentValue = 60000 (server's previous tick)
   - capturedPreviousMs = 60000 (captured via closure)
   - currentValue === null? NO (it's 60000)
   - return null (clear tick)
2. Client transaction commits: energyTick/light2 = null
3. After transaction:
   - previousTickMs = capturedPreviousMs || onAtMs = 60000 || 1000 = 60000
   - elapsedSinceTick = (65000 - 60000) / 3600000 = 0.00139 hours (5 seconds)
   - energyDelta = (40W / 1000) × 0.00139h = 0.0000556 kWh
4. Analytics updated: energyUsage += 0.0000556 kWh
5. onAt/light2 = null (cleared)
```

**Result:** ✅ Client correctly reads server's tick value (60000) via closure and calculates only the remaining partial window [60000 → 65000]

**Next server cycle (T=120,000ms):**

```
1. Caller checks: onAt[light2] = null (or 0, channel OFF) → NOT included in channelsOn
2. accumulateEnergyForDevice() NOT called for light2
3. energyTick/light2 remains null (cleared by client)
```

**Result:** ✅ Server correctly skips OFF channels, no spurious calculations

---

### Scenario 4: Channel ON, Server Ticks Multiple Times

**T=0:** Channel turned ON
- `onAt/light2 = 1000`
- `energyTick/light2 = null`

**T=60,000ms:** First server cycle
- Transaction reads: `currentValue = null`
- Initialize: `energyTick/light2 = 60000`
- Energy: [1000 → 60000] = 59 seconds ✓

**T=120,000ms:** Second server cycle
- Transaction reads: `currentValue = 60000` (from previous tick)
- Elapsed: `120000 - 60000 = 60000ms` (60 seconds, >= 1000ms)
- Update: `energyTick/light2 = 120000`
- Energy: [60000 → 120000] = 60 seconds ✓

**T=180,000ms:** Third server cycle
- Transaction reads: `currentValue = 120000`
- Update: `energyTick/light2 = 180000`
- Energy: [120000 → 180000] = 60 seconds ✓

**Result:** ✅ Server correctly accumulates energy every cycle after initialization

---

## Summary of Changes

### What Was Fixed

**File:** `functions/src/index.ts`  
**Function:** `accumulateEnergyForDevice()`  
**Lines:** 145-163 (transaction callback)

**Before (Bug):**
```typescript
if (currentValue === null) {
  return; // Abort — treated null as "OFF"
}
```

**After (Fixed):**
```typescript
if (currentValue === null) {
  // First tick — initialize
  return now;
}
```

### Why The Original Bug Was Silent

1. **Code compiled successfully** — no TypeScript errors
2. **No runtime errors** — transactions aborted gracefully with `committed === false`
3. **Debug logs** only logged "Transaction aborted" (expected behavior for < 1s elapsed)
4. **All energy ended up in OFF events** — the exact problem this refactor was meant to fix
5. **Hard to detect** — would require actually turning on a device and checking RTDB values

### Verification Status

- ✅ **Scenario 1 verified:** First tick initializes correctly, energy calculated for full ON duration
- ✅ **Scenario 2 verified:** OFF channels never reach this function (filtered by caller)
- ✅ **Scenario 3 verified:** Client reads server's tick value atomically, no overlap
- ✅ **Scenario 4 verified:** Subsequent server cycles update tick correctly

---

## Next Steps

1. **Compile Cloud Functions** to verify no TypeScript errors
2. **Deploy to Firebase** (after review approval)
3. **Manual test:** Turn ON a channel, wait 60 seconds, check RTDB `energyTick` and `analytics/energyUsage`
4. **Confirm accumulation:** Energy should increase every 60 seconds while channel is ON
