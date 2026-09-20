# Analytics Page - Complete Working Logic & Math Calculations

## 📊 Overview
Analytics page shows real-time + historical runtime data for each channel (RIGHT LIGHT, Fan, LEFT LIGHT, top light).

---

## 🔄 Data Flow Architecture

```
ESP32 Firmware → RTDB → Frontend → Display
     ↓              ↓        ↓
  Tracks ON/OFF  Stores    Calculates    Shows
   timestamps    runtime   live delta    to user
```

---

## 📍 Part 1: Data Storage (Backend - RTDB)

### Location in Firebase RTDB:
```
devices/
  └── A5X-HA-2847/
      ├── analytics/
      │   ├── light2Runtime: 13.65    (hours, float)
      │   ├── light3Runtime: 0.75     (hours, float)
      │   ├── fan1Runtime: 13.65      (hours, float)
      │   └── customRuntime: 0        (hours, float)
      ├── analyticsDate: "2026-09-11" (today's date)
      └── onAt/
          ├── light2: 1736598000000   (unix ms when turned ON)
          ├── fan1: 1736598000000     (unix ms when turned ON)
          └── light3: null            (null = OFF)
```

### Key Points:
- **Runtime stored in HOURS** (not seconds!)
- **onAt stores unix milliseconds** when channel turned ON
- **onAt = null** means channel is OFF

---

## 📍 Part 2: Frontend Calculation Logic

### Step 1: Read Data from RTDB

```typescript
// Subscribe to analytics (accumulated runtime)
const todayRtdb = {
  "A5X-HA-2847": {
    light2Runtime: 13.65,  // hours
    fan1Runtime: 13.65,
    light3Runtime: 0.75,
    customRuntime: 0
  }
}

// Subscribe to onAt (current ON timestamps)
const onAtMap = {
  "A5X-HA-2847": {
    light2: 1736598000000,  // ON since this timestamp
    fan1: 1736598000000,    // ON since this timestamp
    light3: null,           // OFF
    custom1: null           // OFF
  }
}
```

---

### Step 2: Calculate Live Runtime (liveRuntime function)

**Purpose:** For channels that are currently ON, add the live delta to stored runtime.

#### Math Formula:
```
If channel is OFF:
  displayedRuntime = storedHours

If channel is ON:
  liveHours = (currentTime - onAtTimestamp) / 3,600,000  (ms to hours)
  displayedRuntime = storedHours + liveHours
  displayedRuntime = min(displayedRuntime, 24)  (cap at 24h max)
```

#### Example Calculation:

**Scenario:**
- Fan's `fan1Runtime` in RTDB = **13.65 hours**
- Fan turned ON at: **10:00 AM** (timestamp: 1736598000000)
- Current time: **10:30 AM** (timestamp: 1736599800000)

**Step-by-step:**
```javascript
// 1. Read stored value
const stored = 13.65;  // hours from RTDB
const storedHours = stored;  // Already in hours, no conversion

// 2. Check if ON
const onAtMs = 1736598000000;  // Fan is ON
if (onAtMs > 0) {
  
  // 3. Calculate time since turned ON
  const now = 1736599800000;  // Current time
  const liveHours = (now - onAtMs) / 3_600_000;
  // liveHours = (1736599800000 - 1736598000000) / 3600000
  // liveHours = 1800000 / 3600000
  // liveHours = 0.5 hours (30 minutes)
  
  // 4. Add to stored
  const total = storedHours + liveHours;
  // total = 13.65 + 0.5 = 14.15 hours
  
  // 5. Cap at 24h (safety)
  const final = Math.min(total, 24);
  // final = 14.15 (less than 24, so not capped)
  
  return 14.15;  // This is displayed!
}
```

**Result:** Fan shows **14h 9m** (14.15 hours)

---

### Step 3: Compute Totals (computeTotals function)

**Purpose:** Sum all channels' runtime across all devices.

#### Math Formula:
```
For each device:
  light2Total += liveRuntime(device, 'light2', stored)
  light3Total += liveRuntime(device, 'light3', stored)
  fan1Total += liveRuntime(device, 'fan1', stored)
  customTotal += liveRuntime(device, 'custom1', stored)
```

#### Example:

**Device: OFFICE (A5X-HA-2847)**
```javascript
const totals = {
  light2Runtime: liveRuntime('A5X-HA-2847', 'light2', 13.65),  // Returns 14.15
  light3Runtime: liveRuntime('A5X-HA-2847', 'light3', 0.75),   // Returns 0.75 (OFF)
  fan1Runtime:   liveRuntime('A5X-HA-2847', 'fan1', 13.65),    // Returns 14.15
  customRuntime: liveRuntime('A5X-HA-2847', 'custom1', 0)      // Returns 0 (OFF)
}
```

**Result:**
- RIGHT LIGHT = 14h 9m
- LEFT LIGHT = 45m
- Fan = 14h 9m
- top light = 0s

---

### Step 4: Calculate "Today Runtime" (Math.max approach)

**Purpose:** Show how long the device was active today (not sum of parallel channels).

#### Current Formula:
```javascript
const totalRuntime = Math.max(
  totals.light2Runtime,  // 14.15
  totals.light3Runtime,  // 0.75
  totals.fan1Runtime,    // 14.15
  totals.customRuntime,  // 0
  0
);
// totalRuntime = 14.15 hours (takes maximum)
```

**Why Math.max?**
- RIGHT LIGHT and Fan ran **simultaneously** for 14h
- If we sum: 14.15 + 14.15 = 28.3h → Wrong! (device can't run 28h in a day)
- Math.max says: "Device was active for **at least** 14.15h" ✅

#### Example Timeline:
```
Time:     00:00  06:00  12:00  18:00  24:00
RIGHT:    [------ON 14h------][OFF]
Fan:      [------ON 14h------][OFF]
LEFT:           [--ON 45m--][OFF]

Device Active Time = 14h 9m (not 28h + 45m!)
```

---

### Step 5: Format Display (fmtRuntime function)

**Purpose:** Convert hours to readable format (Xh Ym Zs).

#### Math Formula:
```
totalSeconds = hours × 3600
hours = floor(totalSeconds / 3600)
minutes = floor((totalSeconds % 3600) / 60)
seconds = totalSeconds % 60
```

#### Example:
```javascript
const h = 14.15;  // Input in hours

// 1. Convert to total seconds
const totalSec = Math.round(14.15 * 3600);
// totalSec = 50940 seconds

// 2. Extract hours
const hh = Math.floor(14.15);  // hh = 14

// 3. Extract minutes
const mm = Math.floor((14.15 - 14) * 60);
// mm = Math.floor(0.15 * 60)
// mm = Math.floor(9)
// mm = 9

// 4. Format output
return "14h 9m";
```

---

## 📍 Part 3: Display Components

### A. Summary Cards (Top Row)

```
┌─────────────────────────────────────┐
│ ⏰ Today Runtime     📊 Energy Used │
│    14h 9m               0.158 kWh   │
│                                     │
│ 💡 Light Runtime     💨 Fan Runtime │
│    14h 54m              14h 9m      │
└─────────────────────────────────────┘
```

**Calculation:**
```javascript
Today Runtime = Math.max(14.15, 0.75, 14.15, 0) = 14.15h → "14h 9m"
Light Runtime = light2 + light3 = 14.15 + 0.75 = 14.9h → "14h 54m"
Fan Runtime = fan1 = 14.15h → "14h 9m"
```

---

### B. Channel Runtimes (Bar Chart)

```
RIGHT LIGHT  [████████████████] 14h 9m
top light    [                ]  0s
Fan          [████████████████] 14h 9m
LEFT LIGHT   [█               ] 45m
```

**Calculation:**
- Each bar shows: `totals.light2Runtime`, `totals.fan1Runtime`, etc.
- Bar width = `(value / maxRuntime) × 100%`
- `maxRuntime = Math.max(14.15, 0.75, 14.15, 0) = 14.15`

**Example - LEFT LIGHT bar:**
```javascript
value = 0.75 hours
maxRuntime = 14.15 hours
barWidth = (0.75 / 14.15) × 100% = 5.3%
```

---

### C. Devices Overview

```
┌─────────────────────────────┐
│ OFFICE         💚  14h 9m   │
│ Office · online             │
└─────────────────────────────┘
```

**Calculation:**
```javascript
deviceRuntime = Math.max(
  liveRuntime('light2', 13.65),  // 14.15
  liveRuntime('light3', 0.75),   // 0.75
  liveRuntime('fan1', 13.65),    // 14.15
  liveRuntime('custom1', 0)      // 0
) = 14.15h → "14h 9m"
```

---

## 📍 Part 4: Real-Time Updates

### 1-Second Ticker
```javascript
// Updates 'now' every second
useEffect(() => {
  const t = setInterval(() => setNow(Date.now()), 1000);
  return () => clearInterval(t);
}, []);
```

**What happens every second:**
1. `now` updates (e.g., 1736599800000 → 1736599801000)
2. `liveRuntime()` recalculates:
   ```
   liveHours = (1736599801000 - 1736598000000) / 3600000
   liveHours = 0.500277... hours (30 seconds more)
   ```
3. Display updates: **14h 9m** → **14h 9m 30s**

---

## 📍 Part 5: Backend Data Update (When Channel Turns OFF)

### When User Turns Fan OFF:

**1. Frontend calls:**
```javascript
trackBulkOutputChange('A5X-HA-2847', { fan1: false });
```

**2. Backend calculates runtime:**
```javascript
const onAtMs = 1736598000000;  // When it was turned ON
const now = 1736599800000;      // When it was turned OFF
const elapsed = (now - onAtMs) / 3_600_000;
// elapsed = 0.5 hours (30 minutes)
```

**3. Update RTDB:**
```javascript
// Read current stored value
const current = 13.65 hours;

// Add elapsed time
const newRuntime = current + elapsed;
// newRuntime = 13.65 + 0.5 = 14.15 hours

// Write back to RTDB
analytics.fan1Runtime = 14.15;  // Updated!
onAt.fan1 = null;               // Mark as OFF
```

**4. Frontend immediately reflects:**
- `todayRtdb['A5X-HA-2847'].fan1Runtime` = 14.15
- `onAtMap['A5X-HA-2847'].fan1` = null
- Display shows: **14h 9m** (static, no longer incrementing)

---

## 📍 Part 6: Midnight Rollover

### What Happens at 00:00:00

**Before Midnight:**
```
analyticsDate: "2026-09-10"
fan1Runtime: 14.15 hours
```

**After Midnight (ensureTodayWindow):**
```javascript
// 1. Check date
const today = "2026-09-11";
const stored = "2026-09-10";  // Old date!

// 2. Save yesterday's data to Firestore
flushDayToFirestore('A5X-HA-2847', '2026-09-10', {
  fan1Runtime: 14.15,
  light2Runtime: 14.15,
  // ... all channels
});

// 3. Reset RTDB for new day
analytics.fan1Runtime = 0;
analytics.light2Runtime = 0;
analytics.light3Runtime = 0;
analytics.customRuntime = 0;
analyticsDate = "2026-09-11";

// 4. If channels are ON, restart tracking from midnight
onAt.fan1 = midnightTimestamp;  // Not current time!
```

**Result:** New day starts fresh, old data saved to history.

---

## 📍 Part 7: Corruption Handling

### Scenario: RTDB has > 24h value

**Problem:**
```
fan1Runtime: 48.5 hours  ❌ (Impossible! Day has only 24h)
```

**Detection (resetCorruptedAnalyticsIfNeeded):**
```javascript
const MAX_DAILY_HOURS = 24;
if (stored > MAX_DAILY_HOURS) {
  // Mark as corrupt
  corruptFields.push('fan1Runtime');
}
```

**Fix:**
```javascript
// 1. Save valid data to Firestore
flushAnalyticsToFirestore('2026-09-10', {
  light2Runtime: 13.65,  // Valid
  light3Runtime: 0.75,   // Valid
  // fan1Runtime excluded (corrupt)
});

// 2. Reset only corrupt field
analytics.fan1Runtime = 0;  // Reset to 0

// 3. Clear onAt for corrupt channel
onAt.fan1 = null;
```

**Display Safety (fmtRuntime):**
```javascript
if (h > 24) {
  console.warn("Runtime exceeds 24h, capping to 24h");
  h = 24;  // Display shows max 24h
}
```

---

## 🎯 Complete Example - Timeline

### Scenario: Fan Usage Throughout the Day

```
06:00 - User turns Fan ON
        → onAt.fan1 = timestamp(06:00)
        → Display shows: 0s (just started)

06:30 - User checks analytics
        → liveHours = (06:30 - 06:00) / 3600000 = 0.5h
        → Display shows: 30m

12:00 - User turns Fan OFF
        → elapsed = (12:00 - 06:00) / 3600000 = 6h
        → fan1Runtime = 0 + 6 = 6 hours
        → onAt.fan1 = null
        → Display shows: 6h (static)

18:00 - User turns Fan ON again
        → onAt.fan1 = timestamp(18:00)
        → Display shows: 6h 0s (starting from stored 6h)

20:00 - User checks analytics
        → liveHours = (20:00 - 18:00) / 3600000 = 2h
        → total = 6 + 2 = 8 hours
        → Display shows: 8h

23:59 - End of day
        → total = 6 + (23:59 - 18:00) / 3600000
        → total = 6 + 5.983 = 11.983 hours
        → Display shows: 11h 59m

00:00 - Midnight rollover
        → Save 11.983h to Firestore
        → Reset fan1Runtime = 0
        → If fan still ON: onAt.fan1 = midnight timestamp
        → New day starts
```

---

## 📊 Summary - Key Math Formulas

### 1. Live Delta Calculation
```
liveHours = (currentTimestamp - onAtTimestamp) / 3,600,000
```

### 2. Total Runtime
```
displayedRuntime = storedHours + liveHours
cappedRuntime = min(displayedRuntime, 24)
```

### 3. Device Active Time (Today Runtime)
```
deviceActiveTime = max(channel1, channel2, channel3, channel4)
```

### 4. Time Formatting
```
hours = floor(decimalHours)
minutes = floor((decimalHours - hours) × 60)
seconds = round(((decimalHours - hours) × 60 - minutes) × 60)
```

### 5. Bar Chart Width
```
barWidth = (channelRuntime / maxChannelRuntime) × 100%
```

---

## ✅ Complete Flow Diagram

```
User Action → ESP32 → RTDB → Frontend → Display
    ↓           ↓       ↓        ↓         ↓
Turn ON    Set onAt  Stores   Reads    Shows 0s
           timestamp  null    onAt     
                                       
Wait 30m      ↓       ↓     Subscribe  Shows 30m
                            updates    (live)
                            every 1s
                            
Turn OFF   Clear     Store   Reads     Shows 30m
           onAt      30m     stored    (static)
                     runtime value
```

---

## 🔧 Debugging Tips

### Check if Live Updates Working:
```javascript
console.log('now:', now);
console.log('onAt:', onAtMap);
console.log('stored:', todayRtdb);
console.log('calculated:', liveRuntime(...));
```

### Check RTDB Values:
Firebase Console → Realtime Database → `devices/A5X-HA-2847/`
- `analytics/` should have values < 24
- `onAt/` should have timestamps for ON channels
- `analyticsDate` should be today

### Check for Corruption:
If all channels show 24h:
- RTDB has corrupted values (> 24)
- Run `resetCorruptedAnalyticsIfNeeded()`
- Or manually reset in Firebase Console

---

**Samajh aa gaya? Koi specific part detail mein chahiye?**
