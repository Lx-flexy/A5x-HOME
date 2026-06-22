import { useEffect, useState, useRef } from 'react';
import { Lightbulb, Wind, Zap, Activity, Clock, BarChart3 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  subscribeToUserDevices,
  subscribeToAnalytics,
  subscribeToOnAt,
  subscribeToLastSeen,
  Device,
  DeviceAnalyticsData,
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
    <div className="flex-1 h-2 bg-neutral-100 rounded-full overflow-hidden">
      <div className={`h-full ${color} rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
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

  // For each device: ensure today's window is clean, then subscribe to analytics + onAt + lastSeen
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

      unsubs.push(u1, u2, u3);
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
          light1Runtime: acc.light1Runtime + liveRuntime(dev.deviceId, 'light1', a.light1Runtime || 0),
          light2Runtime: acc.light2Runtime + liveRuntime(dev.deviceId, 'light2', a.light2Runtime || 0),
          light3Runtime: acc.light3Runtime + liveRuntime(dev.deviceId, 'light3', a.light3Runtime || 0),
          fan1Runtime:   acc.fan1Runtime   + liveRuntime(dev.deviceId, 'fan1',   a.fan1Runtime   || 0),
          fan2Runtime:   acc.fan2Runtime   + liveRuntime(dev.deviceId, 'fan2',   a.fan2Runtime   || 0),
          customRuntime: acc.customRuntime + liveRuntime(dev.deviceId, 'custom1',a.customRuntime || 0),
          energyUsage:   acc.energyUsage   + (a.energyUsage || 0),
        };
      }, { light1Runtime:0, light2Runtime:0, light3Runtime:0, fan1Runtime:0, fan2Runtime:0, customRuntime:0, energyUsage:0 });
    }
    // Historical tabs — use Firestore data
    const allRecords = Object.values(historyMap).flat();
    return aggregateDailyRecords(allRecords);
  };

  const totals = computeTotals();
  const totalRuntime = totals.light1Runtime + totals.light2Runtime + totals.light3Runtime +
                       totals.fan1Runtime + totals.fan2Runtime + totals.customRuntime;
  const maxRuntime = Math.max(
    totals.light1Runtime, totals.light2Runtime, totals.light3Runtime,
    totals.fan1Runtime, totals.fan2Runtime, totals.customRuntime, 0.001
  );

  const today = todayStr();
  const tabLabel = tab === 'today' ? 'Today' : tab === '7d' ? 'Last 7 Days' : 'Last 30 Days';
  const ROOMS = [...new Set(devices.map(d => d.room))];

  if (loading) return <Loader fullPage />;

  return (
    <div className="space-y-6 max-w-5xl">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">Analytics</h2>
          <p className="text-sm text-neutral-500 mt-0.5">
            {tab === 'today'
              ? `Today · ${today} · Live from RTDB`
              : `${tabLabel} · Historical from Firestore`}
          </p>
        </div>
        <div className="flex bg-neutral-100 rounded-xl p-1 gap-1">
          {(['today', '7d', '30d'] as TabKey[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                tab === t
                  ? 'bg-white text-neutral-900 shadow-sm'
                  : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              {t === 'today' ? 'Today' : t === '7d' ? '7 Days' : '30 Days'}
            </button>
          ))}
        </div>
      </div>

      {/* Loading spinner for history tabs */}
      {histLoading && (
        <div className="flex items-center justify-center py-8">
          <svg className="animate-spin w-5 h-5 text-primary-600 mr-2" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
          </svg>
          <span className="text-sm text-neutral-500">Loading {tabLabel}…</span>
        </div>
      )}

      {!histLoading && (
        <>
          {/* ── Summary cards ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                label: `${tabLabel} Runtime`,
                value: fmtRuntime(totalRuntime),
                unit: '',
                icon: <Clock size={18} className="text-primary-600" />,
                color: 'bg-primary-50',
              },
              {
                label: 'Energy Used',
                value: totals.energyUsage.toFixed(3),
                unit: 'kWh',
                icon: <Zap size={18} className="text-yellow-600" />,
                color: 'bg-yellow-50',
              },
              {
                label: 'Light Runtime',
                value: fmtRuntime(totals.light1Runtime + totals.light2Runtime + totals.light3Runtime),
                unit: '',
                icon: <Lightbulb size={18} className="text-yellow-600" />,
                color: 'bg-yellow-50',
              },
              {
                label: 'Fan Runtime',
                value: fmtRuntime(totals.fan1Runtime + totals.fan2Runtime),
                unit: '',
                icon: <Wind size={18} className="text-blue-600" />,
                color: 'bg-blue-50',
              },
            ].map(item => (
              <Card key={item.label}>
                <div className="flex items-center gap-3 mb-2">
                  <div className={`w-9 h-9 ${item.color} rounded-xl flex items-center justify-center`}>
                    {item.icon}
                  </div>
                  <p className="text-xs text-neutral-500">{item.label}</p>
                </div>
                <p className="text-2xl font-bold text-neutral-900">
                  {item.value}
                  {item.unit && <span className="text-sm font-normal text-neutral-400 ml-1">{item.unit}</span>}
                </p>
              </Card>
            ))}
          </div>

          {/* ── Channel runtimes + Devices overview ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Channel runtimes */}
            <Card>
              <div className="flex items-center gap-2 mb-5">
                <BarChart3 size={16} className="text-primary-600" />
                <h3 className="text-sm font-semibold text-neutral-900">Channel Runtimes</h3>
                <span className="ml-auto text-xs text-neutral-400">{tabLabel}</span>
              </div>
              <div className="space-y-3.5">
                {[
                  { label: 'Light 1', value: totals.light1Runtime, color: 'bg-yellow-400' },
                  { label: 'Light 2', value: totals.light2Runtime, color: 'bg-yellow-400' },
                  { label: 'Light 3', value: totals.light3Runtime, color: 'bg-amber-400'  },
                  { label: 'Fan 1',   value: totals.fan1Runtime,   color: 'bg-blue-400'   },
                  { label: 'Fan 2',   value: totals.fan2Runtime,   color: 'bg-sky-400'    },
                  { label: 'Custom',  value: totals.customRuntime, color: 'bg-purple-400' },
                ].map(item => (
                  <div key={item.label} className="flex items-center gap-3">
                    <span className="text-xs text-neutral-500 w-14 flex-shrink-0">{item.label}</span>
                    <RuntimeBar value={item.value} max={maxRuntime} color={item.color} />
                    <span className="text-xs font-semibold text-neutral-700 w-16 text-right flex-shrink-0">
                      {fmtRuntime(item.value)}
                    </span>
                  </div>
                ))}
              </div>
            </Card>

            {/* Devices overview */}
            <Card>
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-sm font-semibold text-neutral-900">Devices Overview</h3>
                <span className="text-xs text-neutral-400">{devices.length} devices</span>
              </div>
              {devices.length === 0 ? (
                <p className="text-sm text-neutral-400 text-center py-8">No devices</p>
              ) : (
                <div className="space-y-3">
                  {devices.map(device => {
                    const a = todayRtdb[device.deviceId];
                    const deviceRuntime = a
                      ? liveRuntime(device.deviceId, 'light1', a.light1Runtime || 0)
                        + liveRuntime(device.deviceId, 'light2', a.light2Runtime || 0)
                        + liveRuntime(device.deviceId, 'light3', a.light3Runtime || 0)
                        + liveRuntime(device.deviceId, 'fan1',   a.fan1Runtime   || 0)
                        + liveRuntime(device.deviceId, 'fan2',   a.fan2Runtime   || 0)
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
                        <div className="w-8 h-8 bg-primary-50 rounded-lg flex items-center justify-center flex-shrink-0">
                          <Zap size={14} className="text-primary-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-neutral-900 truncate">{device.name}</p>
                          <div className="flex items-center gap-2">
                            <p className="text-xs text-neutral-400">{device.room}</p>
                            <span className={`flex items-center gap-1 text-xs ${isOnline ? 'text-success-600' : 'text-neutral-400'}`}>
                              <span className={`w-1 h-1 rounded-full ${isOnline ? 'bg-success-500 animate-pulse' : 'bg-neutral-300'}`} />
                              {isOnline ? 'Online' : 'Offline'}
                            </span>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm font-semibold text-neutral-900">
                            {tab === 'today' ? fmtRuntime(deviceRuntime) : `${energy.toFixed(3)} kWh`}
                          </p>
                          <p className="text-xs text-neutral-400">
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
                <h3 className="text-sm font-semibold text-neutral-900">Energy by Room</h3>
                <span className="text-xs text-neutral-400">kWh · {tabLabel}</span>
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
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm text-neutral-700">{room}</span>
                        <span className="text-xs text-neutral-500">{energy.toFixed(3)} kWh</span>
                      </div>
                      <RuntimeBar value={energy} max={maxE} color="bg-primary-500" />
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
        <div className="px-5 py-4 border-b border-neutral-100">
          <h3 className="text-sm font-semibold text-neutral-900">Activity Logs</h3>
          <p className="text-xs text-neutral-400 mt-0.5">Recent device control actions</p>
        </div>
        {logs.length === 0 ? (
          <div className="py-12 text-center">
            <Activity size={36} className="text-neutral-300 mx-auto mb-3" />
            <p className="text-sm text-neutral-500">No activity recorded yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-100">
                  {['Timestamp', 'Action', 'Performed By'].map(col => (
                    <th key={col} className="text-left py-3 px-5 text-xs font-medium text-neutral-500 uppercase tracking-wide">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {logs.map(log => (
                  <tr key={log.id} className="hover:bg-neutral-50">
                    <td className="py-3.5 px-5">
                      <div className="flex items-center gap-1.5 text-xs text-neutral-500">
                        <Clock size={12} />
                        <span>{formatTimestamp(log.timestamp)}</span>
                        <span className="text-neutral-300">({timeAgo(log.timestamp)})</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-5">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 bg-primary-50 rounded-lg flex items-center justify-center">
                          <Activity size={12} className="text-primary-600" />
                        </div>
                        <span className="text-sm text-neutral-700">{log.action}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-5 text-sm text-neutral-600">{log.performedBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
