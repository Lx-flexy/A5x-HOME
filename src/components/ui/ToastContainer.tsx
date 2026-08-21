import { useEffect, useState } from 'react';
import {
  X, Lightbulb, Wind, Wifi, WifiOff, Cpu, Bot, Zap, AlertCircle, CheckCircle,
} from 'lucide-react';
import type { ToastNotification } from '../../services/toastNotificationService';
import { subscribeToToasts, dismissToast } from '../../services/toastNotificationService';

// Icon mapping
function getToastIcon(iconName: string, size = 20) {
  const props = { size, strokeWidth: 2.5 };
  switch (iconName) {
    case 'lightbulb':
      return <Lightbulb {...props} />;
    case 'lightbulb-off':
      return <Lightbulb {...props} />;
    case 'wind':
      return <Wind {...props} />;
    case 'wifi':
      return <Wifi {...props} />;
    case 'wifi-off':
      return <WifiOff {...props} />;
    case 'cpu':
      return <Cpu {...props} />;
    case 'bot':
      return <Bot {...props} />;
    case 'zap':
      return <Zap {...props} />;
    case 'check':
      return <CheckCircle {...props} />;
    case 'alert':
    default:
      return <AlertCircle {...props} />;
  }
}

// Toast component
function Toast({ toast }: { toast: ToastNotification }) {
  const [isExiting, setIsExiting] = useState(false);

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(() => {
      dismissToast(toast.id);
    }, 300); // Match animation duration
  };

  return (
    <div
      className={`toast-item ${isExiting ? 'toast-exit' : 'toast-enter'}`}
      style={{
        minWidth: '280px',
        maxWidth: 'min(400px, calc(100vw - 24px))',
        width: '100%',
      }}
    >
      <div
        className="flex items-start gap-3 p-4 rounded-xl shadow-lg transition-colors duration-200 relative"
        style={{
          background: toast.color ? `linear-gradient(to right, ${toast.color}06 0%, var(--bg-primary) 100%)` : 'var(--bg-primary)',
          border: '1px solid var(--border-color)',
          borderLeft: toast.color ? `3px solid ${toast.color}` : '1px solid var(--border-color)',
          boxShadow: toast.color
            ? `0 8px 24px rgba(0, 0, 0, 0.15), 0 0 20px ${toast.color}15`
            : '0 8px 24px rgba(0, 0, 0, 0.15)',
        }}
      >
        {/* Icon */}
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{
            background: toast.color ? `${toast.color}18` : 'var(--bg-secondary)',
            color: toast.color || 'var(--text-primary)',
            boxShadow: toast.color ? `0 0 12px ${toast.color}25` : 'none',
          }}
        >
          {getToastIcon(toast.icon)}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 pt-0.5">
          <p
            className="text-sm font-semibold mb-0.5"
            style={{ color: 'var(--text-primary)' }}
          >
            {toast.title}
          </p>
          <p
            className="text-xs line-clamp-2"
            style={{ color: 'var(--text-secondary)' }}
          >
            {toast.description}
          </p>
          <p
            className="text-[10px] mt-1"
            style={{ color: 'var(--text-tertiary)' }}
          >
            just now
          </p>
        </div>

        {/* Close button */}
        <button
          onClick={handleClose}
          className="p-1 rounded-lg transition-all duration-200 flex-shrink-0"
          style={{
            background: 'var(--bg-secondary)',
            color: 'var(--text-tertiary)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--bg-tertiary)';
            e.currentTarget.style.color = 'var(--text-primary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--bg-secondary)';
            e.currentTarget.style.color = 'var(--text-tertiary)';
          }}
          aria-label="Close notification"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

// Container component
export default function ToastContainer() {
  const [toasts, setToasts] = useState<ToastNotification[]>([]);

  useEffect(() => {
    const unsub = subscribeToToasts(setToasts);
    return unsub;
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed top-20 right-3 sm:right-6 z-[9998] flex flex-col gap-3 max-w-[calc(100vw-24px)]"
      style={{
        pointerEvents: 'none',
      }}
    >
      {toasts.map(toast => (
        <div key={toast.id} style={{ pointerEvents: 'auto' }}>
          <Toast toast={toast} />
        </div>
      ))}
    </div>
  );
}
