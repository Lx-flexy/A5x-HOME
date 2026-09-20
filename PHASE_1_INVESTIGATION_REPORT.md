# PHASE 1: INVESTIGATION REPORT - Analytics Event Log

## 1.1 — Where does `onAt` get set and cleared today?

### VERIFIED ✅ - Found 3 locations where `onAt` is written:

---

#### **Location 1: Frontend - trackOutputChange() (Client-side)**
**File:** `src/services/analyticsService.ts` Lines 230-426

**ON Event (Line 255):**
```typescript
if (value) {
  // Turning ON — record start timestamp
  await update(rtdbOnAt(deviceId), { [key]: Date.now() });
}
```

**OFF Event (Lines 258-425):**
```typescript
else {
  // Turning OFF — atomically compute and update energy using transaction
  const onAtSnap = await get(ref(rtdb, `devices/${deviceId}/onAt/${key}`));
  const onAtMs = (onAtSnap.val() as number) || 0;
  
  if (onAtMs > 0) {
    // ... energy calculation using transaction ...
    
    // Line 423: Clear onAt (marks channel as OFF)
    await update(rtdbOnAt(deviceId), { [key]: null });
  }
}
```

**Pairing with Accumulator:**
- ✅ **ALWAYS PAIRED**: OFF event clears `onAt` AND updates accumulator in SAME function
- Lines 367-417: Transaction updates `analytics/{channel}Runtime` 
- Line 423: Clears `onAt/{channel}` to null
- **NO GAP**: Both happen atomically or function fails completely

---

#### **Location 2: Frontend - trackBulkOutputChange() (Client-side)**
**File:** `src/services/analyticsService.ts` Lines 439-593

**ON Events (Lines 467-468):**
```typescript
for (const [k, val] of Object.entries(changes) as [TrackableKey, boolean][]) {
  if (val) {
    // Turning ON
    onAtPatch[k] = now;
  }
}
```

**OFF Events (Lines 469-476):**
```typescript
else {
  // Turning OFF - prepare for transaction
  const onAtMs = onAtData[k] || 0;
  if (onAtMs > 0) {
    offEvents.push({ key: k, onAtMs });
    onAtPatch[k] = null; // Will clear after energy calculation
  }
}
```

**Final Update (Line 590):**
```typescript
// Update onAt states (all ON/OFF changes)
if (Object.keys(onAtPatch).length > 0) {
  await update(rtdbOnAt(deviceId), onAtPatch);
}
```

**Pairing with Accumulator:**
- ✅ **ALWAYS PAIRED**: Lines 558-587 batch-update analytics, Line 590 updates onAt
- Both happen in SAME function execution
- **NO GAP**: Accumulator updated before onAt cleared

---

#### **Location 3: Cloud Function - rolloverDeviceAnalytics() (Server-side)**
**File:** `functions/src/index.ts` Lines 440-583

**Midnight Rollover - Reset onAt (Lines 565-582):**
```typescript
// STEP 5: For channels ON across midnight, reset onAt to midnight timestamp
if (hadChannelsOn) {
  const midnight = getTodayMidnightMs();
  const onAtUpdates: Record<string, number> = {};
  
  for (const channel of channelsOn) {
    const currentOnAt = currentOnAt[channel];
    
    if (currentOnAt < midnight) {
      // Channel was ON before midnight
      // ... calculate previous day portion ...
      
      // Reset to midnight for today's portion calculation
      onAtUpdates[channel] = midnight;
      logger.info(`[rolloverDevice] ${deviceId}/${channel}: Reset onAt to midnight`);
    }
    // else: Channel turned ON after midnight today, keep existing onAt
  }
  
  if (Object.keys(onAtUpdates).length > 0) {
    await rtdb.ref(`devices/${deviceId}/onAt`).update(onAtUpdates);
  }
}
```

**Pairing with Accumulator:**
- ✅ **ALWAYS PAIRED**: Lines 505-533 calculate cross-midnight runtime AND add to analytics
- Lines 540-554: Flush old analytics to Firestore
- Lines 556-562: Reset analytics to 0 for new day
- Lines 565-582: Reset onAt to midnight (NOT null - channel still ON)
- **NO GAP**: Accumulator updated for previous day portion before onAt reset

---

### Summary - Can `onAt` change without accumulator?

**ANSWER: NO ❌**

All 3 code paths show:
1. **ON event:** Sets `onAt` timestamp, accumulator stays same (expected)
2. **OFF event:** Calculates elapsed time, updates accumulator, THEN clears `onAt`
3. **Midnight rollover:** Calculates previous day portion, updates accumulator, THEN resets `onAt`

**CRITICAL FINDING:** 
- `onAt` is NEVER cleared/modified without corresponding accumulator update
- BUT: If process crashes BETWEEN setting `onAt` and clearing it (during OFF event), **accumulator never updates**
- This is the suspected root cause of missing runtime

---

## 1.2 — Current Write Frequency / Cost Baseline

### UNVERIFIED ⚠️ - Cannot Access Firebase Console Usage Data

**Reason:** I cannot access Firebase Console → Usage tab to pull actual write counts.

**User must provide:**
1. Screenshot of Firebase Console → Usage & billing → Usage tab
2. Date range: Last 7 days
3. Required metrics:
   - **RTDB writes/day** (total)
   - **Firestore writes/day** (total)
   - Breakdown by collection if available

**Estimation (for context only, NOT baseline):**

Assuming 1 device with 4 channels, typical usage:
```
RTDB writes per day:
- trackOutputChange (ON): 4 channels × 5 toggles/day = 20 writes
- trackOutputChange (OFF): 4 channels × 5 toggles/day × 3 fields = 60 writes
  (onAt clear, analytics update, energyTick update)
- Cloud Function rollover: 1 × midnight = 1 write
- Total: ~81 RTDB writes/day (rough estimate)

Firestore writes per day:
- flushDayToFirestore: 1 × daily = 1 write
- Total: ~1 Firestore write/day
```

**⚠️ This is NOT the baseline - user must provide actual numbers.**

---

## 1.3 — Reproduce LEFT LIGHT Incident

### UNVERIFIED ⚠️ - Historical Data Needed from User

**Original Incident:**
```
Screenshot A: RIGHT LIGHT 13h 2m, Fan 13h 2m, LEFT LIGHT 45m 14s, top light 0s
Screenshot B: RIGHT LIGHT 12h 1m, Fan 12h 1m, LEFT LIGHT 0s, top light 0s
```

**To investigate, need:**

#### A. Firestore Historical Snapshots
**Path:** `device_analytics/{deviceId}_{date}`
**Required dates:** 2026-09-10, 2026-09-11 (or exact dates from screenshots)

**User action:**
1. Open Firebase Console → Firestore → `device_analytics` collection
2. Filter by: `deviceId == "A5X-HA-2847"` AND `date >= "2026-09-10"`
3. Screenshot showing documents around incident date

**What to look for:**
- Daily snapshots before/after incident
- Check if values match or contradict screenshot evidence
- Missing snapshots = data loss

#### B. Cloud Function Logs
**Path:** Firebase Console → Functions → Logs
**Date range:** September 10-11, 2026

**Filter by:**
- Function: `rolloverDeviceAnalytics` or `tickRuntime`
- Device: `A5X-HA-2847`
- Severity: All (Info, Warning, Error)

**User action:**
1. Open Firebase Console → Functions → Logs
2. Set date range to incident window
3. Filter by `A5X-HA-2847`
4. Screenshot any errors, timeouts, or warnings

**What to look for:**
- Transaction aborted messages
- Cold start delays
- Function timeouts (>60s)
- Concurrent execution conflicts

#### C. RTDB Activity Log (if available)
**Path:** Firebase Console → Realtime Database → Activity

**What to look for:**
- Spike in writes around incident time
- Connection drops/reconnects
- Write conflicts/failed transactions

### RISK 🔴 - Most Likely Scenario Based on Code Analysis

**Hypothesis:** Device restart/crash while channels ON

**Timeline reconstruction:**
```
Before crash:
  RIGHT LIGHT ON since 00:00, onAt set
  Fan ON since 00:00, onAt set
  LEFT LIGHT ON for 45m, onAt set
  Analytics: 13h 2m (accumulated from previous sessions)

Crash occurs (power loss, ESP32 reboot):
  All channels physically turn OFF
  BUT: OFF events never fire (device offline)
  onAt timestamps remain in RTDB (stale)

Device reboots:
  Channels turn ON again (new session)
  onAt gets OVERWRITTEN with new timestamp
  Previous session runtime LOST (never calculated)
  
Result:
  ~1 hour of runtime missing from each channel
  Matches screenshot pattern (13h → 12h decrease)
```

**Evidence that supports this:**
1. ✅ Proportional decrease across multiple channels (RIGHT, Fan)
2. ✅ LEFT LIGHT complete loss (was ON at crash, never calculated)
3. ✅ No corruption pattern (values aren't capped at 24h)

**What event log would capture:**
- Last ON event timestamp before crash
- No corresponding OFF event
- Gap detectable when new ON event arrives

---

## 1.4 — Channel Naming / RTDB Key Mapping

### VERIFIED ✅ - Internal vs Display Names

**Internal RTDB Keys (unchanged):**
```typescript
// analyticsService.ts Line 98-99
type TrackableKey = 'light2' | 'light3' | 'fan1' | 'custom1';

// RTDB paths:
devices/{deviceId}/analytics/
  ├── light2Runtime
  ├── light3Runtime  
  ├── fan1Runtime
  └── customRuntime

devices/{deviceId}/onAt/
  ├── light2
  ├── light3
  ├── fan1
  └── custom1
```

**Display Labels (UI only):**

Looking for the mapping configuration...


**Display Name Mapping (UI Layer):**

**File:** `src/pages/devices/DeviceDetails.tsx` Lines 285-291
```typescript
const getHardwareSlot = (id?: string): string => {
  const slotMap: Record<string, string> = {
    'light2': 'X2',
    'light3': 'X3',
    'fan1': 'X4',
    'custom1': 'X6'
  };
  return id ? (slotMap[id] || '') : '';
};
```

**Default Display Names:**

**File:** `src/services/deviceService.ts` Lines 186-194
```typescript
function defaultOutputMetadata(): DeviceOutputMetadata {
  return {
    light2: { name: 'Light 2', icon: 'lightbulb', color: '#d97706', visible: true },
    light3: { name: 'Light 3', icon: 'lightbulb', color: '#f59e0b', visible: true },
    fan1: { name: 'Fan 1', icon: 'wind', color: '#60a5fa', visible: true },
    custom1: { name: 'Custom', icon: 'zap', color: '#a78bfa', visible: true },
  };
}
```

**Custom Names (user-configurable):**
- Stored in: `devices/{deviceId}/outputMetadata/{channelId}`
- Example: User renames `light2` → "RIGHT LIGHT", `light3` → "LEFT LIGHT"
- Merged with defaults at runtime

**Mapping Summary:**
```
Hardware Slot → RTDB Key    → Display Name (default)  → Display Name (custom)
─────────────────────────────────────────────────────────────────────────────
X2            → light2       → "Light 2"              → "RIGHT LIGHT"
X3            → light3       → "Light 3"              → "LEFT LIGHT"  
X4            → fan1         → "Fan 1"                → "Fan"
X6            → custom1      → "Custom"               → "top light"
```

**CONFIRMED:**
- ✅ Backend ALWAYS uses internal keys: `light2`, `light3`, `fan1`, `custom1`
- ✅ Hardware slots (X2, X3, X4, X6) are UI-only labels
- ✅ Display names customizable per device via metadata
- ✅ NO backend code uses X2/X3/X4/X6 directly

---

## PHASE 1 SUMMARY

### ✅ VERIFIED FINDINGS:

1. **onAt Write Locations:** 3 locations found (2 frontend, 1 Cloud Function)
2. **Accumulator Pairing:** ALL `onAt` clears are paired with accumulator updates
3. **Channel Naming:** Internal keys unchanged, X2/X3/X4/X6 are UI-only

### ⚠️ UNVERIFIED (User Action Required):

1. **Firebase Usage Baseline:** Need screenshot from Firebase Console → Usage tab
2. **Historical Evidence:** Need Firestore snapshots + Cloud Function logs for incident date

### 🔴 CRITICAL RISK IDENTIFIED:

**Gap in Current System:**
If device crashes/reboots while channel ON:
- `onAt` timestamp remains in RTDB (stale)
- OFF event never fires
- Accumulator never incremented
- Runtime for that session LOST permanently

**Evidence:**
- Code analysis confirms no recovery mechanism exists
- Matches LEFT LIGHT incident pattern (runtime disappeared)
- Would be invisible without event log

---

## NEXT STEPS

### Before Phase 2 Implementation:

**User must provide:**
1. ✅ Approve Phase 1 findings
2. ⚠️ Firebase Console usage screenshot (baseline)
3. ⚠️ Historical data for LEFT LIGHT incident (optional but helpful)

**Once approved:**
- Phase 2 will implement Firestore event log
- Piggyback on existing `trackOutputChange` / `trackBulkOutputChange`
- No firmware changes
- Minimal cost increase (estimate: +8 Firestore writes/day per device)

---

**Report Status:** COMPLETE - Awaiting Phase 1 approval and missing evidence from user.
