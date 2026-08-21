# Notification System - Quick Reference

## 🎯 For Users

### How to Use Notifications

1. **View Notifications**
   - Click the bell icon (🔔) in the top-right header
   - Panel opens showing recent activity

2. **Unread Badge**
   - Blue dot appears when you have unread notifications
   - Disappears when all are read

3. **Mark as Read**
   - **Single**: Click any notification
   - **All**: Click the ✓ button in panel header

4. **Clear History**
   - Click the 🗑️ button in panel header
   - Clears your read state (doesn't delete activity logs)

5. **Close Panel**
   - Click outside the panel
   - Press Escape key
   - Click bell icon again

---

## 🔧 For Developers

### Quick Integration

The notification system is automatically integrated into the Header component. No additional setup needed!

### Service Functions

```typescript
import {
  subscribeToNotifications,
  markNotificationsAsRead,
  markAllNotificationsAsRead,
  clearNotificationHistory,
  getUnreadCount,
} from '../services/notificationService';

// Subscribe to notifications
const unsub = subscribeToNotifications(
  userId,
  deviceIds,
  (notifications) => {
    // Handle notifications
  },
  50 // optional limit
);

// Clean up
return () => unsub();
```

### Notification Structure

```typescript
interface Notification {
  id: string;
  deviceId: string;
  action: string;         // e.g., "Light 1 turned ON"
  performedBy: string;    // User who performed action
  timestamp: Timestamp;   // Firestore timestamp
  read: boolean;          // Read state
  category: NotificationCategory;
  icon: string;           // Icon name
}
```

### Categories

| Category | Icon | Examples |
|----------|------|----------|
| `device_status` | 🔌 wifi | Device online/offline |
| `output_control` | ⚡ zap | Light/Fan ON/OFF |
| `device_mgmt` | 💻 cpu | Device added/removed |
| `output_mgmt` | ⚙️ settings | Output updated/hidden |
| `system` | ⚠️ alert | Errors, warnings |
| `dexbot` | 🤖 bot | Dex Bot events |
| `other` | 📊 activity | General activity |

---

## 🗄️ Firestore Collections

### `activity_logs` (Existing)
```typescript
{
  id: string;
  deviceId: string;
  action: string;
  performedBy: string;
  timestamp: Timestamp;
}
```

### `user_notifications` (New)
```typescript
{
  userId: string;
  readNotifications: string[];  // IDs of read notifications
  lastRead: Timestamp;
}
```

**Document ID:** `{userId}`

---

## 🎨 Theme Support

### Dark Mode
```css
Background:    var(--bg-primary)
Text:          var(--text-primary)
Secondary:     var(--text-secondary)
Tertiary:      var(--text-tertiary)
Border:        var(--border-color)
Unread BG:     var(--bg-secondary)
Blue Badge:    #2563eb
```

### Light Mode
Automatically inherits existing light theme variables.

---

## 📊 Performance

- **Max devices per query**: 5 (Firestore limitation)
- **Default notification limit**: 50
- **Bundle size increase**: ~8 KB (0.7%)
- **Real-time updates**: Yes (Firestore subscriptions)

---

## 🔍 Troubleshooting

### Badge Not Showing
- Check if user has unread notifications
- Verify Firebase connection
- Check browser console for errors

### Panel Not Opening
- Verify bell button onClick handler
- Check for JavaScript errors
- Ensure notification panel component imported

### Notifications Not Updating
- Check if user has devices
- Verify Firestore rules allow read access
- Check if activity_logs collection has data

### Read State Not Persisting
- Verify Firestore rules allow write access to `user_notifications`
- Check if user is authenticated
- Verify userId is correct

---

## 🧪 Testing Commands

```bash
# TypeScript check
npx tsc --noEmit

# Production build
npm run build

# Development server
npm run dev
```

---

## 📝 Common Patterns

### Get Unread Count
```typescript
const unreadCount = getUnreadCount(notifications);
```

### Mark Specific Notifications Read
```typescript
await markNotificationsAsRead(userId, [notif1.id, notif2.id]);
```

### Mark All Read
```typescript
const allIds = notifications.map(n => n.id);
await markAllNotificationsAsRead(userId, allIds);
```

### Clear All
```typescript
await clearNotificationHistory(userId);
```

---

## 🎯 Key Features

✅ Real-time updates  
✅ Read/unread tracking  
✅ Persistent across sessions  
✅ Dark/Light mode support  
✅ Auto-categorization  
✅ Icon assignment  
✅ Time ago formatting  
✅ Empty state handling  
✅ Keyboard support (Escape)  
✅ Click outside to close  
✅ Smooth animations  
✅ Responsive design  
✅ TypeScript typed  
✅ No localStorage  
✅ Reuses existing data  

---

## 🔗 Related Files

- `src/services/notificationService.ts` - Service layer
- `src/components/ui/NotificationPanel.tsx` - UI component
- `src/components/layout/Header.tsx` - Integration point
- `src/services/analyticsService.ts` - Activity log source (existing)
- `src/services/deviceService.ts` - Device data source (existing)

---

**Quick Start:** The notification system is ready to use! Just click the bell icon. 🔔
