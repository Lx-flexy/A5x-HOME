/**
 * Multi-User Notification Service
 * Listens to device changes in real-time and shows notifications to all members
 * Works WITHOUT Cloud Functions using RTDB listeners
 */

import { ref, onValue, DataSnapshot, DatabaseReference } from 'firebase/database';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { database, db } from './firebase';

interface DeviceListener {
  deviceId: string;
  outputsRef: DatabaseReference;
  onlineRef: DatabaseReference;
  unsubscribeOutputs: () => void;
  unsubscribeOnline: () => void;
  lastOutputState: Record<string, boolean>;
}

class MultiUserNotificationService {
  private listeners: Map<string, DeviceListener> = new Map();
  private userId: string | null = null;
  private initialized = false;

  /**
   * Initialize notification listeners for user's devices
   */
  async initialize(userId: string) {
    if (this.initialized && this.userId === userId) {
      console.log('[MultiUserNotification] Already initialized for user:', userId);
      return;
    }

    console.log('[MultiUserNotification] Initializing for user:', userId);
    this.userId = userId;

    // Clear existing listeners
    this.cleanup();

    // Get user's devices (owned + shared)
    const devices = await this.getUserDevices(userId);
    console.log('[MultiUserNotification] Found devices:', devices.length);

    // Setup listeners for each device
    devices.forEach((device) => {
      this.setupDeviceListeners(device.id, device.name);
    });

    this.initialized = true;
  }

  /**
   * Get all devices user has access to
   */
  private async getUserDevices(userId: string): Promise<Array<{ id: string; name: string }>> {
    const devices: Array<{ id: string; name: string }> = [];

    try {
      // Get owned devices
      const ownedQuery = query(
        collection(db, 'devices_meta'),
        where('ownerId', '==', userId)
      );
      const ownedSnapshot = await getDocs(ownedQuery);
      ownedSnapshot.forEach((doc) => {
        const data = doc.data();
        devices.push({ id: data.deviceId, name: data.name });
      });

      // Get shared devices
      const memberQuery = query(
        collection(db, 'members'),
        where('uid', '==', userId)
      );
      const memberSnapshot = await getDocs(memberQuery);
      
      for (const doc of memberSnapshot.docs) {
        const memberData = doc.data();
        const deviceId = memberData.deviceId;
        
        // Get device name
        const deviceQuery = query(
          collection(db, 'devices_meta'),
          where('deviceId', '==', deviceId)
        );
        const deviceSnapshot = await getDocs(deviceQuery);
        
        if (!deviceSnapshot.empty) {
          const deviceData = deviceSnapshot.docs[0].data();
          devices.push({ id: deviceId, name: deviceData.name });
        }
      }
    } catch (error) {
      console.error('[MultiUserNotification] Error fetching devices:', error);
    }

    return devices;
  }

  /**
   * Setup realtime listeners for a device
   */
  private setupDeviceListeners(deviceId: string, deviceName: string) {
    console.log('[MultiUserNotification] Setting up listeners for:', deviceName);

    // Reference to device outputs
    const outputsRef = ref(database, `devices/${deviceId}/outputs`);
    
    // Store initial state to detect changes
    let lastOutputState: Record<string, boolean> = {};
    let isFirstLoad = true;

    // Listen to output changes
    const unsubscribeOutputs = onValue(outputsRef, (snapshot: DataSnapshot) => {
      const outputs = snapshot.val();
      if (!outputs) return;

      // Skip notification on first load (avoid spam on page load)
      if (isFirstLoad) {
        lastOutputState = { ...outputs };
        isFirstLoad = false;
        return;
      }

      // Check which outputs changed
      Object.keys(outputs).forEach((outputId) => {
        const newState = outputs[outputId];
        const oldState = lastOutputState[outputId];

        if (newState !== oldState && oldState !== undefined) {
          // Output state changed - show notification
          this.showOutputNotification(deviceName, outputId, newState);
        }
      });

      // Update last state
      lastOutputState = { ...outputs };
    });

    // Reference to device online status
    const onlineRef = ref(database, `devices/${deviceId}/online`);
    let lastOnlineState: boolean | null = null;

    // Listen to online status changes
    const unsubscribeOnline = onValue(onlineRef, (snapshot: DataSnapshot) => {
      const online = snapshot.val();

      // Skip notification on first load
      if (lastOnlineState === null) {
        lastOnlineState = online;
        return;
      }

      if (online !== lastOnlineState) {
        // Status changed - show notification
        this.showStatusNotification(deviceName, online);
        lastOnlineState = online;
      }
    });

    // Store listener info
    this.listeners.set(deviceId, {
      deviceId,
      outputsRef,
      onlineRef,
      unsubscribeOutputs,
      unsubscribeOnline,
      lastOutputState,
    });
  }

  /**
   * Show notification for output change
   */
  private showOutputNotification(deviceName: string, outputId: string, state: boolean) {
    const emoji = state ? '🟢' : '🔴';
    const stateText = state ? 'ON' : 'OFF';
    const title = `${emoji} ${deviceName}`;
    const body = `Output ${outputId} turned ${stateText}`;

    this.showNotification(title, body, {
      tag: `output-${outputId}`,
      icon: '/logo.png',
      badge: '/logo.png',
      requireInteraction: false,
    });
  }

  /**
   * Show notification for device status change
   */
  private showStatusNotification(deviceName: string, online: boolean) {
    const emoji = online ? '🟢' : '🔴';
    const status = online ? 'Online' : 'Offline';
    const title = `${emoji} Device ${status}`;
    const body = `${deviceName} is now ${status.toLowerCase()}`;

    this.showNotification(title, body, {
      tag: `status-${deviceName}`,
      icon: '/logo.png',
      badge: '/logo.png',
      requireInteraction: false,
    });
  }

  /**
   * Show browser notification (works in foreground and background)
   */
  private showNotification(title: string, body: string, options: NotificationOptions = {}) {
    // Check notification permission
    if (Notification.permission !== 'granted') {
      console.warn('[MultiUserNotification] Notification permission not granted');
      return;
    }

    // Use Service Worker to show notification if available (works in background too)
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then((registration) => {
        registration.showNotification(title, {
          body,
          icon: '/logo.png',
          badge: '/logo.png',
          tag: options.tag || 'default',
          requireInteraction: false,
          vibrate: [200, 100, 200],
          ...options,
        }).catch((error) => {
          console.error('[MultiUserNotification] Service Worker notification failed:', error);
          // Fallback to regular notification
          this.showRegularNotification(title, body, options);
        });
      }).catch((error) => {
        console.error('[MultiUserNotification] Service Worker not ready:', error);
        // Fallback to regular notification
        this.showRegularNotification(title, body, options);
      });
    } else {
      // Fallback to regular notification API
      this.showRegularNotification(title, body, options);
    }
  }

  /**
   * Fallback: Show regular browser notification (foreground only)
   */
  private showRegularNotification(title: string, body: string, options: NotificationOptions = {}) {
    try {
      const notification = new Notification(title, {
        body,
        icon: '/logo.png',
        badge: '/logo.png',
        ...options,
      });

      // Auto-close after 5 seconds
      setTimeout(() => notification.close(), 5000);

      // Handle click
      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    } catch (error) {
      console.error('[MultiUserNotification] Error showing notification:', error);
    }
  }

  /**
   * Cleanup all listeners
   */
  cleanup() {
    console.log('[MultiUserNotification] Cleaning up listeners');
    
    this.listeners.forEach((listener) => {
      listener.unsubscribeOutputs();
      listener.unsubscribeOnline();
    });
    
    this.listeners.clear();
    this.initialized = false;
  }

  /**
   * Get active listener count
   */
  getActiveListenerCount(): number {
    return this.listeners.size;
  }
}

// Export singleton instance
export const multiUserNotificationService = new MultiUserNotificationService();
