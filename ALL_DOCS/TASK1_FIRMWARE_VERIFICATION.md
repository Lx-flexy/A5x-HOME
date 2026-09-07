# Task 1: Firmware RTDB Path Verification — COMPLETE

## Evidence from Firmware Source Code

### 1. Channel Configuration (4 channels confirmed)

**Source:** `a5x_home_fermware/core/device_state.h` (lines 6-10, 13-16, 23-26, 34-37)

```cpp
// 4-channel configuration: Light2, Light3, Fan1, Custom1
struct DeviceState {
    // Outputs (relay states)
    bool light2{false};
    bool light3{false};
    bool fan1{false};
    bool custom1{false};

    // Current Sensing (measured current in Amps)
    float light2Current{0.0f};
    float light3Current{0.0f};
    float fan1Current{0.0f};
    float customCurrent{0.0f};

    // Current Mismatch (relay ON but no current detected)
    bool light2Mismatch{false};
    bool light3Mismatch{false};
    bool fan1Mismatch{false};
    bool customMismatch{false};

    // Analytics - cumulative session seconds
    uint32_t light2Runtime{0};
    uint32_t light3Runtime{0};
    uint32_t fan1Runtime{0};
    uint32_t customRuntime{0};
    float    energyUsage{0.0f};
}
```

**Confirmed:** Firmware has exactly 4 channels:
- Light2 (index 0)
- Light3 (index 1)
- Fan1 (index 2)
- Custom1 (index 3)

**Light1 and Fan2 do NOT exist in firmware.**

---

### 2. RTDB Path Structure (nested under devices/{deviceId}/)

**Source:** `a5x_home_fermware/services/rtdb_service.cpp` (lines 245-254 in `pushAnalytics()`)

```cpp
void RtdbService::pushAnalytics() {
    if (!Firebase.ready()) return;

    FirebaseJson json;
    json.set("analytics/light2Runtime",  (int)g_state.light2Runtime);
    json.set("analytics/light3Runtime",  (int)g_state.light3Runtime);
    json.set("analytics/fan1Runtime",    (int)g_state.fan1Runtime);
    json.set("analytics/customRuntime",  (int)g_state.customRuntime);
    json.set("analytics/energyUsage",    g_state.energyUsage);
    
    // Current sense data
    json.set("currentSense/light2Current",   g_state.light2Current);
    json.set("currentSense/light3Current",   g_state.light3Current);
    json.set("currentSense/fan1Current",     g_state.fan1Current);
    json.set("currentSense/customCurrent",   g_state.customCurrent);
    json.set("currentSense/light2Mismatch",  g_state.light2Mismatch);
    json.set("currentSense/light3Mismatch",  g_state.light3Mismatch);
    json.set("currentSense/fan1Mismatch",    g_state.fan1Mismatch);
    json.set("currentSense/customMismatch",  g_state.customMismatch);

    if (!Firebase.updateNode(_fbAnalytics, FB_ROOT, json)) {
        LOG_ERROR("RTDB [pushAnalytics] FAILED: %s", _fbAnalytics.errorReason().c_str());
    } else {
        LOG_INFO("RTDB [pushAnalytics] OK");
    }
}
```

**RTDB Path Confirmed:**
```
devices/{deviceId}/
  currentSense/
    light2Current: float (Amps)
    light3Current: float (Amps)
    fan1Current: float (Amps)
    customCurrent: float (Amps)
    light2Mismatch: bool
    light3Mismatch: bool
    fan1Mismatch: bool
    customMismatch: bool
  analytics/
    light2Runtime: int (seconds)
    light3Runtime: int (seconds)
    fan1Runtime: int (seconds)
    customRuntime: int (seconds)
    energyUsage: float
```

**Path Structure:** NESTED (not flat)
- Base path: `devices/{deviceId}/` (FB_ROOT constant)
- Current sense path: `devices/{deviceId}/currentSense/*`
- Analytics path: `devices/{deviceId}/analytics/*`

---

### 3. Comparison with Web App Implementation

**Web App Path (current):** `devices/{deviceId}/currentSense/*`

**Firmware Path (actual):** `devices/{deviceId}/currentSense/*`

✅ **MATCH** — Web app is listening to the correct path structure!

**However:**

❌ **MISMATCH** — Web app supports 6 channels (light1-3, fan1-2, custom1)  
✅ **FIRMWARE** — Only has 4 channels (light2-3, fan1, custom1)

---

### 4. Data Types

**Firmware writes:**
- `currentSense/{channel}Current` → `float` (Amps)
- `currentSense/{channel}Mismatch` → `bool`
- `analytics/{channel}Runtime` → `int` (seconds, NOT hours)
- `analytics/energyUsage` → `float` (units not specified in firmware, likely kWh)

**Web App expects:**
- `currentSense/{channel}Current` → `number` ✅ (TypeScript number = C++ float)
- `currentSense/{channel}Mismatch` → `boolean` ✅
- `analytics/{channel}Runtime` → `number` (but web app stores in **hours**, firmware sends **seconds**) ⚠️

---

### 5. Analytics Runtime Units Mismatch

**CRITICAL FINDING:**

**Firmware Source:** `a5x_home_fermware/core/device_state.h` (line 35)
```cpp
// Analytics - cumulative session seconds
uint32_t light2Runtime{0};
```

**Firmware writes:** `analytics/light2Runtime` as **seconds** (int)

**Web App stores:** Runtime in **hours** (float)

**Impact:** 
- If firmware writes 3600 (1 hour in seconds)
- Web app reads 3600 and treats it as 3600 hours = 150 days!
- Or if web app writes 1.0 (1 hour), firmware sees 1 second

**This is a CRITICAL BUG** — units are incompatible between firmware and web app.

---

## Summary of Findings

### ✅ Verified Correct:
1. **RTDB path structure** — `devices/{deviceId}/currentSense/*` is correct
2. **Path nesting** — Nested under device root (not flat)
3. **Data types** — float/bool match TypeScript number/boolean

### ❌ Critical Mismatches Found:

1. **Channel count:**
   - Firmware: 4 channels (Light2, Light3, Fan1, Custom1)
   - Web app: 6 channels (Light1, Light2, Light3, Fan1, Fan2, Custom1)
   - **Fix required:** Remove Light1 and Fan2 from web app

2. **Runtime units:**
   - Firmware: seconds (int)
   - Web app: hours (float)
   - **Fix required:** Web app must read/write in seconds, display in hours

3. **Channel naming:**
   - Firmware starts at Light2 (no Light1)
   - Web app assumes Light1 exists
   - **Fix required:** Align web app to Light2-based naming

---

## Recommendations for Task 2 & 3

### Task 2: Remove Light1 and Fan2
- Delete from TypeScript interfaces
- Remove from UI components
- Remove from RTDB listeners
- Remove from analytics calculations
- Search entire codebase for "light1" and "fan2" references

### Task 3: Fix Runtime Units
- When reading from RTDB: convert seconds → hours (divide by 3600)
- When writing to RTDB: convert hours → seconds (multiply by 3600)
- Display layer: continue showing hours/minutes/seconds
- Storage layer: always use seconds to match firmware

### Additional Fix (not in original task):
**Fix analytics unit mismatch:**
- Web app currently writes `analytics/*Runtime` in hours
- Firmware expects seconds
- Add conversion layer or coordinate with firmware team

---

## Status

✅ **Task 1 Complete** — RTDB path verified with direct firmware code evidence

**Next:** Proceed to Task 2 (remove Light1/Fan2) and Task 3 (continuous energy calculation)
