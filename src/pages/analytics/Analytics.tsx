import { useEffect, useState } from 'react';
import { Lightbulb, Wind, Trash2, Zap, Activity, Clock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { subscribeToUserDevices, Device } from '../../services/deviceService';
import { getAllAnalytics, getActivityLogs, AnalyticsEntry, ActivityLog } from '../../services/analyticsService';
import Card from '../../components/ui/Card';
import Loader from '../../components/ui/Loader';

const TABS = ['Today', 'Weekly', 'Monthly'] as const;

function MetricCard({
  icon,
  label,
  value,
  unit,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  unit: string;
  color: string;
}) {
  return (
    <Card>
      <div className="flex items-center gap-3 mb-2">
        <div className={`w-9 h-9 ${color} rounded-xl flex items-center justify-center`}>
          {icon}
        </div>
        <p className="text-xs text-neutral-500">{label}</p>
      </div>
      <p className="text-2xl font-bold text-neutral-900">
        {value.toFixed(2)} <span className="text-sm font-normal text-neutral-400">{unit}</span>
      </p>
    </Card>
  );
}

function SimpleBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="flex-1 h-2 bg-neutral-100 rounded-full overflow-hidden">
      <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
    </div>
  );
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
  return new Date(secs * 1000).toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short' });
}

export default function Analytics() {
  const { user } = useAuth();
  const [devices, setDevices] = useState<Device[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsEntry[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [tab, setTab] = useState<typeof TABS[number]>('Today');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToUserDevices(user.uid, async devs => {
      setDevices(devs);
      const ids = devs.map(d => d.deviceId);
      const [analyticsData, logsData] = await Promise.all([
        getAllAnalytics(user.uid, ids),
        getActivityLogs(ids, 30),
      ]);
      setAnalytics(analyticsData);
      setLogs(logsData);
      setLoading(false);
    });
    return unsub;
  }, [user]);

  const totalEnergy = analytics.reduce((a, b) => a + (b.energyUsage || 0), 0);
  const totalLightRuntime = analytics.reduce((a, b) => a + (b.lightRuntime || 0), 0);
  const totalFanRuntime = analytics.reduce((a, b) => a + (b.fanRuntime || 0), 0);
  const totalDustbin = analytics.reduce((a, b) => a + (b.dustbinOpenCount || 0), 0);

  const ROOMS = [...new Set(devices.map(d => d.room))];
  const maxEnergy = Math.max(...ROOMS.map(room => {
    const roomDevices = devices.filter(d => d.room === room);
    const roomIds = roomDevices.map(d => d.deviceId);
    return analytics.filter(a => roomIds.includes(a.deviceId)).reduce((acc, b) => acc + (b.energyUsage || 0), 0);
  }), 1);

  if (loading) return <Loader fullPage />;

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">Analytics</h2>
          <p className="text-sm text-neutral-500 mt-0.5">Track device usage and energy consumption</p>
        </div>
        <div className="flex gap-1 bg-neutral-100 p-1 rounded-xl">
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                tab === t ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          icon={<Zap size={18} className="text-primary-600" />}
          label="Total Energy"
          value={totalEnergy}
          unit="kWh"
          color="bg-primary-50"
        />
        <MetricCard
          icon={<Lightbulb size={18} className="text-yellow-600" />}
          label="Light Runtime"
          value={totalLightRuntime}
          unit="hrs"
          color="bg-yellow-50"
        />
        <MetricCard
          icon={<Wind size={18} className="text-blue-600" />}
          label="Fan Runtime"
          value={totalFanRuntime}
          unit="hrs"
          color="bg-blue-50"
        />
        <MetricCard
          icon={<Trash2 size={18} className="text-green-600" />}
          label="Dustbin Opens"
          value={totalDustbin}
          unit="times"
          color="bg-green-50"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-neutral-900">By Room</h3>
            <span className="text-xs text-neutral-400">Energy (kWh)</span>
          </div>
          {ROOMS.length === 0 ? (
            <div className="py-8 text-center text-sm text-neutral-400">No room data available</div>
          ) : (
            <div className="space-y-4">
              {ROOMS.map(room => {
                const roomDevices = devices.filter(d => d.room === room);
                const roomIds = roomDevices.map(d => d.deviceId);
                const energy = analytics.filter(a => roomIds.includes(a.deviceId)).reduce((acc, b) => acc + (b.energyUsage || 0), 0);
                const pct = maxEnergy > 0 ? Math.round((energy / maxEnergy) * 100) : 0;
                return (
                  <div key={room}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm text-neutral-700">{room}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-neutral-500">{energy.toFixed(2)} kWh</span>
                        <span className="text-xs text-neutral-400">{pct}%</span>
                      </div>
                    </div>
                    <SimpleBar value={energy} max={maxEnergy} color="bg-primary-500" />
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-neutral-900">Devices Overview</h3>
            <span className="text-xs text-neutral-400">{devices.length} devices</span>
          </div>
          {devices.length === 0 ? (
            <div className="py-8 text-center text-sm text-neutral-400">No devices</div>
          ) : (
            <div className="space-y-3">
              {devices.slice(0, 5).map(device => {
                const devAnalytics = analytics.filter(a => a.deviceId === device.deviceId);
                const energy = devAnalytics.reduce((a, b) => a + (b.energyUsage || 0), 0);
                return (
                  <div key={device.id} className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-primary-50 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Zap size={14} className="text-primary-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-neutral-900 truncate">{device.name}</p>
                      <p className="text-xs text-neutral-400">{device.room}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-neutral-900">{energy.toFixed(2)}</p>
                      <p className="text-xs text-neutral-400">kWh</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      <Card padding={false}>
        <div className="px-5 py-4 border-b border-neutral-100">
          <h3 className="text-sm font-semibold text-neutral-900">Activity Logs</h3>
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
                        <span className="text-neutral-300 ml-1">({timeAgo(log.timestamp)})</span>
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
