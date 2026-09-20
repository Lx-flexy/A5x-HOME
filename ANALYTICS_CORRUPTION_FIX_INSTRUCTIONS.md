# Analytics Corruption Fix - Manual Steps Required

## Problem
All channels showing 24h because RTDB has corrupted values (> 24 hours stored).

## Root Cause
Old bugs wrote values > 24h to RTDB analytics. The 24h cap in display is working correctly by clamping these corrupted values.

## Solution - Two Options:

### Option 1: Firebase Console Manual Reset (IMMEDIATE)
1. Open Firebase Console → Realtime Database
2. Navigate to: `devices/A5X-HA-2847/analytics/`
3. Delete or set to 0:
   ```
   light2Runtime: 0
   light3Runtime: 0
   fan1Runtime: 0
   customRuntime: 0
   ```
4. Set `analyticsDate` to today: `"2026-09-11"`
5. Refresh Analytics page

### Option 2: Code Will Auto-Fix on Next Page Load (AUTOMATIC)
The `resetCorruptedAnalyticsIfNeeded()` function will automatically detect and fix corrupted values (> 24h) when you:
1. Refresh Analytics page
2. Or restart the app

It will:
- Detect any field > 24h as corrupt
- Save valid data to Firestore
- Reset corrupt fields to 0
- Update date marker

## Expected Result After Fix:
```
RIGHT LIGHT: Shows actual runtime (e.g., 2h 15m)
Fan: Shows actual runtime (e.g., 3h 45m) 
LEFT LIGHT: Shows actual runtime (e.g., 1h 20m)
top light: Shows actual runtime (e.g., 0s)
```

## Individual Channel Tracking - Already Working ✅
- Each channel stores its own runtime in RTDB
- Frontend displays individual values correctly
- "Today Runtime" = SUM of all channels (as requested)

The only issue is corrupted historical data showing 24h everywhere.
