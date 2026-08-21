import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Cpu, MapPin, Wifi, Users, Lightbulb, Wind,
  Bot, Activity, ChevronRight,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { subscribeToUserDevices, subscribeToLastSeen, Device } from '../../services/deviceService';
import { subscribeToActivityLogs, ActivityLog } from '../../services/analyticsService';
import { getTotalMembersForUser } from '../../services/memberService';
import { calcIsOnline } from '../../hooks/useDeviceStatus';
import Card from '../../components/ui/Card';
import Loader from '../../components/ui/Loader';

function StatCard({
  label, value, sublabel, icon, iconBg,
}: {
  label: string;
  value: string | number;
  sublabel: string;
  icon: React.ReactNode;
  iconBg: string;
}) {
  return (
    <Card>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{value}</p>
          <p className="text-sm font-medium mt-0.5" style={{ color: 'var(--text-primary)' }}>{label}</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{sublabel}</p>
        </div>
        <div className={`w-10 h-10 ${iconBg} rounded-xl flex items-center justify-center`}>
          {icon}
        </div>
      </div>
    </Card>
  );
}

function timeAgo(timestamp: unknown): string {
  if (!timestamp) return '';
  const seconds = (timestamp as { seconds: number }).seconds;
  if (!seconds) return '';
  const diff = Math.floor(Date.now() / 1000) - seconds;
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`;
  return `${Math.floor(diff / 86400)} days ago`;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [devices, setDevices]           = useState<Device[]>([]);
  const [logs, setLogs]                 = useState<ActivityLog[]>([]);
  const [memberCount, setMemberCount]   = useState(0);
  const [lastSeenMap, setLastSeenMap]   = useState<Record<string, number>>({});
  const [, tick]                        = useState(0); // 1s re-render for live status
  const [loadingDevices, setLoadingDevices] = useState(true);
  const [loadingLogs, setLoadingLogs]       = useState(true);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 1s ticker so isOnline re-evaluates without new RTDB data
  useEffect(() => {
    tickRef.current = setInterval(() => tick(n => n + 1), 1000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, []);

  // Firestore: device list
  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToUserDevices(user.uid, devs => {
      setDevices(devs);
      setLoadingDevices(false);
      getTotalMembersForUser(devs.map(d => d.deviceId)).then(setMemberCount);
    });
    return unsub;
  }, [user]);

  // RTDB: subscribe to lastSeen for each device
  useEffect(() => {
    if (!devices.length) return;
    const unsubscribers = devices.map(dev =>
      subscribeToLastSeen(dev.deviceId, ms => {
        setLastSeenMap(prev => ({ ...prev, [dev.deviceId]: ms }));
      })
    );
    return () => unsubscribers.forEach(u => u());
  }, [devices]);

  // Firestore: activity logs
  useEffect(() => {
    if (!user || !devices.length) { setLoadingLogs(false); return; }
    const ids = devices.map(d => d.deviceId);
    const unsub = subscribeToActivityLogs(ids, data => {
      setLogs(data.slice(0, 10));
      setLoadingLogs(false);
    }, 10);
    return unsub;
  }, [devices, user]);

  const isDeviceOnline = (deviceId: string) => {
    return calcIsOnline(lastSeenMap[deviceId] || 0);
  };

  const onlineCount = devices.filter(d => isDeviceOnline(d.deviceId)).length;
  const uniqueRooms = new Set(devices.map(d => d.room)).size;

  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Overview</h2>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>Your smart home at a glance</p>
      </div>

      {/* ── Stats row ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <StatCard
          label="Devices" value={devices.length} sublabel="Registered"
          iconBg="bg-primary-50" icon={<Cpu size={20} className="text-primary-600" />}
        />
        <StatCard
          label="Online" value={onlineCount} sublabel="Live from RTDB"
          iconBg="bg-success-50" icon={<Wifi size={20} className="text-success-600" />}
        />
        <StatCard
          label="Rooms" value={uniqueRooms} sublabel="Total rooms"
          iconBg="bg-purple-50" icon={<MapPin size={20} className="text-purple-600" />}
        />
        <StatCard
          label="Members" value={memberCount} sublabel="Total members"
          iconBg="bg-orange-50" icon={<Users size={20} className="text-orange-500" />}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 md:gap-6">
        {/* ── My Devices ── */}
        <div className="xl:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>My Devices</h3>
            <Link to="/devices" className="text-xs font-medium flex items-center gap-1" style={{ color: '#2563eb' }}>
              View All <ChevronRight size={14} />
            </Link>
          </div>
          <Card padding={false}>
            {loadingDevices ? <Loader /> : devices.length === 0 ? (
              <div className="py-12 text-center">
                <Cpu size={32} style={{ color: 'var(--text-tertiary)' }} className="mx-auto mb-3" />
                <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>No devices added yet</p>
                <Link to="/devices" className="text-xs mt-1 block" style={{ color: '#2563eb' }}>
                  Add your first device
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-neutral-100" style={{ borderColor: 'var(--border-color)' }}>
                {devices.slice(0, 5).map(device => {
                  const isOnline = isDeviceOnline(device.deviceId);
                  return (
                    <Link
                      key={device.id}
                      to={`/devices/${device.id}`}
                      className="flex items-center gap-3 md:gap-4 px-4 md:px-5 py-3 md:py-4 transition-colors touch-manipulation"
                      style={{
                        background: 'transparent',
                        minHeight: '64px', // Touch-friendly
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-secondary)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <div className="w-10 h-10 md:w-9 md:h-9 bg-primary-50 rounded-xl flex items-center justify-center flex-shrink-0">
                        <Cpu size={18} className="md:w-4 md:h-4 text-primary-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{device.name}</p>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{device.room} · {device.location}</p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <div className={`w-2 h-2 md:w-1.5 md:h-1.5 rounded-full ${isOnline ? 'bg-success-500 animate-pulse' : 'bg-neutral-300'}`} />
                        <span className={`text-sm md:text-xs font-medium ${isOnline ? 'text-success-600' : ''}`} style={{ color: isOnline ? '#16a34a' : 'var(--text-tertiary)' }}>
                          {isOnline ? 'Online' : 'Offline'}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        {/* ── Recent Activity ── */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Recent Activity</h3>
            <Link to="/analytics" className="text-xs font-medium flex items-center gap-1" style={{ color: '#2563eb' }}>
              View All <ChevronRight size={14} />
            </Link>
          </div>
          <Card padding={false}>
            {loadingLogs ? <Loader /> : logs.length === 0 ? (
              <div className="py-12 text-center">
                <Activity size={32} style={{ color: 'var(--text-tertiary)' }} className="mx-auto mb-3" />
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No activity yet</p>
              </div>
            ) : (
              <div className="divide-y" style={{ borderColor: 'var(--border-color)' }}>
                {logs.slice(0, 8).map(log => (
                  <div key={log.id} className="flex items-start gap-3 px-4 md:px-5 py-3 md:py-3.5">
                    <div className="w-8 h-8 md:w-7 md:h-7 bg-primary-50 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Activity size={16} className="md:w-[14px] md:h-[14px] text-primary-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm md:text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{log.action}</p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{timeAgo(log.timestamp)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* ── Bottom row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <Card>
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <div className="w-10 h-10 md:w-9 md:h-9 rounded-xl flex items-center justify-center" style={{ background: 'var(--bg-secondary)' }}>
              <Bot size={20} className="md:w-[18px] md:h-[18px]" style={{ color: 'var(--text-secondary)' }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Dex Bot</p>
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Voice & chat control</p>
            </div>
            <span className="text-xs px-2.5 py-1 rounded-full font-medium whitespace-nowrap" style={{ background: 'var(--bg-secondary)', color: 'var(--text-tertiary)' }}>
              Not Connected
            </span>
          </div>
          <Link
            to="/dexbot"
            className="block w-full text-center py-3 md:py-2.5 text-sm font-medium border rounded-lg transition-colors touch-manipulation"
            style={{ 
              color: '#2563eb',
              borderColor: 'var(--border-color)',
              background: 'transparent',
              minHeight: '44px',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-secondary)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            Connect Dex Bot
          </Link>
        </Card>

        <Card>
          <p className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Home Overview</p>
          <div className="grid grid-cols-2 gap-3">
            {[
              {
                icon: <Wifi size={18} className="md:w-4 md:h-4 text-success-600" />,
                bg: 'bg-success-50',
                label: 'Online',
                value: `${onlineCount}/${devices.length}`,
              },
              {
                icon: <Lightbulb size={18} className="md:w-4 md:h-4 text-yellow-600" />,
                bg: 'bg-yellow-50',
                label: 'Controllers',
                value: devices.length,
              },
              {
                icon: <Wind size={18} className="md:w-4 md:h-4 text-blue-600" />,
                bg: 'bg-blue-50',
                label: 'Rooms',
                value: uniqueRooms,
              },
              {
                icon: <Users size={18} className="md:w-4 md:h-4 text-orange-500" />,
                bg: 'bg-orange-50',
                label: 'Members',
                value: memberCount,
              },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-2 md:gap-3 rounded-xl p-3" style={{ background: 'var(--bg-secondary)' }}>
                <div className={`w-10 h-10 md:w-8 md:h-8 ${item.bg} rounded-lg flex items-center justify-center flex-shrink-0`}>
                  {item.icon}
                </div>
                <div className="min-w-0">
                  <p className="text-sm md:text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{item.value}</p>
                  <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{item.label}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
