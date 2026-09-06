# Race Scenario: Server Tick vs Client OFF (Both Read Null Initially)

## Scenario Setup

**Timeline:**
- **T=1000ms:** User turns channel ON
  - `onAt/light2 = 1000`
  - `energyTick/light2 = null` (never initialized)

- **T=5000ms:** User turns channel OFF (only 4 seconds after ON)
  - Client `trackOutputChange()` starts executing

- **T=5001ms:** Server's periodic cycle happens to fire at nearly the same moment
  - Server `accumulateEnergyForDevice()` starts executing

**Race condition:** Both server and client attempt to transact on `energyTick/light2`, which is still `null` (server's first cycle hasn't run yet for this short ON period).

---

## Firebase RTDB Transaction Semantics

Firebase RTDB transactions use **optimistic locking with automatic retry**:

1. **Initial read:** Transaction callback invoked with current server value
2. **Compute new value:** Callback returns new value (or `undefined` to abort)
3. **Atomic compare-and-set:** Firebase attempts to write new value IF server value hasn't changed since read
4. **On conflict:** If server value changed (another writer committed), Firebase **re-invokes callback** with the NEW server value
5. **Retry until success or abort:** Callback may run multiple times until successful commit or explicit abort

**Key guarantee:** Only ONE transaction commits the FIRST write from `null → someValue`. The other transaction sees the updated value on retry.

---

## Detailed Race Timeline with Transaction Retries

### Phase 1: Both Start Transactions (Initial Read = null)

**T=5000ms — Client OFF transaction starts:**
```typescript
// Client: trackOutputChange(light2, false)
const tickRef = ref(rtdb, 'devices/device1/energyTick/light2');
let capturedPreviousMs: number | null = null;

// Transaction callback invoked (first attempt)
runTransaction(tickRef, (currentValue) => {
  capturedPreviousMs = currentValue;  // currentValue = null (read from server)
  
  if (currentValue === null) return null;  // Clear tick
  
  return null;
});
```

**Client's first attempt:**
- Reads: `currentValue = null`
- Captures: `capturedPreviousMs = null`
- Returns: `null` (clear tick)
- **Attempts atomic write:** `null → null` (no-op, but still an update)

---

**T=5001ms — Server tick transaction starts (1ms later):**
```typescript
// Server: accumulateEnergyForDevice(['light2'], ...)
const tickRef = rtdb.ref('devices/device1/energyTick/light2');
let capturedPreviousMs: number | null = null;

// Transaction callback invoked (first attempt)
tickRef.transaction((currentValue: number | null) => {
  capturedPreviousMs = currentValue;  // currentValue = null (read from server)
  
  if (currentValue === null) {
    // First tick — initialize
    return now;  // Return 5001 (server's now)
  }
  
  // ... rest of logic
});
```

**Server's first attempt:**
- Reads: `currentValue = null`
- Captures: `capturedPreviousMs = null`
- Returns: `5001` (initialize tick)
- **Attempts atomic write:** `null → 5001`

---

### Phase 2: Firebase Detects Conflict, Retries Loser

Firebase's atomic compare-and-set detects that two transactions tried to write concurrently from the same starting value (`null`). Only ONE succeeds.

**Case A: Client Wins First**

If client's transaction commits first:
- Client writes: `energyTick/light2 = null → null` (cleared)
- Server's transaction **fails** (server value changed from `null` to `null` ... actually, if client returns `null`, this is a clear/delete)

Actually, let me reconsider. When client returns `null` in the transaction, Firebase treats this as **setting the value to `null`**, not as "no change." So:

- Client commits: `energyTick/light2 = null` (explicitly set)
- Server's transaction detects conflict: expected `null`, but now it's... still `null` (but the version changed)

Wait, this is getting complex. Let me think about Firebase's actual behavior:

Firebase RTDB transactions use a **version/timestamp-based optimistic lock**. Even if the VALUE doesn't change (`null → null`), the **version** changes when a write occurs. So:

**Client wins race:**
1. Client transaction commits: `energyTick/light2 = null` (version V1 → V2)
2. Server transaction fails its compare-and-set (expected version V1, now V2)
3. **Server transaction callback RE-INVOKED** with current value
4. Server callback second attempt:
   - Reads: `currentValue = null` (client cleared it)
   - Captures: `capturedPreviousMs = null` (OVERWRITTEN from first attempt)
   - `currentValue === null` → Returns `5001` (initialize)
5. Server transaction commits: `energyTick/light2 = 5001` (version V2 → V3)

**After both complete:**
- `energyTick/light2 = 5001` (server initialized it)
- Client's `capturedPreviousMs = null` (from successful commit)
- Server's `capturedPreviousMs = null` (from second attempt that committed)

**Energy calculation:**
- Client: `previousTickMs = null || onAtMs = null || 1000 = 1000`
  - `elapsedSinceTick = (5000 - 1000) / 3600000 = 0.00111 hours`
  - `energyDelta = (40W / 1000) × 0.00111h = 0.0000444 kWh` ✓
- Server: `baselineMs = null || onAtMs = null || 1000 = 1000`
  - `elapsedHours = (5001 - 1000) / 3600000 = 0.00111 hours`
  - `energyDelta = (40W / 1000) × 0.00111h = 0.0000444 kWh` ✓

**PROBLEM:** Both calculated from the same baseline (1000), so we have **double-counting**!

Wait, no. Let me re-read the client code...

---

### Re-examining Client's Transaction Return Value

Looking at the actual client code:

```typescript
const transactionResult = await runTransaction(tickRef, (currentValue) => {
  capturedPreviousMs = currentValue;
  
  if (currentValue === null) return null;  // Clear tick
  
  return null;  // Clear tick (also this line, always clears)
});
```

The client ALWAYS returns `null`, regardless of `currentValue`. So the client's transaction is:
- Read `null` → write `null` (no-op? or version bump?)
- Read `5001` (on retry after server wins) → write `null` (clear the server's value)

Let me reconsider both cases more carefully.

---

## Corrected Analysis with Transaction Retry Semantics

### Scenario: Server Wins Race, Client Retries

**Timeline:**

**T=5001ms — Both transactions start nearly simultaneously**

**Server transaction (first attempt):**
- Reads: `currentValue = null`
- Captures: `capturedPreviousMs = null`
- Returns: `5001` (initialize tick)
- **Commits successfully FIRST:** `energyTick/light2 = 5001`

**Client transaction (first attempt):**
- Reads: `currentValue = null`
- Captures: `capturedPreviousMs = null`
- Returns: `null` (clear tick)
- **Fails compare-and-set** (server changed value from `null` → `5001`)

**Client transaction (RETRY — second attempt):**
- Reads: `currentValue = 5001` (server's update)
- Captures: `capturedPreviousMs = 5001` (**OVERWRITTEN**)
- `currentValue === null`? NO (it's 5001)
- Returns: `null` (clear tick)
- **Commits successfully:** `energyTick/light2 = null`

**Final state:**
- `energyTick/light2 = null` (client cleared it)
- Server's `capturedPreviousMs = null` (from successful first attempt)
- Client's `capturedPreviousMs = 5001` (from successful second attempt)

**Energy calculations:**
- Server: `baselineMs = null || 1000 = 1000`
  - `elapsedHours = (5001 - 1000) / 3600000 = 0.00111h`
  - `energyDelta = 0.0000444 kWh` ✓ [1000 → 5001]
  
- Client: `previousTickMs = 5001 || 1000 = 5001`
  - `elapsedSinceTick = (5000 - 5001) / 3600000 = -0.000000278h` (NEGATIVE!)
  - `if (elapsedSinceTick > 0)` → FALSE, skips energy calculation ✓

**Result:** ✅ Server calculates [1000 → 5001], client calculates nothing (negative elapsed time filtered out). **No double-counting.**

---

### Alternative: Client Wins Race, Server Retries

**Timeline:**

**T=5000ms — Both transactions start**

**Client transaction (first attempt):**
- Reads: `currentValue = null`
- Captures: `capturedPreviousMs = null`
- Returns: `null` (clear tick)
- **Commits successfully FIRST:** `energyTick/light2 = null`

**Server transaction (first attempt):**
- Reads: `currentValue = null`
- Captures: `capturedPreviousMs = null`
- Returns: `5001` (initialize tick)
- **Fails compare-and-set** (client changed value)

**Server transaction (RETRY — second attempt):**
- Reads: `currentValue = null` (client cleared it)
- Captures: `capturedPreviousMs = null` (**OVERWRITTEN**)
- `currentValue === null` → Returns `5001` (initialize)
- **Commits successfully:** `energyTick/light2 = 5001`

**BUT WAIT:** At T=5000, client already turned OFF the channel, so `onAt/light2` should be cleared by the client. Let me re-examine the client's full OFF logic:

```typescript
// Client OFF event
if (!transactionResult.committed) {
  // ... abort handling
  await update(rtdbOnAt(deviceId), { [key]: null });  // Still clear onAt
  return;
}

// ... energy calculation ...

// Clear onAt (marks channel as OFF in state tracking)
await update(rtdbOnAt(deviceId), { [key]: null });
```

The client clears `onAt` AFTER the transaction, regardless of commit success. So:

**T=5000:** Client clears `energyTick = null`, then clears `onAt/light2 = null`
**T=5001:** Server's RETRY attempt:
- By this point, `onAt/light2 = null` (client cleared it)
- Server's periodic function initially checked `onAt[light2] > 0` at T=5001 START
- But the channel list was captured BEFORE client cleared `onAt`

Actually, let me re-read the server code structure:

```typescript
export const periodicEnergyAccumulation = onSchedule(..., async (_event) => {
  // Get all devices
  const devicesSnapshot = await rtdb.ref('devices').once('value');
  const devices = devicesSnapshot.val();
  
  for (const deviceId of deviceIds) {
    const device = devices[deviceId];
    const onAt = device.onAt || {};
    
    // Check if any channels are currently ON
    const channelsOn = TRACKABLE.filter(key => onAt[key] > 0);
    
    if (channelsOn.length === 0) continue;
    
    await accumulateEnergyForDevice(deviceId, channelsOn, device);
  }
});
```

The server reads the ENTIRE device state once at the START of the cycle, then processes it. So:

**T=5001 (server cycle start):** Server reads device state
- `onAt/light2 = 1000` (client hasn't cleared it yet)
- `channelsOn = ['light2']` (included)

**T=5001 (server processes light2):** Starts transaction on `energyTick/light2`

**T=5000-5002 (client OFF event):** Client transaction + clears `onAt`
- Client's transaction may interleave with server's transaction

So yes, server captured `onAt/light2 = 1000` at the start, even though client cleared it mid-processing. This is fine — server will use stale `onAt` for energy calculation baseline.

**Server transaction RETRY (after client wins):**
- Reads: `currentValue = null` (client cleared tick)
- Captures: `capturedPreviousMs = null`
- Returns: `5001` (initialize)
- Commits: `energyTick/light2 = 5001`

**Energy calculations:**
- Client: `previousTickMs = null || 1000 = 1000`
  - `elapsedSinceTick = (5000 - 1000) / 3600000 = 0.00111h`
  - `energyDelta = 0.0000444 kWh` ✓ [1000 → 5000]
  
- Server: `baselineMs = null || 1000 = 1000`
  - `elapsedHours = (5001 - 1000) / 3600000 = 0.00111h`
  - `energyDelta = 0.0000444 kWh` ✓ [1000 → 5001]

**PROBLEM:** Both calculated from baseline 1000, window overlap [1000 → 5000] vs [1000 → 5001]. This IS double-counting (almost the entire duration).

---

## The Actual Problem

The race condition I described reveals a **genuine bug**: if client OFF happens before server's first tick, and they race on the null-to-non-null transition, BOTH can end up calculating energy from `onAtMs` as the baseline, causing overlap.

**Root cause:** Both transactions see `null`, both use `onAtMs` as fallback, both calculate from the same starting point.

**This happens because:**
1. Server initializes on `null`: `capturedPreviousMs = null → baselineMs = null || onAtMs`
2. Client clears from `null`: `capturedPreviousMs = null → previousTickMs = null || onAtMs`
3. Both use `onAtMs` as baseline → double-count the entire ON duration

---

## How to Actually Fix This

The issue is that BOTH the server's "initialize tick" logic and the client's "clear tick from null" logic use `onAtMs` as the fallback baseline. We need to distinguish these two cases.

**Solution:** Client should NOT calculate energy if it read `null` from the transaction, because `null` means "no server tick happened yet, so server will account for the full duration when it initializes."

Let me update the client code to handle this case correctly.
