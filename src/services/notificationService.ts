/**
 * Notification Service
 * ────────────────────────────────────────────────────────────────────────────
 * Manages notification state (read/unread) using Firestore.
 * Transforms activity logs into notification format with icons and categories.
 * ────────────────────────────────────────────────────────────────────────────
 */

import {
  collection, doc, setDoc, getDoc, onSnapshot, serverTimestamp, query, where, orderBy,
} from 'firebase/firestore';
import { db } from './firebase';
import type { ActivityLog } from './analyticsService';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Notification {
  id: string;
  deviceId: string;
  action: string;
  performedBy: string;
  timestamp: unknown;
  read: boolean;
  category: NotificationCategory;
  icon: string;
  color?: string; // Custom output color for color-matched notifications
  outputId?: string; // Output ID if notification is related to a specific output
}

export type NotificationCategory =
  | 'device_status'    // online/offline
  | 'output_control'   // light/fan on/off
  | 'device_mgmt'      // device added/removed
  | 'output_mgmt'      // output updated/hidden/removed
  | 'system'           // errors, warnings
  | 'dexbot'           // dex bot events
  | 'other';

export interface UserNotificationState {
  userId: string;
  readNotifications: string[]; // array of notification IDs
  deletedNotifications: string[]; // array of deleted notification IDs
  lastRead: unknown;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Categorize notification based on action text
 */
function categorizeNotification(action: string, outputId?: string): {
  category: NotificationCategory;
  icon: string;
} {
  const lower = action.toLowerCase();

  // Device status
  if (lower.includes('online') || lower.includes('offline') || lower.includes('connected') || lower.includes('disconnected')) {
    return { category: 'device_status', icon: 'wifi' };
  }

  // Output control (Light/Fan ON/OFF) - identified by outputId presence
  if (outputId && (lower.includes('turned on') || lower.includes('turned off') || lower.includes('on at') || lower.includes('off at'))) {
    return { category: 'output_control', icon: 'zap' };
  }

  // Device management
  if (lower.includes('device') && (lower.includes('added') || lower.includes('removed'))) {
    return { category: 'device_mgmt', icon: 'cpu' };
  }

  // Output management
  if (lower.includes('output') && (lower.includes('updated') || lower.includes('hidden') || lower.includes('shown') || lower.includes('removed'))) {
    return { category: 'output_mgmt', icon: 'settings' };
  }

  // All devices/lights/fans actions
  if (lower.includes('all') && (lower.includes('devices') || lower.includes('lights') || lower.includes('fans'))) {
    return { category: 'output_control', icon: 'zap' };
  }

  // Dex Bot
  if (lower.includes('dex') || lower.includes('bot') || lower.includes('voice') || lower.includes('chat')) {
    return { category: 'dexbot', icon: 'bot' };
  }

  // System/Error
  if (lower.includes('error') || lower.includes('failed') || lower.includes('warning')) {
    return { category: 'system', icon: 'alert-circle' };
  }

  // Default
  return { category: 'other', icon: 'activity' };
}

/**
 * Transform activity log into notification
 */
function activityLogToNotification(log: ActivityLog, readIds: Set<string>): Notification {
  const { category, icon } = categorizeNotification(log.action, log.outputId);

  return {
    ...log,
    read: readIds.has(log.id),
    category,
    icon,
    outputId: log.outputId, // Use outputId directly from activity log
    // color will be added by enrichment
  };
}

// ─── User Notification State ──────────────────────────────────────────────────

/**
 * Get user's notification state (which notifications are read/deleted)
 */
export async function getUserNotificationState(userId: string): Promise<UserNotificationState> {
  try {
    const docRef = doc(db, 'user_notifications', userId);
    const snap = await getDoc(docRef);
    
    if (snap.exists()) {
      const data = snap.data() as UserNotificationState;
      return {
        userId: data.userId,
        readNotifications: data.readNotifications || [],
        deletedNotifications: data.deletedNotifications || [],
        lastRead: data.lastRead,
      };
    }
    
    return {
      userId,
      readNotifications: [],
      deletedNotifications: [],
      lastRead: serverTimestamp(),
    };
  } catch (err) {
    console.warn('[getUserNotificationState] Failed:', err);
    return {
      userId,
      readNotifications: [],
      deletedNotifications: [],
      lastRead: serverTimestamp(),
    };
  }
}

/**
 * Mark notifications as read
 */
export async function markNotificationsAsRead(userId: string, notificationIds: string[]): Promise<void> {
  try {
    const docRef = doc(db, 'user_notifications', userId);
    const current = await getUserNotificationState(userId);
    
    const updatedReadIds = Array.from(new Set([...current.readNotifications, ...notificationIds]));
    
    await setDoc(docRef, {
      userId,
      readNotifications: updatedReadIds,
      lastRead: serverTimestamp(),
    });
  } catch (err) {
    console.warn('[markNotificationsAsRead] Failed:', err);
  }
}

/**
 * Mark all current notifications as read
 */
export async function markAllNotificationsAsRead(userId: string, allNotificationIds: string[]): Promise<void> {
  try {
    const docRef = doc(db, 'user_notifications', userId);
    
    await setDoc(docRef, {
      userId,
      readNotifications: allNotificationIds,
      lastRead: serverTimestamp(),
    });
  } catch (err) {
    console.warn('[markAllNotificationsAsRead] Failed:', err);
  }
}

/**
 * Clear notification history for user (doesn't delete activity logs, just clears read state)
 */
export async function clearNotificationHistory(userId: string): Promise<void> {
  try {
    const docRef = doc(db, 'user_notifications', userId);
    
    await setDoc(docRef, {
      userId,
      readNotifications: [],
      deletedNotifications: [],
      lastRead: serverTimestamp(),
    });
  } catch (err) {
    console.warn('[clearNotificationHistory] Failed:', err);
  }
}

/**
 * Delete all notifications for user (marks all as deleted)
 */
export async function deleteAllNotifications(userId: string, allNotificationIds: string[]): Promise<void> {
  try {
    const docRef = doc(db, 'user_notifications', userId);
    
    await setDoc(docRef, {
      userId,
      readNotifications: [],
      deletedNotifications: allNotificationIds,
      lastRead: serverTimestamp(),
    });
  } catch (err) {
    console.error('[deleteAllNotifications] Failed:', err);
    throw err;
  }
}

/**
 * Delete a single notification for user
 */
export async function deleteNotification(userId: string, notificationId: string): Promise<void> {
  try {
    const docRef = doc(db, 'user_notifications', userId);
    const current = await getUserNotificationState(userId);
    
    const updatedDeletedIds = Array.from(new Set([...current.deletedNotifications, notificationId]));
    
    await setDoc(docRef, {
      userId,
      readNotifications: current.readNotifications,
      deletedNotifications: updatedDeletedIds,
      lastRead: serverTimestamp(),
    });
  } catch (err) {
    console.error('[deleteNotification] Failed:', err);
    throw err;
  }
}

// ─── Real-time Notifications ──────────────────────────────────────────────────

/**
 * Enrich notifications with output colors from device metadata
 * Uses the outputId directly from activity logs (light1, light2, light3, fan1, fan2, custom1)
 */
async function enrichNotificationsWithColors(notifications: Notification[]): Promise<Notification[]> {
  // Get unique device IDs
  const deviceIds = Array.from(new Set(notifications.map(n => n.deviceId)));
  
  // Fetch metadata for all devices
  const metadataPromises = deviceIds.map(async (deviceId) => {
    try {
      const { getDeviceOutputMetadata } = await import('./deviceService');
      const metadata = await getDeviceOutputMetadata(deviceId);
      return { deviceId, metadata };
    } catch (err) {
      console.error('[enrichNotifications] Failed to fetch metadata for', deviceId, err);
      return { deviceId, metadata: undefined };
    }
  });
  
  const metadataResults = await Promise.all(metadataPromises);
  const metadataMap = new Map(metadataResults.map(r => [r.deviceId, r.metadata]));
  
  // Enrich each notification with output color
  return notifications.map(notification => {
    // Skip if no outputId (device-level or system notifications)
    if (!notification.outputId) {
      return notification;
    }
    
    const deviceMetadata = metadataMap.get(notification.deviceId);
    if (!deviceMetadata) {
      console.warn('[enrichNotifications] No metadata for device:', notification.deviceId);
      return notification;
    }
    
    // Valid output IDs: light1, light2, light3, fan1, fan2, custom1
    const validOutputIds = ['light1', 'light2', 'light3', 'fan1', 'fan2', 'custom1'];
    if (!validOutputIds.includes(notification.outputId)) {
      console.warn('[enrichNotifications] Invalid outputId:', notification.outputId);
      return notification;
    }
    
    // Get the output metadata using the hardware output ID
    const outputMetadata = deviceMetadata[notification.outputId as keyof typeof deviceMetadata];
    if (!outputMetadata?.color) {
      console.warn('[enrichNotifications] No color for output:', notification.outputId, 'metadata:', outputMetadata);
      return notification;
    }
    
    // DEBUG: Log successful enrichment
    console.log('[enrichNotifications] ✅ SUCCESS:', {
      outputId: notification.outputId,
      color: outputMetadata.color,
      action: notification.action.substring(0, 50)
    });
    
    // Return notification enriched with output color
    return {
      ...notification,
      color: outputMetadata.color,
    };
  });
}

/**
 * Subscribe to notifications for user's devices
 * Combines activity logs with user's read state and filters out deleted notifications
 */
export function subscribeToNotifications(
  userId: string,
  deviceIds: string[],
  callback: (notifications: Notification[]) => void,
  limit = 50
): () => void {
  if (!deviceIds.length) {
    callback([]);
    return () => {};
  }

  let readIds = new Set<string>();
  let deletedIds = new Set<string>();
  let activityLogs: ActivityLog[] = [];

  const merge = async () => {
    // Filter out deleted notifications
    const visibleLogs = activityLogs.filter(log => !deletedIds.has(log.id));
    const notifications = visibleLogs.map(log => activityLogToNotification(log, readIds));
    // Enrich with output colors
    const enriched = await enrichNotificationsWithColors(notifications);
    callback(enriched);
  };

  // Subscribe to user's read state and deleted state
  const userNotifRef = doc(db, 'user_notifications', userId);
  const unsubUser = onSnapshot(userNotifRef, snap => {
    if (snap.exists()) {
      const data = snap.data() as UserNotificationState;
      readIds = new Set(data.readNotifications || []);
      deletedIds = new Set(data.deletedNotifications || []);
    } else {
      readIds = new Set();
      deletedIds = new Set();
    }
    merge();
  });

  // Subscribe to activity logs (max 5 devices to avoid query limits)
  const unsubscribers: (() => void)[] = [unsubUser];
  const allLogs = new Map<string, ActivityLog[]>();

  const mergeActivityLogs = () => {
    activityLogs = Array.from(allLogs.values())
      .flat()
      .sort((a, b) => {
        const at = (a.timestamp as { seconds: number })?.seconds || 0;
        const bt = (b.timestamp as { seconds: number })?.seconds || 0;
        return bt - at;
      })
      .slice(0, limit);
    merge();
  };

  // Subscribe to each device's activity logs
  deviceIds.slice(0, 5).forEach(deviceId => {
    const q = query(
      collection(db, 'activity_logs'),
      where('deviceId', '==', deviceId),
      orderBy('timestamp', 'desc')
    );

    const unsub = onSnapshot(q, snap => {
      allLogs.set(deviceId, snap.docs.map(d => ({ id: d.id, ...d.data() } as ActivityLog)));
      mergeActivityLogs();
    });

    unsubscribers.push(unsub);
  });

  return () => unsubscribers.forEach(u => u());
}

/**
 * Get unread notification count
 */
export function getUnreadCount(notifications: Notification[]): number {
  return notifications.filter(n => !n.read).length;
}
