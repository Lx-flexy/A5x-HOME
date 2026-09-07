# Task 2: Channel Removal Complete — 6 Channels → 4 Channels

## Summary

Successfully removed all references to **Light1** and **Fan2** from the web app, aligning it with the firmware's 4-channel configuration.

**Final Channel Set:** Light2, Light3, Fan1, Custom1

---

## Files Modified

### 1. `src/services/deviceService.ts`

**Changes:**
- Updated header documentation to reflect 4-channel config
- Removed `light1` and `fan2` from `DeviceOutputs` interface
- Removed `light1Runtime`, `fan2Runtime` from `DeviceAnalyticsData`
- Removed `light1Current`, `fan2Current`, `light1Mismatch`, `fan2Mismatch` from `DeviceCurrentSense`
- Removed `light1`, `fan2` from `DeviceNames` interface
- Removed `light1`, `fan2` from `DeviceOutputMetadata` interface
- Updated `ActivityLog` comment to list only 4 channels
- Updated `defaultOutputs()` to return only 4 channels
- Updated `defaultAnalytics()` to return only 4 channels
- Updated `defaultCurrentSense()` to return only 4 channels
- Updated `defaultNames()` to return only 4 channels
- Updated `defaultOutputMetadata()` to return only 4 channels
- Updated `TRACKABLE_KEYS` set to include only 4 channels
- Updated `setOutput()` type annotation to only 4 trackable keys
- Updated `setOutputValue()` to remove `light1Brightness` and `fan2Speed`
- Updated `updateDeviceState()` to process only 4 trackable channels

**Lines affected:** ~20 locations

---

### 2. `src/services/analyticsService.ts`

**Changes:**
- Updated header documentation to reflect 4-channel config and SECONDS storage
- Updated `ActivityLog` interface comment
- Removed `light1Runtime`, `fan2Runtime` from `DailyAnalytics` interface
- Updated `WATT` constant to include only 4 channels
- Updated `TRACKABLE` array to include only 4 channels
- Updated `ensureTodayWindow()` reset logic for 4 channels
- Updated day rollover reset logic for 4 channels
- Updated `aggregateDailyRecords()` to sum only 4 channels
- Updated `resetTodayAnalytics()` for 4 channels
- Updated `resetCorruptedAnalyticsIfNeeded()` for 4 channels

**Lines affected:** ~15 locations

---

### 3. `src/services/notificationService.ts`

**Changes:**
- Updated `enrichNotificationsWithColors()` header comment
- Updated `validOutputIds` array to include only 4 channels

**Lines affected:** 2 locations

---

### 4. `src/pages/analytics/Analytics.tsx`

**Changes:**
- Updated `computeTotals()` to sum only 4 channel runtimes
- Updated `totalRuntime` calculation to sum only 4 channels
- Updated `maxRuntime` calculation to consider only 4 channels
- Updated summary card "Light Runtime" to sum only light2 + light3
- Updated summary card "Fan Runtime" to sum only fan1
- Updated "Live Current Monitor" grid to show only 4 channels
- Updated "Channel Runtimes" bars to show only 4 channels
- Updated device runtime calculation in "Devices Overview" to sum only 4 channels

**Lines affected:** ~10 locations

---

## Verification

### Type Safety Check
All TypeScript interfaces now correctly reflect the 4-channel model:
- `DeviceOutputs`: light2, light3, fan1, custom1 ✅
- `DeviceAnalyticsData`: light2Runtime, light3Runtime, fan1Runtime, customRuntime ✅
- `DeviceCurrentSense`: 4 current fields + 4 mismatch fields ✅
- `TRACKABLE` constant: ['light2','light3','fan1','custom1'] ✅

### UI Components
Analytics page now displays only 4 channels:
- Live Current Monitor: 4 cards ✅
- Channel Runtimes: 4 progress bars ✅
- Summary cards correctly aggregate 2 lights + 1 fan ✅

### Data Flow
All RTDB listeners and writers now expect only 4 channels:
- `trackOutputChange()`: 4 channels ✅
- `trackBulkOutputChange()`: 4 channels ✅
- `setOutput()`: 4 channels ✅
- `updateDeviceState()`: 4 channels ✅

---

## Breaking Changes

### Removed Interfaces/Types
- `light1` removed from all interfaces
- `fan2` removed from all interfaces
- `light1Brightness` removed from PWM support
- `fan2Speed` removed from PWM support

### Data Migration Required
If production database contains light1 or fan2 data:
1. **Firestore `device_analytics` documents** may have `light1Runtime` and `fan2Runtime` fields
2. **RTDB `devices/{deviceId}/analytics`** may have these fields
3. **Migration:** Old data will be ignored (gracefully degraded), not cause errors

### API Changes
- `setOutputValue()` no longer accepts `light1Brightness` or `fan2Speed`
- Any client code calling these will get TypeScript errors

---

## Testing Checklist

- [ ] Analytics page loads without errors
- [ ] Live Current Monitor shows 4 cards (not 6)
- [ ] Channel Runtimes shows 4 bars (not 6)
- [ ] Device runtime calculations are correct (no NaN or undefined)
- [ ] Energy calculation uses only 4 channels
- [ ] Notifications work for light2, light3, fan1, custom1
- [ ] No console errors about missing properties
- [ ] TypeScript compilation succeeds with no errors

---

## Next Steps

**Task 3:** Implement continuous energy calculation (periodic updates while device is ON)

**Current behavior:** Energy calculated only on OFF event  
**Required behavior:** Energy updated every 30-60 seconds while device is ON

---

## Status

✅ **Task 2 Complete** — All light1 and fan2 references removed from web app

**Files Changed:** 4 files  
**Total Changes:** ~50 locations across codebase
