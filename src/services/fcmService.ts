import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

// Firebase Cloud Messaging Service
// Handles push notifications for web app

let messaging: any = null;

// Initialize FCM
export async function initializeFCM(): Promise<boolean> {
  try {
    const supported = await isSupported();
    if (!supported) {
      console.warn('[FCM] Push notifications not supported in this browser');
      return false;
    }

    const { getMessaging: getMsg } = await import('firebase/messaging');
    messaging = getMsg();
    
    console.log('[FCM] Initialized successfully');
    return true;
  } catch (error) {
    console.error('[FCM] Initialization error:', error);
    return false;
  }
}

// Request notification permission and get FCM token
export async function requestNotificationPermission(userId: string): Promise<string | null> {
  try {
    // Check if notifications are supported
    if (!('Notification' in window)) {
      console.warn('[FCM] Notifications not supported');
      return null;
    }

    // Check current permission
    if (Notification.permission === 'denied') {
      console.warn('[FCM] Notification permission denied');
      return null;
    }

    // Request permission if not granted
    if (Notification.permission !== 'granted') {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        console.warn('[FCM] Notification permission not granted');
        return null;
      }
    }

    // Initialize FCM if not already done
    if (!messaging) {
      const initialized = await initializeFCM();
      if (!initialized) return null;
    }

    // Get FCM token
    const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
    
    if (!vapidKey) {
      console.warn('[FCM] VAPID key not configured. Please add VITE_FIREBASE_VAPID_KEY to .env');
      console.warn('[FCM] See PUSH_NOTIFICATIONS_SETUP.md for setup instructions');
      return null;
    }
    
    const token = await getToken(messaging, { vapidKey });

    if (!token) {
      console.warn('[FCM] No registration token available');
      return null;
    }

    console.log('[FCM] Token obtained:', token.substring(0, 20) + '...');

    // Save token to Firestore
    await saveFCMToken(userId, token);

    return token;
  } catch (error) {
    console.error('[FCM] Error getting token:', error);
    return null;
  }
}

// Save FCM token to Firestore
async function saveFCMToken(userId: string, token: string): Promise<void> {
  try {
    const tokenDoc = doc(db, `users/${userId}/fcmTokens/${token}`);
    await setDoc(tokenDoc, {
      token,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      userAgent: navigator.userAgent,
      platform: navigator.platform,
    });
    console.log('[FCM] Token saved to Firestore');
  } catch (error) {
    console.error('[FCM] Error saving token:', error);
  }
}

// Listen for foreground messages
export function onForegroundMessage(callback: (payload: any) => void): (() => void) | null {
  if (!messaging) {
    console.warn('[FCM] Messaging not initialized');
    return null;
  }

  try {
    const unsubscribe = onMessage(messaging, (payload) => {
      console.log('[FCM] Foreground message received:', payload);
      callback(payload);
      
      // Show notification even when app is open
      if (Notification.permission === 'granted' && payload.notification) {
        new Notification(payload.notification.title || 'A5X Home', {
          body: payload.notification.body,
          icon: '/logo.png',
          badge: '/logo.png',
          tag: payload.data?.notificationId || 'default',
          data: payload.data,
          requireInteraction: false,
        });
      }
    });

    return unsubscribe;
  } catch (error) {
    console.error('[FCM] Error setting up foreground listener:', error);
    return null;
  }
}

// Delete FCM token (on logout)
export async function deleteFCMToken(userId: string, token: string): Promise<void> {
  try {
    const tokenDoc = doc(db, `users/${userId}/fcmTokens/${token}`);
    await setDoc(tokenDoc, { deletedAt: serverTimestamp() }, { merge: true });
    console.log('[FCM] Token marked as deleted');
  } catch (error) {
    console.error('[FCM] Error deleting token:', error);
  }
}

// Check if push notifications are enabled
export function isPushNotificationEnabled(): boolean {
  return Notification.permission === 'granted';
}

// Get notification permission status
export function getNotificationPermission(): NotificationPermission {
  if (!('Notification' in window)) {
    return 'denied';
  }
  return Notification.permission;
}
