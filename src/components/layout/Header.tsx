import { useState, useRef, useEffect } from 'react';
import { Bell, Menu, BellOff } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { subscribeToUserDevices } from '../../services/deviceService';
import {
  subscribeToNotifications,
  markNotificationsAsRead,
  markAllNotificationsAsRead,
  clearNotificationHistory,
  getUnreadCount,
  type Notification,
} from '../../services/notificationService';
import {
  subscribeToPauseState,
  pauseNotifications,
  resumeNotifications,
  showToast,
  createToastFromAction,
  type NotificationPauseState,
  type PauseDuration,
} from '../../services/toastNotificationService';
import NotificationPanel from '../ui/NotificationPanel';

interface HeaderProps {
  onMenuToggle: () => void;
}

export default function Header({ onMenuToggle }: HeaderProps) {
  const { userData, user } = useAuth();
  
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [deviceIds, setDeviceIds] = useState<string[]>([]);
  const [pauseState, setPauseState] = useState<NotificationPauseState | null>(null);
  const bellButtonRef = useRef<HTMLButtonElement>(null);
  
  // Track shown notifications to prevent duplicates
  const shownNotificationsRef = useRef<Set<string>>(new Set());

  // Subscribe to user's devices
  useEffect(() => {
    if (!user) return;
    
    const unsub = subscribeToUserDevices(user.uid, devices => {
      setDeviceIds(devices.map(d => d.deviceId));
    });
    
    return unsub;
  }, [user]);

  // Subscribe to pause state
  useEffect(() => {
    if (!user) return;

    const unsub = subscribeToPauseState(user.uid, setPauseState);
    return unsub;
  }, [user]);

  // Subscribe to notifications
  useEffect(() => {
    if (!user || deviceIds.length === 0) {
      setNotifications([]);
      return;
    }

    const unsub = subscribeToNotifications(
      user.uid,
      deviceIds,
      (newNotifications) => {
        setNotifications(newNotifications);

        // Show toast for new notifications
        newNotifications.forEach(notif => {
          // Only show toast for unread notifications we haven't shown yet
          if (!notif.read && !shownNotificationsRef.current.has(notif.id)) {
            shownNotificationsRef.current.add(notif.id);
            
            // DEBUG: Log notification data
            console.log('[Header] New notification:', {
              action: notif.action,
              outputId: notif.outputId,
              color: notif.color,
              hasColor: !!notif.color
            });
            
            // Pass the notification's color (from output metadata) to the toast
            const toast = createToastFromAction(notif.action, notif.deviceId, notif.color);
            if (toast) {
              console.log('[Header] Toast created:', {
                title: toast.title,
                color: toast.color
              });
              showToast(toast, pauseState || undefined);
            }
          }
        });

        // Clean up old IDs from tracking set (keep last 100)
        if (shownNotificationsRef.current.size > 100) {
          const idsArray = Array.from(shownNotificationsRef.current);
          shownNotificationsRef.current = new Set(idsArray.slice(-100));
        }
      },
      50 // limit to 50 most recent
    );

    return unsub;
  }, [user, deviceIds, pauseState]);

  const handleMarkAsRead = async (notificationIds: string[]) => {
    if (!user) return;
    await markNotificationsAsRead(user.uid, notificationIds);
  };

  const handleMarkAllAsRead = async () => {
    if (!user) return;
    const allIds = notifications.map(n => n.id);
    await markAllNotificationsAsRead(user.uid, allIds);
  };

  const handleClearAll = async () => {
    if (!user) return;
    await clearNotificationHistory(user.uid);
  };

  const handlePauseNotifications = async (duration: PauseDuration) => {
    if (!user) return;
    await pauseNotifications(user.uid, duration);
  };

  const handleResumeNotifications = async () => {
    if (!user) return;
    await resumeNotifications(user.uid);
  };

  const toggleNotifications = () => {
    setNotificationsOpen(prev => !prev);
  };

  const unreadCount = getUnreadCount(notifications);
  const isPaused = pauseState?.paused || false;

  const name = userData?.name || user?.displayName || 'User';
  const initials = name
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';

  return (
    <header
      className="h-[68px] flex items-center justify-between px-3 md:px-5 flex-shrink-0 transition-colors duration-200"
      style={{
        background: 'var(--bg-primary)',
        borderBottom: '1px solid var(--border-color)',
        boxShadow: '0 2px 12px var(--shadow-sm)',
      }}
    >
      {/* Left */}
      <div className="flex items-center gap-2 md:gap-4 min-w-0 flex-1">
        <button
          onClick={onMenuToggle}
          className="lg:hidden p-2 rounded-xl transition-all flex-shrink-0 touch-manipulation"
          style={{
            background: 'var(--bg-secondary)',
            boxShadow: 'var(--neo-shadow)',
            color: 'var(--text-secondary)',
            minWidth: '44px', // Touch-friendly size
            minHeight: '44px',
          }}
          aria-label="Open navigation menu"
        >
          <Menu size={18} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="font-semibold text-xs sm:text-sm md:text-sm leading-tight truncate" style={{ color: 'var(--text-primary)' }}>
            {greeting}, {name.split(' ')[0]} 👋
          </h1>
          <p className="text-[10px] sm:text-[11px] leading-tight mt-0.5 hidden sm:block" style={{ color: 'var(--text-tertiary)' }}>
            Here's what's happening in your home today.
          </p>
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Notification bell */}
        <button
          ref={bellButtonRef}
          onClick={toggleNotifications}
          className="relative p-2 rounded-xl transition-all hover:opacity-80 touch-manipulation"
          style={{
            background: 'var(--bg-secondary)',
            boxShadow: 'var(--neo-shadow)',
            color: 'var(--text-primary)',
            minWidth: '44px', // Touch-friendly size
            minHeight: '44px',
          }}
          title={isPaused ? 'Notifications (Paused)' : 'Notifications'}
          aria-label={isPaused ? 'Notifications paused' : 'Notifications'}
        >
          {isPaused ? <BellOff size={17} /> : <Bell size={17} />}
          {unreadCount > 0 && (
            <span
              className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full border-2"
              style={{ background: '#2563eb', borderColor: 'var(--bg-primary)' }}
            />
          )}
        </button>

        {/* Notification Panel */}
        <NotificationPanel
          isOpen={notificationsOpen}
          onClose={() => setNotificationsOpen(false)}
          anchor={bellButtonRef}
          notifications={notifications}
          onMarkAsRead={handleMarkAsRead}
          onMarkAllAsRead={handleMarkAllAsRead}
          onClearAll={handleClearAll}
          pauseState={pauseState}
          onPauseNotifications={handlePauseNotifications}
          onResumeNotifications={handleResumeNotifications}
          userId={user.uid}
        />

        {/* Avatar */}
        <div
          className="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center cursor-pointer touch-manipulation"
          style={{
            background: 'linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)',
            boxShadow: '3px 3px 8px rgba(37,99,235,0.3), -1px -1px 4px rgba(255,255,255,0.3)',
            minWidth: '44px', // Touch-friendly size
            minHeight: '44px',
          }}
          role="button"
          tabIndex={0}
          aria-label="User profile"
        >
          <span className="text-xs font-bold text-white">{initials}</span>
        </div>
      </div>
    </header>
  );
}
