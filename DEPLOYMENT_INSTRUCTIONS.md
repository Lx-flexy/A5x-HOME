# PHASE 2 DEPLOYMENT INSTRUCTIONS

## Pre-Deployment Checklist

### 1. Record Baseline (BEFORE deploying)

Open Firebase Console and screenshot:
- **Firestore Usage:** Console → Usage → Firestore writes/day
  - Current baseline: 10 writes today, 232 peak
- **Current Accumulator Values:**
  - RTDB path: `devices/A5X-HA-2847/analytics`
  - Note down: `light2Runtime`, `light3Runtime`, `fan1Runtime`, `custom1Runtime`, `energyUsage`

---

## Deployment Steps

### Step 1: Build and Deploy

```powershell
# Build the project
npm run build

# Deploy to Firebase
firebase deploy
```

**Expected output:**
```
✔ Deploy complete!
Functions:
  - No changes (no new functions)
Hosting:
  - analyticsService.ts updates included in bundle
```

---

### Step 2: Test ON→OFF Cycle

**Use the actual device (A5X-HA-2847):**

1. **Turn ON one channel** (e.g., Fan/X4 via app)
   - Wait for confirmation (device responds)

2. **Wait 2-5 minutes** (let runtime accumulate)

3. **Turn OFF the same channel**
   - Wait for confirmation

---

### Step 3: Verify Event Log Created

**Open Firebase Console:**

1. Go to: **Firestore Database**
2. Navigate to: `devices` → `A5X-HA-2847` → `runtimeEvents`
3. **Expected:** 2 new documents

**Document 1 (ON event):**
```json
{
  "channel": "fan1",
  "event": "ON",
  "timestamp": "<server timestamp>",
  "accumulatorValueAfter": <current runtime>,
  "energyValueAfter": <current energy>,
  "ttlExpireAt": "<+7 days>"
}
```

**Document 2 (OFF event):**
```json
{
  "channel": "fan1",
  "event": "OFF",
  "timestamp": "<server timestamp>",
  "accumulatorValueAfter": <new runtime>,
  "energyValueAfter": <new energy>,
  "ttlExpireAt": "<+7 days>"
}
```

📸 **SCREENSHOT REQUIRED** (both documents visible)

---

### Step 4: Verify Accumulator Unchanged

**Check RTDB analytics:**

1. Firebase Console → Realtime Database
2. Path: `devices/A5X-HA-2847/analytics`
3. Compare `fan1Runtime` and `energyUsage` with baseline

**Expected:**
- `fan1Runtime` increased by ~0.03-0.08h (2-5 minutes)
- `energyUsage` increased proportionally
- **Other channels unchanged** (light2Runtime, light3Runtime, custom1Runtime)

✅ **CONFIRMATION REQUIRED:** "Accumulator values correct, no anomalies"

---

### Step 5: Check Firestore Usage Impact

**Firebase Console → Usage:**

1. Note **Firestore writes/day** for today
2. Compare with baseline (recorded in Step 1)

**Expected delta:**
- Baseline + 2 writes (ON + OFF events)
- Example: 10 → 12 writes

📸 **SCREENSHOT REQUIRED** (Usage dashboard)

---

## Post-Deployment: Configure TTL Policy

**One-time setup (can be done later):**

1. Firebase Console → **Firestore Database** → **Settings** (gear icon)
2. Click **Time-to-live policies** tab
3. Click **Add Policy**
4. Configure:
   - **Collection group:** `runtimeEvents`
   - **TTL field:** `ttlExpireAt`
   - **Action:** Delete documents
5. Save

**Effect:**
- Documents auto-delete ~72h after `ttlExpireAt` passes
- Zero maintenance, included in Firestore pricing

---

## Troubleshooting

### Problem: No documents in `runtimeEvents` collection

**Possible causes:**
1. **Build not deployed:** Re-run `npm run build && firebase deploy`
2. **Channel was already OFF:** Event log only fires when `onAt` exists
3. **Firestore write failed:** Check browser console for errors

**Fix:**
- Confirm channel is ON (check Live Current Monitor for current draw > 0)
- Try another ON→OFF cycle
- Check browser console (DevTools → Console) for `[logRuntimeEvent]` warnings

---

### Problem: Accumulator values don't match

**Possible causes:**
1. **Old data in cache:** Refresh Analytics page
2. **Server-side tick raced:** Normal, wait 1 minute and re-check
3. **Concurrent OFF event:** Check Cloud Function logs

**Fix:**
- Wait 2 minutes, refresh page
- Compare multiple channels (corruption would affect only one channel)
- If persistent, revert deployment and report issue

---

### Problem: Firestore usage spiked unexpectedly

**Possible causes:**
1. **Multiple devices active:** Each device writes to its own `runtimeEvents`
2. **Bulk ON/OFF testing:** Each channel = 2 events (ON + OFF)
3. **Automatic daily rollover fired:** Separate from event log

**Expected usage:**
- 1 device, 1 ON/OFF cycle = +2 writes
- 1 device, typical day = +80 writes (4 channels × 20 cycles)
- 10 devices, typical day = +800 writes (still well within free tier)

---

## Evidence Checklist for Phase 2 Sign-Off

Provide the following:

1. ✅ **Code deployment confirmation**
   - Command output: `firebase deploy` success message

2. 📸 **Firestore screenshot**
   - Path: `devices/A5X-HA-2847/runtimeEvents`
   - Must show at least 2 documents (ON + OFF)

3. 📸 **Firestore usage screenshot**
   - Firebase Console → Usage → Firestore writes/day
   - Compare baseline vs. post-test value

4. ✅ **Accumulator verification**
   - Text confirmation: "Checked RTDB analytics, values correct"
   - OR screenshot of RTDB `devices/A5X-HA-2847/analytics` path

5. ⏳ **TTL policy configured** (can be done after testing)
   - Screenshot of Firestore Settings → Time-to-live policies (optional)

---

## Success Criteria

✅ Phase 2 is **COMPLETE** when:

1. `runtimeEvents` collection exists and logs ON/OFF events correctly
2. Event documents contain all required fields (channel, event, timestamp, accumulatorValueAfter, energyValueAfter, ttlExpireAt)
3. Existing accumulator values are **unchanged/correct** (no regression)
4. Firestore usage impact is **acceptable** (+2 writes per ON/OFF cycle)
5. TTL policy configured (or plan to configure within 7 days)

---

## Next: How to Use Event Log for Debugging

### Query recent events for a channel

```typescript
const eventsRef = collection(db, 'devices/A5X-HA-2847/runtimeEvents');
const q = query(
  eventsRef,
  where('channel', '==', 'fan1'),
  where('timestamp', '>=', new Date('2025-01-13')),
  orderBy('timestamp', 'asc')
);
const snapshot = await getDocs(q);
snapshot.forEach(doc => console.log(doc.data()));
```

### Detect missing OFF event (crash indicator)

```typescript
// If consecutive ON events without OFF in between = crash happened
const events = await getDocs(q);
const eventList = events.docs.map(d => d.data());

for (let i = 0; i < eventList.length - 1; i++) {
  if (eventList[i].event === 'ON' && eventList[i + 1].event === 'ON') {
    console.warn('Missing OFF event between', eventList[i].timestamp, 'and', eventList[i + 1].timestamp);
    console.warn('Possible device crash/reboot');
  }
}
```

---

**Ready to deploy? Follow steps 1-5 above and provide evidence.** 🚀
