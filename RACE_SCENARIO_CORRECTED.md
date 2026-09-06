# Race Scenario CORRECTED: Server Tick vs Client OFF (Both Read Null)

## Scenario Setup

**Timeline:**
- **T=1000ms:** User turns channel ON
  - `onAt/light2 = 1000`
  - `energyTick/light2 = null` (never initialized)

- **T=5000ms:** User turns channel OFF (only 4 seconds after ON, before server's first 60s cycle)
  - Client `trackOutputChange()` starts executing

- **T=5001ms:** Server's periodic cycle happens to fire at nearly the same moment
  - Server `accumulateEnergyForDevice()` starts executing

**Race condition:** Both server and client attempt to transact on `energyTick/light2`, which is still `null`.

---

## Firebase RTDB Transaction Retry Semantics

Firebase RTDB transactions use **optimistic locking with automatic retry**:

1. Transaction callback invoked with current server value
2. Callback returns new value (or `undefined` to abort)
3. **Atomic compare-and-set:** Write succeeds IF server value unchanged since read
4. **On conflict:** If value changed, callback **RE-INVOKED** with NEW value
5. Only ONE transaction wins the first write from `null` → non-`null`

---

## Race Timeline with CORRECTED Logic

### Case 1: Server Wins Race (Initializes First)

**T=5001ms — Server transaction (first attempt):**
```typescript
// Server reads device state at cycle start
const onAt = {light2: 1000};  // Captured before client clears it
const channelsOn = ['light2'];  // light2 included

// Transaction on energyTick/light2
tickRef.transaction((currentValue) => {
  capturedPreviousMs = currentValue;  // null
  
  if (currentValue === null) {
    return now;  // Initialize to 5001
  }
});
```
- Reads: `null`
- Returns: `5001`
- **Commits FIRST:** `energyTick/light2 = 5001`

**T=5000ms — Client transaction (first attempt, slightly earlier but slower):**
```typescript
runTransaction(tickRef, (currentValue) => {
  capturedPreviousMs = currentValue;  // null
  
  if (currentValue === null) return null;  // Clear
  return null;
});
```
- Reads: `null`
- Returns: `null`
- **Fails compare-and-set** (server changed value to 5001)

**Client transaction RETRIES (second attempt):**
- Reads: `currentValue = 5001` (server's update)
- Captures: `capturedPreviousMs = 5001` (**OVERWRITTEN**)
- `currentValue === null`? NO
- Returns: `null` (clear)
- **Commits:** `energyTick/light2 = null`

**After both complete:**
- `energyTick/light2 = null` (client cleared server's value)
- Server's `capturedPreviousMs = null` (from first attempt that committed 5001)
- Client's `capturedPreviousMs = 5001` (from second attempt that committed null)

**Energy calculations (CORRECTED CODE):**

**Server:**
```typescript
const baselineMs = capturedPreviousMs || onAtMs;  // null || 1000 = 1000
const newTickMs = transactionResult.snapshot.val();  // 5001
const elapsedHours = (5001 - 1000) / 3600000;  // 0.00111 hours
energyDelta = (40W / 1000) × 0.00111h = 0.0000444 kWh
```
✅ Server calculates [1000 → 5001]

**Client:**
```typescript
if (capturedPreviousMs === null) {
  // Server never ticked yet - it will account for full duration
  console.info('Skipping client energy calc (server will account for full duration)');
  await update(rtdbOnAt(deviceId), { [key]: null });
  return;  // EXIT WITHOUT CALCULATING
}
```
✅ Client skips calculation (recognizes server didn't tick yet)

**WAIT — THIS IS WRONG!**

Client's `capturedPreviousMs = 5001` (from retry), NOT `null`. So the check fails and client calculates:

```typescript
const previousTickMs = capturedPreviousMs || onAtMs;  // 5001 || 1000 = 5001
const elapsedSinceTick = (5000 - 5001) / 3600000;  // -0.000000278 hours (NEGATIVE)

if (elapsed > 0 && elapsedSinceTick > 0) {
  // FALSE — negative elapsed time, skip
}
```

✅ Client skips calculation due to negative elapsed time (client OFF at T=5000, server ticked at T=5001)

**Result:** ✅ **NO DOUBLE-COUNTING** — Server calculates [1000 → 5001], client calculates nothing

---

### Case 2: Client Wins Race (Clears First)

**T=5000ms — Client transaction (first attempt):**
- Reads: `null`
- Returns: `null` (clear)
- **Commits FIRST:** `energyTick/light2 = null`

**T=5001ms — Server transaction (first attempt):**
- Reads: `null`
- Returns: `5001` (initialize)
- **Fails compare-and-set** (client changed version)

**Server transaction RETRIES (second attempt):**
- Reads: `currentValue = null` (client cleared it, but version changed)
- Captures: `capturedPreviousMs = null` (**OVERWRITTEN**)
- `currentValue === null` → Returns `5001` (initialize again)
- **Commits:** `energyTick/light2 = 5001`

**After both complete:**
- `energyTick/light2 = 5001` (server initialized after client cleared)
- Client's `capturedPreviousMs = null` (from first attempt)
- Server's `capturedPreviousMs = null` (from second attempt)

**Energy calculations (CORRECTED CODE):**

**Client:**
```typescript
if (capturedPreviousMs === null) {
  // Server never ticked yet - skip calculation
  console.info('Skipping client energy calc (server will account for full duration)');
  await update(rtdbOnAt(deviceId), { [key]: null });
  return;  // EXIT WITHOUT CALCULATING
}
```
✅ Client explicitly skips calculation (sees `null`, knows server will account for it)

**Server:**
```typescript
const baselineMs = capturedPreviousMs || onAtMs;  // null || 1000 = 1000
const newTickMs = transactionResult.snapshot.val();  // 5001
const elapsedHours = (5001 - 1000) / 3600000;  // 0.00111 hours
energyDelta = (40W / 1000) × 0.00111h = 0.0000444 kWh
```
✅ Server calculates [1000 → 5001]

**Result:** ✅ **NO DOUBLE-COUNTING** — Client skips (explicit check), server calculates [1000 → 5001]

---

## Key Fix: Client Checks `capturedPreviousMs === null`

### Added Logic in Client Code:

```typescript
if (capturedPreviousMs === null) {
  // Server never ticked yet - it will account for full duration when it initializes
  console.info(`Skipping client energy calc for ${key} (server will account for full duration)`);
  await update(rtdbOnAt(deviceId), { [key]: null });
  return;  // EXIT WITHOUT CALCULATING ENERGY
}
```

### Why This Works:

**Case 1 (Server wins):** Client's retry reads server's value (5001), so `capturedPreviousMs !== null`, but `elapsedSinceTick < 0` (negative time), so calculation skipped anyway.

**Case 2 (Client wins):** Client's commit has `capturedPreviousMs === null`, triggers explicit skip, server accounts for full duration.

**Either way:** Only ONE calculation happens for the [1000 → 5000/5001] window.

---

## Summary

### Compilation Results

**Cloud Functions:**
```
cd functions && npm run build
Exit Code: 0
```

**Web App:**
```
npm run build
✓ built in 5.88s
Exit Code: 0
```

✅ Both compile successfully with zero errors

### Files Modified

1. **`functions/src/index.ts`**
   - Fixed `null` handling: Initialize instead of abort

2. **`src/services/analyticsService.ts`**
   - Added explicit check: Skip energy calc if `capturedPreviousMs === null`
   - Applied to both `trackOutputChange()` and `trackBulkOutputChange()`

### Race Condition Resolution

✅ **Verified via Firebase transaction retry semantics:**
- If server wins: Client retry sees non-`null`, calculates negative time (skipped)
- If client wins: Client sees `null`, explicitly skips, server accounts for full duration
- **No double-counting in either case**

---

**Ready for deployment after review approval.**
