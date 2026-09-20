# ESP32 GPIO Pin Mapping - A5X Home Automation

**Device:** ESP32 Controller  
**Hardware Version:** v1.0  
**Last Updated:** 2026-09-07

---

## 🔌 RELAY OUTPUTS (Device Control)

| Channel | GPIO Pin | Firebase Path | Function |
|---------|----------|---------------|----------|
| Light 1 | GPIO 13 | `devices/{deviceId}/outputs/light1` | Light/Load Control |
| Light 2 | GPIO 14 | `devices/{deviceId}/outputs/light2` | Light/Load Control |
| Light 3 | GPIO 25 | `devices/{deviceId}/outputs/light3` | Light/Load Control |
| Fan 1   | GPIO 27 | `devices/{deviceId}/outputs/fan1` | Fan/Motor Control |

**Note:** 
- HIGH = Relay ON (device powered)
- LOW = Relay OFF (device off)
- Relay module: Active LOW or Active HIGH (check hardware)

---

## 📊 CURRENT SENSORS (ACS712 Modules)

| Channel | GPIO Pin | ADC Channel | Firebase Path | Status |
|---------|----------|-------------|---------------|--------|
| Light 2 | GPIO 34 | ADC1_CH6 | `devices/{deviceId}/currentSense/light2Current` | ✅ ACTIVE |
| Light 3 | GPIO 35 | ADC1_CH7 | `devices/{deviceId}/currentSense/light3Current` | ✅ ACTIVE |
| Fan 1   | GPIO 32 | ADC1_CH4 | `devices/{deviceId}/currentSense/fan1Current` | ✅ ACTIVE |
| Custom  | GPIO 39 | ADC1_CH3 | `devices/{deviceId}/currentSense/customCurrent` | ✅ ACTIVE |

**Hardware Details:**
- Sensor: ACS712-30A Hall Effect Current Sensor
- Output: 0-3.3V analog (proportional to current)
- Mapping: GPIO ADC reads voltage → firmware converts to Amperes
- Valid Range: 0A - 30A (household typical: 0.5A - 15A)

**ADC-Only Pins (Cannot be used as outputs):**
- GPIO 34, 35, 36, 39 are **input-only**
- GPIO 32 can be input/output but used as ADC input here

---

## 🗺️ CHANNEL TO GPIO MAPPING TABLE

```
┌──────────┬─────────────┬─────────────────┬──────────────────────────────┐
│ Channel  │ Relay GPIO  │ Sensor GPIO     │ Firebase Paths               │
├──────────┼─────────────┼─────────────────┼──────────────────────────────┤
│ Light 1  │ GPIO 13     │ N/A             │ outputs/light1               │
│ Light 2  │ GPIO 14     │ GPIO 34 (ADC)   │ outputs/light2               │
│          │             │                 │ currentSense/light2Current   │
│ Light 3  │ GPIO 25     │ GPIO 35 (ADC)   │ outputs/light3               │
│          │             │                 │ currentSense/light3Current   │
│ Fan 1    │ GPIO 27     │ GPIO 32 (ADC)   │ outputs/fan1                 │
│          │             │                 │ currentSense/fan1Current     │
│ Custom   │ N/A         │ GPIO 39 (ADC)   │ currentSense/customCurrent   │
└──────────┴─────────────┴─────────────────┴──────────────────────────────┘
```

---

## ⚡ POWER RATINGS (Typical)

| Load Type | Typical Current | Max Safe Current | GPIO Relay Rating |
|-----------|----------------|------------------|-------------------|
| LED Light | 0.1A - 2A | 5A | 10A (relay dependent) |
| CFL/Bulb | 0.3A - 1A | 3A | 10A |
| Ceiling Fan | 0.5A - 1.5A | 3A | 10A |
| Custom Load | Variable | 5A | 10A |

**Safety Notes:**
- ACS712-30A sensor rated for 30A max
- ESP32 GPIO max current: 12mA (relay modules isolate high current)
- Household 230V circuit breaker: typically 6A - 16A

---

## 🔧 FIRMWARE REFERENCE

**Current Sensor Calibration:**
```cpp
// Example firmware constants
#define LIGHT2_CURRENT_PIN 34
#define LIGHT3_CURRENT_PIN 35
#define FAN1_CURRENT_PIN 32
#define CUSTOM_CURRENT_PIN 39

#define ACS712_SENSITIVITY 0.066  // 66mV/A for ACS712-30A
#define ADC_VREF 3.3              // ESP32 ADC reference voltage
#define ADC_RESOLUTION 4095       // 12-bit ADC
```

**Relay Pin Definitions:**
```cpp
#define LIGHT1_RELAY_PIN 13
#define LIGHT2_RELAY_PIN 14
#define LIGHT3_RELAY_PIN 25
#define FAN1_RELAY_PIN 27
```

---

## 📝 NOTES

1. **GPIO 36 NOT USED:** Originally planned but replaced with GPIO 32
2. **Light 1:** No current sensor (basic on/off control only)
3. **Custom Channel:** Current sensor only, no relay control
4. **Mismatch Detection:** Firmware compares relay state vs measured current
5. **Zero Current:** Device OFF or sensor at noise floor (<0.01A)

---

## 🚨 TROUBLESHOOTING

### Current Sensor Shows 0A When Device ON:
- Check ACS712 module OUT wire connection to GPIO
- Verify load is actually drawing current (test with multimeter)
- Check firmware ADC calibration constants

### Relay Not Responding:
- Verify GPIO pin number in firmware matches this document
- Check relay module power supply (VCC/GND)
- Test GPIO with multimeter (should read HIGH ~3.3V when ON)

### Mismatch Alert Triggered:
- Normal: Device turned ON via physical switch (not app)
- Check: Current sensor calibration if persistent
- Firmware may need ACS712 sensitivity adjustment

---

**Document Version:** 1.0  
**Maintained By:** A5X Home Automation Team  
**Last Verified:** 2026-09-07
