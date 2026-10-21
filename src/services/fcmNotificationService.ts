/**
 * FCM Notification Service - Client-Side Push Notifications
 * 
 * Sends push notifications to all device members using Service Worker
 * Works WITHOUT Cloud Functions and WITHOUT Server Key
 * 
 * Flow:
 * 1. User performs action (switch ON/OFF)
 * 2. Write notification data to RTDB under /notifications/{notificationId}
 * 3. All members' clients listen to /notifications path
 * 4. Service Worker shows notification when data changes
 * 5. All members receive push notification
 */

import { ref, push, set, serverTimestamp } from 'firebase/database';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { database, db } from './firebase';

interface NotificationData {
  deviceId: string;
  title: string;
  body: string;
  action: string;
  timestamp: any;
  data?: Record<string, string>;
}

/**
 * Send push notification to all device members via RTDB
 */
export async function sendNotificationToMembers(
  deviceId: string,
  title: string,
  body: string,
  action: string,
  data?: Record<string, string>
): Promise<void> {
  try {
    // Write notification to RTDB - all members listening will receive it
    const notificationsRef = ref(database, 'notifications');
    const newNotificationRef = push(notificationsRef);
    
    const notificationData: NotificationData = {
      deviceId,
      title,
      body,
      action,
      timestamp: serverTimestamp(),
      data: data || {},
    };

    await set(newNotificationRef, notificationData);
    
    console.log('[FCMNotification] Notification written to RTDB:', notificationData);
  } catch (error) {
    console.error('[FCMNotification] Error sending notification:', error);
  }
}

/**
 * Notify members about output change
 */
export async function notifyOutputChange(
  deviceId: string,
  deviceName: string,
  outputId: string,
  outputName: string,
  state: boolean,
  performedBy: string
): Promise<void> {
  const emoji = state ? '🟢' : '🔴';
  const stateText = state ? 'ON' : 'OFF';

  await sendNotificationToMembers(
    deviceId,
    `${emoji} ${deviceName}`,
    `${outputName} turned ${stateText} by ${performedBy}`,
    'output_changed',
    {
      deviceId,
      outputId,
      state: state.toString(),
      performedBy,
    }
  );
}

/**
 * Notify members about device status change
 */
export async function notifyDeviceStatus(
  deviceId: string,
  deviceName: string,
  online: boolean
): Promise<void> {
  const emoji = online ? '🟢' : '🔴';
  const status = online ? 'Online' : 'Offline';

  await sendNotificationToMembers(
    deviceId,
    `${emoji} Device ${status}`,
    `${deviceName} is now ${status.toLowerCase()}`,
    'status_change',
    {
      deviceId,
      online: online.toString(),
    }
  );
}
