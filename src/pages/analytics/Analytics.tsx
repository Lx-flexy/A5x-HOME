import { useEffect, useState } from 'react';
import { Lightbulb, Wind, Zap, Activity, Clock, BarChart3, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  subscribeToUserDevices,
  subscribeToAnalytics,
  subscribeToOnAt,
  subscribeToLastSeen,
  subscribeToCurrentSense,
  Device,
  DeviceAnalyticsData,
  DeviceCurrentSense,
} from '../../services/deviceService';
import { calcIsOnline } from '../../hooks/useDeviceStatus';
import {
  ensureTodayWindow,
  resetCorruptedAnalyticsIfNeeded,
  getActivityLogs,
  getDailyAnalytics,
  aggregateDailyRecords,
  DailyAnalytics,
  ActivityLog,
  todayStr,
} from '../../services/analyticsService';
import Card from '../../components/ui/Card';
import Loader from '../../components/ui/Loader';

type TabKey = 'today' | '7d' | '30d';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtRuntime(h: number): string {
  if (!h || h <= 0) return '0s';
  const totalSec = Math.round(h * 3600);
  if (totalSec < 60) return `${totalSec}s`;
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  const ss = Math.round(((h - hh) * 60 - mm) * 60);
  if (hh === 0) return ss > 0 ? `${mm}m ${ss}s` : `${mm}m`;
  return mm > 0 ? `${hh}h ${mm}m` : `${hh}h`;
}

function fmtCurrent(amps: number): string {
  // Clamp near-zero readings to exactly 0 (sensor noise floor)
  if (amps < 0.01) return '0.00 A';
  // Format to 2 decimal places
  return `${amps.toFixed(2)} A`;
}

function timeAgo(timestamp: unknown): string {
  if (!timestamp) return '';
  const seconds = (timestamp as { seconds: number }).seconds;
  if (!seconds) return '';
  const diff = Math.floor(Date.now() / 1000) - seconds;
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function formatTimestamp(ts: unknown): string {
  if (!ts) return '–';
  const secs = (ts as { seconds: number })?.seconds;
  if (!secs) return '–';
  return new Date(secs * 1000).toLocaleString('en-US', {
    hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short',
  });
}

function RuntimeBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div 
      className="flex-1 h-2.5 sm:h-2 rounded-full overflow-hidden transition-colors duration-200" 
      style={{
        background: 'var(--bg-tertiary)',
        boxShadow: 'var(--neo-inset)',
      }}
    >
      <div 
        className="h-full rounded-full transition-all duration-700" 
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Analytics() {
  const { user } = useAuth();

  const [devices, setDevices]         = useState<Device[]>([]);
  // Stored analytics from RTDB (today's accumulated values)
  const [todayRtdb, setTodayRtdb]     = useState<Record<string, DeviceAnalyticsData>>({});
  // Live onAt timestamps — devices currently ON
  const [onAtMap, setOnAtMap]         = useState<Record<string, Record<string, number>>>({});
  const [lastSeenMap, setLastSeenMap] = useState<Record<string, number>>({});
  // Current sense data — live current readings and mismatch flags
  const [currentSenseMap, setCurrentSenseMap] = useState<Record<string, DeviceCurrentSense>>({});
  const [now, setNow]                 = useState(Date.now());
  const [logs, setLogs]               = useState<ActivityLog[]>([]);
  const [loading, setLoading]         = useState(true);
  const [tab, setTab]                 = useState<TabKey>('today');
  const [historyMap, setHistoryMap]   = useState<Record<string, DailyAnalytics[]>>({});
  const [histLoading, setHistLoading] = useState(false);

  // 1-second ticker for live runtime updates
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Load devices
  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToUserDevices(user.uid, devs => {
      setDevices(devs);
      setLoading(false);
    });
    return unsub;
  }, [user]);

  // For each device: ensure today's window is clean, then subscribe to analytics + onAt + lastSeen + currentSense
  useEffect(() => {
    if (!devices.length) return;
    const unsubs: (() => void)[] = [];

    devices.forEach(dev => {
      // First: wipe any corrupted legacy data (values > 24h impossible in one day)
      resetCorruptedAnalyticsIfNeeded(dev.deviceId).catch(() => {});
      // Then: trigger day-rollover check and clean window
      ensureTodayWindow(dev.deviceId).catch(() => {});

      // Subscribe to stored analytics (accumulated off-time runtime)
      const u1 = subscribeToAnalytics(dev.deviceId, data => {
        setTodayRtdb(prev => ({ ...prev, [dev.deviceId]: data }));
      });

      // Subscribe to onAt — tracks devices currently ON (live delta)
      const u2 = subscribeToOnAt(dev.deviceId, onAt => {
        setOnAtMap(prev => ({ ...prev, [dev.deviceId]: onAt }));
      });

      // Subscribe to lastSeen for online status
      const u3 = subscribeToLastSeen(dev.deviceId, ms => {
        setLastSeenMap(prev => ({ ...prev, [dev.deviceId]: ms }));
      });

      // Subscribe to currentSense — live current readings and mismatch flags
      const u4 = subscribeToCurrentSense(dev.deviceId, currentSense => {
        setCurrentSenseMap(prev => ({ ...prev, [dev.deviceId]: currentSense }));
      });

      unsubs.push(u1, u2, u3, u4);
    });

    return () => unsubs.forEach(u => u());
  }, [devices]);

  // Load Firestore history when tab changes to 7d/30d
  useEffect(() => {
    if (tab === 'today' || !devices.length) return;
    const days = tab === '7d' ? 7 : 30;
    setHistLoading(true);
    Promise.all(
      devices.map(dev =>
        getDailyAnalytics(dev.deviceId, days).then(records => ({ deviceId: dev.deviceId, records }))
      )
    ).then(results => {
      const map: Record<string, DailyAnalytics[]> = {};
      results.forEach(r => { map[r.deviceId] = r.records; });
      setHistoryMap(map);
      setHistLoading(false);
    });
  }, [tab, devices]);

  // Activity logs — realtime
  useEffect(() => {
    if (!devices.length) return;
    getActivityLogs(devices.map(d => d.deviceId), 30).then(setLogs);
  }, [devices]);

  const isDeviceOnline = (deviceId: string) => calcIsOnline(lastSeenMap[deviceId] || 0);

  // ── Live runtime for a single channel ────────────────────────────────────
  // Adds the live delta (device currently ON) to the stored accumulated value.
  // This is the same logic DeviceDetails uses for its live clock.
  const liveRuntime = (deviceId: string, key: string, stored: number): number => {
    const onAtMs = onAtMap[deviceId]?.[key] || 0;
    const liveHours = onAtMs > 0 ? (now - onAtMs) / 3_600_000 : 0;
    return stored + liveHours;
  };

  // ── Compute totals for current tab ────────────────────────────────────────
  const computeTotals = () => {
    if (tab === 'today') {
      // Sum stored + live delta across all devices
      return devices.reduce((acc, dev) => {
        const a = todayRtdb[dev.deviceId];
        if (!a) return acc;
        return {
          light2Runtime: acc.light2Runtime + liveRuntime(dev.deviceId, 'light2', a.light2Runtime || 0),
          light3Runtime: acc.light3Runtime + liveRuntime(dev.deviceId, 'light3', a.light3Runtime || 0),
          fan1Runtime:   acc.fan1Runtime   + liveRuntime(dev.deviceId, 'fan1',   a.fan1Runtime   || 0),
          customRuntime: acc.customRuntime + liveRuntime(dev.deviceId, 'custom1',a.customRuntime || 0),
          energyUsage:   acc.energyUsage   + (a.energyUsage || 0),
        };
      }, { light2Runtime:0, light3Runtime:0, fan1Runtime:0, customRuntime:0, energyUsage:0 });
    }
    // Historical tabs — use Firestore data
    const allRecords = Object.values(historyMap).flat();
    return aggregateDailyRecords(allRecords);
  };

  const totals = computeTotals();
  const totalRuntime = totals.light2Runtime + totals.light3Runtime +
                       totals.fan1Runtime + totals.customRuntime;
  const maxRuntime = Math.max(
    totals.light2Runtime, totals.light3Runtime,
    totals.fan1Runtime, totals.customRuntime, 0.001
  );

  const today = todayStr();
  const tabLabel = tab === 'today' ? 'Today' : tab === '7d' ? 'Last 7 Days' : 'Last 30 Days';
  const ROOMS = [...new Set(devices.map(d => d.room))];

  if (loading) return <Loader fullPage />;

  return (
    <div className="space-y-4 md:space-y-6 max-w-5xl">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-3">
        <div>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Analytics</h2>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
            {tab === 'today'
              ? `Today · ${today} · Live from RTDB`
              : `${tabLabel} · Historical from Firestore`}
          </p>
        </div>
        <div className="flex rounded-xl p-1 gap-1 w-full sm:w-auto" style={{ background: 'var(--bg-secondary)' }}>
          {(['today', '7d', '30d'] as TabKey[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 sm:flex-none px-4 sm:px-3.5 py-2.5 sm:py-1.5 text-sm sm:text-xs font-semibold rounded-lg transition-all touch-manipulation ${
                tab === t
                  ? 'shadow-sm'
                  : ''
              }`}
              style={{
                background: tab === t ? 'var(--bg-primary)' : 'transparent',
                color: tab === t ? 'var(--text-primary)' : 'var(--text-secondary)',
                minHeight: '44px', // Touch-friendly on mobile
              }}
            >
              {t === 'today' ? 'Today' : t === '7d' ? '7 Days' : '30 Days'}
            </button>
          ))}
        </div>
      </div>

      {/* Loading spinner for history tabs */}
      {histLoading && (
        <div className="flex items-center justify-center py-12 sm:py-8">
          <svg className="animate-spin w-6 h-6 sm:w-5 sm:h-5 mr-2" viewBox="0 0 24 24" fill="none" style={{ color: '#2563eb' }}>
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
          </svg>
          <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Loading {tabLabel}…</span>
        </div>
      )}

      {!histLoading && (
        <>
          {/* ── Summary cards ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            {[
              {
                label: `${tabLabel} Runtime`,
                value: fmtRuntime(totalRuntime),
                unit: '',
                icon: <Clock size={20} className="sm:w-[18px] sm:h-[18px]" style={{ color: '#2563eb' }} />,
                iconBg: 'linear-gradient(135deg, #dbeafe, #bfdbfe)',
              },
              {
                label: 'Energy Used',
                value: totals.energyUsage.toFixed(3),
                unit: 'kWh',
                icon: <Zap size={20} className="sm:w-[18px] sm:h-[18px]" style={{ color: '#d97706' }} />,
                iconBg: 'linear-gradient(135deg, #fef9c3, #fde68a)',
              },
              {
                label: 'Light Runtime',
                value: fmtRuntime(totals.light2Runtime + totals.light3Runtime),
                unit: '',
                icon: <Lightbulb size={20} className="sm:w-[18px] sm:h-[18px]" style={{ color: '#d97706' }} />,
                iconBg: 'linear-gradient(135deg, #fef9c3, #fde68a)',
              },
              {
                label: 'Fan Runtime',
                value: fmtRuntime(totals.fan1Runtime),
                unit: '',
                icon: <Wind size={20} className="sm:w-[18px] sm:h-[18px]" style={{ color: '#2563eb' }} />,
                iconBg: 'linear-gradient(135deg, #dbeafe, #bfdbfe)',
              },
            ].map(item => (
              <Card key={item.label}>
                <div className="flex items-center gap-3 mb-3 sm:mb-2">
                  <div 
                    className="w-11 h-11 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: item.iconBg }}
                  >
                    {item.icon}
                  </div>
                  <p className="text-sm sm:text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>{item.label}</p>
                </div>
                <p className="text-2xl sm:text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                  {item.value}
                  {item.unit && <span className="text-base sm:text-sm font-normal ml-1" style={{ color: 'var(--text-tertiary)' }}>{item.unit}</span>}
                </p>
              </Card>
            ))}
          </div>

          {/* ── Live Current Monitoring (Today only) ── */}
          {tab === 'today' && devices.length > 0 && (
            <Card>
              <div className="flex items-center gap-2 mb-5">
                <Zap size={18} className="sm:w-4 sm:h-4" style={{ color: '#2563eb' }} />
                <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Live Current Monitor</h3>
                <span className="ml-auto text-xs" style={{ color: 'var(--text-tertiary)' }}>Real-time</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {[
                  { key: 'light2', label: 'Light 2', color: '#fbbf24' },
                  { key: 'light3', label: 'Light 3', color: '#f59e0b' },
                  { key: 'fan1', label: 'Fan 1', color: '#60a5fa' },
                  { key: 'custom1', label: 'Custom', color: '#a78bfa' },
                ].map(channel => {
                  // Aggregate current across all devices for this channel
                  let totalCurrent = 0;
                  let hasMismatch = false;
                  let hasData = false;

                  devices.forEach(dev => {
                    const cs = currentSenseMap[dev.deviceId];
                    if (cs) {
                      const currentField = `${channel.key}Current` as keyof DeviceCurrentSense;
                      const mismatchField = `${channel.key}Mismatch` as keyof DeviceCurrentSense;
                      const current = cs[currentField] as number;
                      const mismatch = cs[mismatchField] as boolean;
                      
                      if (typeof current === 'number') {
                        hasData = true;
                        totalCurrent += current;
                      }
                      if (mismatch === true) {
                        hasMismatch = true;
                      }
                    }
                  });

                  return (
                    <div 
                      key={channel.key} 
                      className="p-3 rounded-lg border"
                      style={{ 
                        background: hasMismatch ? 'rgba(239, 68, 68, 0.05)' : 'var(--bg-secondary)',
                        borderColor: hasMismatch ? '#ef4444' : 'var(--border-color)'
                      }}
                    >
                      <div className="flex items-center gap-1.5 mb-2">
                        <div 
                          className="w-2 h-2 rounded-full flex-shrink-0" 
                          style={{ background: channel.color }}
                        />
                        <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                          {channel.label}
                        </p>
                      </div>
                      {hasData ? (
                        <>
                          <p className="text-lg font-bold mb-1" style={{ color: hasMismatch ? '#ef4444' : 'var(--text-primary)' }}>
                            {fmtCurrent(totalCurrent)}
                          </p>
                          {hasMismatch && (
                            <div className="flex items-start gap-1 mt-2 pt-2 border-t" style={{ borderColor: 'rgba(239, 68, 68, 0.2)' }}>
                              <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" style={{ color: '#ef4444' }} />
                              <p className="text-xs leading-tight" style={{ color: '#ef4444' }}>
                                Not responding — check switch or bulb
                              </p>
                            </div>
                          )}
                        </>
                      ) : (
                        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>No data</p>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="text-xs mt-4" style={{ color: 'var(--text-tertiary)' }}>
                Current sensing requires compatible hardware. Older devices may show "No data".
              </p>
            </Card>
          )}

          {/* ── Channel runtimes + Devices overview ── */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 md:gap-6">
            {/* Channel runtimes */}
            <Card>
              <div className="flex items-center gap-2 mb-5">
                <BarChart3 size={18} className="sm:w-4 sm:h-4" style={{ color: '#2563eb' }} />
                <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Channel Runtimes</h3>
                <span className="ml-auto text-xs" style={{ color: 'var(--text-tertiary)' }}>{tabLabel}</span>
              </div>
              <div className="space-y-4 sm:space-y-3.5">
                {[
                  { label: 'Light 2', value: totals.light2Runtime, color: '#fbbf24' },
                  { label: 'Light 3', value: totals.light3Runtime, color: '#f59e0b'  },
                  { label: 'Fan 1',   value: totals.fan1Runtime,   color: '#60a5fa'   },
                  { label: 'Custom',  value: totals.customRuntime, color: '#a78bfa' },
                ].map(item => (
                  <div key={item.label} className="flex items-center gap-3">
                    <span className="text-sm sm:text-xs font-medium w-16 sm:w-14 flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>{item.label}</span>
                    <RuntimeBar value={item.value} max={maxRuntime} color={item.color} />
                    <span className="text-sm sm:text-xs font-semibold w-20 sm:w-16 text-right flex-shrink-0" style={{ color: 'var(--text-primary)' }}>
                      {fmtRuntime(item.value)}
                    </span>
                  </div>
                ))}
              </div>
            </Card>

            {/* Devices overview */}
            <Card>
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Devices Overview</h3>
                <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{devices.length} devices</span>
              </div>
              {devices.length === 0 ? (
                <p className="text-sm text-center py-12 sm:py-8" style={{ color: 'var(--text-tertiary)' }}>No devices</p>
              ) : (
                <div className="space-y-4 sm:space-y-3">
                  {devices.map(device => {
                    const a = todayRtdb[device.deviceId];
                    const deviceRuntime = a
                      ? liveRuntime(device.deviceId, 'light2', a.light2Runtime || 0)
                        + liveRuntime(device.deviceId, 'light3', a.light3Runtime || 0)
                        + liveRuntime(device.deviceId, 'fan1',   a.fan1Runtime   || 0)
                        + liveRuntime(device.deviceId, 'custom1',a.customRuntime || 0)
                      : tab !== 'today'
                        ? aggregateDailyRecords(historyMap[device.deviceId] || []).energyUsage
                        : 0;

                    const energy = tab === 'today'
                      ? (a?.energyUsage || 0)
                      : aggregateDailyRecords(historyMap[device.deviceId] || []).energyUsage;
                    const isOnline = isDeviceOnline(device.deviceId);

                    return (
                      <div key={device.id} className="flex items-center gap-3">
                        <div 
                          className="w-10 h-10 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ background: 'rgba(37, 99, 235, 0.1)' }}
                        >
                          <Zap size={16} className="sm:w-[14px] sm:h-[14px]" style={{ color: '#2563eb' }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{device.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{device.room}</p>
                            <span className={`flex items-center gap-1 text-xs ${isOnline ? '' : ''}`} style={{ color: isOnline ? '#16a34a' : 'var(--text-tertiary)' }}>
                              <span className={`w-1.5 h-1.5 sm:w-1 sm:h-1 rounded-full ${isOnline ? 'animate-pulse' : ''}`} style={{ background: isOnline ? '#22c55e' : 'var(--text-tertiary)' }} />
                              {isOnline ? 'Online' : 'Offline'}
                            </span>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                            {tab === 'today' ? fmtRuntime(deviceRuntime) : `${energy.toFixed(3)} kWh`}
                          </p>
                          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                            {tab === 'today' ? 'runtime' : 'energy'}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>

          {/* ── Energy by Room ── */}
          {ROOMS.length > 0 && (
            <Card>
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Energy by Room</h3>
                <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>kWh · {tabLabel}</span>
              </div>
              <div className="space-y-4">
                {ROOMS.map(room => {
                  const roomDevices = devices.filter(d => d.room === room);
                  const energy = roomDevices.reduce((sum, d) => {
                    const an = tab === 'today'
                      ? todayRtdb[d.deviceId]
                      : aggregateDailyRecords(historyMap[d.deviceId] || []);
                    return sum + (an?.energyUsage || 0);
                  }, 0);
                  const maxE = Math.max(...ROOMS.map(r =>
                    devices.filter(d => d.room === r).reduce((s, d) => {
                      const an = tab === 'today'
                        ? todayRtdb[d.deviceId]
                        : aggregateDailyRecords(historyMap[d.deviceId] || []);
                      return s + (an?.energyUsage || 0);
                    }, 0)
                  ), 0.001);
                  return (
                    <div key={room}>
                      <div className="flex items-center justify-between mb-2 sm:mb-1.5">
                        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{room}</span>
                        <span className="text-sm sm:text-xs" style={{ color: 'var(--text-tertiary)' }}>{energy.toFixed(3)} kWh</span>
                      </div>
                      <RuntimeBar value={energy} max={maxE} color="#2563eb" />
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </>
      )}

      {/* ── Activity Logs ── */}
      <Card padding={false}>
        <div className="px-4 md:px-5 py-4" style={{ borderBottom: '1px solid var(--border-color)' }}>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Activity Logs</h3>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>Recent device control actions</p>
        </div>
        {logs.length === 0 ? (
          <div className="py-16 sm:py-12 text-center px-4">
            <Activity size={40} className="sm:w-9 sm:h-9 mx-auto mb-3" style={{ color: 'var(--text-tertiary)' }} />
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>No activity recorded yet</p>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                    {['Timestamp', 'Action', 'Performed By'].map(col => (
                      <th key={col} className="text-left py-3 px-5 text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--border-color)' }}>
                  {logs.map(log => (
                    <tr 
                      key={log.id} 
                      className="transition-colors"
                      style={{ background: 'transparent' }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-secondary)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <td className="py-3.5 px-5">
                        <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                          <Clock size={12} />
                          <span>{formatTimestamp(log.timestamp)}</span>
                          <span style={{ color: 'var(--text-tertiary)', opacity: 0.7 }}>({timeAgo(log.timestamp)})</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-5">
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-6 h-6 rounded-lg flex items-center justify-center"
                            style={{ background: 'rgba(37, 99, 235, 0.1)' }}
                          >
                            <Activity size={12} style={{ color: '#2563eb' }} />
                          </div>
                          <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{log.action}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-5 text-sm" style={{ color: 'var(--text-secondary)' }}>{log.performedBy}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden divide-y" style={{ borderColor: 'var(--border-color)' }}>
              {logs.map(log => (
                <div key={log.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <div 
                      className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{ background: 'rgba(37, 99, 235, 0.1)' }}
                    >
                      <Activity size={16} style={{ color: '#2563eb' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>{log.action}</p>
                      <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                        <Clock size={12} />
                        <span>{formatTimestamp(log.timestamp)}</span>
                        <span>({timeAgo(log.timestamp)})</span>
                      </div>
                      <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>By {log.performedBy}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
