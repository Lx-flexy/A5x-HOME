# Web Push Notifications Setup Guide

## Overview
Web Push Notifications implemented using Firebase Cloud Messaging (FCM). Users can receive notifications even when the browser/tab is closed - just like a native app!

## Features Implemented
✅ Service Worker for background notifications
✅ Push notification permission request UI
✅ FCM token management in Firestore
✅ Foreground and background message handling
✅ Notification click handling (opens app)
✅ Auto-permission request on login (if previously granted)
✅ Notification preferences in Settings

## Setup Steps

### 1. Generate VAPID Key (Web Push Certificate)

Run this command in your terminal:

```bash
firebase login
cd functions
node -e "const admin = require('firebase-admin'); admin.initializeApp(); admin.messaging().getToken().then(console.log);"
```

**OR** use Firebase Console:
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: **home-automation-a5x**
3. Go to **Project Settings** → **Cloud Messaging**
4. Under **Web Push certificates** → Click **Generate key pair**
5. Copy the generated **Key pair** (starts with `B...`)

### 2. Add VAPID Key to Environment Variables

Add to `.env`:
```env
VITE_FIREBASE_VAPID_KEY="YOUR_GENERATED_VAPID_KEY"
```

Add to Vercel Environment Variables:
- Go to Vercel Dashboard → Your Project → Settings → Environment Variables
- Add: `VITE_FIREBASE_VAPID_KEY` = `YOUR_GENERATED_VAPID_KEY`
- Enable for: Production, Preview, Development

### 3. Update fcmService.ts

Replace the placeholder VAPID key in `src/services/fcmService.ts`:

```typescript
const token = await getToken(messaging, {
  vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY // Update this line
});
```

### 4. Enable Firebase Cloud Messaging API

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select project: **home-automation-a5x**
3. Go to **APIs & Services** → **Library**
4. Search for **"Firebase Cloud Messaging API"**
5. Click **Enable**

### 5. Test Push Notifications

#### Local Testing:
1. Run: `npm run dev`
2. Open: `http://localhost:5174`
3. Login to your account
4. Go to **Settings** → **Notifications**
5. Click **"Enable Push Notifications"**
6. Grant permission when browser asks
7. Check browser console for FCM token

#### Test Notification from Firebase Console:
1. Go to Firebase Console → **Cloud Messaging**
2. Click **"Send your first message"**
3. Fill notification title and body
4. Click **"Send test message"**
5. Paste your FCM token (from browser console)
6. Click **"Test"**

### 6. Deploy

```bash
git add .
git commit -m "feat: Add web push notifications"
git push origin main
```

Vercel will auto-deploy with the new environment variable.

## File Structure

```
├── public/
│   └── firebase-messaging-sw.js          # Service Worker (background notifications)
├── src/
│   ├── services/
│   │   ├── fcmService.ts                 # FCM logic (token, permission)
│   │   └── firebase.ts                   # Firebase initialization (updated)
│   ├── components/
│   │   └── settings/
│   │       └── PushNotificationSettings.tsx  # UI component
│   ├── pages/
│   │   └── settings/Settings.tsx         # Settings page (updated)
│   └── context/
│       └── AuthContext.tsx               # FCM init on login (updated)
└── PUSH_NOTIFICATIONS_SETUP.md          # This file
```

## How It Works

### 1. **Permission Request**
- User clicks "Enable Push Notifications" in Settings
- Browser shows permission dialog
- On grant: FCM token is generated and saved to Firestore

### 2. **Token Storage**
```
users/{userId}/fcmTokens/{token}
  - token: string
  - createdAt: timestamp
  - userAgent: string
  - platform: string
```

### 3. **Foreground Messages**
- App is open → `onForegroundMessage()` handles it
- Shows browser notification even when app is focused

### 4. **Background Messages**
- App is closed → Service Worker handles it
- `firebase-messaging-sw.js` shows notification
- User clicks → App opens

### 5. **Sending Notifications**

From Cloud Functions (when device state changes):

```typescript
import { getMessaging } from 'firebase-admin/messaging';

const messaging = getMessaging();

// Get user's FCM tokens
const tokensSnapshot = await admin.firestore()
  .collection(`users/${userId}/fcmTokens`)
  .get();

const tokens = tokensSnapshot.docs.map(doc => doc.data().token);

// Send notification to all user's devices
if (tokens.length > 0) {
  await messaging.sendEachForMulticast({
    tokens,
    notification: {
      title: 'Device Status Changed',
      body: 'Living Room Light is now ON',
    },
    data: {
      deviceId: 'device123',
      action: 'output_changed',
      notificationId: 'notif123',
    },
    webpush: {
      fcmOptions: {
        link: 'https://yourdomain.com/devices/device123'
      }
    }
  });
}
```

## Browser Compatibility

✅ Chrome 42+
✅ Firefox 44+
✅ Edge 17+
✅ Safari 16+ (macOS Ventura+)
✅ Opera 29+
❌ iOS Safari (Apple limitation)

## Troubleshooting

### Permission Denied
- User manually blocked notifications
- Solution: Guide user to browser settings → Site Settings → Notifications → Allow

### Service Worker Not Registering
- Check: `firebase-messaging-sw.js` is in `/public` folder
- Check: No HTTPS errors (service workers require HTTPS)
- Local dev: `localhost` is allowed (HTTP OK)

### FCM Token Not Generated
- Check: VAPID key is correct in `.env`
- Check: Firebase Cloud Messaging API is enabled
- Check: Browser console for errors

### Notifications Not Received
- Check: FCM token saved to Firestore
- Check: Cloud Functions sending to correct tokens
- Check: Firebase Cloud Messaging quota (10k/day free tier)

## Next Steps

### 1. Integrate with Device Status Changes
Update `deviceService.ts` to send push notifications:
- Device comes online/offline
- Output state changes
- Member actions

### 2. Add Notification Categories
- Device alerts
- Member activity
- System updates

### 3. Rich Notifications
- Add images/icons
- Action buttons (Acknowledge, Dismiss)
- Sound/vibration patterns

## Resources

- [Firebase Cloud Messaging Docs](https://firebase.google.com/docs/cloud-messaging)
- [Web Push Protocol](https://developers.google.com/web/fundamentals/push-notifications)
- [Service Workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)

---

**Status**: ✅ Implementation Complete - Needs VAPID Key Setup
