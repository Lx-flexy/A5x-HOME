# Verification Quick Reference

## ✅ Code Complete — Manual Deployment and Testing Required

### What Was Fixed

1. **✅ Atomicity:** ALL `energyTick` updates now use RTDB transactions (server + client)
2. **✅ Background-safe:** Server-side Cloud Function runs every 60s (independent of any client)
3. **✅ No double-counting:** RTDB transactions prevent race conditions between server tick and client OFF event
4. **✅ TypeScript:** Zero compilation errors (functions + web app)

**Critical fix applied:** Client-side OFF event handlers (`trackOutputChange` and `trackBulkOutputChange`) now use `runTransaction()` to atomically read and update `energyTick`, eliminating the race condition with server-side periodic tick.

---

## 🔧 Deployment Steps

### 1. Install Firebase CLI (if needed)
```powershell
npm install -g firebase-tools
firebase login
```

### 2. Deploy Cloud Functions
```powershell
cd functions
firebase deploy --only functions
```

**Expected output:**
```
✔  Deploy complete!
Functions:
  periodicEnergyAccumulation(us-central1)
  cleanupOldAnalytics(us-central1)
```

### 3. Verify Deployment
Check Firebase Console → Functions → periodicEnergyAccumulation → Logs

Or CLI:
```powershell
firebase functions:log --only periodicEnergyAccumulation --limit 5
```

**Expected log pattern (every 60s):**
```
[periodicEnergy] Starting energy accumulation cycle
[periodicEnergy] Completed: 2 devices, 3 channels updated in 245ms
```

---

## 🧪 Manual Tests (3 Required)

### Test 1: Live Tick (60s)
1. Open Analytics page
2. Turn ON Light2
3. Wait 60 seconds
4. Check RTDB: `devices/{deviceId}/analytics/energyUsage`
5. **Expected:** Increases by ~0.001 kWh

### Test 2: Background Accumulation (3min) ⭐
1. Turn ON Light2
2. **Close Analytics page**
3. Wait 3 minutes
4. Reopen Analytics page
5. Check RTDB: `energyUsage`
6. **Expected:** Shows full 3 minutes (~0.002 kWh), not just time since reopening

**This proves Fix Task A** (background-independent operation)

### Test 3: No Double-Counting (90s) ⭐
1. Open Analytics in Tab 1
2. Open Analytics in Tab 2
3. Turn ON Light2
4. Wait 90 seconds
5. Check RTDB: `energyUsage`
6. **Expected:** ~0.0015 kWh (NOT ~0.003 kWh)

**This proves Fix Task B** (atomic transaction prevents race conditions)

---

## 📊 Architecture Summary

### Energy Flow While Device is ON

**Server (Cloud Function — every 60s):**
```
1. Read energyTick/{channel} (via transaction)
2. Calculate: energy = power × (now - lastTick)
3. Update energyUsage += energy
4. Update energyTick/{channel} = now (atomic commit)
```

**Client (OFF event only):**
```
1. Read energyTick/{channel}
2. Calculate: energy = power × (now - lastTick)  [final partial period]
3. Update energyUsage += energy
4. Clear energyTick/{channel} = null
5. Clear onAt/{channel} = null
```

**Key:** Both use same `energyTick` reference → no overlap possible

---

## 📝 Files Modified

- `functions/src/index.ts` — Added `periodicEnergyAccumulation()` Cloud Function
- `src/services/analyticsService.ts` — Removed client-side periodic update, updated OFF-event logic
- `src/pages/analytics/Analytics.tsx` — Removed periodic update useEffect hook
- `src/services/deviceService.ts` — Removed light1/fan2 from TRACKABLE_KEYS (now 4 channels)

---

## 💰 Cost Impact

- **Invocations:** 1,440/day × 30 days = 43,200/month
- **Free tier:** 2,000,000/month
- **Usage:** 2.16% of free tier
- **Cost:** $0.00

---

## ✅ Deployment Checklist

- [x] TypeScript compiles (0 errors)
- [x] RTDB transactions implemented (server + client, ALL energyTick writes)
- [x] Server-side scheduled function
- [x] Client-side periodic update removed
- [ ] Firebase CLI installed (`firebase login`)
- [ ] Cloud Functions deployed (`firebase deploy --only functions`)
- [ ] Deployment logs verified (2-3 invocations visible)
- [ ] Test 1: Live tick ✓
- [ ] Test 2: Background accumulation ✓ (proves Fix A)
- [ ] Test 3: No double-counting ✓ (proves Fix B)

---

## 🚨 Important Notes

- **I cannot deploy or test in this environment** — requires live Firebase project with authentication
- **No client catch-up logic** — by design (server-only approach chosen)
- **Client OFF event NOW uses transaction** — fixed race condition with server tick
- **Firebase CLI required** for deployment (not included in project dependencies)
- See `ATOMICITY_AND_DEPLOYMENT_VERIFICATION.md` for detailed technical verification and exact test procedures
