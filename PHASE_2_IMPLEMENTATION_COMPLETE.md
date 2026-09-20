# PHASE 2: IMPLEMENTATION COMPLETE ✅

## Summary

Added cloud-side runtime event audit log to `devices/{deviceId}/runtimeEvents` Firestore collection. Piggybacks on existing `trackOutputChange()` and `trackBulkOutputChange()` functions with zero firmware changes.

---

## Implementation Details

### 1. New RuntimeEvent Type

**File:** `src/services/analyticsService.ts` Lines 27-35

```typescript
export interface RuntimeEvent {
  id?: string;
  channel: string;
  event: 'ON' | 'OFF';
  timestamp: unknown;
  accumulatorValueAfter: number;
  energyValueAfter: number;
  ttlExpireAt: unknown;  // Auto-delete after 7 days
}
```

---

### 2. logRuntimeEvent() Helper Function

**File:** `src/services/analyticsService.ts` Lines 105-141

```typescript
/**
 * Log runtime event to Firestore for audit trail and debugging.
 * Writes to: devices/{deviceId}/runtimeEvents/{autoId}
 * 
 * PURPOSE: Capture ON/OFF events with accumulator state for crash/gap detection.
 * If device crashes while ON, the missing OFF event will be detectable as a gap.
 * 
 * RETENTION: 7-day TTL via Firestore TTL policy (see firebase.json)
 * 
 * @param deviceId Device ID
 * @param channel Channel key (light2, light3, fan1, custom1)
 * @param event ON or OFF
 * @param accumulatorValue Runtime hours after this event
 * @param energyValue Total energy kWh after this event
 */
async function logRuntimeEvent(
  deviceId: string,
  channel: string,
  event: 'ON' | 'OFF',
  accumulatorValue: number,
  energyValue: number
): Promise<void> {
  try {
    const now = new Date();
    const ttlExpireAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // +7 days
    
    const eventData: Omit<RuntimeEvent, 'id'> = {
      channel,
      event,
      timestamp: serverTimestamp(),
      accumulatorValueAfter: accumulatorValue,
      energyValueAfter: energyValue,
      ttlExpireAt: Timestamp.fromDate(ttlExpireAt),
    };
    
    await addDoc(collection(db, `devices/${deviceId}/runtimeEvents`), eventData);
  } catch (err) {
    // Non-fatal: event log is for debugging only, don't block main flow
    console.warn(`[logRuntimeEvent] Failed for ${deviceId}/${channel}:`, err);
  }
}
```

**Key Features:**
- Non-blocking: Wrapped in try-catch, failures logged but don't stop main flow
- TTL field: Auto-expires after 7 days (Firestore TTL policy)
- Minimal overhead: Single Firestore write per ON/OFF event

---

### 3. trackOutputChange() Integration

**File:** `src/services/analyticsService.ts` Lines 298-502

#### ON Event Logging (Lines 306-317)

```typescript
if (value) {
  // Turning ON — record start timestamp
  await update(rtdbOnAt(deviceId), { [key]: Date.now() });
  
  // Log ON event with current accumulator state
  const field = runtimeField(key);
  const analyticsSnap = await get(rtdbAnalytics(deviceId));
  const analytics = (analyticsSnap.val() as Record<string, number>) || {};
  const currentRuntime = analytics[field] || 0;
  const currentEnergy = analytics['energyUsage'] || 0;
  
  await logRuntimeEvent(deviceId, key, 'ON', currentRuntime, currentEnergy);
}
```

**Captures:** Current accumulator state BEFORE channel turns ON

---

#### OFF Event Logging (Lines 471-478)

```typescript
// Check transaction result
if (!transactionResult.committed) {
  console.warn(`[trackOutputChange] Analytics transaction aborted for ${key} (device ${deviceId})`);
  await update(rtdbOnAt(deviceId), { [key]: null });
  return;
}

// Log OFF event with NEW accumulator values from transaction
const updatedAnalytics = transactionResult.snapshot.val() as Record<string, number>;
const newRuntime = updatedAnalytics[field] || 0;
const newEnergy = updatedAnalytics['energyUsage'] || 0;
await logRuntimeEvent(deviceId, key, 'OFF', newRuntime, newEnergy);

const today = todayStr();
await flushDayToFirestore(deviceId, today);
```

**Captures:** NEW accumulator state AFTER transaction commits (includes this OFF event's runtime)

---

### 4. trackBulkOutputChange() Integration

**File:** `src/services/analyticsService.ts` Lines 506-701

#### ON Events Collection (Lines 528-543)

```typescript
// Collect ON/OFF changes
const offEvents: Array<{ key: TrackableKey; onAtMs: number }> = [];
const onEvents: TrackableKey[] = [];

for (const [k, val] of Object.entries(changes) as [TrackableKey, boolean][]) {
  if (val) {
    // Turning ON
    onAtPatch[k] = now;
    onEvents.push(k);  // ← Track for event logging
  } else {
    // Turning OFF - prepare for transaction
    const onAtMs = onAtData[k] || 0;
    if (onAtMs > 0) {
      offEvents.push({ key: k, onAtMs });
      onAtPatch[k] = null;
    }
  }
}
```

---

#### OFF Events Logging (Lines 635-674)

```typescript
// Track final values for event logging
const finalValues: Record<string, { runtime: number; energy: number }> = {};

for (const update of energyUpdates) {
  // ... validation and cap logic ...
  
  const newRuntime = Math.min(currentRuntime + update.runtime, MAX_DAILY_HOURS);
  analyticsPatch[update.field] = newRuntime;
  totalEnergy += update.energy;
  
  // Store final values for event logging
  finalValues[update.channelKey] = {
    runtime: newRuntime,
    energy: totalEnergy,
  };
}
analyticsPatch['energyUsage'] = totalEnergy;

await update(rtdbAnalytics(deviceId), analyticsPatch);

// Log OFF events with NEW accumulator values
for (const channelKey of Object.keys(finalValues)) {
  const values = finalValues[channelKey];
  await logRuntimeEvent(deviceId, channelKey, 'OFF', values.runtime, values.energy);
}

await flushDayToFirestore(deviceId, todayStr());
```

---

#### ON Events Logging (Lines 680-693)

```typescript
// Log ON events with current accumulator state
if (onEvents.length > 0) {
  const analyticsSnap = await get(rtdbAnalytics(deviceId));
  const analytics = (analyticsSnap.val() as Record<string, number>) || {};
  const currentEnergy = analytics['energyUsage'] || 0;
  
  for (const key of onEvents) {
    const field = runtimeField(key);
    const currentRuntime = analytics[field] || 0;
    await logRuntimeEvent(deviceId, key, 'ON', currentRuntime, currentEnergy);
  }
}
```

---

## Event Log Document Structure

### Example ON Event

```json
{
  "channel": "fan1",
  "event": "ON",
  "timestamp": "2025-01-13T10:30:00.000Z",
  "accumulatorValueAfter": 12.5,
  "energyValueAfter": 0.3125,
  "ttlExpireAt": "2025-01-20T10:30:00.000Z"
}
```

### Example OFF Event

```json
{
  "channel": "fan1",
  "event": "OFF",
  "timestamp": "2025-01-13T12:45:00.000Z",
  "accumulatorValueAfter": 14.75,
  "energyValueAfter": 0.36875,
  "ttlExpireAt": "2025-01-20T12:45:00.000Z"
}
```

---

## Retention Strategy: Firestore TTL Policy

**Decision:** Use native Firestore Time-to-Live (TTL) expiration ✅

### Configuration Required

**Firebase Console → Firestore → Settings → Time-to-live policies:**

1. Collection path: `devices/{deviceId}/runtimeEvents`
2. TTL field: `ttlExpireAt`
3. Deletion mode: Auto-delete when `ttlExpireAt < current_time`

### Why TTL vs. Scheduled Cloud Function?

| Feature | TTL Policy | Cloud Function |
|---------|-----------|----------------|
| Cost | $0 (included) | $0.40/month minimum + read costs |
| Setup | Console config + 1 field | Deploy function + code |
| Maintenance | Zero | Ongoing monitoring |
| Reliability | Firebase SLA | Custom code can fail |
| Deletion speed | ~72h gradual | Instant (but costlier) |

**Justification:** TTL is simpler, cheaper, zero-maintenance, and perfectly adequate for debugging/audit use case.

See: `PHASE_2_RETENTION_PROPOSAL.md` for full analysis.

---

## Code Changes Summary

### Files Modified

1. **`src/services/analyticsService.ts`**
   - Added `RuntimeEvent` interface (Lines 27-35)
   - Added `logRuntimeEvent()` helper function (Lines 105-141)
   - Updated imports: `addDoc`, `Timestamp` from `firebase/firestore`
   - Integrated event logging into `trackOutputChange()` (Lines 306-502)
   - Integrated event logging into `trackBulkOutputChange()` (Lines 506-701)

### New Firestore Writes

**Per-device per-day estimate:**
- Typical usage: ~10-20 ON/OFF cycles per channel per day
- 4 channels × 20 cycles = 80 events/day
- Each event = 1 Firestore write
- **Total added: ~80 Firestore writes/device/day**

**Cost Impact:**
- Firestore free tier: 20,000 writes/day
- Single device: 80 writes (0.4% of free tier)
- 10 devices: 800 writes (4% of free tier)
- **Conclusion:** Negligible cost for typical deployment

---

## Testing Instructions

### Before Testing: Record Baseline

1. Open Firebase Console → Usage tab
2. Screenshot current Firestore writes/day (baseline: 10 writes today, 232 peak)
3. Check current accumulator values:
   ```javascript
   // In browser console on Analytics page
   console.log(JSON.stringify({
     light2Runtime: /* value from RTDB */,
     light3Runtime: /* value from RTDB */,
     fan1Runtime: /* value from RTDB */,
     custom1Runtime: /* value from RTDB */,
     energyUsage: /* value from RTDB */
   }));
   ```

### Test Procedure

1. **Turn ON one channel** (e.g., Fan/X4)
   - Expected: 1 Firestore write to `runtimeEvents` with `event: "ON"`

2. **Wait 2-5 minutes** (let some runtime accumulate)

3. **Turn OFF the same channel**
   - Expected: 1 Firestore write to `runtimeEvents` with `event: "OFF"`

4. **Verify Firestore entries:**
   - Open Firebase Console → Firestore → `devices/A5X-HA-2847/runtimeEvents`
   - Should see 2 documents (ON + OFF)
   - Screenshot for evidence

5. **Verify accumulator unchanged:**
   - Check RTDB `analytics/fan1Runtime` before/after
   - Should match (within normal tolerance)

6. **Check Firestore usage:**
   - Firebase Console → Usage tab
   - Compare writes/day vs. baseline
   - Expected delta: +2 writes (ON + OFF events)

---

## Evidence Checklist

- [ ] **Full updated code:** trackOutputChange() + trackBulkOutputChange() (DONE, documented above)
- [ ] **Firestore screenshot:** Real entries after ON→OFF cycle on actual device (USER MUST PROVIDE)
- [ ] **Firestore usage:** Updated writes/day vs. baseline (USER MUST PROVIDE)
- [ ] **Accumulator verification:** Before/after values unchanged (USER MUST PROVIDE)

---

## Implementation Status

✅ **Code implementation complete**
✅ **Retention policy proposed and justified** (TTL policy)
✅ **Documentation complete**

⏳ **Awaiting user evidence:**
1. Screenshot of Firestore `runtimeEvents` collection after real ON→OFF cycle
2. Firebase Console usage screenshot (Firestore writes/day comparison)
3. Confirmation that existing accumulator values are unchanged

---

## How to Debug Missing Runtime Events (Use Case)

### Scenario
Device shows runtime gap: Fan was ON at 10:00 AM, expected 5h runtime by 3:00 PM, but accumulator only shows 3h.

### Investigation Steps

1. **Query Firestore event log:**
   ```javascript
   const eventsRef = collection(db, 'devices/A5X-HA-2847/runtimeEvents');
   const q = query(
     eventsRef,
     where('channel', '==', 'fan1'),
     where('timestamp', '>=', startOfDay),
     orderBy('timestamp', 'asc')
   );
   const events = await getDocs(q);
   ```

2. **Analyze event sequence:**
   ```
   10:00 AM - ON event (accumulator: 0h)
   11:30 AM - OFF event (accumulator: 1.5h) ✅
   12:00 PM - ON event (accumulator: 1.5h)
   [MISSING OFF EVENT] ❌ ← Device crashed or rebooted here
   3:00 PM - ON event (accumulator: 1.5h) ← Restart after crash
   ```

3. **Conclusion:**
   - Gap detected: No OFF event between 12:00 PM and 3:00 PM
   - Indicates device crash/reboot while channel ON
   - Lost runtime: ~3 hours (12:00 PM to 3:00 PM)
   - Explains accumulator discrepancy

4. **Correlation with other signals:**
   - Check Cloud Function logs for rollover timing
   - Check ESP32 logs for crash dump (if available)
   - Check network logs for disconnect event

---

## What Was NOT Changed (As Required)

✅ **No firmware changes** (ESP32 code untouched)
✅ **No changes to `liveRuntime()`** (frontend live clock logic)
✅ **No changes to `computeTotals()`** (aggregation logic)
✅ **No changes to `Math.max()`** (total runtime calculation)
✅ **No changes to frontend display logic** (Analytics.tsx reads only)

**Event log is write-only from frontend's perspective** — exists purely for backend debugging via Firebase Console.

---

## Next Steps

**USER ACTION REQUIRED:**

1. Deploy changes: `npm run build && firebase deploy`
2. Test one ON→OFF cycle on real device (A5X-HA-2847)
3. Provide screenshots:
   - Firestore `runtimeEvents` collection (should show 2 documents)
   - Firebase Console Usage tab (Firestore writes comparison)
4. Confirm accumulator values unchanged (before/after testing)
5. Configure Firestore TTL policy in Firebase Console (one-time setup)

**Once evidence provided, Phase 2 can be marked complete.** ✅
