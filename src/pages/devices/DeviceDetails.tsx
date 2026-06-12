import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ChevronRight, Lightbulb, Wind, Monitor, Volume2,
  Wifi, Clock, Cpu, Activity, Edit2, MapPin, Trash,
  Zap, MemoryStick, RotateCcw, Signal, Server,
  CheckCircle2, XCircle, BarChart3, Bolt,
} from 'lucide-react';
import {
  getDevice, subscribeToDeviceState, subscribeToDeviceAnalytics,
  updateDeviceState, deleteDevice,
  Device, DeviceState, DeviceAnalytics,
} from '../../services/deviceService';
import { useAuth } from '../../context/AuthContext';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Loader from '../../components/ui/Loader';
import Modal from '../../components/ui/Modal';

// ─── Toggle ───────────────────────────────────────────────────────────────────
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
    <label className={`toggle-switch ${disabled ? 'opacity-40 pointer-events-none' : 'cursor-pointer'}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        disabled={disabled}
      />
      <div className="toggle-track">
        <div className="toggle-thumb" />
      </div>
    </label>
  );
}

// ─── Status Pill ──────────────────────────────────────────────────────────────
function StatusPill({ online }: { online: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full ${
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

// ─── Runtime bar ─────────────────────────────────────────────────────────────
function RuntimeBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="flex-1 h-1.5 bg-neutral-100 rounded-full overflow-hidden">
      <div
        className={`h-full ${color} rounded-full transition-all duration-700`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ─── Health indicator ────────────────────────────────────────────────────────
function HealthDot({ ok }: { ok: boolean }) {
  return ok ? (
    <CheckCircle2 size={14} className="text-success-500 flex-shrink-0" />
  ) : (
    <XCircle size={14} className="text-error-500 flex-shrink-0" />
  );
}

// ─── Format seconds to readable ──────────────────────────────────────────────
function fmtUptime(seconds: number): string {
  if (!seconds || seconds <= 0) return '–';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function fmtHeap(bytes: number): string {
  if (!bytes) return '–';
  return `${Math.round(bytes / 1024)} KB`;
}

function fmtRuntime(hours: number): string {
  if (!hours) return '0h 0m';
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}h ${m}m`;
}

function timeAgo(ts: unknown): string {
  if (!ts) return '–';
  const secs = (ts as { seconds: number })?.seconds;
  if (!secs) return '–';
  const diff = Math.floor(Date.now() / 1000) - secs;
  if (diff < 5) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ─── Control row ─────────────────────────────────────────────────────────────
function ControlRow({
  icon,
  iconBg,
  label,
  sublabel,
  checked,
  runtime,
  onChange,
  offline,
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  sublabel?: string;
  checked: boolean;
  runtime?: number;
  onChange: (v: boolean) => void;
  offline?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between py-3.5 px-4 rounded-xl border transition-all duration-200 ${
        checked
          ? 'bg-primary-50 border-primary-200'
          : 'bg-white border-neutral-100 hover:border-neutral-200'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 ${iconBg} rounded-xl flex items-center justify-center flex-shrink-0`}>
          {icon}
        </div>
        <div>
          <p className="text-sm font-medium text-neutral-900">{label}</p>
          <p className="text-xs text-neutral-400">
            {sublabel || (checked ? 'ON' : 'OFF')}
            {runtime !== undefined && runtime > 0 && (
              <span className="ml-1.5 text-primary-500">· {fmtRuntime(runtime)}</span>
            )}
          </p>
        </div>
      </div>
      <Toggle checked={checked} onChange={onChange} disabled={offline} />
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function DeviceDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { userData } = useAuth();

  const [device, setDevice] = useState<Device | null>(null);
  const [state, setState] = useState<DeviceState | null>(null);
  const [analytics, setAnalytics] = useState<DeviceAnalytics[]>([]);
  const [loading, setLoading] = useState(true);

  // OLED
  const [oledMsg, setOledMsg] = useState('');
  const [sendingOled, setSendingOled] = useState(false);

  // Buzzer
  const [buzzerMode, setBuzzerMode] = useState<'idle' | 'single' | 'double' | 'alarm'>('idle');

  // Delete modal
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Load device metadata
  useEffect(() => {
    if (!id) return;
    getDevice(id).then(dev => {
      setDevice(dev);
      setLoading(false);
    });
  }, [id]);

  // Real-time state subscription
  useEffect(() => {
    if (!device) return;
    const unsub = subscribeToDeviceState(device.deviceId, s => setState(s));
    return unsub;
  }, [device]);

  // Real-time analytics subscription (last 7 days)
  useEffect(() => {
    if (!device) return;
    const unsub = subscribeToDeviceAnalytics(device.deviceId, entries => setAnalytics(entries), 7);
    return unsub;
  }, [device]);

  const performer = userData?.name || 'User';
  const isOffline = device?.status === 'offline';

  // ── Toggle handler ────────────────────────────────────────────────────────
  const toggle = useCallback(
    async (key: keyof DeviceState, value: boolean, label: string) => {
      if (!device) return;
      await updateDeviceState(device.deviceId, { [key]: value } as Partial<DeviceState>, performer, label);
    },
    [device, performer]
  );

  // ── OLED ──────────────────────────────────────────────────────────────────
  async function handleSendOled() {
    if (!device || !oledMsg.trim()) return;
    setSendingOled(true);
    await updateDeviceState(
      device.deviceId,
      { oledMessage: oledMsg },
      performer,
      `OLED: "${oledMsg}"`
    );
    setSendingOled(false);
  }

  async function handleClearOled() {
    if (!device) return;
    await updateDeviceState(device.deviceId, { oledMessage: '' }, performer, 'OLED cleared');
    setOledMsg('');
  }

  // ── Buzzer ────────────────────────────────────────────────────────────────
  async function triggerBuzzer(mode: 'single' | 'double' | 'alarm') {
    if (!device) return;
    setBuzzerMode(mode);
    await updateDeviceState(device.deviceId, { buzzer: true }, performer, `Buzzer: ${mode} beep`);
    const duration = mode === 'single' ? 500 : mode === 'double' ? 1000 : 3000;
    setTimeout(async () => {
      await updateDeviceState(device.deviceId, { buzzer: false }, performer);
      setBuzzerMode('idle');
    }, duration);
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!device) return;
    setDeleting(true);
    await deleteDevice(device.id, device.deviceId, userData?.uid || '');
    navigate('/devices');
  }

  // ── Analytics aggregation ─────────────────────────────────────────────────
  const agg = analytics.reduce(
    (acc, e) => ({
      light1: acc.light1 + (e.light1Runtime || 0),
      light2: acc.light2 + (e.light2Runtime || 0),
      light3: acc.light3 + (e.light3Runtime || 0),
      fan1:   acc.fan1   + (e.fan1Runtime   || 0),
      fan2:   acc.fan2   + (e.fan2Runtime   || 0),
      custom1:acc.custom1+ (e.custom1Runtime|| 0),
      energy: acc.energy + (e.energyUsage   || 0),
      total:  acc.total  + (e.totalRuntime  || 0),
    }),
    { light1: 0, light2: 0, light3: 0, fan1: 0, fan2: 0, custom1: 0, energy: 0, total: 0 }
  );
  const maxRuntime = Math.max(agg.light1, agg.light2, agg.light3, agg.fan1, agg.fan2, agg.custom1, 0.1);

  if (loading) return <Loader fullPage />;
  if (!device) return (
    <div className="text-center py-20">
      <p className="text-neutral-500">Device not found.</p>
      <Link to="/devices" className="text-primary-600 text-sm mt-2 block">← Back to Devices</Link>
    </div>
  );

  const s = state;

  return (
    <div className="space-y-6 max-w-7xl">

      {/* ── Breadcrumb ── */}
      <div className="flex items-center gap-2 text-sm text-neutral-400">
        <Link to="/devices" className="hover:text-neutral-600 transition-colors">Devices</Link>
        <ChevronRight size={14} />
        <span className="text-neutral-900 font-medium">{device.name}</span>
      </div>

      {/* ── Header ── */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 bg-primary-600 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-sm">
            <Cpu size={26} className="text-white" />
          </div>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-2xl font-bold text-neutral-900">{device.name}</h2>
              <StatusPill online={device.status === 'online'} />
            </div>
            <div className="flex items-center gap-4 mt-1 text-xs text-neutral-400 flex-wrap">
              <span className="font-mono font-medium text-neutral-600">{device.deviceId}</span>
              <span>Firmware {device.firmware || 'v1.2.4'}</span>
              <span className="flex items-center gap-1">
                <Clock size={11} />
                Last seen {timeAgo(s?.updatedAt)}
              </span>
              <span className="flex items-center gap-1">
                <MapPin size={11} />
                {device.room} · {device.location}
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

      {/* ── 3-column grid ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">

        {/* ── LIGHTS ── */}
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-yellow-50 rounded-xl flex items-center justify-center">
              <Lightbulb size={16} className="text-yellow-500" />
            </div>
            <h3 className="text-sm font-semibold text-neutral-900">Lights</h3>
            <span className="ml-auto text-xs text-neutral-400">
              {[s?.light1, s?.light2, s?.light3].filter(Boolean).length} / 3 on
            </span>
          </div>
          <div className="space-y-2">
            <ControlRow
              icon={<Lightbulb size={16} className="text-yellow-500" />}
              iconBg="bg-yellow-50"
              label="Light 1"
              checked={s?.light1 || false}
              runtime={agg.light1}
              onChange={v => toggle('light1', v, `Light 1 turned ${v ? 'ON' : 'OFF'}`)}
              offline={isOffline}
            />
            <ControlRow
              icon={<Lightbulb size={16} className="text-yellow-500" />}
              iconBg="bg-yellow-50"
              label="Light 2"
              checked={s?.light2 || false}
              runtime={agg.light2}
              onChange={v => toggle('light2', v, `Light 2 turned ${v ? 'ON' : 'OFF'}`)}
              offline={isOffline}
            />
            <ControlRow
              icon={<Lightbulb size={16} className="text-yellow-500" />}
              iconBg="bg-yellow-50"
              label="Light 3"
              checked={s?.light3 || false}
              runtime={agg.light3}
              onChange={v => toggle('light3', v, `Light 3 turned ${v ? 'ON' : 'OFF'}`)}
              offline={isOffline}
            />
          </div>
        </Card>

        {/* ── FANS ── */}
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-blue-50 rounded-xl flex items-center justify-center">
              <Wind size={16} className="text-blue-500" />
            </div>
            <h3 className="text-sm font-semibold text-neutral-900">Fans</h3>
            <span className="ml-auto text-xs text-neutral-400">
              {[s?.fan1, s?.fan2].filter(Boolean).length} / 2 on
            </span>
          </div>
          <div className="space-y-2">
            <ControlRow
              icon={<Wind size={16} className="text-blue-500" />}
              iconBg="bg-blue-50"
              label="Fan 1"
              checked={s?.fan1 || false}
              runtime={agg.fan1}
              onChange={v => toggle('fan1', v, `Fan 1 turned ${v ? 'ON' : 'OFF'}`)}
              offline={isOffline}
            />
            <ControlRow
              icon={<Wind size={16} className="text-blue-500" />}
              iconBg="bg-blue-50"
              label="Fan 2"
              checked={s?.fan2 || false}
              runtime={agg.fan2}
              onChange={v => toggle('fan2', v, `Fan 2 turned ${v ? 'ON' : 'OFF'}`)}
              offline={isOffline}
            />
          </div>

          {/* ── CUSTOM DEVICE (inside fans card on md, own card on xl) ── */}
          <div className="mt-4 pt-4 border-t border-neutral-100">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 bg-purple-50 rounded-xl flex items-center justify-center">
                <Bolt size={16} className="text-purple-500" />
              </div>
              <h3 className="text-sm font-semibold text-neutral-900">Custom Device</h3>
            </div>
            <ControlRow
              icon={<Bolt size={16} className="text-purple-500" />}
              iconBg="bg-purple-50"
              label="Custom Device 1"
              checked={s?.custom1 || false}
              runtime={agg.custom1}
              onChange={v => toggle('custom1', v, `Custom Device 1 turned ${v ? 'ON' : 'OFF'}`)}
              offline={isOffline}
            />
          </div>
        </Card>

        {/* ── DEVICE HEALTH ── */}
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-green-50 rounded-xl flex items-center justify-center">
              <Activity size={16} className="text-green-500" />
            </div>
            <h3 className="text-sm font-semibold text-neutral-900">Device Health</h3>
            <span className={`ml-auto w-2 h-2 rounded-full ${device.status === 'online' ? 'bg-success-500 animate-pulse' : 'bg-neutral-300'}`} />
          </div>
          <div className="space-y-3">
            {/* WiFi */}
            <div className="flex items-center justify-between py-2 border-b border-neutral-50">
              <div className="flex items-center gap-2">
                <Wifi size={14} className="text-neutral-400" />
                <span className="text-xs text-neutral-600">WiFi Status</span>
              </div>
              <div className="flex items-center gap-1.5">
                <HealthDot ok={s?.wifiStatus === 'connected'} />
                <span className={`text-xs font-medium capitalize ${s?.wifiStatus === 'connected' ? 'text-success-600' : 'text-error-500'}`}>
                  {s?.wifiStatus || 'Unknown'}
                </span>
              </div>
            </div>
            {/* Firebase */}
            <div className="flex items-center justify-between py-2 border-b border-neutral-50">
              <div className="flex items-center gap-2">
                <Server size={14} className="text-neutral-400" />
                <span className="text-xs text-neutral-600">Firebase</span>
              </div>
              <div className="flex items-center gap-1.5">
                <HealthDot ok={s?.firebaseStatus === 'connected'} />
                <span className={`text-xs font-medium capitalize ${s?.firebaseStatus === 'connected' ? 'text-success-600' : 'text-error-500'}`}>
                  {s?.firebaseStatus || 'Unknown'}
                </span>
              </div>
            </div>
            {/* RSSI */}
            <div className="flex items-center justify-between py-2 border-b border-neutral-50">
              <div className="flex items-center gap-2">
                <Signal size={14} className="text-neutral-400" />
                <span className="text-xs text-neutral-600">RSSI</span>
              </div>
              <span className="text-xs font-semibold text-neutral-900">
                {s?.rssi ? `${s.rssi} dBm` : '–'}
              </span>
            </div>
            {/* Heap */}
            <div className="flex items-center justify-between py-2 border-b border-neutral-50">
              <div className="flex items-center gap-2">
                <MemoryStick size={14} className="text-neutral-400" />
                <span className="text-xs text-neutral-600">Free Heap</span>
              </div>
              <span className="text-xs font-semibold text-neutral-900">{fmtHeap(s?.freeHeap || 0)}</span>
            </div>
            {/* Device Uptime */}
            <div className="flex items-center justify-between py-2 border-b border-neutral-50">
              <div className="flex items-center gap-2">
                <Clock size={14} className="text-neutral-400" />
                <span className="text-xs text-neutral-600">Device Uptime</span>
              </div>
              <span className="text-xs font-semibold text-neutral-900">{fmtUptime(s?.deviceUptime || 0)}</span>
            </div>
            {/* WiFi Uptime */}
            <div className="flex items-center justify-between py-2 border-b border-neutral-50">
              <div className="flex items-center gap-2">
                <Wifi size={14} className="text-neutral-400" />
                <span className="text-xs text-neutral-600">WiFi Uptime</span>
              </div>
              <span className="text-xs font-semibold text-neutral-900">{fmtUptime(s?.wifiUptime || 0)}</span>
            </div>
            {/* Restart Count */}
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-2">
                <RotateCcw size={14} className="text-neutral-400" />
                <span className="text-xs text-neutral-600">Restarts</span>
              </div>
              <span className="text-xs font-semibold text-neutral-900">{s?.restartCount ?? '–'}</span>
            </div>
          </div>
        </Card>

        {/* ── ANALYTICS ── */}
        <Card className="md:col-span-2 xl:col-span-2">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-8 h-8 bg-primary-50 rounded-xl flex items-center justify-center">
              <BarChart3 size={16} className="text-primary-600" />
            </div>
            <h3 className="text-sm font-semibold text-neutral-900">Runtime Analytics</h3>
            <span className="ml-auto text-xs text-neutral-400">Last 7 days</span>
          </div>

          {/* Top stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            {[
              { label: 'Total Runtime', value: fmtRuntime(agg.total), icon: <Clock size={14} className="text-primary-500" />, bg: 'bg-primary-50' },
              { label: 'Energy Used', value: `${agg.energy.toFixed(3)} kWh`, icon: <Zap size={14} className="text-yellow-500" />, bg: 'bg-yellow-50' },
              { label: 'Lights On', value: [s?.light1, s?.light2, s?.light3].filter(Boolean).length.toString(), icon: <Lightbulb size={14} className="text-yellow-500" />, bg: 'bg-yellow-50' },
              { label: 'Fans On', value: [s?.fan1, s?.fan2].filter(Boolean).length.toString(), icon: <Wind size={14} className="text-blue-500" />, bg: 'bg-blue-50' },
            ].map(item => (
              <div key={item.label} className="bg-neutral-50 rounded-xl p-3">
                <div className={`w-7 h-7 ${item.bg} rounded-lg flex items-center justify-center mb-2`}>
                  {item.icon}
                </div>
                <p className="text-base font-bold text-neutral-900">{item.value}</p>
                <p className="text-xs text-neutral-400 mt-0.5">{item.label}</p>
              </div>
            ))}
          </div>

          {/* Per-channel runtime bars */}
          <div className="space-y-3">
            {[
              { label: 'Light 1', value: agg.light1, color: 'bg-yellow-400', icon: '💡' },
              { label: 'Light 2', value: agg.light2, color: 'bg-yellow-400', icon: '💡' },
              { label: 'Light 3', value: agg.light3, color: 'bg-yellow-400', icon: '💡' },
              { label: 'Fan 1',   value: agg.fan1,   color: 'bg-blue-400',   icon: '🌀' },
              { label: 'Fan 2',   value: agg.fan2,   color: 'bg-blue-400',   icon: '🌀' },
              { label: 'Custom 1',value: agg.custom1,color: 'bg-purple-400', icon: '⚡' },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-3">
                <span className="text-sm w-5">{item.icon}</span>
                <span className="text-xs text-neutral-600 w-16">{item.label}</span>
                <RuntimeBar value={item.value} max={maxRuntime} color={item.color} />
                <span className="text-xs font-medium text-neutral-700 w-16 text-right">
                  {fmtRuntime(item.value)}
                </span>
              </div>
            ))}
          </div>
        </Card>

        {/* ── OLED DISPLAY ── */}
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-purple-50 rounded-xl flex items-center justify-center">
              <Monitor size={16} className="text-purple-500" />
            </div>
            <h3 className="text-sm font-semibold text-neutral-900">OLED Display</h3>
          </div>

          {/* Preview */}
          <div className="bg-neutral-900 rounded-xl p-4 mb-4 min-h-[72px] flex items-center justify-center font-mono text-center">
            {s?.oledMessage ? (
              <p className="text-green-400 text-sm leading-snug break-words">{s.oledMessage}</p>
            ) : (
              <p className="text-neutral-600 text-xs">No message</p>
            )}
          </div>

          <div className="space-y-2">
            <textarea
              className="form-input text-sm resize-none"
              rows={2}
              placeholder="Type a message to display..."
              value={oledMsg}
              onChange={e => setOledMsg(e.target.value.slice(0, 64))}
            />
            <p className="text-xs text-neutral-400 text-right">{oledMsg.length}/64</p>
            <div className="flex gap-2">
              <Button
                className="flex-1"
                size="sm"
                onClick={handleSendOled}
                loading={sendingOled}
                disabled={!oledMsg.trim() || isOffline}
              >
                Send
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={handleClearOled}
                disabled={!s?.oledMessage || isOffline}
              >
                Clear
              </Button>
            </div>
          </div>
        </Card>

        {/* ── BUZZER ── */}
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-orange-50 rounded-xl flex items-center justify-center">
              <Volume2 size={16} className="text-orange-500" />
            </div>
            <h3 className="text-sm font-semibold text-neutral-900">Buzzer</h3>
            {s?.buzzer && (
              <span className="ml-auto flex items-center gap-1 text-xs font-medium text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                Active
              </span>
            )}
          </div>

          <div className="space-y-2">
            <button
              onClick={() => triggerBuzzer('single')}
              disabled={buzzerMode !== 'idle' || isOffline}
              className="w-full flex items-center justify-between px-4 py-3 bg-neutral-50 hover:bg-orange-50 border border-neutral-100 hover:border-orange-200 rounded-xl text-sm font-medium text-neutral-700 hover:text-orange-700 transition-all disabled:opacity-40"
            >
              <span>Test Beep</span>
              <span className="text-xs text-neutral-400">0.5s</span>
            </button>
            <button
              onClick={() => triggerBuzzer('double')}
              disabled={buzzerMode !== 'idle' || isOffline}
              className="w-full flex items-center justify-between px-4 py-3 bg-neutral-50 hover:bg-orange-50 border border-neutral-100 hover:border-orange-200 rounded-xl text-sm font-medium text-neutral-700 hover:text-orange-700 transition-all disabled:opacity-40"
            >
              <span>Double Beep</span>
              <span className="text-xs text-neutral-400">1s</span>
            </button>
            <button
              onClick={() => triggerBuzzer('alarm')}
              disabled={buzzerMode !== 'idle' || isOffline}
              className="w-full flex items-center justify-between px-4 py-3 bg-neutral-50 hover:bg-red-50 border border-neutral-100 hover:border-red-200 rounded-xl text-sm font-medium text-neutral-700 hover:text-red-600 transition-all disabled:opacity-40"
            >
              <span>Alarm Beep</span>
              <span className="text-xs text-neutral-400">3s</span>
            </button>
          </div>
        </Card>

        {/* ── DEVICE INFO ── */}
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-neutral-100 rounded-xl flex items-center justify-center">
              <Cpu size={16} className="text-neutral-500" />
            </div>
            <h3 className="text-sm font-semibold text-neutral-900">Controller Info</h3>
          </div>
          <div className="space-y-3 text-sm">
            {[
              { label: 'Device ID',       value: device.deviceId,  mono: true },
              { label: 'Room',            value: device.room },
              { label: 'Location',        value: device.location },
              { label: 'Firmware',        value: device.firmware || 'v1.2.4' },
              { label: 'Controller',      value: 'ESP32' },
              {
                label: 'Added On',
                value: device.createdAt
                  ? new Date((device.createdAt as { seconds: number }).seconds * 1000)
                      .toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
                  : '–',
              },
            ].map(item => (
              <div key={item.label} className="flex items-center justify-between py-2 border-b border-neutral-50 last:border-0">
                <span className="text-xs text-neutral-400">{item.label}</span>
                <span className={`text-xs font-semibold text-neutral-900 ${item.mono ? 'font-mono' : ''}`}>
                  {item.value}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-3 border-t border-neutral-100">
            <button
              onClick={() => setDeleteModal(true)}
              className="flex items-center gap-2 w-full px-3 py-2.5 text-xs text-error-500 hover:bg-error-50 rounded-lg transition-colors"
            >
              <Trash size={13} /> Remove Device
            </button>
          </div>
        </Card>

      </div>{/* end grid */}

      {/* ── Delete Modal ── */}
      <Modal open={deleteModal} onClose={() => setDeleteModal(false)} title="Remove Device">
        <p className="text-sm text-neutral-600 mb-5">
          Remove <strong>{device.name}</strong>? This will delete all device data and cannot be undone.
        </p>
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" onClick={() => setDeleteModal(false)}>Cancel</Button>
          <Button variant="danger" loading={deleting} onClick={handleDelete}>Remove</Button>
        </div>
      </Modal>
    </div>
  );
}
