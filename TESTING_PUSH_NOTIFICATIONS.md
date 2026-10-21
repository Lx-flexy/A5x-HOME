# 🔔 Testing Web Push Notifications - Quick Guide

## ✅ Setup Complete!

VAPID Key configured: `BJSfxFcrKI_sQcgjVz...` ✓

## 🧪 How to Test Now

### Step 1: Open the App
```
http://localhost:5174
```

### Step 2: Login
- Use your existing account
- Or create new account

### Step 3: Enable Push Notifications

1. **Go to Settings**
   - Click avatar (top-right)
   - Or navigate to `/settings`

2. **Click Notifications Tab**
   - You'll see "Push Notifications" section at top

3. **Click "Enable Push Notifications" Button**
   - Browser will show permission dialog
   - Click **"Allow"** / **"अनुमति दें"**

4. **Success!** 
   - Green checkmark will appear
   - FCM token will be saved to Firestore

### Step 4: Check Browser Console

Open DevTools (F12) and check console:

```
✅ Expected logs:
[SW] Service Worker registered: ServiceWorkerRegistration {...}
[FCM] Initialized successfully
[FCM] Token obtained: eJxT8G9d...
[FCM] Token saved to Firestore
```

### Step 5: Test Background Notification

#### Option A: Send Test from Firebase Console

1. Open: https://console.firebase.google.com/project/home-automation-a5x/notification
2. Click **"Send your first message"**
3. Fill form:
   - **Notification title**: "Test Notification"
   - **Notification text**: "This is a test push notification!"
4. Click **"Send test message"**
5. Paste your FCM token (from browser console)
6. Click **"Test"**

#### Option B: Close Browser and Check

1. **Close the browser tab** (app should be closed)
2. Send test notification from Firebase Console
3. **Check system tray** - notification should appear!
4. **Click notification** - browser will open to app

---

## 🔍 Debug Checklist

### ❌ Service Worker Not Registering?

**Check:**
```javascript
// Browser console
navigator.serviceWorker.getRegistrations().then(console.log)
```

**Fix:**
- Refresh browser (Ctrl + F5)
- Clear browser cache
- Check: `public/firebase-messaging-sw.js` exists

---

### ❌ Permission Denied?

**Check:**
```javascript
// Browser console
Notification.permission
// Should be: "granted"
```

**Fix:**
- Go to browser settings → Site Settings → Notifications
- Find: `localhost:5174`
- Change to: **Allow**
- Refresh page

---

### ❌ FCM Token Not Generated?

**Check:**
```javascript
// Browser console
console.log('VAPID Key:', import.meta.env.VITE_FIREBASE_VAPID_KEY)
```

**Fix:**
- Restart dev server: `Ctrl+C` then `npm run dev`
- Check `.env` file has VAPID key
- Check Firebase Cloud Messaging API is enabled

---

### ❌ Notification Not Received?

**Check Firestore:**
```
users/{userId}/fcmTokens/{token}
```

**Should have:**
- token: "eJxT8G9d..."
- createdAt: timestamp
- platform: "Win32"

**Fix:**
- Re-enable notifications in Settings
- Check Firebase Cloud Messaging quota (10k/day)
- Check browser console for errors

---

## 📊 What Gets Stored in Firestore?

### User's FCM Tokens
```javascript
// Path: users/{userId}/fcmTokens/{token}
{
  token: "eJxT8G9d9eqJ72D5B...",
  createdAt: Timestamp,
  updatedAt: Timestamp,
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)...",
  platform: "Win32"
}
```

**Why multiple tokens?**
- Each browser/device gets its own token
- User can receive notifications on all devices

---

## 🚀 Next: Send Real Notifications

### From Cloud Functions (Device Status Change)

```typescript
import { getMessaging } from 'firebase-admin/messaging';

// Get user's tokens
const tokensSnap = await admin.firestore()
  .collection(`users/${userId}/fcmTokens`)
  .get();

const tokens = tokensSnap.docs.map(doc => doc.data().token);

// Send notification
if (tokens.length > 0) {
  await getMessaging().sendEachForMulticast({
    tokens,
    notification: {
      title: '🏠 Device Status',
      body: 'Living Room Light turned ON',
    },
    data: {
      deviceId: 'device123',
      action: 'output_changed',
      click_action: '/devices/device123'
    }
  });
}
```

---

## 🎯 Features Implemented

✅ Service Worker registration
✅ Permission request UI in Settings
✅ FCM token generation & storage
✅ Foreground message handling (app open)
✅ Background message handling (app closed)
✅ Notification click → Opens app
✅ Auto-request permission on login (if previously granted)
✅ Multi-device support (one user, multiple tokens)

---

## 📱 Browser Support

| Browser | Support | Notes |
|---------|---------|-------|
| Chrome | ✅ Yes | Full support |
| Firefox | ✅ Yes | Full support |
| Edge | ✅ Yes | Full support |
| Safari | ✅ Yes (macOS 13+) | Requires macOS Ventura+ |
| Opera | ✅ Yes | Full support |
| Mobile Safari | ❌ No | Apple limitation |

---

## 🐛 Common Errors

### `DOMException: Registration failed`
**Cause:** Service worker file not found  
**Fix:** Check `public/firebase-messaging-sw.js` exists

### `FirebaseError: Messaging: We are unable to register the default service worker`
**Cause:** Another service worker already registered  
**Fix:** Unregister old workers in browser DevTools

### `FirebaseError: Messaging: A problem occurred while subscribing the user to FCM`
**Cause:** VAPID key incorrect or FCM API disabled  
**Fix:** Check VAPID key in `.env` and Firebase Console

---

## 🎉 Success Indicators

When everything works:

1. ✅ Service Worker shows as **"activated"** in DevTools
2. ✅ Console shows: `[FCM] Token saved to Firestore`
3. ✅ Firestore has token document in `users/{uid}/fcmTokens/`
4. ✅ Settings page shows: **"Push notifications are active"**
5. ✅ Browser shows notification when app is closed
6. ✅ Clicking notification opens the app

---

**Current Status:** ✅ Ready to Test!

Dev Server: http://localhost:5174
