# Toast Notification System - Quick Reference

## 🎯 For Users

### Toast Popups

**Automatic Notifications:**
- Appear at top-right of screen
- Show device events (lights, fans, online/offline)
- Auto-dismiss after 5 seconds
- Click X to close manually

**Example Toast:**
```
┌─────────────────────────────────────┐
│ 💡  Light 1 turned ON          [X] │
│     Office • just now               │
└─────────────────────────────────────┘
```

### Pause Notifications

**To Pause Toasts:**
1. Click bell icon 🔔
2. Click "Pause" button in panel
3. Choose duration:
   - 15 minutes
   - 1 hour
   - Until tomorrow

**When Paused:**
- Bell icon changes to 🔕 (slashed bell)
- Popup toasts don't appear
- Events still logged
- History still accessible in panel

**To Resume:**
1. Click bell icon 🔕
2. Click "Resume" button

---

## 🔧 For Developers

### Show Custom Toast

```typescript
import { showToast } from '../services/toastNotificationService';

showToast({
  id: 'unique-id-123',
  type: 'success', // 'success' | 'info' | 'warning' | 'error'
  icon: 'check',
  title: 'Action Completed',
  description: 'Your changes were saved successfully',
  deviceId: 'esp32_001',
  color: '#16a34a',
  duration: 5000, // optional, default 5000ms
});
```

### Dismiss Toast

```typescript
import { dismissToast } from '../services/toastNotificationService';

dismissToast('toast-id-123');
```

### Clear All Toasts

```typescript
import { clearAllToasts } from '../services/toastNotificationService';

clearAllToasts();
```

### Pause Notifications

```typescript
import { pauseNotifications } from '../services/toastNotificationService';

await pauseNotifications(userId, '15min'); // '15min' | '1hour' | 'tomorrow'
```

### Resume Notifications

```typescript
import { resumeNotifications } from '../services/toastNotificationService';

await resumeNotifications(userId);
```

### Subscribe to Toasts

```typescript
import { subscribeToToasts } from '../services/toastNotificationService';

const unsub = subscribeToToasts((toasts) => {
  console.log('Current toasts:', toasts);
});

// Cleanup
return () => unsub();
```

### Subscribe to Pause State

```typescript
import { subscribeToPauseState } from '../services/toastNotificationService';

const unsub = subscribeToPauseState(userId, (state) => {
  console.log('Paused:', state.paused);
  console.log('Until:', new Date(state.pausedUntil || 0));
});

// Cleanup
return () => unsub();
```

---

## 📊 Toast Types & Icons

| Type | Icon | Color | Use Case |
|------|------|-------|----------|
| `success` | check | Green | Successful actions |
| `info` | lightbulb/wind | Custom | Device controls |
| `warning` | wifi-off | Orange | Connection issues |
| `error` | alert | Red | Errors, failures |

---

## 🎨 Available Icons

- `lightbulb` - Light control
- `lightbulb-off` - Light off
- `wind` - Fan control
- `wifi` - Device online
- `wifi-off` - Device offline
- `cpu` - Device management
- `bot` - Dex Bot
- `zap` - All devices
- `check` - Success
- `alert` - Error/warning

---

## 🗄️ Firestore Collections

### `notification_pause`
```typescript
{
  userId: string;
  paused: boolean;
  pausedUntil: number | null;
  pauseDuration: '15min' | '1hour' | 'tomorrow' | null;
  pausedAt: number | null;
  updatedAt: Timestamp;
}
```

**Document ID:** `{userId}`

---

## ⚙️ Configuration

### Max Visible Toasts
Default: 4 (prevents screen clutter)

### Auto-Dismiss Duration
Default: 5000ms (5 seconds)

### Deduplication Window
Default: 2000ms (2 seconds)

### Toast Position
Fixed: `top: 80px, right: 24px`

---

## 🧪 Testing

### Manual Test Commands

```bash
# TypeScript check
npx tsc --noEmit

# Production build
npm run build

# Development server
npm run dev
```

### Test Scenarios

1. **Light ON**
   - Turn on any light
   - Toast should appear: "💡 Light X turned ON"

2. **Multiple Toasts**
   - Turn on 3 lights quickly
   - All 3 toasts should stack vertically

3. **Auto-Dismiss**
   - Turn on a light
   - Toast should disappear after 5 seconds

4. **Manual Close**
   - Turn on a light
   - Click X button
   - Toast should close immediately

5. **Pause 15 Minutes**
   - Click bell → Pause → 15 minutes
   - Turn on a light
   - No toast should appear
   - Notification still in panel

6. **Resume**
   - While paused, click bell → Resume
   - Turn on a light
   - Toast should appear

---

## 🔍 Troubleshooting

### Toast Not Appearing

**Check:**
1. Is notification paused? (Bell shows 🔕)
2. Is event logged to activity_logs?
3. Browser console for errors
4. Firebase connection status

### Duplicate Toasts

**Solution:** Already handled by deduplication system (2-second window)

### Toast Stuck on Screen

**Solution:** Click X button or wait for auto-dismiss (5 seconds)

### Pause Not Working

**Check:**
1. Firestore connection
2. User authenticated
3. `notification_pause` collection exists
4. Browser console for errors

---

## 📝 Common Patterns

### Show Toast After Action

```typescript
// Perform action
await setOutput(deviceId, 'light1', true);

// Toast will automatically appear
// (Header component handles this)
```

### Custom Toast Duration

```typescript
showToast({
  id: 'long-toast',
  type: 'info',
  icon: 'check',
  title: 'Processing...',
  description: 'This will take a moment',
  duration: 10000, // 10 seconds
});
```

### Programmatic Dismiss

```typescript
const toastId = 'custom-toast-123';

showToast({
  id: toastId,
  // ... other properties
});

// Later...
setTimeout(() => {
  dismissToast(toastId);
}, 3000);
```

---

## 🎯 Key Features

✅ Auto-display on device events  
✅ Slide-in/out animations  
✅ Manual close button  
✅ Auto-dismiss (5 seconds)  
✅ Stack multiple toasts  
✅ Max 4 visible  
✅ Pause for 15min/1hour/tomorrow  
✅ Auto-resume when expires  
✅ Visual pause indicator (🔕)  
✅ Events still logged when paused  
✅ Dark/Light theme support  
✅ Custom output colors  
✅ Deduplication  
✅ Accessible (ARIA labels)  
✅ Keyboard support  
✅ No localStorage  

---

## 🔗 Related Files

- `src/services/toastNotificationService.ts` - Service layer
- `src/components/ui/ToastContainer.tsx` - Toast UI
- `src/components/ui/NotificationPanel.tsx` - Pause controls
- `src/components/layout/Header.tsx` - Integration
- `src/components/layout/AppLayout.tsx` - Toast container mount
- `src/index.css` - Toast animations

---

## 🎓 Architecture

```
User Action
    ↓
Activity Log (Firestore)
    ↓
Notification Service
    ↓
Header (creates toast)
    ↓
Toast Service (checks pause state)
    ↓
Toast Queue
    ↓
Toast Container (renders)
    ↓
Toast appears at top-right
```

---

**Quick Start:** Toasts appear automatically when devices are controlled! To pause, click the bell and select "Pause". 🔔
