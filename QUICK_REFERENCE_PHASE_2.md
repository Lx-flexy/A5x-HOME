# PHASE 2: QUICK REFERENCE CARD

## 🎯 Goal
Debug missing runtime events (device crashes while channel ON) using cloud-side event audit trail.

---

## 📦 What Was Added

### New Collection
```
devices/A5X-HA-2847/runtimeEvents/{autoId}
```

### Document Fields (6 total)
```typescript
{
  channel: "fan1",                    // Which channel
  event: "ON" | "OFF",                // What happened
  timestamp: <serverTimestamp>,       // When
  accumulatorValueAfter: 12.5,        // Runtime hours after event
  energyValueAfter: 0.3125,           // Total kWh after event
  ttlExpireAt: <+7 days>              // Auto-delete date
}
```

---

## 🔧 Functions Modified

### trackOutputChange()
```typescript
// ON event: logs BEFORE state
if (value) {
  await update(rtdbOnAt(deviceId), { [key]: Date.now() });
  await logRuntimeEvent(deviceId, key, 'ON', currentRuntime, currentEnergy);
}

// OFF event: logs AFTER state (from transaction result)
const updatedAnalytics = transactionResult.snapshot.val();
await logRuntimeEvent(deviceId, key, 'OFF', newRuntime, newEnergy);
```

### trackBulkOutputChange()
```typescript
// Collect ON channels
for (const [k, val] of Object.entries(changes)) {
  if (val) onEvents.push(k);
}

// Log ON events with current state
for (const key of onEvents) {
  await logRuntimeEvent(deviceId, key, 'ON', currentRuntime, currentEnergy);
}

// Log OFF events with NEW state (after batch update)
for (const channelKey of Object.keys(finalValues)) {
  await logRuntimeEvent(deviceId, channelKey, 'OFF', newRuntime, newEnergy);
}
```

---

## 📊 Cost Impact

| Metric | Value |
|--------|-------|
| Writes per ON/OFF cycle | +2 (one ON, one OFF) |
| Typical device/day | +80 writes (4 channels × 20 cycles) |
| 10 devices/day | +800 writes |
| Firestore free tier | 20,000 writes/day |
| % of free tier (10 devices) | 4% |
| Storage per event | ~150 bytes |
| Storage per device/7 days | ~84 KB (560 events) |

**Conclusion:** Negligible cost for typical deployment.

---

## 🚀 Deployment

```powershell
# Build
npm run build

# Deploy
firebase deploy

# Test
# 1. Turn ON one channel (e.g., Fan)
# 2. Wait 2-5 minutes
# 3. Turn OFF same channel
# 4. Check Firestore: devices/A5X-HA-2847/runtimeEvents
```

---

## 🔍 How to Debug Gaps

### Query Events
```typescript
const q = query(
  collection(db, 'devices/A5X-HA-2847/runtimeEvents'),
  where('channel', '==', 'fan1'),
  where('timestamp', '>=', startOfDay),
  orderBy('timestamp', 'asc')
);
const events = await getDocs(q);
```

### Detect Missing OFF
```typescript
const eventList = events.docs.map(d => d.data());
for (let i = 0; i < eventList.length - 1; i++) {
  if (eventList[i].event === 'ON' && eventList[i+1].event === 'ON') {
    console.warn('GAP DETECTED:', eventList[i].timestamp, '→', eventList[i+1].timestamp);
  }
}
```

### Calculate Lost Runtime
```typescript
// Last OFF event accumulator: 12.5h
// Current RTDB accumulator: 12.5h (same)
// Expected: 15.5h (based on ON timestamps)
// Lost runtime: 15.5 - 12.5 = 3h
```

---

## ⏰ Retention (TTL Policy)

### Configure Once
1. Firebase Console → Firestore → Settings (gear icon)
2. Time-to-live policies → Add Policy
3. Collection: `runtimeEvents`
4. TTL field: `ttlExpireAt`
5. Save

### Effect
- Documents auto-delete ~72h after `ttlExpireAt` passes
- Zero maintenance required

---

## ✅ Evidence Required

1. **Firestore screenshot:** `runtimeEvents` collection (2 documents visible)
2. **Usage screenshot:** Firebase Console → Usage → Firestore writes/day
3. **Confirmation:** "Accumulator values unchanged before/after testing"

---

## 📚 Full Documentation

| Document | Purpose |
|----------|---------|
| `PHASE_2_SUMMARY.md` | Implementation overview (this summary) |
| `PHASE_2_IMPLEMENTATION_COMPLETE.md` | Full function code (no elisions) |
| `PHASE_2_RETENTION_PROPOSAL.md` | TTL policy justification |
| `DEPLOYMENT_INSTRUCTIONS.md` | Step-by-step testing guide |

---

## 🚨 Troubleshooting

### No documents in runtimeEvents
- Confirm channel was ON (check Live Current Monitor)
- Check browser console for `[logRuntimeEvent]` warnings
- Try another ON→OFF cycle

### Accumulator mismatch
- Wait 2 minutes and refresh page
- Compare multiple channels (corruption affects only one)
- Check Cloud Function logs for concurrent updates

### Firestore usage spike
- Each channel ON/OFF = +2 writes (expected)
- Bulk ON/OFF (all channels) = +8 writes (expected)
- 10 devices × 80 writes/day = 800 writes (4% of free tier)

---

## ✨ Key Benefits

✅ **Crash detection:** Missing OFF event = device crashed while ON
✅ **Gap quantification:** Calculate exact lost runtime
✅ **Non-invasive:** Zero firmware changes, piggybacks existing functions
✅ **Cost-effective:** ~4% of free tier for 10 devices
✅ **Zero maintenance:** TTL policy auto-deletes old events

---

**Status:** READY FOR DEPLOYMENT 🚀
**Next:** Follow `DEPLOYMENT_INSTRUCTIONS.md`
