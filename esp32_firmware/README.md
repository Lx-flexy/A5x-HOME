# A5X ESP32 Firmware Setup

## Arduino IDE Setup

1. **Board:** ESP32 Dev Module
2. **Install libraries** via Library Manager:
   - `Firebase ESP32 Client` by Mobizt (v4.x)
   - `ArduinoJson` by Benoit Blanchon

## Firebase Setup

1. Firebase Console → Authentication → Sign-in methods → **Enable Anonymous**
2. Realtime Database → Rules → set:
```json
{
  "rules": {
    "devices": {
      "$deviceId": {
        ".read": "auth != null",
        ".write": "auth != null"
      }
    }
  }
}
```

## Config Changes in .ino file

| Field | Value |
|-------|-------|
| `WIFI_SSID` | Your WiFi name |
| `WIFI_PASSWORD` | Your WiFi password |
| `DEVICE_ID` | Must match app — e.g. `A5X-HA-2847` |
| `FIREBASE_HOST` | From your .env `VITE_FIREBASE_DATABASE_URL` (without https://) |
| `FIREBASE_API_KEY` | From your .env `VITE_FIREBASE_API_KEY` |

## Pin Wiring (change in .ino if different)

| Output | Pin |
|--------|-----|
| Light 1 | GPIO 26 |
| Light 2 | GPIO 27 |
| Light 3 | GPIO 14 |
| Fan 1 | GPIO 25 |
| Fan 2 | GPIO 33 |
| Custom | GPIO 32 |
| Buzzer | GPIO 4 |

## How Online Status Works

ESP32 writes `devices/A5X-HA-2847/health/lastSeen` every **10 seconds**.
Web app checks: `Date.now() - lastSeen < 30000ms` → Online ✅

If ESP32 loses power → lastSeen stops updating → after 30s → Offline ❌
