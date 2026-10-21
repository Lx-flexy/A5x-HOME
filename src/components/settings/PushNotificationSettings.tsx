import { useState, useEffect } from 'react';
import { Bell, BellOff, Check, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  requestNotificationPermission,
  isPushNotificationEnabled,
  getNotificationPermission,
} from '../../services/fcmService';
import Button from '../ui/Button';

export default function PushNotificationSettings() {
  const { user } = useAuth();
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setPermission(getNotificationPermission());
  }, []);

  async function handleEnableNotifications() {
    if (!user) return;
    
    setLoading(true);
    setError('');
    setSuccess(false);

    try {
      const token = await requestNotificationPermission(user.uid);
      
      if (token) {
        setPermission('granted');
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      } else {
        setError('Failed to enable notifications. Please check browser settings.');
      }
    } catch (err) {
      console.error('Error enabling notifications:', err);
      setError('Failed to enable notifications');
    } finally {
      setLoading(false);
    }
  }

  const isEnabled = permission === 'granted';
  const isDenied = permission === 'denied';

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        {isEnabled ? (
          <div className="w-10 h-10 rounded-full bg-success-100 flex items-center justify-center flex-shrink-0">
            <Bell size={18} className="text-success-600" />
          </div>
        ) : (
          <div className="w-10 h-10 rounded-full bg-neutral-100 flex items-center justify-center flex-shrink-0">
            <BellOff size={18} className="text-neutral-500" />
          </div>
        )}
        
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-neutral-900 mb-1">
            Push Notifications
          </h4>
          <p className="text-xs text-neutral-500 mb-3">
            {isEnabled
              ? 'You will receive notifications even when the app is closed.'
              : 'Get real-time notifications even when this tab is closed.'}
          </p>

          {!isEnabled && (
            <div className="space-y-3">
              {isDenied && (
                <div className="flex items-start gap-2 p-3 bg-warning-50 border border-warning-200 rounded-lg">
                  <AlertCircle size={16} className="text-warning-600 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-warning-700">
                    <p className="font-medium mb-1">Notifications Blocked</p>
                    <p>Please enable notifications in your browser settings and refresh the page.</p>
                  </div>
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2 p-3 bg-error-50 border border-error-200 rounded-lg">
                  <AlertCircle size={16} className="text-error-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-error-700">{error}</p>
                </div>
              )}

              {!isDenied && (
                <Button
                  onClick={handleEnableNotifications}
                  loading={loading}
                  className="w-full sm:w-auto min-h-[44px]"
                  icon={<Bell size={16} />}
                >
                  Enable Push Notifications
                </Button>
              )}
            </div>
          )}

          {isEnabled && success && (
            <div className="flex items-center gap-2 text-success-600 text-sm">
              <Check size={16} />
              <span>Notifications enabled successfully!</span>
            </div>
          )}

          {isEnabled && !success && (
            <div className="flex items-center gap-2 p-3 bg-success-50 border border-success-200 rounded-lg">
              <Check size={16} className="text-success-600 flex-shrink-0" />
              <p className="text-xs text-success-700">
                Push notifications are active. You'll receive alerts even when the app is closed.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Features list */}
      <div className="pl-[52px] space-y-2">
        <div className="flex items-start gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-primary-500 mt-1.5 flex-shrink-0" />
          <p className="text-xs text-neutral-600">Device status changes (online/offline)</p>
        </div>
        <div className="flex items-start gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-primary-500 mt-1.5 flex-shrink-0" />
          <p className="text-xs text-neutral-600">Control actions (switches, outputs, sensors)</p>
        </div>
        <div className="flex items-start gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-primary-500 mt-1.5 flex-shrink-0" />
          <p className="text-xs text-neutral-600">Member activity and access changes</p>
        </div>
        <div className="flex items-start gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-primary-500 mt-1.5 flex-shrink-0" />
          <p className="text-xs text-neutral-600">System alerts and updates</p>
        </div>
      </div>
    </div>
  );
}
