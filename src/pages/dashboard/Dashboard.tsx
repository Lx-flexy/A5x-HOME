import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Cpu, MapPin, Wifi, Users, Lightbulb, Wind, Trash2, Bot, Activity, ChevronRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { subscribeToUserDevices, Device } from '../../services/deviceService';
import { subscribeToActivityLogs, ActivityLog } from '../../services/analyticsService';
import { getTotalMembersForUser } from '../../services/memberService';
import Card from '../../components/ui/Card';
import Loader from '../../components/ui/Loader';

interface StatCardProps {
  label: string;
  value: string | number;
  sublabel: string;
  icon: React.ReactNode;
  iconBg: string;
}

function StatCard({ label, value, sublabel, icon, iconBg }: StatCardProps) {
  return (
    <Card>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-2xl font-bold text-neutral-900">{value}</p>
          <p className="text-sm font-medium text-neutral-700 mt-0.5">{label}</p>
          <p className="text-xs text-neutral-400 mt-0.5">{sublabel}</p>
        </div>
        <div className={`w-10 h-10 ${iconBg} rounded-xl flex items-center justify-center`}>
          {icon}
        </div>
      </div>
    </Card>
  );
}

function getDeviceIcon(name: string) {
  const n = name.toLowerCase();
  if (n.includes('light')) return <Lightbulb size={16} className="text-yellow-600" />;
  if (n.includes('fan')) return <Wind size={16} className="text-blue-600" />;
  if (n.includes('dustbin')) return <Trash2 size={16} className="text-green-600" />;
  return <Cpu size={16} className="text-primary-600" />;
}

function getDeviceBg(name: string) {
  const n = name.toLowerCase();
  if (n.includes('light')) return 'bg-yellow-50';
  if (n.includes('fan')) return 'bg-blue-50';
  if (n.includes('dustbin')) return 'bg-green-50';
  return 'bg-primary-50';
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
  const [devices, setDevices] = useState<Device[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [memberCount, setMemberCount] = useState(0);
  const [loadingDevices, setLoadingDevices] = useState(true);
  const [loadingLogs, setLoadingLogs] = useState(true);

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToUserDevices(user.uid, (devs) => {
      setDevices(devs);
      setLoadingDevices(false);

      // Fetch real member count
      const deviceIds = devs.map(d => d.deviceId);
      getTotalMembersForUser(deviceIds).then(setMemberCount);
    });
    return unsub;
  }, [user]);

  useEffect(() => {
    if (!user || devices.length === 0) {
      setLoadingLogs(false);
      return;
    }
    const deviceIds = devices.map(d => d.deviceId);
    const unsub = subscribeToActivityLogs(deviceIds, (data) => {
      setLogs(data.slice(0, 10));
      setLoadingLogs(false);
    }, 10);
    return unsub;
  }, [devices, user]);

  const onlineDevices = devices.filter(d => d.status === 'online');
  const uniqueRooms = new Set(devices.map(d => d.room)).size;

  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <h2 className="text-lg font-semibold text-neutral-900">Overview</h2>
        <p className="text-sm text-neutral-500 mt-0.5">Your smart home at a glance</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Devices"
          value={devices.length}
          sublabel="All devices"
          iconBg="bg-primary-50"
          icon={<Cpu size={20} className="text-primary-600" />}
        />
        <StatCard
          label="Rooms"
          value={uniqueRooms}
          sublabel="Total rooms"
          iconBg="bg-purple-50"
          icon={<MapPin size={20} className="text-purple-600" />}
        />
        <StatCard
          label="Online"
          value={onlineDevices.length}
          sublabel="All online"
          iconBg="bg-success-50"
          icon={<Wifi size={20} className="text-success-600" />}
        />
        <StatCard
          label="Members"
          value={memberCount}
          sublabel="Total members"
          iconBg="bg-orange-50"
          icon={<Users size={20} className="text-orange-500" />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-neutral-900">My Devices</h3>
            <Link to="/devices" className="text-xs text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1">
              View All <ChevronRight size={14} />
            </Link>
          </div>

          <Card padding={false}>
            {loadingDevices ? (
              <Loader />
            ) : devices.length === 0 ? (
              <div className="py-12 text-center">
                <Cpu size={32} className="text-neutral-300 mx-auto mb-3" />
                <p className="text-sm text-neutral-500 font-medium">No devices added yet</p>
                <p className="text-xs text-neutral-400 mt-1">
                  <Link to="/devices" className="text-primary-600 hover:underline">Add your first device</Link>
                </p>
              </div>
            ) : (
              <div className="divide-y divide-neutral-100">
                {devices.slice(0, 5).map(device => (
                  <Link
                    key={device.id}
                    to={`/devices/${device.id}`}
                    className="flex items-center gap-4 px-5 py-4 hover:bg-neutral-50 transition-colors"
                  >
                    <div className={`w-9 h-9 ${getDeviceBg(device.name)} rounded-xl flex items-center justify-center flex-shrink-0`}>
                      {getDeviceIcon(device.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-neutral-900 truncate">{device.name}</p>
                      <p className="text-xs text-neutral-400">{device.room} · {device.location}</p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <div className={`w-1.5 h-1.5 rounded-full ${device.status === 'online' ? 'bg-success-500' : 'bg-neutral-300'}`} />
                      <span className={`text-xs font-medium ${device.status === 'online' ? 'text-success-600' : 'text-neutral-400'}`}>
                        {device.status === 'online' ? 'Online' : 'Offline'}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-neutral-900">Recent Activity</h3>
            <Link to="/analytics" className="text-xs text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1">
              View All <ChevronRight size={14} />
            </Link>
          </div>

          <Card padding={false}>
            {loadingLogs ? (
              <Loader />
            ) : logs.length === 0 ? (
              <div className="py-12 text-center">
                <Activity size={32} className="text-neutral-300 mx-auto mb-3" />
                <p className="text-sm text-neutral-500">No activity yet</p>
              </div>
            ) : (
              <div className="divide-y divide-neutral-100">
                {logs.slice(0, 8).map(log => (
                  <div key={log.id} className="flex items-start gap-3 px-5 py-3.5">
                    <div className="w-7 h-7 bg-primary-50 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Activity size={14} className="text-primary-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-neutral-900">{log.action}</p>
                      <p className="text-xs text-neutral-400 mt-0.5">{timeAgo(log.timestamp)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 bg-neutral-100 rounded-xl flex items-center justify-center">
              <Bot size={18} className="text-neutral-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-neutral-900">Dex Bot</p>
              <p className="text-xs text-neutral-400">Voice & chat control</p>
            </div>
            <div className="ml-auto">
              <span className="text-xs bg-neutral-100 text-neutral-500 px-2.5 py-1 rounded-full font-medium">Not Connected</span>
            </div>
          </div>
          <Link
            to="/dexbot"
            className="block w-full text-center py-2.5 text-sm font-medium text-primary-600 border border-primary-200 rounded-lg hover:bg-primary-50 transition-colors"
          >
            Connect Dex Bot
          </Link>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-semibold text-neutral-900">Home Overview</p>
              <p className="text-xs text-neutral-400 mt-0.5">Live status</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: <Wifi size={16} className="text-success-600" />, bg: 'bg-success-50', label: 'Online', value: `${onlineDevices.length}/${devices.length}` },
              { icon: <Lightbulb size={16} className="text-yellow-600" />, bg: 'bg-yellow-50', label: 'Lights', value: devices.filter(d => d.name.toLowerCase().includes('light')).length },
              { icon: <Wind size={16} className="text-blue-600" />, bg: 'bg-blue-50', label: 'Fans', value: devices.filter(d => d.name.toLowerCase().includes('fan')).length },
              { icon: <Trash2 size={16} className="text-green-600" />, bg: 'bg-green-50', label: 'Dustbins', value: devices.filter(d => d.name.toLowerCase().includes('dustbin')).length },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-3 bg-neutral-50 rounded-xl p-3">
                <div className={`w-8 h-8 ${item.bg} rounded-lg flex items-center justify-center`}>
                  {item.icon}
                </div>
                <div>
                  <p className="text-sm font-semibold text-neutral-900">{item.value}</p>
                  <p className="text-xs text-neutral-400">{item.label}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
