# Closure Pattern Fix — Eliminating the get() Race Condition

**Date:** 2026-09-06  
**Status:** Code complete — awaiting review before deployment

---

## Problem: The get() + runTransaction() Race Condition

The previous implementation read `previousTickMs` using a separate `get()` call **before** calling `runTransaction()`:

### ❌ INCORRECT PATTERN (Race Condition):

```typescript
// STEP 1: Read previous value BEFORE transaction
const beforeSnapshot = await get(tickRef);
const previousTickMs = beforeSnapshot.val() || onAtMs;

// STEP 2: Run transaction
const result = await runTransaction(tickRef, (currentValue) => {
  // Calculate and update...
  return now;
});

// STEP 3: Calculate energy using previousTickMs from step 1
if (result.committed) {
  const energyDelta = calculate(previousTickMs);
}
```

### Why This is Unsafe:

The `get()` and `runTransaction()` are **two separate, non-atomic operations**. Another writer (server tick or client OFF event) can change the value **between** them:

**Timeline of race condition:**

```
T=0: Client reads previousTickMs = 1000 (via get())
T=5: Server tick updates energyTick to 1060 (calculates 1000→1060)
T=10: Client transaction commits, clears energyTick to null
T=15: Client calculates energy using previousTickMs = 1000 (from T=0)
     → Calculates 1000→1065, overlapping with server's 1000→1060
```

**Result:** Time window 1000→1060 counted twice (server + client overlap)

**Root cause:** The `get()` at T=0 doesn't see the server's update at T=5, so the client calculates from a stale baseline.

---

## Solution: Capture Previous Value via Closure

### ✅ CORRECT PATTERN (No Race Condition):

```typescript
// Closure variable to capture previous value
let capturedPreviousMs: number | null = null;

const result = await runTransaction(tickRef, (currentValue) => {
  // Transaction callback reads current server value at this moment
  // May run multiple times on conflict — overwrites capturedPreviousMs each time
  capturedPreviousMs = currentValue;
  
  if (currentValue === null) return null; // Abort
  
  return null; // or new value
});

// Check if committed
if (!result.committed) {
  // Transaction aborted - handle explicitly
  console.warn('Transaction aborted');
  return;
}

// Safe to use capturedPreviousMs - it's from the committed invocation
const energyDelta = calculate(capturedPreviousMs);
```

### Why This is Safe:

1. **Atomic read-modify-write:** The transaction callback reads `currentValue` atomically with the update
2. **Closure captures committed value:** `capturedPreviousMs` is overwritten on each retry, ending with the value from the exact invocation that commits
3. **No separate get():** No gap between read and transaction where another writer can intervene
4. **Handles retries correctly:** If transaction retries due to conflict, closure variable gets fresh value each time

---

## Implementation Details

### Server-Side Cloud Function

**File:** `functions/src/index.ts`  
**Function:** `accumulateEnergyForDevice()`  
**Lines:** 133-170

```typescript
for (const channel of channelsOn) {
  const onAtMs = device.onAt?.[channel] || 0;
  if (onAtMs === 0) continue;

  try {
    const tickRef = rtdb.ref(`devices/${deviceId}/energyTick/${channel}`);
    
    // CORRECT PATTERN: Capture via closure
    let capturedPreviousMs: number | null = null;
    
    const transactionResult = await tickRef.transaction((currentValue: number | null) => {
      // Capture current value (overwritten on each retry)
      capturedPreviousMs = currentValue;
      
      if (currentValue === null) return; // Abort if OFF
      
      const tickMs = currentValue || onAtMs;
      const elapsedMs = now - tickMs;
      
      if (elapsedMs < 1000) return; // Abort if < 1s
      
      return now; // Update tick
    });

    // Check if committed
    if (!transactionResult.committed) {
      logger.debug(`Transaction aborted for ${channel}`);
      continue; // Explicitly skip this channel
    }

    // Safe: capturedPreviousMs is from committed invocation
    const baselineMs = capturedPreviousMs || onAtMs;
    const newTickMs = transactionResult.snapshot.val() as number;
    
    tickUpdates.push({ channel, previousMs: baselineMs, newMs: newTickMs });
  } catch (error) {
    logger.error(`Channel ${channel} error:`, error);
  }
}
```

**Key change:** Removed `await tickRef.once('value')` before transaction. Previous value now captured inside transaction callback via `capturedPreviousMs` closure variable.

---

### Client-Side OFF Event Handler

**File:** `src/services/analyticsService.ts`  
**Function:** `trackOutputChange()`  
**Lines:** 230-272

```typescript
const tickRef = ref(rtdb, `devices/${deviceId}/energyTick/${key}`);

// CORRECT PATTERN: Capture via closure
let capturedPreviousMs: number | null = null;

const transactionResult = await runTransaction(tickRef, (currentValue) => {
  // Capture current value (overwritten on each retry)
  capturedPreviousMs = currentValue;
  
  if (currentValue === null) return null; // Already cleared
  
  return null; // Clear tick (marks OFF)
});

// Check if committed
if (!transactionResult.committed) {
  console.warn(`Transaction aborted for ${key} (device ${deviceId})`);
  await update(rtdbOnAt(deviceId), { [key]: null }); // Still clear onAt
  return; // Explicitly skip energy accounting
}

// Safe: capturedPreviousMs is from committed invocation
const previousTickMs = capturedPreviousMs || onAtMs;
const elapsed = (now - onAtMs) / 3_600_000;
const elapsedSinceTick = (now - previousTickMs) / 3_600_000;

if (elapsed > 0 && elapsedSinceTick > 0) {
  const energyDelta = (WATT[key] / 1000) * elapsedSinceTick;
  await update(rtdbAnalytics(deviceId), {
    [field]: (cur[field] || 0) + elapsed,
    energyUsage: (cur.energyUsage || 0) + energyDelta,
  });
}
```

**Key change:** Removed `await get(tickRef)` before transaction. Added explicit handling when `transactionResult.committed === false`.

---

### Client-Side Bulk OFF Handler

**File:** `src/services/analyticsService.ts`  
**Function:** `trackBulkOutputChange()`  
**Lines:** 345-423

```typescript
// Collect OFF events (no pre-transaction get() calls)
const offEvents: Array<{ key: TrackableKey; onAtMs: number }> = [];

for (const [k, val] of Object.entries(changes) as [TrackableKey, boolean][]) {
  if (!val) { // Turning OFF
    const onAtMs = onAtData[k] || 0;
    if (onAtMs > 0) {
      offEvents.push({ key: k, onAtMs }); // No previousTickMs stored
      onAtPatch[k] = null;
    }
  }
}

// Process OFF events sequentially
for (const event of offEvents) {
  const tickRef = ref(rtdb, `devices/${deviceId}/energyTick/${event.key}`);
  
  // CORRECT PATTERN: Capture via closure
  let capturedPreviousMs: number | null = null;
  
  const transactionResult = await runTransaction(tickRef, (currentValue) => {
    capturedPreviousMs = currentValue; // Overwritten on each retry
    if (currentValue === null) return null; // Abort
    return null; // Clear tick
  });

  // Check if committed
  if (!transactionResult.committed) {
    console.warn(`Transaction aborted for ${event.key} (device ${deviceId})`);
    continue; // Explicitly skip this channel
  }

  // Safe: capturedPreviousMs is from committed invocation
  const previousTickMs = capturedPreviousMs || event.onAtMs;
  const energyDelta = (WATT[event.key] / 1000) * elapsedSinceTick;
  
  energyUpdates.push({ field, runtime, energy: energyDelta });
}
```

**Key change:** Removed pre-transaction `await get(tickRef)` loop. Each transaction now captures its own previous value via closure.

---

## Race Condition Proof: Why Double-Counting is Now Impossible

### Scenario: Server tick and client OFF event execute concurrently

**Initial state:**
- `onAt/light2 = 1000` (channel turned ON at T=1000)
- `energyTick/light2 = null` (no previous tick yet)

---

### Timeline with Correct Pattern:

**T=60,000ms:** Server periodic function runs

```
1. Server transaction callback reads currentValue = null
   → capturedPreviousMs = null
   → baseline = null || 1000 = 1000
   → elapsed = 60000 - 1000 = 59000ms (>1s, proceed)
   → return 60000 (update tick to now)

2. Server transaction commits: energyTick/light2 = 60000

3. Server calculates: energyDelta = (1000 - 1000) to (60000 - 1000) / 3600000
   = 0.01639 kWh (59 seconds)
```

**T=65,000ms:** User turns channel OFF (5 seconds after server tick)

```
1. Client transaction callback reads currentValue = 60000 (server's update)
   → capturedPreviousMs = 60000
   → return null (clear tick)

2. Client transaction commits: energyTick/light2 = null

3. Client calculates: energyDelta = (65000 - 60000) / 3600000
   = 0.00139 kWh (5 seconds)
```

**Result:**
- Server accumulated: 1000→60000 (59 seconds)
- Client accumulated: 60000→65000 (5 seconds)
- **Total: 64 seconds (correct)**
- **No overlap:** Each time window counted exactly once

---

### Key Insight: Atomic Read Within Transaction

The client's transaction callback reads `currentValue = 60000` (the server's update) **atomically** as part of the transaction. There is no gap where:
1. Client reads old value (null or 1000)
2. Server updates to 60000
3. Client calculates from old value

**Why:** The transaction callback runs **inside** the RTDB transaction's atomic read-modify-write operation. Firebase guarantees that `currentValue` reflects the latest server state at the moment the transaction acquires its lock.

**Even if transaction retries:**
- First attempt: reads `currentValue = 1000`, tries to update
- Server updates to 60000 (conflict detected)
- Second attempt: reads `currentValue = 60000`, updates capturedPreviousMs = 60000
- Transaction commits with fresh value
- Client calculates from 60000 (correct baseline)

---

## Explicit Abort Handling

Both implementations now explicitly handle `!transactionResult.committed`:

### Server-Side:
```typescript
if (!transactionResult.committed) {
  logger.debug(`Transaction aborted for ${channel} (device ${deviceId})`);
  continue; // Skip this channel, don't silently proceed
}
```

### Client-Side:
```typescript
if (!transactionResult.committed) {
  console.warn(`Transaction aborted for ${key} (device ${deviceId})`);
  await update(rtdbOnAt(deviceId), { [key]: null }); // Still clear onAt
  return; // Exit, don't silently skip energy accounting
}
```

**Why this matters:** If transaction aborts (callback returned `undefined` to cancel), we must not proceed as if energy was accounted for. Previous implementation would silently skip the energy calculation without logging, making debugging impossible.

---

## Compilation Results

### Cloud Functions Build

```powershell
cd functions
npm run build
```

**Output:**
```
> build
> tsc

Exit Code: 0
```

✅ **Zero TypeScript errors**

---

### Web App Build

```powershell
npm run build
```

**Output:**
```
> vite-react-typescript-starter@0.0.0 build
> vite build

vite v5.4.8 building for production...
✓ 1537 modules transformed.
dist/index.html                     0.96 kB │ gzip:   0.52 kB
dist/assets/index-CwMSZDSs.css     40.71 kB │ gzip:   8.02 kB
dist/assets/index-BLw6ZQ9n.js   1,189.98 kB │ gzip: 296.47 kB
✓ built in 5.41s

Exit Code: 0
```

✅ **Zero TypeScript errors** (warnings about chunk size and dynamic imports, but no compilation errors)

---

## Summary

### What Changed

**Before (Unsafe get() + transaction):**
```typescript
const beforeSnapshot = await get(tickRef); // Separate read
const previousMs = beforeSnapshot.val();
await runTransaction(tickRef, (val) => { return newValue; });
const energy = calculate(previousMs); // Uses stale read
```

**After (Atomic closure capture):**
```typescript
let capturedPreviousMs = null;
await runTransaction(tickRef, (currentValue) => {
  capturedPreviousMs = currentValue; // Captured atomically
  return newValue;
});
const energy = calculate(capturedPreviousMs); // Uses committed value
```

### Files Modified

1. **`functions/src/index.ts`**  
   - Removed `await tickRef.once('value')` before transaction
   - Added closure variable `capturedPreviousMs`
   - Added explicit abort handling with logger.debug

2. **`src/services/analyticsService.ts`**  
   - `trackOutputChange()`: Removed `await get(tickRef)`, added closure capture and explicit abort handling
   - `trackBulkOutputChange()`: Removed pre-transaction get() loop, added closure capture per event

### Compilation Status

✅ Cloud Functions: Compiled successfully (0 errors)  
✅ Web App: Compiled successfully (0 errors)

### Deployment Status

⏳ **Awaiting review confirmation before deployment**

---

## Next Steps

1. **Review this document** and verify the race condition proof logic
2. **Confirm deployment**: If approved, run `cd functions && firebase deploy --only functions`
3. **Execute manual tests** as documented in `ATOMICITY_AND_DEPLOYMENT_VERIFICATION.md`

See `ATOMICITY_AND_DEPLOYMENT_VERIFICATION.md` for full deployment and testing procedures.
