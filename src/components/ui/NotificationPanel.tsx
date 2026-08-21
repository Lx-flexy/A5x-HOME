import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Zap, Wifi, Cpu, Settings, AlertCircle, Activity, Bot, Check, Trash2, Bell, BellOff, Clock, X,
} from 'lucide-react';
import type { Notification } from '../../services/notificationService';
import { deleteAllNotifications } from '../../services/notificationService';
import type { NotificationPauseState, PauseDuration } from '../../services/toastNotificationService';

interface NotificationPanelProps {
  isOpen: boolean;
  onClose: () => void;
  anchor: React.RefObject<HTMLElement>;
  notifications: Notification[];
  onMarkAsRead: (notificationIds: string[]) => void;
  onMarkAllAsRead: () => void;
  onClearAll: () => void;
  pauseState: NotificationPauseState | null;
  onPauseNotifications: (duration: PauseDuration) => void;
  onResumeNotifications: () => void;
  userId: string;
}

// Icon mapping
function getNotificationIcon(iconName: string, size = 16) {
  const props = { size, strokeWidth: 2 };
  switch (iconName) {
    case 'zap':
      return <Zap {...props} />;
    case 'wifi':
      return <Wifi {...props} />;
    case 'cpu':
      return <Cpu {...props} />;
    case 'settings':
      return <Settings {...props} />;
    case 'alert-circle':
      return <AlertCircle {...props} />;
    case 'bot':
      return <Bot {...props} />;
    case 'activity':
    default:
      return <Activity {...props} />;
  }
}

// Time ago formatter
function timeAgo(timestamp: unknown): string {
  if (!timestamp) return '';
  const seconds = (timestamp as { seconds: number })?.seconds;
  if (!seconds) return '';
  const diff = Math.floor(Date.now() / 1000) - seconds;
  
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} days ago`;
  return `${Math.floor(diff / 604800)} weeks ago`;
}

export default function NotificationPanel({
  isOpen,
  onClose,
  anchor,
  notifications,
  onMarkAsRead,
  onMarkAllAsRead,
  onClearAll,
  pauseState,
  onPauseNotifications,
  onResumeNotifications,
  userId,
}: NotificationPanelProps) {
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [showPauseMenu, setShowPauseMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen || !anchor.current || !panelRef.current) return;

    const updatePosition = () => {
      const anchorRect = anchor.current!.getBoundingClientRect();
      const isMobile = window.innerWidth < 640; // sm breakpoint
      const panelWidth = isMobile ? Math.min(380, window.innerWidth - 24) : 380;
      const panelHeight = Math.min(500, window.innerHeight - 100);

      // Position below and aligned to right edge of bell
      let top = anchorRect.bottom + 8;
      let left = isMobile ? 12 : anchorRect.right - panelWidth;

      // Check if would go off left edge
      if (left < 12) {
        left = 12;
      }

      // Check if would go off right edge
      if (left + panelWidth > window.innerWidth - 12) {
        left = window.innerWidth - panelWidth - 12;
      }

      // Check if would go below viewport
      if (top + panelHeight > window.innerHeight - 12) {
        top = anchorRect.top - panelHeight - 8;
      }

      // Ensure minimum top position
      if (top < 12) {
        top = 12;
      }

      setPosition({ top, left });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen, anchor]);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(event.target as Node) &&
        anchor.current &&
        !anchor.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose, anchor]);

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.read) {
      onMarkAsRead([notification.id]);
    }
  };

  const handlePauseClick = (duration: PauseDuration) => {
    onPauseNotifications(duration);
    setShowPauseMenu(false);
  };

  const handleDeleteAllClick = () => {
    setShowDeleteConfirm(true);
    setDeleteError(null);
  };

  const handleConfirmDelete = async () => {
    if (isDeleting) return; // Prevent double-click

    setIsDeleting(true);
    setDeleteError(null);

    try {
      const allIds = notifications.map(n => n.id);
      await deleteAllNotifications(userId, allIds);
      
      // Success - close confirmation dialog
      setShowDeleteConfirm(false);
    } catch (error) {
      console.error('[NotificationPanel] Delete failed:', error);
      setDeleteError('Failed to delete notifications. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCancelDelete = () => {
    setShowDeleteConfirm(false);
    setDeleteError(null);
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  if (!isOpen) return null;

  return createPortal(
    <div
      ref={panelRef}
      className="fixed rounded-xl shadow-2xl w-[calc(100vw-24px)] sm:w-[380px] max-w-[380px] max-h-[500px] flex flex-col transition-colors duration-200"
      style={{
        top: position.top,
        left: position.left,
        zIndex: 9999,
        background: 'var(--bg-primary)',
        border: '1px solid var(--border-color)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border-color)' }}
      >
        <div>
          <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
            Notifications
          </h3>
          {unreadCount > 0 && (
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
              {unreadCount} unread
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {notifications.length > 0 && (
            <>
              {unreadCount > 0 && (
                <button
                  onClick={onMarkAllAsRead}
                  className="p-2 sm:p-1.5 rounded-lg transition-all duration-200 hover:opacity-70 touch-manipulation"
                  style={{
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-secondary)',
                    minHeight: '44px', // Touch-friendly
                    minWidth: '44px',
                  }}
                  title="Mark all as read"
                  aria-label="Mark all as read"
                >
                  <Check size={16} className="sm:w-[14px] sm:h-[14px]" />
                </button>
              )}
              <button
                onClick={handleDeleteAllClick}
                disabled={isDeleting}
                className="p-2 sm:p-1.5 rounded-lg transition-all duration-200 hover:opacity-70 disabled:opacity-40 disabled:cursor-not-allowed touch-manipulation"
                style={{
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-secondary)',
                  minHeight: '44px', // Touch-friendly
                  minWidth: '44px',
                }}
                title="Delete all"
                aria-label="Delete all notifications"
              >
                <Trash2 size={16} className="sm:w-[14px] sm:h-[14px]" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Pause Controls */}
      <div
        className="px-4 py-3 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border-color)' }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {pauseState?.paused ? <BellOff size={16} style={{ color: 'var(--text-tertiary)' }} /> : <Bell size={16} style={{ color: 'var(--text-secondary)' }} />}
            <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
              Popup Notifications
            </span>
          </div>
          
          {pauseState?.paused ? (
            <button
              onClick={onResumeNotifications}
              className="px-3 py-1 text-xs font-medium rounded-lg transition-all duration-200"
              style={{
                background: 'rgba(37, 99, 235, 0.1)',
                color: '#2563eb',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(37, 99, 235, 0.15)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(37, 99, 235, 0.1)';
              }}
              aria-label="Resume notifications"
            >
              Resume
            </button>
          ) : (
            <div className="relative">
              <button
                onClick={() => setShowPauseMenu(!showPauseMenu)}
                className="px-3 py-1 text-xs font-medium rounded-lg transition-all duration-200 flex items-center gap-1.5"
                style={{
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-secondary)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--bg-tertiary)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--bg-secondary)';
                }}
                aria-label="Pause notifications"
              >
                <Clock size={12} />
                Pause
              </button>

              {showPauseMenu && (
                <div
                  className="absolute right-0 top-full mt-1 rounded-lg shadow-lg py-1 min-w-[140px] z-10"
                  style={{
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--border-color)',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                  }}
                >
                  <button
                    onClick={() => handlePauseClick('15min')}
                    className="w-full px-3 py-2 text-xs text-left transition-colors"
                    style={{ color: 'var(--text-primary)' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--bg-secondary)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    15 minutes
                  </button>
                  <button
                    onClick={() => handlePauseClick('1hour')}
                    className="w-full px-3 py-2 text-xs text-left transition-colors"
                    style={{ color: 'var(--text-primary)' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--bg-secondary)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    1 hour
                  </button>
                  <button
                    onClick={() => handlePauseClick('tomorrow')}
                    className="w-full px-3 py-2 text-xs text-left transition-colors"
                    style={{ color: 'var(--text-primary)' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--bg-secondary)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    Until tomorrow
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {pauseState?.paused && pauseState.pausedUntil && (
          <p className="text-[10px] mt-2" style={{ color: 'var(--text-tertiary)' }}>
            Paused until {new Date(pauseState.pausedUntil).toLocaleString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}
          </p>
        )}
      </div>

      {/* Notification List */}
      <div className="flex-1 overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center mb-3"
              style={{ background: 'var(--bg-secondary)' }}
            >
              <Activity size={20} style={{ color: 'var(--text-tertiary)' }} />
            </div>
            <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              No new notifications
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
              You're all caught up!
            </p>
          </div>
        ) : (
          <div>
            {notifications.map(notification => (
              <button
                key={notification.id}
                onClick={() => handleNotificationClick(notification)}
                className="w-full flex items-start gap-3 px-4 py-3 transition-colors duration-200 text-left relative"
                style={{
                  background: notification.read ? 'transparent' : (notification.color ? `${notification.color}08` : 'var(--bg-secondary)'),
                  borderBottom: '1px solid var(--border-color)',
                  borderLeft: notification.color ? `3px solid ${notification.color}` : 'none',
                  paddingLeft: notification.color ? 'calc(1rem - 3px)' : '1rem',
                }}
                onMouseEnter={(e) => {
                  if (notification.read) {
                    e.currentTarget.style.background = notification.color ? `${notification.color}05` : 'var(--bg-secondary)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (notification.read) {
                    e.currentTarget.style.background = 'transparent';
                  }
                }}
              >
                {/* Icon */}
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{
                    background: notification.read
                      ? 'var(--bg-tertiary)'
                      : (notification.color ? `${notification.color}15` : 'rgba(37, 99, 235, 0.1)'),
                    color: notification.read ? 'var(--text-tertiary)' : (notification.color || '#2563eb'),
                    boxShadow: notification.color && !notification.read ? `0 0 8px ${notification.color}30` : 'none',
                  }}
                >
                  {getNotificationIcon(notification.icon)}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p
                    className="text-xs font-medium line-clamp-2 mb-1"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {notification.action}
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                      {timeAgo(notification.timestamp)}
                    </span>
                    {!notification.read && (
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ background: notification.color || '#2563eb' }}
                      />
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div
          className="absolute inset-0 flex items-center justify-center z-10"
          style={{
            background: 'rgba(0, 0, 0, 0.5)',
            backdropFilter: 'blur(4px)',
            borderRadius: 'inherit',
          }}
        >
          <div
            className="w-[90%] max-w-[320px] rounded-xl p-5 shadow-2xl"
            style={{
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-color)',
            }}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{
                    background: 'rgba(239, 68, 68, 0.1)',
                    color: '#ef4444',
                  }}
                >
                  <Trash2 size={18} />
                </div>
                <div>
                  <h4 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                    Delete All Notifications?
                  </h4>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                    This action cannot be undone
                  </p>
                </div>
              </div>
              <button
                onClick={handleCancelDelete}
                disabled={isDeleting}
                className="p-1 rounded-lg hover:opacity-70 transition-opacity disabled:opacity-40"
                style={{ color: 'var(--text-tertiary)' }}
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            {deleteError && (
              <div
                className="mb-4 p-3 rounded-lg text-xs"
                style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  color: '#ef4444',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                }}
              >
                {deleteError}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={handleCancelDelete}
                disabled={isDeleting}
                className="flex-1 px-4 py-2.5 text-xs font-medium rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                }}
                onMouseEnter={(e) => {
                  if (!isDeleting) {
                    e.currentTarget.style.background = 'var(--bg-tertiary)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--bg-secondary)';
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="flex-1 px-4 py-2.5 text-xs font-medium rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: '#ef4444',
                  color: '#ffffff',
                }}
                onMouseEnter={(e) => {
                  if (!isDeleting) {
                    e.currentTarget.style.background = '#dc2626';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#ef4444';
                }}
              >
                {isDeleting ? 'Deleting...' : 'Delete All'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
