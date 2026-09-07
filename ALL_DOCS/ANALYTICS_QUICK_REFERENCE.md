# Analytics Page — Quick Reference

## New Features at a Glance

### 🔌 Live Current Monitor
- **Location:** Analytics page → Today tab
- **Shows:** Real-time current (Amps) for all 6 channels
- **Format:** 2 decimal places (e.g., "0.42 A")
- **Updates:** Live, within 1-2 seconds

### ⚠️ Mismatch Warnings
- **Trigger:** Relay ON but no current detected (device not responding)
- **Display:** Red border + alert icon + message
- **Message:** "Not responding — check the switch or bulb"
- **Healthy State:** Silent (no warnings shown)

### ⚡ Accurate Energy Calculation
- **With Current Sensing:** Power = 230V × Actual Current (A)
- **Without Current Sensing:** Uses placeholder wattage (40W/25W/30W)
- **Storage:** Energy in kWh, accumulated per channel
- **Precision:** Full float precision stored, rounded for display only

### 📅 IST Timezone
- **Day Boundary:** Matches device local time (IST UTC+5:30)
- **Not Affected By:** Browser timezone or DST
- **Synced With:** Firmware NTP offset (19800 seconds)

### 🔄 Runtime Persistence
- **Behavior:** Turning device OFF does NOT reset today's runtime
- **Accumulation:** Each ON/OFF cycle adds to today's total
- **Day Rollover:** Resets at midnight IST (not before)

### 🧹 Automatic Cleanup
- **Schedule:** Daily at 2:00 AM IST
- **Retention:** Last 7 days only (today + 6 previous)
- **Method:** Cloud Function (scheduled via Pub/Sub)
- **Manual Trigger:** Available via HTTP endpoint

---

## UI Components

### Live Current Card Structure
```
┌──────────────────────────────────┐
│ 🟡 Light 1                       │
│ 0.42 A                           │ ← Normal (no mismatch)
└──────────────────────────────────┘

┌──────────────────────────────────┐
│ 🟠 Light 2                       │
│ 0.00 A                           │
│ ⚠️ Not responding                │ ← Mismatch detected
│    — check switch or bulb        │
└──────────────────────────────────┘

┌──────────────────────────────────┐
│ 🔵 Fan 1                         │
│ No data                          │ ← No current sensing
└──────────────────────────────────┘
```

### Channel Colors
- **Light 1:** 🟡 `#fbbf24` (Amber)
- **Light 2:** 🟡 `#fbbf24` (Amber)
- **Light 3:** 🟠 `#f59e0b` (Orange)
- **Fan 1:** 🔵 `#60a5fa` (Blue)
- **Fan 2:** 🔵 `#38bdf8` (Sky Blue)
- **Custom:** 🟣 `#a78bfa` (Purple)

---

## Data Flow

```
┌──────────────┐
│ ESP32 Writes │
└──────────────┘
      ↓
devices/{deviceId}/
  - outputs/{channel} = true/false
  - currentSense/{channel}Current = float (Amps)
  - currentSense/{channel}Mismatch = bool
      ↓
┌──────────────┐
│  Web App     │
└──────────────┘
      ↓
  ON: Write onAt timestamp
 OFF: Read onAt + currentSense
      Compute elapsed hours
      Calculate energy (V × A × t)
      Accumulate into RTDB analytics
      Flush to Firestore
      ↓
┌──────────────┐
│ Analytics UI │
└──────────────┘
  Today: RTDB + live delta + currentSense
  History: Firestore device_analytics
```

---

## API Reference

### Device Service

#### Subscribe to Current Sense
```typescript
import { subscribeToCurrentSense, DeviceCurrentSense } from '@/services/deviceService';

const unsub = subscribeToCurrentSense(deviceId, (data: DeviceCurrentSense) => {
  console.log('Light 1 Current:', data.light1Current, 'A');
  console.log('Light 1 Mismatch:', data.light1Mismatch);
});

// Cleanup
unsub();
```

#### DeviceCurrentSense Interface
```typescript
interface DeviceCurrentSense {
  light1Current: number;    // Amps (0-15 typical range)
  light2Current: number;
  light3Current: number;
  fan1Current: number;
  fan2Current: number;
  customCurrent: number;
  light1Mismatch: boolean;  // true = relay ON but no current
  light2Mismatch: boolean;
  light3Mismatch: boolean;
  fan1Mismatch: boolean;
  fan2Mismatch: boolean;
  customMismatch: boolean;
}
```

### Analytics Service

#### Get Today's Date (IST)
```typescript
import { todayStr } from '@/services/analyticsService';

const today = todayStr(); // "2026-09-06" (IST, not UTC)
```

#### Constants
```typescript
const NOMINAL_VOLTAGE = 230;  // Volts (Indian standard)
const IST_OFFSET_MS = 19800 * 1000;  // UTC +5:30
```

---

## Firestore Schema

### device_analytics/{deviceId}_{YYYY-MM-DD}
```typescript
{
  deviceId: string;
  date: string;  // "YYYY-MM-DD" in IST
  light1Runtime: number;  // hours (float)
  light2Runtime: number;
  light3Runtime: number;
  fan1Runtime: number;
  fan2Runtime: number;
  customRuntime: number;
  energyUsage: number;  // kWh (float, total across all channels)
  savedAt: Timestamp;
}
```

### Retention Policy
- **Kept:** Last 7 days (today + 6 previous)
- **Deleted:** Anything older than 7 days
- **Cleanup:** Runs daily at 2 AM IST via Cloud Function

---

## Cloud Function Endpoints

### Scheduled Cleanup (Automatic)
- **Function:** `cleanupOldAnalytics`
- **Schedule:** `30 20 * * *` (8:30 PM UTC = 2:00 AM IST next day)
- **Timezone:** Asia/Kolkata
- **Action:** Deletes device_analytics docs older than 7 days

### Manual Trigger (For Testing)
- **Function:** `triggerAnalyticsCleanup`
- **Method:** HTTP POST
- **URL:** `https://us-central1-{project-id}.cloudfunctions.net/triggerAnalyticsCleanup`
- **Response:**
  ```json
  {
    "success": true,
    "message": "Deleted 42 old analytics documents (older than 2026-08-30)",
    "cutoffDate": "2026-08-30"
  }
  ```

---

## Troubleshooting

### "No data" shown for all channels
**Cause:** Device doesn't have current sensing hardware  
**Solution:** Normal behavior, energy calculation uses placeholder wattage

### Mismatch warning stuck on
**Cause:** Firmware not sending mismatch updates  
**Solution:** Check RTDB `devices/{deviceId}/currentSense/{channel}Mismatch` — should be false when healthy

### Runtime resets to zero unexpectedly
**Check:**
1. Is it midnight IST? (Day rollover expected)
2. Check RTDB `devices/{deviceId}/analyticsDate` — should match today's date
3. Check for corrupted data (runtime > 24h triggers reset)

### Energy calculation seems wrong
**Check:**
1. Verify currentSense data exists and is reasonable (0.01-15 A)
2. If no currentSense, should use placeholder: Light=40W, Fan=25W, Custom=30W
3. Formula: Energy (kWh) = (230V × Current A × Hours) / 1000

### Cloud Function not running
**Check:**
1. Function deployed: `firebase functions:list`
2. Logs: `firebase functions:log --only cleanupOldAnalytics`
3. Scheduled correctly: `firebase functions:config:get`

---

## Testing Commands

### Deploy Functions
```bash
cd functions
npm install
npm run build
firebase deploy --only functions
```

### Test Manual Trigger
```bash
curl -X POST https://us-central1-YOUR-PROJECT.cloudfunctions.net/triggerAnalyticsCleanup
```

### View Logs
```bash
firebase functions:log --only cleanupOldAnalytics --limit 10
```

### Check Firestore
```javascript
// Firebase Console → Firestore
// Collection: device_analytics
// Look for doc IDs like: A5X-HA-2647_2026-09-06
```

---

## Performance Notes

- **Current Sense Listeners:** One per device, real-time updates
- **Energy Calculation:** Only at OFF event (not continuous sampling)
- **Firestore Writes:** One per OFF event (merged upsert)
- **Cloud Function:** Runs once daily, batch deletes in single transaction
- **Page Load:** Initial data fetch + real-time subscriptions (no polling)

---

## Future Enhancements

### Potential Improvements:
1. **Continuous Energy Sampling:** Sample current every 10s for more accurate energy calculation
2. **Per-Channel Energy Display:** Show energy breakdown by channel (not just total)
3. **Historical Current Graphs:** Store and display current trends over time
4. **Notification on Mismatch:** Push notification when device stops responding
5. **Export Analytics:** CSV/PDF export for monthly reports

---

**Last Updated:** September 6, 2026  
**Version:** 1.0.0  
**Status:** Production Ready
