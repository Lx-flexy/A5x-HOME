# PHASE 2: ANALYTICS EVENT LOG - IMPLEMENTATION SUMMARY

## ✅ IMPLEMENTATION COMPLETE

Added cloud-side runtime event audit trail to debug missing runtime incidents (e.g., device crashes while channel ON).

---

## What Was Implemented

### 1. Event Log System

**New Firestore Collection:**
```
devices/{deviceId}/runtimeEvents/{autoId}
```

**Document Schema:**
```typescript
{
  channel: "light2" | "light3" | "fan1" | "custom1",
  event: "ON" | "OFF",
  timestamp: <serverTimestamp>,
  accumulatorValueAfter: number,  // Runtime hours after this event
  energyValueAfter: number,       // Total kWh after this event
  ttlExpireAt: <timestamp>        // Auto-delete after 7 days
}
```

---

### 2. Integration Points

**trackOutputChange():** Single channel ON/OFF
- ON event: Logs current accumulator state BEFORE turning ON
- OFF event: Logs NEW accumulator state AFTER transaction commits

**trackBulkOutputChange():** All ON/All OFF buttons
- ON events: Logs current accumulator state for each channel
- OFF events: Logs NEW accumulator state after batch update

**Non-blocking:** Event logging wrapped in try-catch, failures don't stop main flow

---

### 3. Retention Strategy

**Firestore TTL Policy (Recommended):**
- Each event has `ttlExpireAt` field set to +7 days from creation
- Firebase auto-deletes expired documents (~72h gradual cleanup)
- Zero cost, zero maintenance

**Alternative:** Scheduled Cloud Function cleanup (rejected due to cost/complexity)

**Justification:** See `PHASE_2_RETENTION_PROPOSAL.md`

---

## Files Modified

### src/services/analyticsService.ts

**New Additions:**
1. `RuntimeEvent` interface (Lines 27-35)
2. `logRuntimeEvent()` helper function (Lines 105-141)
3. Import: `addDoc`, `Timestamp` from `firebase/firestore`

**Integration Changes:**
1. `trackOutputChange()` - ON event logging (Lines 306-317)
2. `trackOutputChange()` - OFF event logging (Lines 471-478)
3. `trackBulkOutputChange()` - ON/OFF event collection (Lines 528-543)
4. `trackBulkOutputChange()` - OFF event logging (Lines 635-674)
5. `trackBulkOutputChange()` - ON event logging (Lines 680-693)

**Total Lines Added:** ~120 lines
**Total New Firestore Writes:** +2 per ON/OFF cycle (one device)

---

## What Was NOT Changed

✅ **No firmware changes** (ESP32 code untouched)
✅ **No changes to accumulator logic** (trackOutputChange/trackBulkOutputChange math)
✅ **No changes to liveRuntime()** (frontend live clock)
✅ **No changes to computeTotals()** (aggregation)
✅ **No changes to Math.max()** (total runtime calculation)
✅ **No changes to frontend display** (Analytics.tsx reads only)

**Event log is debugging-only** — frontend never reads from `runtimeEvents` collection.

---

## Cost Impact

### Firestore Writes Added

**Per device typical usage:**
- 4 channels × 20 ON/OFF cycles/day = 80 writes/day
- Single device with heavy usage = ~100 writes/day
- 10 devices = ~1,000 writes/day

**Firestore Free Tier:**
- 20,000 writes/day (per project)
- 1 GB storage (per project)

**Cost at scale:**
- 10 devices = 5% of free tier (negligible)
- 100 devices = 50% of free tier (acceptable)
- Beyond free tier: $0.18 per 100K writes

**Conclusion:** Cost impact minimal for typical deployment (1-50 devices).

---

## Build Verification

```powershell
npm run build
```

**Result:** ✅ Build successful (34.44s)
- No TypeScript errors
- No Firebase import issues
- Bundle size: 1.2MB (within normal range)

---

## Deployment Readiness

### ✅ Code Complete
- All integration points implemented
- Helper function tested (syntax verified via build)
- Non-blocking error handling in place

### ✅ Documentation Complete
- `PHASE_2_IMPLEMENTATION_COMPLETE.md` - Full code documentation
- `PHASE_2_RETENTION_PROPOSAL.md` - TTL policy justification
- `DEPLOYMENT_INSTRUCTIONS.md` - Step-by-step testing guide

### ⏳ Awaiting User Action
1. Deploy to Firebase: `firebase deploy`
2. Test one ON→OFF cycle on real device (A5X-HA-2847)
3. Provide evidence:
   - Screenshot of Firestore `runtimeEvents` collection
   - Screenshot of Firebase Console usage (Firestore writes/day)
   - Confirmation that accumulator values are unchanged
4. Configure Firestore TTL policy in Console (one-time setup)

---

## How to Use Event Log (Post-Deployment)

### Detect Missing Runtime Events

**Scenario:** Device shows 3h runtime but expected 5h (2h gap).

**Query Firestore:**
```typescript
const eventsRef = collection(db, 'devices/A5X-HA-2847/runtimeEvents');
const q = query(
  eventsRef,
  where('channel', '==', 'fan1'),
  where('timestamp', '>=', startOfDay),
  orderBy('timestamp', 'asc')
);
const events = await getDocs(q);
```

**Expected sequence:**
```
10:00 AM - ON event (accumulator: 0h)
11:30 AM - OFF event (accumulator: 1.5h) ✅
12:00 PM - ON event (accumulator: 1.5h)
[MISSING OFF EVENT] ❌ ← Device crashed here
3:00 PM - ON event (accumulator: 1.5h) ← Restart after crash
```

**Conclusion:**
- Gap detected between 12:00 PM and 3:00 PM
- Indicates device crash/reboot while channel ON
- Lost runtime: ~3 hours
- Explains accumulator discrepancy

---

## Debugging Checklist

### If Event Log Shows Gaps

1. **Correlate with Cloud Function logs**
   - Check `automaticDailyRollover` execution time
   - Look for errors/timeouts around gap time

2. **Check ESP32 logs** (if available)
   - Look for crash dump or reboot message
   - Check network disconnect events

3. **Verify accumulator math**
   - Cross-reference `accumulatorValueAfter` from last OFF event
   - Compare with RTDB `analytics/{channel}Runtime` current value
   - Gap = missing runtime

4. **Check for concurrent OFF events**
   - If two OFF events for same channel within seconds = race condition
   - Should be prevented by transaction, but worth checking

---

## Next Steps

### Immediate (Required for Sign-Off)

1. **Deploy:** `npm run build && firebase deploy`
2. **Test:** One ON→OFF cycle on real device
3. **Screenshot:** Firestore `runtimeEvents` collection (2 documents)
4. **Screenshot:** Firebase Console usage (Firestore writes/day)
5. **Confirm:** Accumulator values unchanged

### Post-Deployment (Recommended)

1. **Configure TTL policy** in Firebase Console (one-time, 5 minutes)
2. **Monitor Firestore usage** for 7 days (confirm within budget)
3. **Test gap detection** if/when runtime anomaly occurs again

### Future Enhancements (Optional)

1. **Dashboard visualization:** Show recent ON/OFF events in Analytics page
2. **Anomaly alerts:** Email notification if gap detected (Cloud Function)
3. **Export to CSV:** Download event log for offline analysis

---

## Success Metrics

### Phase 2 is COMPLETE when:

✅ Event log writes ON/OFF events to Firestore
✅ Documents contain all required fields (6 fields)
✅ Existing accumulator logic unchanged/correct
✅ Firestore usage within acceptable limits (+80 writes/day per device)
✅ TTL policy configured (or plan to configure)

### Phase 2 is SUCCESSFUL when:

✅ Next runtime anomaly is debuggable via event log
✅ Gap detection identifies crash/reboot timing
✅ No false positives (normal operation doesn't trigger gaps)
✅ Cost remains within free tier or budget

---

## Key Design Decisions

### 1. Piggyback vs. New Trigger Path
**Decision:** Piggyback on existing functions
**Reason:** Avoids new failure point, ensures event log matches actual accumulator updates

### 2. TTL Policy vs. Cloud Function Cleanup
**Decision:** Firestore TTL policy
**Reason:** Zero cost, zero maintenance, perfectly adequate for debugging use case

### 3. Event Timing
**Decision:** 
- ON event: BEFORE turning ON (captures starting state)
- OFF event: AFTER transaction commits (captures ending state)
**Reason:** Ensures `accumulatorValueAfter` is always accurate for cross-referencing

### 4. Error Handling
**Decision:** Non-blocking try-catch around event logging
**Reason:** Debugging is secondary to core functionality, event log failure should never break device control

---

## Documentation Index

1. **PHASE_1_INVESTIGATION_REPORT.md** - Where `onAt` is written (3 locations)
2. **PHASE_1_CLARIFICATIONS.md** - Transaction details and Cloud Function code
3. **PHASE_2_RETENTION_PROPOSAL.md** - TTL policy vs. Cloud Function analysis
4. **PHASE_2_IMPLEMENTATION_COMPLETE.md** - Full updated function code (no elisions)
5. **DEPLOYMENT_INSTRUCTIONS.md** - Step-by-step testing guide
6. **PHASE_2_SUMMARY.md** - This document (overview)

---

## Final Checklist

- [x] Code implementation complete
- [x] Build verification passed
- [x] Documentation complete
- [x] Retention strategy proposed and justified
- [ ] User deployment (awaiting)
- [ ] User testing (awaiting)
- [ ] Evidence screenshots (awaiting)
- [ ] TTL policy configuration (awaiting)

---

**Status:** READY FOR DEPLOYMENT 🚀

**Next:** User must follow `DEPLOYMENT_INSTRUCTIONS.md` and provide evidence.
