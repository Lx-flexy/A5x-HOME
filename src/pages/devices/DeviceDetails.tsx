import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ChevronRight, Lightbulb, Wind, Monitor, Volume2,
  Wifi, Clock, Cpu, Activity, MapPin, Trash,
  Zap, MemoryStick, RotateCcw, Signal, Server,
  CheckCircle2, XCircle, BarChart3, Bolt, Edit2,
} from 'lucide-react';
import {
  getDevice,
  subscribeToOutputs,
  subscribeToHealth,
  subscribeToAnalytics,
  subscribeToDeviceStatus,
  setOutput,
  deleteDevice,
  Device,
  DeviceOutputs,
  DeviceHealth,
  DeviceAnalyticsData,
} from '../../services/deviceService';
import { useAuth } from '../../context/AuthContext';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Loader from '../../components/ui/Loader';
import Modal from '../../components/ui/Modal';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtUptime(s: number): string {
  if (!s || s <= 0) return '–';
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function fmtHeap(b: number): string {
  if (!b) return '–';
  return `${Math.round(b / 1024)} KB`;
}

function fmtRuntime(h: number): string {
  if (!h) return '0h 0m';
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${hh}h ${mm}m`;
}

function timeAgo(ts: unknown): string {
  if (!ts) return '–';
  // RTDB stores unix ms; Firestore stores {seconds, nanoseconds}
  let ms: number;
  if (typeof ts === 'number') {
    ms = ts > 1e10 ? ts : ts * 1000; // handle both ms and seconds
  } else {
    const secs = (ts as { seconds: number })?.seconds;
    if (!secs) return '–';
    ms = secs * 1000;
  }
  const diff = Math.floor((Date.now() - ms) / 1000);
  if (diff < 5) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function rssiLabel(rssi: number): { text: string; color: string } {
  if (rssi >= -50) return { text: 'Excellent', color: 'text-success-600' };
  if (rssi >= -60) return { text: 'Good', color: 'text-success-600' };
  if (rssi >= -70) return { text: 'Fair', color: 'text-yellow-600' };
  return { text: 'Weak', color: 'text-error-500' };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={`relative inline-flex items-center ${
        disabled ? 'opacity-40 pointer-events-none' : 'cursor-pointer'
      }`}
    >
      <input
        type="checkbox"
        className="sr-only peer"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        disabled={disabled}
      />
      <div
        className={`w-11 h-6 rounded-full border-2 transition-all duration-200 peer-checked:border-primary-600
          ${checked ? 'bg-primary-600 border-primary-600' : 'bg-neutral-200 border-neutral-300'}
        `}
      />
      <div
        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200
          ${checked ? 'translate-x-5' : 'translate-x-0'}
        `}
      />
    </label>
  );
}

function OnlinePill({ online }: { online: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
        online ? 'bg-success-50 text-success-700' : 'bg-neutral-100 text-neutral-500'
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          online ? 'bg-success-500 animate-pulse' : 'bg-neutral-400'
        }`}
      />
      {online ? 'Online' : 'Offline'}
    </span>
  );
}

function HealthRow({
  icon,
  label,
  value,
  ok,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  ok?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-neutral-50 last:border-0">
      <div className="flex items-center gap-2.5">
        <span className="text-neutral-400">{icon}</span>
        <span className="text-xs text-neutral-600">{label}</span>
      </div>
      <div className="flex items-center gap-1.5">
        {ok !== undefined &&
          (ok ? (
            <CheckCircle2 size={13} className="text-success-500" />
          ) : (
            <XCircle size={13} className="text-error-500" />
          ))}
        <span className="text-xs font-semibold text-neutral-900">{value}</span>
      </div>
    </div>
  );
}

function ControlCard({
  icon,
  iconActiveBg,
  iconInactiveBg,
  iconActiveColor,
  iconInactiveColor,
  label,
  runtime,
  checked,
  onChange,
  disabled,
  lastUpdate,
}: {
  icon: React.ReactNode;
  iconActiveBg: string;
  iconInactiveBg: string;
  iconActiveColor: string;
  iconInactiveColor: string;
  label: string;
  runtime?: number;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  lastUpdate?: string;
}) {
  return (
    <div
      className={`rounded-2xl border-2 p-4 transition-all duration-200 ${
        checked
          ? `border-primary-200 bg-gradient-to-br from-primary-50 to-white`
          : 'border-neutral-100 bg-white hover:border-neutral-200'
      }`}
    >
      <div className="flex items-start justify-between mb-3">
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 ${
            checked ? iconActiveBg : iconInactiveBg
          }`}
        >
          <span className={checked ? iconActiveColor : iconInactiveColor}>{icon}</span>
        </div>
        <Toggle checked={checked} onChange={onChange} disabled={disabled} />
      </div>
      <p className="text-sm font-semibold text-neutral-900">{label}</p>
      <div className="flex items-center justify-between mt-1">
        <span
          className={`text-xs font-medium ${
            checked ? 'text-primary-600' : 'text-neutral-400'
          }`}
        >
          {checked ? '● ON' : '○ OFF'}
        </span>
        {runtime !== undefined && runtime > 0 && (
          <span className="text-xs text-neutral-400">{fmtRuntime(runtime)}</span>
        )}
      </div>
      {lastUpdate && (
        <p className="text-xs text-neutral-300 mt-1">{lastUpdate}</p>
      )}
    </div>
  );
}

function RuntimeBar({
  value,
  max,
  color,
}: {
  value: number;
  max: number;
  color: string;
}) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="flex-1 h-2 bg-neutral-100 rounded-full overflow-hidden">
      <div
        className={`h-full ${color} rounded-full transition-all duration-700 ease-out`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DeviceDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { userData } = useAuth();

  const [device, setDevice]     = useState<Device | null>(null);
  const [outputs, setOutputs]   = useState<DeviceOutputs | null>(null);
  const [health, setHealth]     = useState<DeviceHealth | null>(null);
  const [analytics, setAnalytics] = useState<DeviceAnalyticsData | null>(null);
  const [liveStatus, setLiveStatus] = useState<'online' | 'offline'>('offline');
  const [loading, setLoading]   = useState(true);

  const [oledDraft, setOledDraft]   = useState('');
  const [sendingOled, setSendingOled] = useState(false);

  const [buzzerMode, setBuzzerMode] = useState<'idle'|'single'|'double'|'alarm'>('idle');
  const buzzerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [deleteModal, setDeleteModal] = useState(false);
  const [deleting, setDeleting]       = useState(false);

  const performer = userData?.name || 'User';
  const isOnline  = liveStatus === 'online';
  const isOffline = false; // controls always enabled — RTDB queues commands for ESP32

  // ── Load device meta ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!id) return;
    getDevice(id).then(dev => {
      setDevice(dev);
      setLoading(false);
    });
  }, [id]);

  // ── Subscribe realtime ────────────────────────────────────────────────────
  useEffect(() => {
    if (!device) return;
    const did = device.deviceId;
    const u1 = subscribeToOutputs(did, setOutputs);
    const u2 = subscribeToHealth(did, setHealth);
    const u3 = subscribeToAnalytics(did, setAnalytics);
    const u4 = subscribeToDeviceStatus(did, setLiveStatus);
    return () => { u1(); u2(); u3(); u4(); };
  }, [device]);

  // ── Cleanup buzzer timer ──────────────────────────────────────────────────
  useEffect(() => () => { if (buzzerTimer.current) clearTimeout(buzzerTimer.current); }, []);

  // ── Toggle output ─────────────────────────────────────────────────────────
  const toggle = useCallback(
    async (key: keyof DeviceOutputs, value: boolean, label: string) => {
      if (!device) return;
      await setOutput(device.deviceId, key, value, performer, label);
    },
    [device, performer]
  );

  // ── OLED ──────────────────────────────────────────────────────────────────
  async function handleSendOled() {
    if (!device || !oledDraft.trim()) return;
    setSendingOled(true);
    await setOutput(device.deviceId, 'oledMessage', oledDraft.trim(), performer, `OLED: "${oledDraft.trim()}"`);
    setSendingOled(false);
  }

  async function handleClearOled() {
    if (!device) return;
    await setOutput(device.deviceId, 'oledMessage', '', performer, 'OLED cleared');
    setOledDraft('');
  }

  // ── Buzzer ────────────────────────────────────────────────────────────────
  async function triggerBuzzer(mode: 'single' | 'double' | 'alarm') {
    if (!device || buzzerMode !== 'idle') return;
    setBuzzerMode(mode);
    await setOutput(device.deviceId, 'buzzer', true, performer, `Buzzer: ${mode}`);
    const ms = mode === 'single' ? 600 : mode === 'double' ? 1200 : 3500;
    buzzerTimer.current = setTimeout(async () => {
      await setOutput(device.deviceId, 'buzzer', false, performer);
      setBuzzerMode('idle');
    }, ms);
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!device) return;
    setDeleting(true);
    await deleteDevice(device.id, device.deviceId, userData?.uid || '');
    navigate('/devices');
  }

  // ─────────────────────────────────────────────────────────────────────────

  if (loading) return <Loader fullPage />;
  if (!device) return (
    <div className="text-center py-24">
      <Cpu size={40} className="text-neutral-300 mx-auto mb-3" />
      <p className="text-neutral-500 font-medium">Device not found</p>
      <Link to="/devices" className="text-primary-600 text-sm mt-2 block hover:underline">
        ← Back to Devices
      </Link>
    </div>
  );

  const o  = outputs;
  const h  = health;
  const an = analytics;
  const maxRuntime = Math.max(
    an?.light1Runtime || 0, an?.light2Runtime || 0, an?.light3Runtime || 0,
    an?.fan1Runtime   || 0, an?.fan2Runtime   || 0, an?.customRuntime  || 0, 0.1
  );
  const totalRuntime = (
    (an?.light1Runtime || 0) + (an?.light2Runtime || 0) + (an?.light3Runtime || 0) +
    (an?.fan1Runtime   || 0) + (an?.fan2Runtime   || 0) + (an?.customRuntime  || 0)
  );

  return (
    <div className="space-y-6 max-w-7xl">

      {/* ── Breadcrumb ── */}
      <div className="flex items-center gap-1.5 text-sm">
        <Link to="/devices" className="text-neutral-400 hover:text-neutral-700 transition-colors">
          Devices
        </Link>
        <ChevronRight size={14} className="text-neutral-300" />
        <span className="text-neutral-900 font-medium">{device.name}</span>
      </div>

      {/* ── Header card ── */}
      <div className="bg-white border border-neutral-100 rounded-2xl p-5 flex items-start justify-between flex-wrap gap-4 shadow-sm">
        <div className="flex items-start gap-4">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-sm
            ${isOnline ? 'bg-primary-600' : 'bg-neutral-400'}`}>
            <Cpu size={26} className="text-white" />
          </div>
          <div>
            <div className="flex items-center gap-3 flex-wrap mb-1">
              <h2 className="text-xl font-bold text-neutral-900">{device.name}</h2>
              <OnlinePill online={isOnline} />
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-400">
              <span className="flex items-center gap-1 font-mono font-semibold text-neutral-600">
                <Cpu size={11} />{device.deviceId}
              </span>
              <span className="flex items-center gap-1">
                <Bolt size={11} />Firmware {device.firmware || 'v1.2.4'}
              </span>
              <span className="flex items-center gap-1">
                <Clock size={11} />Last seen {health?.lastSeen ? timeAgo(health.lastSeen) : '–'}
              </span>
              <span className="flex items-center gap-1">
                <MapPin size={11} />{device.room} · {device.location}
              </span>
              <span className="flex items-center gap-1">
                <Cpu size={11} />ESP32 · Controller
              </span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm">
            <Edit2 size={14} /> Edit
          </Button>
          <Button variant="danger" size="sm" onClick={() => setDeleteModal(true)}>
            <Trash size={14} /> Remove
          </Button>
        </div>
      </div>

      {/* ── Main 3-col grid ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">

        {/* ═══ LIGHTS ═══ */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-yellow-50 rounded-xl flex items-center justify-center">
                <Lightbulb size={16} className="text-yellow-500" />
              </div>
              <h3 className="text-sm font-bold text-neutral-900">Lights</h3>
            </div>
            <span className="text-xs font-medium text-neutral-400 bg-neutral-50 px-2.5 py-1 rounded-full">
              {[o?.light1, o?.light2, o?.light3].filter(Boolean).length} / 3 on
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3">
            {([
              { key: 'light1' as const, label: 'Light 1', runtime: an?.light1Runtime },
              { key: 'light2' as const, label: 'Light 2', runtime: an?.light2Runtime },
              { key: 'light3' as const, label: 'Light 3', runtime: an?.light3Runtime },
            ]).map(item => (
              <ControlCard
                key={item.key}
                icon={<Lightbulb size={18} />}
                iconActiveBg="bg-yellow-100"
                iconInactiveBg="bg-yellow-50"
                iconActiveColor="text-yellow-600"
                iconInactiveColor="text-yellow-400"
                label={item.label}
                runtime={item.runtime}
                checked={o?.[item.key] || false}
                onChange={v => toggle(item.key, v, `${item.label} turned ${v ? 'ON' : 'OFF'}`)}
                disabled={isOffline}
              />
            ))}
          </div>
        </Card>

        {/* ═══ FANS ═══ */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-50 rounded-xl flex items-center justify-center">
                <Wind size={16} className="text-blue-500" />
              </div>
              <h3 className="text-sm font-bold text-neutral-900">Fans</h3>
            </div>
            <span className="text-xs font-medium text-neutral-400 bg-neutral-50 px-2.5 py-1 rounded-full">
              {[o?.fan1, o?.fan2].filter(Boolean).length} / 2 on
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3 mb-4">
            {([
              { key: 'fan1' as const, label: 'Fan 1', runtime: an?.fan1Runtime },
              { key: 'fan2' as const, label: 'Fan 2', runtime: an?.fan2Runtime },
            ]).map(item => (
              <ControlCard
                key={item.key}
                icon={<Wind size={18} />}
                iconActiveBg="bg-blue-100"
                iconInactiveBg="bg-blue-50"
                iconActiveColor="text-blue-600"
                iconInactiveColor="text-blue-400"
                label={item.label}
                runtime={item.runtime}
                checked={o?.[item.key] || false}
                onChange={v => toggle(item.key, v, `${item.label} turned ${v ? 'ON' : 'OFF'}`)}
                disabled={isOffline}
              />
            ))}
          </div>

          {/* Custom Device inside same column */}
          <div className="pt-4 border-t border-neutral-100">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 bg-purple-50 rounded-xl flex items-center justify-center">
                <Bolt size={16} className="text-purple-500" />
              </div>
              <h3 className="text-sm font-bold text-neutral-900">Custom Device</h3>
            </div>
            <ControlCard
              icon={<Bolt size={18} />}
              iconActiveBg="bg-purple-100"
              iconInactiveBg="bg-purple-50"
              iconActiveColor="text-purple-600"
              iconInactiveColor="text-purple-400"
              label="Custom Device"
              runtime={an?.customRuntime}
              checked={o?.custom1 || false}
              onChange={v => toggle('custom1', v, `Custom Device turned ${v ? 'ON' : 'OFF'}`)}
              disabled={isOffline}
            />
          </div>
        </Card>

        {/* ═══ DEVICE HEALTH ═══ */}
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-green-50 rounded-xl flex items-center justify-center">
              <Activity size={16} className="text-green-500" />
            </div>
            <h3 className="text-sm font-bold text-neutral-900">Device Health</h3>
            <span
              className={`ml-auto w-2.5 h-2.5 rounded-full ${
                isOnline ? 'bg-success-500 animate-pulse' : 'bg-neutral-300'
              }`}
            />
          </div>
          <div className="space-y-0">
            <HealthRow
              icon={<Wifi size={13} />}
              label="WiFi Status"
              ok={h?.wifiStatus === 'connected'}
              value={
                <span className={h?.wifiStatus === 'connected' ? 'text-success-600' : 'text-error-500'}>
                  {h?.wifiStatus === 'connected' ? 'Connected' : 'Disconnected'}
                </span>
              }
            />
            <HealthRow
              icon={<Server size={13} />}
              label="Firebase"
              ok={h?.firebaseStatus === 'connected'}
              value={
                <span className={h?.firebaseStatus === 'connected' ? 'text-success-600' : 'text-error-500'}>
                  {h?.firebaseStatus === 'connected' ? 'Connected' : 'Disconnected'}
                </span>
              }
            />
            <HealthRow
              icon={<Signal size={13} />}
              label="RSSI"
              value={
                h?.rssi ? (
                  <span>
                    {h.rssi} dBm{' '}
                    <span className={`${rssiLabel(h.rssi).color} font-normal`}>
                      ({rssiLabel(h.rssi).text})
                    </span>
                  </span>
                ) : '–'
              }
            />
            <HealthRow
              icon={<MemoryStick size={13} />}
              label="Free Heap"
              value={fmtHeap(h?.heap || 0)}
            />
            <HealthRow
              icon={<Clock size={13} />}
              label="Device Uptime"
              value={fmtUptime(h?.uptime || 0)}
            />
            <HealthRow
              icon={<Wifi size={13} />}
              label="WiFi Uptime"
              value={fmtUptime(h?.wifiUptime || 0)}
            />
            <HealthRow
              icon={<RotateCcw size={13} />}
              label="Restart Count"
              value={h?.restartCount ?? '–'}
            />
          </div>
        </Card>

        {/* ═══ ANALYTICS (spans 2 cols on xl) ═══ */}
        <div className="md:col-span-2 xl:col-span-2">
          <Card>
            <div className="flex items-center gap-2 mb-5">
              <div className="w-8 h-8 bg-primary-50 rounded-xl flex items-center justify-center">
                <BarChart3 size={16} className="text-primary-600" />
              </div>
              <h3 className="text-sm font-bold text-neutral-900">Runtime Analytics</h3>
              <span className="ml-auto text-xs text-neutral-400">Cumulative</span>
            </div>

            {/* Summary stat cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              {[
                {
                  label: 'Total Runtime',
                  value: fmtRuntime(totalRuntime),
                  icon: <Clock size={14} className="text-primary-500" />,
                  bg: 'bg-primary-50',
                },
                {
                  label: 'Energy Used',
                  value: `${(an?.energyUsage || 0).toFixed(3)} kWh`,
                  icon: <Zap size={14} className="text-yellow-500" />,
                  bg: 'bg-yellow-50',
                },
                {
                  label: 'Lights Active',
                  value: `${[o?.light1, o?.light2, o?.light3].filter(Boolean).length} / 3`,
                  icon: <Lightbulb size={14} className="text-yellow-500" />,
                  bg: 'bg-yellow-50',
                },
                {
                  label: 'Fans Active',
                  value: `${[o?.fan1, o?.fan2].filter(Boolean).length} / 2`,
                  icon: <Wind size={14} className="text-blue-500" />,
                  bg: 'bg-blue-50',
                },
              ].map(item => (
                <div key={item.label} className="bg-neutral-50 rounded-xl p-3.5">
                  <div className={`w-7 h-7 ${item.bg} rounded-lg flex items-center justify-center mb-2.5`}>
                    {item.icon}
                  </div>
                  <p className="text-base font-bold text-neutral-900 leading-tight">{item.value}</p>
                  <p className="text-xs text-neutral-400 mt-0.5">{item.label}</p>
                </div>
              ))}
            </div>

            {/* Per-channel bars */}
            <div className="space-y-3.5">
              {[
                { label: 'Light 1',  value: an?.light1Runtime  || 0, color: 'bg-yellow-400', dot: 'bg-yellow-400' },
                { label: 'Light 2',  value: an?.light2Runtime  || 0, color: 'bg-yellow-400', dot: 'bg-yellow-400' },
                { label: 'Light 3',  value: an?.light3Runtime  || 0, color: 'bg-amber-400',  dot: 'bg-amber-400'  },
                { label: 'Fan 1',    value: an?.fan1Runtime    || 0, color: 'bg-blue-400',   dot: 'bg-blue-400'   },
                { label: 'Fan 2',    value: an?.fan2Runtime    || 0, color: 'bg-sky-400',    dot: 'bg-sky-400'    },
                { label: 'Custom',   value: an?.customRuntime  || 0, color: 'bg-purple-400', dot: 'bg-purple-400' },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${item.dot}`} />
                  <span className="text-xs text-neutral-500 w-14 flex-shrink-0">{item.label}</span>
                  <RuntimeBar value={item.value} max={maxRuntime} color={item.color} />
                  <span className="text-xs font-semibold text-neutral-700 w-16 text-right flex-shrink-0">
                    {fmtRuntime(item.value)}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* ═══ OLED ═══ */}
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-slate-100 rounded-xl flex items-center justify-center">
              <Monitor size={16} className="text-slate-600" />
            </div>
            <h3 className="text-sm font-bold text-neutral-900">OLED Display</h3>
          </div>

          {/* Screen preview */}
          <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 mb-4 min-h-[80px] flex items-center justify-center font-mono relative overflow-hidden">
            <div className="absolute inset-0 opacity-5"
              style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,.03) 2px, rgba(255,255,255,.03) 4px)' }}
            />
            {o?.oledMessage ? (
              <p className="text-green-400 text-sm text-center leading-relaxed z-10 break-all">
                {o.oledMessage}
              </p>
            ) : (
              <p className="text-neutral-700 text-xs z-10">— display empty —</p>
            )}
          </div>

          <div className="space-y-2.5">
            <textarea
              className="form-input text-sm resize-none font-mono"
              rows={2}
              placeholder="Type a message..."
              value={oledDraft}
              onChange={e => setOledDraft(e.target.value.slice(0, 64))}
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-neutral-400">{oledDraft.length} / 64 chars</span>
            </div>
            <div className="flex gap-2">
              <Button
                className="flex-1"
                size="sm"
                onClick={handleSendOled}
                loading={sendingOled}
                disabled={!oledDraft.trim() || isOffline}
              >
                Send to Display
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={handleClearOled}
                disabled={!o?.oledMessage || isOffline}
              >
                Clear
              </Button>
            </div>
          </div>
        </Card>

        {/* ═══ BUZZER ═══ */}
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-orange-50 rounded-xl flex items-center justify-center">
              <Volume2 size={16} className="text-orange-500" />
            </div>
            <h3 className="text-sm font-bold text-neutral-900">Buzzer</h3>
            {o?.buzzer && (
              <span className="ml-auto inline-flex items-center gap-1.5 text-xs font-semibold text-orange-600 bg-orange-50 border border-orange-200 px-2.5 py-1 rounded-full animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                Sounding
              </span>
            )}
          </div>

          <div className="space-y-2.5">
            {([
              { mode: 'single' as const,  label: 'Test Beep',    desc: 'Single short beep',   duration: '0.6s', hoverCls: 'hover:bg-orange-50 hover:border-orange-200 hover:text-orange-700' },
              { mode: 'double' as const,  label: 'Double Beep',  desc: 'Two consecutive beeps', duration: '1.2s', hoverCls: 'hover:bg-orange-50 hover:border-orange-200 hover:text-orange-700' },
              { mode: 'alarm'  as const,  label: 'Alarm Test',   desc: 'Long alarm sound',    duration: '3.5s', hoverCls: 'hover:bg-red-50 hover:border-red-200 hover:text-red-600'    },
            ]).map(item => (
              <button
                key={item.mode}
                onClick={() => triggerBuzzer(item.mode)}
                disabled={buzzerMode !== 'idle' || isOffline}
                className={`w-full flex items-center justify-between px-4 py-3.5 bg-neutral-50 border border-neutral-100 rounded-xl text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed ${item.hoverCls} ${buzzerMode === item.mode ? 'ring-2 ring-orange-300 bg-orange-50' : ''}`}
              >
                <div className="text-left">
                  <p className="font-semibold text-neutral-800">{item.label}</p>
                  <p className="text-xs text-neutral-400 mt-0.5">{item.desc}</p>
                </div>
                <span className="text-xs text-neutral-400 bg-white border border-neutral-100 px-2 py-1 rounded-lg">
                  {item.duration}
                </span>
              </button>
            ))}
          </div>
        </Card>

        {/* ═══ CONTROLLER INFO ═══ */}
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-neutral-100 rounded-xl flex items-center justify-center">
              <Cpu size={16} className="text-neutral-500" />
            </div>
            <h3 className="text-sm font-bold text-neutral-900">Controller Info</h3>
          </div>
          <div className="space-y-0">
            {[
              { label: 'Device ID',   value: device.deviceId, mono: true },
              { label: 'Room',        value: device.room },
              { label: 'Location',    value: device.location },
              { label: 'Firmware',    value: device.firmware || 'v1.2.4' },
              { label: 'Controller',  value: 'ESP32' },
              { label: 'Channels',    value: '3 Lights · 2 Fans · 1 Custom' },
              {
                label: 'Added On',
                value: device.createdAt
                  ? new Date((device.createdAt as { seconds: number }).seconds * 1000)
                      .toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
                  : '–',
              },
            ].map(item => (
              <div
                key={item.label}
                className="flex items-center justify-between py-2.5 border-b border-neutral-50 last:border-0"
              >
                <span className="text-xs text-neutral-400">{item.label}</span>
                <span
                  className={`text-xs font-semibold text-neutral-900 max-w-[60%] text-right ${
                    item.mono ? 'font-mono' : ''
                  }`}
                >
                  {item.value}
                </span>
              </div>
            ))}
          </div>
          <button
            onClick={() => setDeleteModal(true)}
            className="mt-4 w-full flex items-center gap-2 px-3 py-2.5 text-xs font-medium text-error-500 hover:bg-error-50 rounded-xl transition-colors"
          >
            <Trash size={13} /> Remove This Device
          </button>
        </Card>

      </div>

      {/* ── Delete Modal ── */}
      <Modal open={deleteModal} onClose={() => setDeleteModal(false)} title="Remove Device">
        <p className="text-sm text-neutral-600 mb-6">
          Remove <strong>{device.name}</strong>? All device data will be permanently deleted.
        </p>
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" onClick={() => setDeleteModal(false)}>Cancel</Button>
          <Button variant="danger" loading={deleting} onClick={handleDelete}>
            Remove Device
          </Button>
        </div>
      </Modal>
    </div>
  );
}
