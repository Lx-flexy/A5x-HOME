import { useEffect, useState, useRef } from 'react';
import { Lightbulb, Wind, Zap, Activity, Clock, BarChart3 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  subscribeToUserDevices,
  subscribeToAnalytics,
  subscribeToLastSeen,
  ONLINE_THRESHOLD_MS,
  Device,
  DeviceAnalyticsData,
} from '../../services/deviceService';
import { getActivityLogs, ActivityLog } from '../../services/analyticsService';
import Card from '../../components/ui/Card';
import Loader from '../../components/ui/Loader';

function fmtRuntime(h: number): string {
  if (!h) return '0h 0m';
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${hh}h ${mm}m`;
}

function timeAgo(timestamp: unknown): string {
  if (!timestamp) return '';
  const seconds = (timestamp as { seconds: number }).seconds;
  if (!seconds) return '';
  const diff = Math.floor(Date.now() / 1000) - seconds;
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
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

export default function Analytics() {
  const { user } = useAuth();
  const [devices, setDevices]     = useState<Device[]>([]);
  const [analyticsMap, setAnalyticsMap] = useState<Record<string, DeviceAnalyticsData>>({});
  const [onlineMap, setOnlineMap] = useState<Record<string, boolean>>({});
  const [logs, setLogs]           = useState<ActivityLog[]>([]);
  const [loading, setLoading]     = useState(true);

  // Load devices from Firestore
  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToUserDevices(user.uid, devs => {
      setDevices(devs);
      setLoading(false);
    });
    return unsub;
  }, [user]);

  // Subscribe to RTDB analytics + status for each device
  useEffect(() => {
    if (!devices.length) return;
    const unsubscribers: (() => void)[] = [];

    devices.forEach(dev => {
      const u1 = subscribeToAnalytics(dev.deviceId, data => {
        setAnalyticsMap(prev => ({ ...prev, [dev.deviceId]: data }));
      });
      const u2 = subscribeToDeviceStatus(dev.deviceId, status => {
        setOnlineMap(prev => ({ ...prev, [dev.deviceId]: status === 'online' }));
      });
      unsubscribers.push(u1, u2);
    });

    return () => unsubscribers.forEach(u => u());
  }, [devices]);

  // Load activity logs from Firestore
  useEffect(() => {
    if (!devices.length) return;
    const ids = devices.map(d => d.deviceId);
    getActivityLogs(ids, 30).then(setLogs);
  }, [devices]);

  // Aggregate totals across all devices
  const totals = Object.values(analyticsMap).reduce(
    (acc, a) => ({
      light1Runtime:  acc.light1Runtime  + (a.light1Runtime  || 0),
      light2Runtime:  acc.light2Runtime  + (a.light2Runtime  || 0),
      light3Runtime:  acc.light3Runtime  + (a.light3Runtime  || 0),
      fan1Runtime:    acc.fan1Runtime    + (a.fan1Runtime    || 0),
      fan2Runtime:    acc.fan2Runtime    + (a.fan2Runtime    || 0),
      customRuntime:  acc.customRuntime  + (a.customRuntime  || 0),
      energyUsage:    acc.energyUsage    + (a.energyUsage    || 0),
    }),
    { light1Runtime: 0, light2Runtime: 0, light3Runtime: 0, fan1Runtime: 0, fan2Runtime: 0, customRuntime: 0, energyUsage: 0 }
  );
  const totalRuntime = totals.light1Runtime + totals.light2Runtime + totals.light3Runtime +
                       totals.fan1Runtime   + totals.fan2Runtime   + totals.customRuntime;
  const maxRuntime = Math.max(
    totals.light1Runtime, totals.light2Runtime, totals.light3Runtime,
    totals.fan1Runtime, totals.fan2Runtime, totals.customRuntime, 0.1
  );

  const ROOMS = [...new Set(devices.map(d => d.room))];

  if (loading) return <Loader fullPage />;

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h2 className="text-lg font-semibold text-neutral-900">Analytics</h2>
        <p className="text-sm text-neutral-500 mt-0.5">Live runtime data from RTDB · Activity logs from Firestore</p>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Runtime',  value: fmtRuntime(totalRuntime), unit: '',    icon: <Clock size={18} className="text-primary-600" />,  color: 'bg-primary-50' },
          { label: 'Energy Used',    value: totals.energyUsage.toFixed(3), unit: 'kWh', icon: <Zap size={18} className="text-yellow-600" />,  color: 'bg-yellow-50'  },
          { label: 'Light Runtime',  value: fmtRuntime(totals.light1Runtime + totals.light2Runtime + totals.light3Runtime), unit: '', icon: <Lightbulb size={18} className="text-yellow-600" />, color: 'bg-yellow-50' },
          { label: 'Fan Runtime',    value: fmtRuntime(totals.fan1Runtime + totals.fan2Runtime), unit: '', icon: <Wind size={18} className="text-blue-600" />, color: 'bg-blue-50' },
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

      {/* ── Runtime bars + per-device ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Runtime breakdown */}
        <Card>
          <div className="flex items-center gap-2 mb-5">
            <BarChart3 size={16} className="text-primary-600" />
            <h3 className="text-sm font-semibold text-neutral-900">Channel Runtimes</h3>
            <span className="ml-auto text-xs text-neutral-400">Cumulative</span>
          </div>
          <div className="space-y-3.5">
            {[
              { label: 'Light 1', value: totals.light1Runtime, color: 'bg-yellow-400' },
              { label: 'Light 2', value: totals.light2Runtime, color: 'bg-yellow-400' },
              { label: 'Light 3', value: totals.light3Runtime, color: 'bg-amber-400' },
              { label: 'Fan 1',   value: totals.fan1Runtime,   color: 'bg-blue-400' },
              { label: 'Fan 2',   value: totals.fan2Runtime,   color: 'bg-sky-400' },
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

        {/* Per-device energy */}
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
                const an = analyticsMap[device.deviceId];
                const energy = an?.energyUsage || 0;
                const isOnline = onlineMap[device.deviceId] || false;
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
                          <span className={`w-1 h-1 rounded-full ${isOnline ? 'bg-success-500' : 'bg-neutral-300'}`} />
                          {isOnline ? 'Online' : 'Offline'}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-neutral-900">{energy.toFixed(3)}</p>
                      <p className="text-xs text-neutral-400">kWh</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* ── By Room ── */}
      {ROOMS.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-sm font-semibold text-neutral-900">Energy by Room</h3>
            <span className="text-xs text-neutral-400">kWh</span>
          </div>
          <div className="space-y-4">
            {ROOMS.map(room => {
              const roomDevices = devices.filter(d => d.room === room);
              const energy = roomDevices.reduce((sum, d) => sum + (analyticsMap[d.deviceId]?.energyUsage || 0), 0);
              const maxE = Math.max(...ROOMS.map(r =>
                devices.filter(d => d.room === r).reduce((s, d) => s + (analyticsMap[d.deviceId]?.energyUsage || 0), 0)
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

      {/* ── Activity Logs ── */}
      <Card padding={false}>
        <div className="px-5 py-4 border-b border-neutral-100">
          <h3 className="text-sm font-semibold text-neutral-900">Activity Logs</h3>
          <p className="text-xs text-neutral-400 mt-0.5">Stored in Firestore · activity_logs collection</p>
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
