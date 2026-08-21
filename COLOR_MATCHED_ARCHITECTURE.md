# Color-Matched Notifications - Architecture Diagram

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER INTERFACE                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │ Device Card  │  │ Device Card  │  │ Device Card  │         │
│  ├──────────────┤  ├──────────────┤  ├──────────────┤         │
│  │ X1 Kitchen   │  │ X2 Bedroom   │  │ X3 Bathroom  │         │
│  │ Light 🟠     │  │ Lamp 🩷      │  │ Light 🔵     │         │
│  │ [Toggle ON]  │  │ [Toggle ON]  │  │ [Toggle ON]  │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ User Toggles X1 (Kitchen Light) ON
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      DEVICE SERVICE                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  toggle('light1', true, 'Kitchen Light turned ON')             │
│           │                                                      │
│           ▼                                                      │
│  setOutput(deviceId, 'light1', true, 'User', 'Kitchen...')     │
│           │                                                      │
│           ├─► Write to RTDB: outputs/light1 = true             │
│           │                                                      │
│           ├─► Track Analytics: trackOutputChange('light1')      │
│           │                                                      │
│           └─► Log Activity with outputId                        │
│                      │                                           │
│                      ▼                                           │
│  logActivity(deviceId, 'Kitchen Light...', 'User', 'light1')   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Store in Firestore
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   FIRESTORE DATABASE                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Collection: activity_logs                                      │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ {                                                         │ │
│  │   "id": "abc123",                                         │ │
│  │   "deviceId": "device_123",                               │ │
│  │   "action": "Kitchen Light turned ON",                    │ │
│  │   "performedBy": "User",                                  │ │
│  │   "outputId": "light1",  ◄─── HARDWARE ID STORED         │ │
│  │   "timestamp": {...}                                      │ │
│  │ }                                                         │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Real-time Subscription
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                  NOTIFICATION SERVICE                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  subscribeToNotifications()                                     │
│           │                                                      │
│           ├─► Subscribe to activity_logs                        │
│           │                                                      │
│           ├─► Transform to Notification                         │
│           │        │                                            │
│           │        ▼                                            │
│           │   { action: "Kitchen Light turned ON",             │
│           │     outputId: "light1",  ◄─── FROM DATABASE        │
│           │     color: undefined }   ◄─── TO BE ENRICHED       │
│           │                                                      │
│           └─► enrichNotificationsWithColors()                   │
│                      │                                           │
│                      ▼                                           │
│               ┌──────────────────────────────────────┐          │
│               │ Fetch Device Metadata                │          │
│               │ metadata.outputMetadata['light1']    │          │
│               │ → { name, icon, color: "#ff8800" }   │          │
│               └──────────────────────────────────────┘          │
│                      │                                           │
│                      ▼                                           │
│               { action: "Kitchen Light turned ON",              │
│                 outputId: "light1",                             │
│                 color: "#ff8800" }  ◄─── ENRICHED!              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Pass Enriched Notification
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   HEADER COMPONENT                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Receives: { action, outputId, color: "#ff8800" }              │
│                      │                                           │
│                      ├─► Update notification panel state        │
│                      │                                           │
│                      └─► Create toast notification              │
│                               │                                  │
│                               ▼                                  │
│  createToastFromAction(action, deviceId, "#ff8800")            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Display with Color
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      UI COMPONENTS                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌────────────────────┐         ┌─────────────────────┐        │
│  │ NOTIFICATION PANEL │         │   TOAST POPUP       │        │
│  ├────────────────────┤         ├─────────────────────┤        │
│  │▎💡 Kitchen Light  │         │▎💡 Light Turned ON  │        │
│  │   turned ON        │         │   Kitchen Light...  │        │
│  │   just now • 🟠   │         │   just now          │        │
│  └────────────────────┘         └─────────────────────┘        │
│     ▲                                  ▲                        │
│     │                                  │                        │
│     └──── Orange border (#ff8800)     │                        │
│     └──── Orange icon (#ff8800)       │                        │
│     └──── Orange dot (#ff8800)        │                        │
│                                        │                        │
│                  └──── Orange border (#ff8800)                 │
│                  └──── Orange icon (#ff8800)                   │
│                  └──── Orange glow (#ff880026)                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Flow Diagram

```
User Action
    │
    ▼
┌─────────────────────┐
│  toggle(light1)     │
└─────────────────────┘
    │
    ▼
┌─────────────────────┐
│  setOutput()        │
│  - Write RTDB       │
│  - Track analytics  │
│  - Log activity     │
└─────────────────────┘
    │
    ▼
┌─────────────────────────────────┐
│  Firestore: activity_logs       │
│  {                              │
│    action: "Kitchen Light ON",  │
│    outputId: "light1"  ◄────────┼─── KEY: Hardware ID stored
│  }                              │
└─────────────────────────────────┘
    │
    ▼
┌─────────────────────┐
│  Notification       │
│  Service            │
│  - Subscribe        │
│  - Transform        │
│  - Enrich ──────────┼───┐
└─────────────────────┘   │
                          │
                          ▼
              ┌─────────────────────────┐
              │  Device Metadata        │
              │  outputMetadata: {      │
              │    light1: {            │
              │      color: "#ff8800" ◄─┼── KEY: Color retrieved
              │    }                    │
              │  }                      │
              └─────────────────────────┘
                          │
                          ▼
              ┌─────────────────────────┐
              │  Enriched Notification  │
              │  {                      │
              │    outputId: "light1",  │
              │    color: "#ff8800"     │
              │  }                      │
              └─────────────────────────┘
                          │
                          ▼
              ┌─────────────────────────┐
              │  UI Components          │
              │  - Notification Panel   │
              │  - Toast Popup          │
              │  (Display with color)   │
              └─────────────────────────┘
```

---

## Hardware Output ID Mapping

```
┌──────────────────────────────────────────────────────────────┐
│                    PHYSICAL DEVICE                           │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│    ESP32 Hardware Outputs                                   │
│    ┌────┐  ┌────┐  ┌────┐  ┌────┐  ┌────┐  ┌────┐         │
│    │ X1 │  │ X2 │  │ X3 │  │ X4 │  │ X5 │  │ X6 │         │
│    └────┘  └────┘  └────┘  └────┘  └────┘  └────┘         │
│      │       │       │       │       │       │              │
│      │       │       │       │       │       │              │
└──────┼───────┼───────┼───────┼───────┼───────┼──────────────┘
       │       │       │       │       │       │
       │       │       │       │       │       │
┌──────┼───────┼───────┼───────┼───────┼───────┼──────────────┐
│      ▼       ▼       ▼       ▼       ▼       ▼              │
│   light1  light2  light3   fan1    fan2  custom1            │
│      │       │       │       │       │       │              │
│      │       │       │       │       │       │              │
│   HARDWARE IDs (Never Change)                               │
│      │       │       │       │       │       │              │
└──────┼───────┼───────┼───────┼───────┼───────┼──────────────┘
       │       │       │       │       │       │
       ▼       ▼       ▼       ▼       ▼       ▼
┌──────────────────────────────────────────────────────────────┐
│                   DISPLAY NAMES (Can Change)                 │
├──────────────────────────────────────────────────────────────┤
│  "Kitchen"  "Bedroom"  "Bath"  "Living"  "Bedroom"  "Garage" │
│  "Light"    "Lamp"     "Light" "Fan"     "Fan"      "Door"   │
└──────────────────────────────────────────────────────────────┘
       │       │       │       │       │       │
       ▼       ▼       ▼       ▼       ▼       ▼
┌──────────────────────────────────────────────────────────────┐
│                   CUSTOM COLORS                              │
├──────────────────────────────────────────────────────────────┤
│   🟠      🩷       🔵      🟢       🟦       🟣              │
│  Orange    Pink     Blue    Green    Cyan    Purple          │
│  #ff8800  #ff69b4  #0088ff  #00ff88  #00d4ff  #8800ff       │
└──────────────────────────────────────────────────────────────┘
       │       │       │       │       │       │
       └───────┴───────┴───────┴───────┴───────┘
                       │
                       ▼
           ┌───────────────────────┐
           │  Firestore Metadata   │
           │  outputMetadata: {    │
           │    light1: {          │
           │      name: "Kitchen", │
           │      color: "#ff8800" │
           │    },                 │
           │    light2: { ... },   │
           │    ...                │
           │  }                    │
           └───────────────────────┘
```

---

## Color Enrichment Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ STEP 1: Activity Log Created                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  User toggles X1 (Kitchen Light) ON                            │
│                                                                 │
│  Firestore Document Created:                                   │
│  {                                                             │
│    "action": "Kitchen Light turned ON",                        │
│    "outputId": "light1"  ◄─── CRITICAL: Hardware ID           │
│  }                                                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 2: Transform to Notification                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  activityLogToNotification(log)                                │
│                                                                 │
│  notification = {                                              │
│    action: "Kitchen Light turned ON",                          │
│    outputId: "light1",  ◄─── Copied from log                  │
│    color: undefined     ◄─── Not yet enriched                  │
│  }                                                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 3: Enrich with Color                                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  enrichNotificationsWithColors(notifications)                  │
│                                                                 │
│  For notification with outputId = "light1":                    │
│                                                                 │
│    1. Fetch device metadata                                    │
│    2. Access metadata.outputMetadata['light1']                 │
│    3. Extract color = "#ff8800"                                │
│    4. Add to notification                                      │
│                                                                 │
│  enrichedNotification = {                                      │
│    action: "Kitchen Light turned ON",                          │
│    outputId: "light1",                                         │
│    color: "#ff8800"  ◄─── ENRICHED!                            │
│  }                                                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 4: Display with Color                                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Notification Panel:                                           │
│  - Border: 3px solid #ff8800                                   │
│  - Icon: color #ff8800                                         │
│  - Background: #ff880014 (8% opacity)                          │
│                                                                 │
│  Toast Popup:                                                  │
│  - Border: 3px solid #ff8800                                   │
│  - Icon: color #ff8800                                         │
│  - Glow: 0 0 20px #ff880026                                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Key Architectural Decisions

### 1. Store Hardware ID in Database
**Why**: Text parsing is unreliable for renamed outputs  
**How**: Added optional `outputId` field to activity logs  
**Result**: 100% reliable output identification  

### 2. Enrich After Fetching
**Why**: Keep database simple, compute colors on-demand  
**How**: Async enrichment function fetches metadata  
**Result**: Flexible, maintainable, efficient  

### 3. Direct ID Lookup
**Why**: No text parsing, no string matching  
**How**: Use outputId as direct key: `metadata[outputId]`  
**Result**: Fast, reliable, simple  

### 4. Optional Field
**Why**: Backward compatibility with existing logs  
**How**: Make outputId optional in interface  
**Result**: No migration needed, graceful degradation  

### 5. Validation
**Why**: Prevent invalid output IDs  
**How**: Whitelist check: `['light1', 'light2', ...]`  
**Result**: Safe, predictable, error-free  

---

**Architecture Version**: 2.0  
**Last Updated**: August 21, 2026  
**Status**: ✅ Production Ready
