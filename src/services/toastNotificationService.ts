/**
 * Toast Notification Service
 * ────────────────────────────────────────────────────────────────────────────
 * Manages popup toast notifications with pause/resume functionality
 * ────────────────────────────────────────────────────────────────────────────
 */

import {
  collection, doc, setDoc, getDoc, onSnapshot, serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ToastNotification {
  id: string;
  type: 'success' | 'info' | 'warning' | 'error';
  icon: string;
  title: string;
  description: string;
  timestamp: number;
  deviceId?: string;
  color?: string; // Custom output color
  duration?: number; // ms, default 5000
}

export type PauseDuration = '15min' | '1hour' | 'tomorrow' | null;

export interface NotificationPauseState {
  userId: string;
  paused: boolean;
  pausedUntil: number | null; // unix timestamp ms
  pauseDuration: PauseDuration;
  pausedAt: number | null;
}

// ─── Toast Queue Manager ──────────────────────────────────────────────────────

class ToastQueueManager {
  private queue: ToastNotification[] = [];
  private displayedIds = new Set<string>();
  private listeners: ((toasts: ToastNotification[]) => void)[] = [];
  private deduplicationWindow = 2000; // 2 seconds
  private maxVisible = 4;

  addToast(toast: ToastNotification) {
    // Deduplicate: check if same notification was shown recently
    if (this.displayedIds.has(toast.id)) {
      return;
    }

    // Add to displayed set
    this.displayedIds.add(toast.id);

    // Clean up old IDs after deduplication window
    setTimeout(() => {
      this.displayedIds.delete(toast.id);
    }, this.deduplicationWindow);

    // Add to queue (newest at top)
    this.queue.unshift(toast);

    // Limit visible toasts
    if (this.queue.length > this.maxVisible) {
      this.queue = this.queue.slice(0, this.maxVisible);
    }

    this.notifyListeners();

    // Auto-remove after duration
    const duration = toast.duration || 5000;
    setTimeout(() => {
      this.removeToast(toast.id);
    }, duration);
  }

  removeToast(id: string) {
    this.queue = this.queue.filter(t => t.id !== id);
    this.notifyListeners();
  }

  clearAll() {
    this.queue = [];
    this.notifyListeners();
  }

  subscribe(listener: (toasts: ToastNotification[]) => void) {
    this.listeners.push(listener);
    listener(this.queue);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notifyListeners() {
    this.listeners.forEach(listener => listener([...this.queue]));
  }
}

const toastQueue = new ToastQueueManager();

// ─── Pause State Management ───────────────────────────────────────────────────

/**
 * Get user's notification pause state
 */
export async function getPauseState(userId: string): Promise<NotificationPauseState> {
  try {
    const docRef = doc(db, 'notification_pause', userId);
    const snap = await getDoc(docRef);
    
    if (snap.exists()) {
      const data = snap.data() as NotificationPauseState;
      
      // Check if pause has expired
      if (data.paused && data.pausedUntil && Date.now() > data.pausedUntil) {
        // Auto-resume
        await resumeNotifications(userId);
        return {
          userId,
          paused: false,
          pausedUntil: null,
          pauseDuration: null,
          pausedAt: null,
        };
      }
      
      return data;
    }
    
    return {
      userId,
      paused: false,
      pausedUntil: null,
      pauseDuration: null,
      pausedAt: null,
    };
  } catch (err) {
    console.warn('[getPauseState] Failed:', err);
    return {
      userId,
      paused: false,
      pausedUntil: null,
      pauseDuration: null,
      pausedAt: null,
    };
  }
}

/**
 * Pause notifications for a duration
 */
export async function pauseNotifications(
  userId: string,
  duration: PauseDuration
): Promise<void> {
  try {
    const now = Date.now();
    let pausedUntil: number | null = null;

    if (duration === '15min') {
      pausedUntil = now + 15 * 60 * 1000;
    } else if (duration === '1hour') {
      pausedUntil = now + 60 * 60 * 1000;
    } else if (duration === 'tomorrow') {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      pausedUntil = tomorrow.getTime();
    }

    const docRef = doc(db, 'notification_pause', userId);
    await setDoc(docRef, {
      userId,
      paused: true,
      pausedUntil,
      pauseDuration: duration,
      pausedAt: now,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn('[pauseNotifications] Failed:', err);
  }
}

/**
 * Resume notifications
 */
export async function resumeNotifications(userId: string): Promise<void> {
  try {
    const docRef = doc(db, 'notification_pause', userId);
    await setDoc(docRef, {
      userId,
      paused: false,
      pausedUntil: null,
      pauseDuration: null,
      pausedAt: null,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn('[resumeNotifications] Failed:', err);
  }
}

/**
 * Subscribe to pause state changes
 */
export function subscribeToPauseState(
  userId: string,
  callback: (state: NotificationPauseState) => void
): () => void {
  const docRef = doc(db, 'notification_pause', userId);
  
  const unsub = onSnapshot(docRef, snap => {
    if (snap.exists()) {
      const data = snap.data() as NotificationPauseState;
      
      // Check if pause has expired
      if (data.paused && data.pausedUntil && Date.now() > data.pausedUntil) {
        // Auto-resume
        resumeNotifications(userId).then(() => {
          callback({
            userId,
            paused: false,
            pausedUntil: null,
            pauseDuration: null,
            pausedAt: null,
          });
        });
      } else {
        callback(data);
      }
    } else {
      callback({
        userId,
        paused: false,
        pausedUntil: null,
        pauseDuration: null,
        pausedAt: null,
      });
    }
  });

  return unsub;
}

// ─── Toast Display Functions ──────────────────────────────────────────────────

/**
 * Show a toast notification (respects pause state)
 */
export function showToast(
  toast: Omit<ToastNotification, 'timestamp'>,
  pauseState?: NotificationPauseState
): void {
  // Check if notifications are paused
  if (pauseState?.paused) {
    // Don't show toast, but event is still logged
    return;
  }

  const fullToast: ToastNotification = {
    ...toast,
    timestamp: Date.now(),
  };

  toastQueue.addToast(fullToast);
}

/**
 * Remove a specific toast
 */
export function dismissToast(id: string): void {
  toastQueue.removeToast(id);
}

/**
 * Clear all visible toasts
 */
export function clearAllToasts(): void {
  toastQueue.clearAll();
}

/**
 * Subscribe to toast updates
 */
export function subscribeToToasts(
  callback: (toasts: ToastNotification[]) => void
): () => void {
  return toastQueue.subscribe(callback);
}

// ─── Helper: Create toast from activity action ────────────────────────────────

/**
 * Create toast from activity action
 * The outputColor should be passed from the notification's enriched color
 */
export function createToastFromAction(
  action: string,
  deviceId: string,
  outputColor?: string
): Omit<ToastNotification, 'timestamp'> | null {
  const lower = action.toLowerCase();

  // Device status
  if (lower.includes('went online') || lower.includes('device online')) {
    return {
      id: `${deviceId}-online-${Date.now()}`,
      type: 'success',
      icon: 'wifi',
      title: 'Device Online',
      description: action,
      deviceId,
      color: '#16a34a',
    };
  }

  if (lower.includes('went offline') || lower.includes('device offline')) {
    return {
      id: `${deviceId}-offline-${Date.now()}`,
      type: 'warning',
      icon: 'wifi-off',
      title: 'Device Offline',
      description: action,
      deviceId,
      color: '#d97706',
    };
  }

  // Output control - ON (use output color if provided, otherwise fallback)
  if (lower.includes('turned on')) {
    const isLight = lower.includes('light');
    const isFan = lower.includes('fan');
    const isCustom = lower.includes('custom');
    
    return {
      id: `${deviceId}-output-on-${Date.now()}`,
      type: 'info',
      icon: isLight ? 'lightbulb' : isFan ? 'wind' : 'zap',
      title: isLight ? 'Light Turned ON' : isFan ? 'Fan Turned ON' : 'Device Turned ON',
      description: action,
      deviceId,
      color: outputColor || (isLight ? '#f59e0b' : isFan ? '#06b6d4' : '#7c3aed'),
    };
  }

  // Output control - OFF (use gray for off state)
  if (lower.includes('turned off')) {
    const isLight = lower.includes('light');
    const isFan = lower.includes('fan');
    
    return {
      id: `${deviceId}-output-off-${Date.now()}`,
      type: 'info',
      icon: isLight ? 'lightbulb-off' : isFan ? 'wind' : 'zap',
      title: isLight ? 'Light Turned OFF' : isFan ? 'Fan Turned OFF' : 'Device Turned OFF',
      description: action,
      deviceId,
      color: outputColor || '#6b7280',
    };
  }

  // Device management
  if (lower.includes('device') && lower.includes('added')) {
    return {
      id: `${deviceId}-added-${Date.now()}`,
      type: 'success',
      icon: 'cpu',
      title: 'Device Added',
      description: action,
      deviceId,
      color: '#16a34a',
    };
  }

  if (lower.includes('device') && lower.includes('removed')) {
    return {
      id: `${deviceId}-removed-${Date.now()}`,
      type: 'error',
      icon: 'cpu',
      title: 'Device Removed',
      description: action,
      deviceId,
      color: '#ef4444',
    };
  }

  // Dex Bot
  if (lower.includes('dex') || lower.includes('bot')) {
    return {
      id: `${deviceId}-dexbot-${Date.now()}`,
      type: 'info',
      icon: 'bot',
      title: 'Dex Bot',
      description: action,
      deviceId,
      color: '#8b5cf6',
    };
  }

  // Firebase connection
  if (lower.includes('firebase') || lower.includes('connection')) {
    const isError = lower.includes('lost') || lower.includes('failed') || lower.includes('error');
    return {
      id: `${deviceId}-firebase-${Date.now()}`,
      type: isError ? 'error' : 'success',
      icon: isError ? 'wifi-off' : 'wifi',
      title: isError ? 'Connection Lost' : 'Connection Restored',
      description: action,
      deviceId,
      color: isError ? '#ef4444' : '#16a34a',
    };
  }

  // All devices/lights/fans
  if (lower.includes('all') && (lower.includes('devices') || lower.includes('lights') || lower.includes('fans'))) {
    const isOn = lower.includes('turned on');
    return {
      id: `${deviceId}-all-${Date.now()}`,
      type: 'info',
      icon: 'zap',
      title: isOn ? 'All Devices ON' : 'All Devices OFF',
      description: action,
      deviceId,
      color: isOn ? '#f59e0b' : '#6b7280',
    };
  }

  // Don't create toasts for other actions (output metadata changes, etc.)
  return null;
}
