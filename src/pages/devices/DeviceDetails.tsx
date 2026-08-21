import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ChevronRight, Lightbulb, Wind, Monitor, Volume2,
  Wifi, Clock, Cpu, Activity, MapPin, Trash,
  Zap, MemoryStick, RotateCcw, Signal, Server,
  CheckCircle2, XCircle, BarChart3, Bolt, Edit2, Plus, X,
} from 'lucide-react';
import {
  getDevice,
  subscribeToOutputs,
  subscribeToHealth,
  subscribeToAnalytics,
  subscribeToOnAt,
  subscribeToOutputMetadata,
  updateOutputMetadata,
  updateOutputVisibility,
  removeOutput,
  getOutputMetadata,
  resetAnalytics,
  setOutput,
  setOutputValue,
  deleteDevice,
  updateDevice,
  Device,
  DeviceOutputs,
  DeviceHealth,
  DeviceAnalyticsData,
  DeviceOutputMetadata,
  updateDeviceState,
} from '../../services/deviceService';
import { ensureTodayWindow } from '../../services/analyticsService';
import { useAuth } from '../../context/AuthContext';
import { useDeviceStatus } from '../../hooks/useDeviceStatus';
import Button from '../../components/ui/Button';
import Loader from '../../components/ui/Loader';
import Modal from '../../components/ui/Modal';
import EditableOutputLabel from '../../components/ui/EditableLabel';
import { getIconById } from '../../components/ui/IconPicker';

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
  if (!h || h <= 0) return '0s';
  const totalSec = Math.round(h * 3600);
  if (totalSec < 60) return `${totalSec}s`;
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  const ss = Math.round(((h - hh) * 60 - mm) * 60);
  if (hh === 0) return ss > 0 ? `${mm}m ${ss}s` : `${mm}m`;
  return mm > 0 ? `${hh}h ${mm}m` : `${hh}h`;
}


function rssiLabel(rssi: number): { text: string; color: string } {
  if (rssi >= -50) return { text: 'Excellent', color: '#16a34a' };
  if (rssi >= -60) return { text: 'Good',      color: '#16a34a' };
  if (rssi >= -70) return { text: 'Fair',      color: '#d97706' };
  return               { text: 'Weak',      color: '#ef4444' };
}

// ─── iOS Toggle ───────────────────────────────────────────────────────────────

function IOSToggle({
  checked,
  onChange,
  disabled,
  customColor,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  customColor?: string;
}) {
  return (
    <label className={`ios-toggle${disabled ? ' disabled' : ''}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        disabled={disabled}
      />
      <div 
        className="ios-track" 
        style={checked && customColor ? { 
          background: customColor,
          boxShadow: `inset 0 0 4px ${customColor}60`
        } : undefined}
      />
      <div className="ios-thumb" />
    </label>
  );
}

// ─── Online Pill ──────────────────────────────────────────────────────────────

function OnlinePill({ online }: { online: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold"
      style={{
        background: online ? 'rgba(22,163,74,0.1)' : 'rgba(156,163,175,0.15)',
        color: online ? '#16a34a' : '#6b7280',
      }}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${online ? 'animate-pulse' : ''}`}
        style={{ background: online ? '#22c55e' : '#9ca3af' }}
      />
      {online ? 'Online' : 'Offline'}
    </span>
  );
}

// ─── Health Row ───────────────────────────────────────────────────────────────

function HealthRow({
  icon, label, value, ok,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  ok?: boolean;
}) {
  return (
    <div
      className="flex items-center justify-between px-4 py-3 rounded-2xl mb-2 transition-colors duration-200"
      style={{
        background: 'var(--bg-secondary)',
        boxShadow: 'var(--neo-inset)',
      }}
    >
      <div className="flex items-center gap-2.5">
        <span style={{ color: 'var(--text-tertiary)' }}>{icon}</span>
        <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{label}</span>
      </div>
      <div className="flex items-center gap-1.5">
        {ok !== undefined && (
          ok
            ? <CheckCircle2 size={13} style={{ color: '#16a34a' }} />
            : <XCircle size={13} style={{ color: '#ef4444' }} />
        )}
        <span className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>{value}</span>
      </div>
    </div>
  );
}

// ─── Runtime Bar ──────────────────────────────────────────────────────────────

function RuntimeBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div
      className="flex-1 h-2.5 rounded-full overflow-hidden transition-colors duration-200"
      style={{
        background: 'var(--bg-tertiary)',
        boxShadow: 'var(--neo-inset)',
      }}
    >
      <div
        className="h-full rounded-full transition-all duration-700 ease-out"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  );
}

// ─── Neomorphic Slider ────────────────────────────────────────────────────────

function NeoSlider({
  value,
  onChange,
  disabled,
  accentColor,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  accentColor: string;
  label: string;
}) {
  const pct = Math.round(value);
  return (
    <div className={`mt-3 px-1 transition-opacity duration-200 ${disabled ? 'opacity-40 pointer-events-none' : ''}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-semibold" style={{ color: 'var(--text-tertiary)' }}>{label}</span>
        <span
          className="text-[11px] font-bold px-2 py-0.5 rounded-lg transition-colors duration-200"
          style={{
            background: disabled ? 'var(--bg-secondary)' : `${accentColor}18`,
            color: disabled ? 'var(--text-tertiary)' : accentColor,
          }}
        >
          {pct}%
        </span>
      </div>
      <div className="relative h-6 flex items-center">
        {/* Track background */}
        <div
          className="absolute w-full h-2 rounded-full transition-colors duration-200"
          style={{
            background: 'var(--bg-tertiary)',
            boxShadow: 'var(--neo-inset)',
          }}
        />
        {/* Fill */}
        <div
          className="absolute h-2 rounded-full transition-all duration-150"
          style={{
            width: `${pct}%`,
            background: disabled
              ? 'linear-gradient(90deg, #c8d0db, #d1d9e6)'
              : `linear-gradient(90deg, ${accentColor}99, ${accentColor})`,
          }}
        />
        {/* Native input overlaid — invisible but interactive */}
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={value}
          disabled={disabled}
          onChange={e => onChange(Number(e.target.value))}
          className="neo-slider-input"
          style={{ '--accent': accentColor } as React.CSSProperties}
        />
      </div>
    </div>
  );
}

// ─── Compact Device Item ─────────────────────────────────────────────────────

function CompactDeviceItem({
  icon, customColor, label, runtime, checked, onChange, disabled,
  onMetadataChange, outputId, iconId, onRemove,
}: {
  icon: React.ReactNode;
  customColor: string;
  label: string;
  runtime?: number;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  onMetadataChange?: (name: string, icon: string, color: string) => Promise<void>;
  outputId?: string;
  iconId?: string;
  onRemove?: () => void;
}) {
  // Map outputId to hardware slot number (permanent mapping)
  const getHardwareSlot = (id?: string): string => {
    const slotMap: Record<string, string> = {
      'light1': 'X1',
      'light2': 'X2',
      'light3': 'X3',
      'fan1': 'X4',
      'fan2': 'X5',
      'custom1': 'X6'
    };
    return id ? (slotMap[id] || '') : '';
  };

  const hardwareSlot = getHardwareSlot(outputId);

  return (
    <div
      className="rounded-2xl p-4 transition-all duration-300 relative"
      style={
        checked
          ? {
              background: `linear-gradient(135deg, ${customColor}08 0%, var(--bg-primary) 100%)`,
              boxShadow: `0 0 20px ${customColor}25, 4px 4px 12px rgba(0,0,0,0.2)`,
              border: `1.5px solid ${customColor}30`,
            }
          : {
              background: 'var(--bg-primary)',
              boxShadow: 'var(--neo-shadow)',
              border: '1.5px solid var(--border-color)',
            }
      }
    >
      {/* Remove button */}
      {onRemove && (
        <button
          onClick={onRemove}
          disabled={disabled}
          className="absolute top-2 right-2 w-7 h-7 sm:w-6 sm:h-6 rounded-lg flex items-center justify-center transition-all duration-200 z-10 touch-manipulation"
          style={{
            background: 'var(--bg-secondary)',
            boxShadow: 'var(--neo-shadow)',
            border: '1px solid var(--border-color)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--bg-secondary)';
          }}
          title="Remove output"
        >
          <X size={12} style={{ color: 'var(--text-secondary)' }} />
        </button>
      )}
      
      <div className="flex items-start justify-between mb-3">
        {/* Icon */}
        <div
          className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 transition-all duration-300"
          style={
            checked
              ? { 
                  background: `${customColor}12`, 
                  boxShadow: `0 0 12px ${customColor}30, 2px 2px 8px rgba(0,0,0,0.15)` 
                }
              : {
                  background: 'var(--bg-secondary)',
                  boxShadow: 'var(--neo-shadow)',
                }
          }
        >
          <span style={{ color: checked ? customColor : 'var(--text-secondary)' }}>{icon}</span>
        </div>
        {/* Toggle - positioned with proper spacing from remove button */}
        <div style={{ marginTop: onRemove ? '32px' : '0' }}>
          <IOSToggle checked={checked} onChange={onChange} disabled={disabled} customColor={customColor} />
        </div>
      </div>
      <div className="flex items-center gap-2 mb-1">
        {onMetadataChange && outputId ? (
          <EditableOutputLabel
            name={label}
            icon={iconId || 'zap'}
            color={customColor}
            onSave={onMetadataChange}
            disabled={disabled}
            maxLength={40}
            className=""
          />
        ) : (
          <>
            <span style={{ color: customColor }}>{icon}</span>
            <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{label}</p>
          </>
        )}
      </div>
      <div className="flex items-center justify-between">
        <span
          className="text-xs font-semibold transition-colors duration-300"
          style={{ color: checked ? customColor : 'var(--text-tertiary)' }}
        >
          {checked ? '● ON' : '○ OFF'}
        </span>
        {runtime !== undefined && runtime > 0 && (
          <span className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>
            {fmtRuntime(runtime)}
          </span>
        )}
      </div>
      {/* Hardware slot label */}
      {hardwareSlot && (
        <div className="mt-2 pt-2" style={{ borderTop: '1px solid var(--border-color)' }}>
          <span className="text-[10px] font-medium tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
            {hardwareSlot}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Control Card (premium neomorphic device card) ────────────────────────────

function ControlCard({
  icon, accentColor, accentBg, accentGlow,
  label, runtime, checked, onChange, disabled,
  sliderValue, onSliderChange, sliderLabel,
  onMetadataChange, outputId, iconId, iconColor,
}: {
  icon: React.ReactNode;
  accentColor: string;
  accentBg: string;
  accentGlow: string;
  label: string;
  runtime?: number;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  sliderValue?: number;
  onSliderChange?: (v: number) => void;
  sliderLabel?: string;
  onMetadataChange?: (name: string, icon: string, color: string) => Promise<void>;
  outputId?: string;
  iconId?: string;
  iconColor?: string;
}) {
  // Use the custom color for the ON state
  const customColor = iconColor || accentColor;
  
  return (
    <div
      className="rounded-2xl p-4 transition-all duration-300"
      style={
        checked
          ? {
              background: `linear-gradient(135deg, ${customColor}08 0%, var(--bg-primary) 100%)`,
              boxShadow: `0 0 20px ${customColor}25, 4px 4px 12px rgba(0,0,0,0.2)`,
              border: `1.5px solid ${customColor}30`,
            }
          : {
              background: 'var(--bg-primary)',
              boxShadow: 'var(--neo-shadow)',
              border: '1.5px solid var(--border-color)',
            }
      }
    >
      <div className="flex items-start justify-between mb-3">
        {/* Icon */}
        <div
          className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 transition-all duration-300"
          style={
            checked
              ? { 
                  background: `${customColor}12`, 
                  boxShadow: `0 0 12px ${customColor}30, 2px 2px 8px rgba(0,0,0,0.15)` 
                }
              : {
                  background: 'var(--bg-secondary)',
                  boxShadow: 'var(--neo-shadow)',
                }
          }
        >
          <span style={{ color: checked ? customColor : 'var(--text-tertiary)' }}>{icon}</span>
        </div>
        {/* Toggle */}
        <IOSToggle checked={checked} onChange={onChange} disabled={disabled} customColor={customColor} />
      </div>
      <div className="flex items-center gap-2 mb-1">
        {onMetadataChange && outputId ? (
          <EditableOutputLabel
            name={label}
            icon={iconId || 'zap'}
            color={iconColor || accentColor}
            onSave={onMetadataChange}
            disabled={disabled}
            maxLength={40}
            className=""
          />
        ) : (
          <>
            <span style={{ color: iconColor || accentColor }}>{icon}</span>
            <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{label}</p>
          </>
        )}
      </div>
      <div className="flex items-center justify-between">
        <span
          className="text-xs font-semibold transition-colors duration-300"
          style={{ color: checked ? customColor : 'var(--text-tertiary)' }}
        >
          {checked ? '● ON' : '○ OFF'}
        </span>
        {runtime !== undefined && runtime > 0 && (
          <span className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>
            {fmtRuntime(runtime)}
          </span>
        )}
      </div>
      {sliderValue !== undefined && onSliderChange && sliderLabel && (
        <NeoSlider
          value={sliderValue}
          onChange={onSliderChange}
          disabled={!checked || disabled}
          accentColor={accentColor}
          label={sliderLabel}
        />
      )}
    </div>
  );
}

// ─── NeoCard wrapper ──────────────────────────────────────────────────────────

function NeoCard({ children, className = '', style = {} }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`rounded-[22px] p-5 transition-colors duration-200 ${className}`}
      style={{
        background: 'var(--bg-primary)',
        boxShadow: 'var(--neo-shadow-lg)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ─── Section Header ───────────────────────────────────────────────────────────

function SectionHeader({
  icon, iconBg, iconColor, title, actions,
}: {
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  title: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between mb-5">
      <div className="flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-2xl flex items-center justify-center flex-shrink-0"
          style={{
            background: iconBg,
            boxShadow: 'var(--neo-shadow)',
          }}
        >
          <span style={{ color: iconColor }}>{icon}</span>
        </div>
        <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{title}</h3>
      </div>
      {actions}
    </div>
  );
}

// ─── Mini pill toggle button ──────────────────────────────────────────────────

function PillBtn({
  label, active, activeColor, activeBg, activeGlow, onClick,
}: {
  label: string;
  active: boolean;
  activeColor: string;
  activeBg: string;
  activeGlow: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1 text-xs font-bold rounded-xl transition-all duration-200"
      style={
        active
          ? {
              background: activeBg,
              color: activeColor,
              boxShadow: `2px 2px 6px ${activeGlow}`,
            }
          : {
              background: 'var(--bg-secondary)',
              color: 'var(--text-secondary)',
              boxShadow: 'var(--neo-shadow)',
            }
      }
    >
      {label}
    </button>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DeviceDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { userData } = useAuth();

  const [device, setDevice]       = useState<Device | null>(null);
  const [outputs, setOutputs]     = useState<DeviceOutputs | null>(null);
  const [health, setHealth]       = useState<DeviceHealth | null>(null);
  const [analytics, setAnalytics] = useState<DeviceAnalyticsData | null>(null);
  const [outputMetadata, setOutputMetadata] = useState<DeviceOutputMetadata | null>(null);
  const [onAt, setOnAt]           = useState<Record<string, number>>({});
  const [now, setNow]             = useState<number>(Date.now());
  const [loading, setLoading]     = useState(true);
  const [resetting, setResetting] = useState(false);

  const [oledDraft, setOledDraft]     = useState('');
  const [sendingOled, setSendingOled] = useState(false);

  // ── Brightness / Speed local state (synced from RTDB outputs) ────────────
  // We keep local state so the slider is smooth; we debounce the RTDB write.
  const [brightness, setBrightness] = useState<Record<string, number>>({
    light1Brightness: 100, light2Brightness: 100, light3Brightness: 100,
  });
  const [fanSpeed, setFanSpeed] = useState<Record<string, number>>({
    fan1Speed: 100, fan2Speed: 100,
  });
  const sliderDebounce = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const [buzzerMode, setBuzzerMode] = useState<'idle'|'single'|'double'|'alarm'>('idle');
  const buzzerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [deleteModal, setDeleteModal] = useState(false);
  const [deleting, setDeleting]       = useState(false);

  const [editModal, setEditModal] = useState(false);
  const [saving, setSaving] = useState(false);

  const [removeModal, setRemoveModal] = useState(false);
  const [removingOutputId, setRemovingOutputId] = useState<keyof DeviceOutputMetadata | null>(null);
  const [removing, setRemoving] = useState(false);

  const performer = userData?.name || 'User';

  const { isOnline, lastSeenLabel } = useDeviceStatus(device?.deviceId);
  const isOffline = false;

  useEffect(() => {
    if (!id) return;
    getDevice(id).then(dev => { setDevice(dev); setLoading(false); });
  }, [id]);

  useEffect(() => {
    if (!device) return;
    const did = device.deviceId;
    ensureTodayWindow(did).catch(err => console.warn('[DeviceDetails] ensureTodayWindow failed:', err));
    const u1 = subscribeToOutputs(did, (out) => {
      setOutputs(out);
      // Sync brightness/speed defaults from RTDB (fallback to 100 if not set)
      setBrightness({
        light1Brightness: out.light1Brightness ?? 100,
        light2Brightness: out.light2Brightness ?? 100,
        light3Brightness: out.light3Brightness ?? 100,
      });
      setFanSpeed({
        fan1Speed: out.fan1Speed ?? 100,
        fan2Speed: out.fan2Speed ?? 100,
      });
    });
    const u2 = subscribeToHealth(did, setHealth);
    const u3 = subscribeToAnalytics(did, setAnalytics);
    const u4 = subscribeToOnAt(did, setOnAt);
    const u5 = subscribeToOutputMetadata(did, setOutputMetadata);
    return () => { u1(); u2(); u3(); u4(); u5(); };
  }, [device]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => () => { if (buzzerTimer.current) clearTimeout(buzzerTimer.current); }, []);
  useEffect(() => () => { Object.values(sliderDebounce.current).forEach(clearTimeout); }, []);

  const toggle = useCallback(
    async (key: keyof DeviceOutputs, value: boolean, label: string) => {
      if (!device) return;
      await setOutput(device.deviceId, key, value, performer, label);
    },
    [device, performer]
  );

  const toggleAllLights = useCallback(async (value: boolean) => {
    if (!device) return;
    await updateDeviceState(device.deviceId, { light1: value, light2: value, light3: value }, performer, `All Lights turned ${value ? 'ON' : 'OFF'}`);
  }, [device, performer]);

  const toggleAllFans = useCallback(async (value: boolean) => {
    if (!device) return;
    await updateDeviceState(device.deviceId, { fan1: value, fan2: value }, performer, `All Fans turned ${value ? 'ON' : 'OFF'}`);
  }, [device, performer]);

  const toggleAllDevices = useCallback(async (value: boolean) => {
    if (!device) return;
    await updateDeviceState(device.deviceId, { light1: value, light2: value, light3: value, fan1: value, fan2: value, custom1: value }, performer, `All Devices turned ${value ? 'ON' : 'OFF'}`);
  }, [device, performer]);

  // ── Slider handler — debounced RTDB write ────────────────────────────────
  const handleSlider = useCallback(
    (
      key: 'light1Brightness' | 'light2Brightness' | 'light3Brightness' | 'fan1Speed' | 'fan2Speed',
      value: number,
      setFn: React.Dispatch<React.SetStateAction<Record<string, number>>>
    ) => {
      // Instant local update for smooth UI
      setFn(prev => ({ ...prev, [key]: value }));
      // Debounce RTDB write by 120ms
      if (sliderDebounce.current[key]) clearTimeout(sliderDebounce.current[key]);
      sliderDebounce.current[key] = setTimeout(() => {
        if (device) setOutputValue(device.deviceId, key, value).catch(console.warn);
      }, 120);
    },
    [device]
  );

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

  async function handleResetAnalytics() {
    if (!device) return;
    setResetting(true);
    await resetAnalytics(device.deviceId);
    setResetting(false);
  }

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

  async function handleDelete() {
    if (!device) return;
    setDeleting(true);
    await deleteDevice(device.id, device.deviceId, userData?.uid || '');
    navigate('/devices');
  }

  async function handleSaveEdit(formData: { name: string; room: string; location: string; firmware: string }) {
    if (!device) return;
    setSaving(true);
    try {
      await updateDevice(device.id, formData);
      setEditModal(false);
      // Refresh device data to show updated values immediately
      const updatedDevice = await getDevice(device.id);
      setDevice(updatedDevice);
    } catch (err) {
      console.error('[DeviceDetails] Failed to update device:', err);
      throw err; // Let the form handle the error
    } finally {
      setSaving(false);
    }
  }

  const handleMetadataChange = useCallback(
    async (outputId: keyof DeviceOutputMetadata, name: string, icon: string, color: string) => {
      if (!device || !userData) return;
      await updateOutputMetadata(device.deviceId, outputId, name, icon, color, userData.name || 'User');
    },
    [device, userData]
  );

  const handleShowNextOutput = useCallback(
    async () => {
      if (!device || !userData || !outputMetadata) return;
      
      // Define the output order (hardware limit: 6 outputs max)
      const outputOrder: (keyof DeviceOutputMetadata)[] = ['light1', 'light2', 'light3', 'fan1', 'fan2', 'custom1'];
      
      // Find the first hidden output
      const nextHidden = outputOrder.find(id => {
        const meta = getOutputMetadata(outputMetadata, id);
        return meta.visible === false;
      });
      
      if (nextHidden) {
        const { updateOutputVisibility } = await import('../../services/deviceService');
        await updateOutputVisibility(device.deviceId, nextHidden, true, userData.name || 'User');
      }
    },
    [device, userData, outputMetadata]
  );

  const handleRemoveClick = useCallback((outputId: keyof DeviceOutputMetadata) => {
    setRemovingOutputId(outputId);
    setRemoveModal(true);
  }, []);

  const handleRemoveConfirm = useCallback(async () => {
    if (!device || !userData || !removingOutputId) return;
    setRemoving(true);
    await removeOutput(device.deviceId, removingOutputId, userData.name || 'User');
    setRemoving(false);
    setRemoveModal(false);
    setRemovingOutputId(null);
  }, [device, userData, removingOutputId]);

  const handleRemoveCancel = useCallback(() => {
    setRemoveModal(false);
    setRemovingOutputId(null);
  }, []);

  if (loading) return <Loader fullPage />;
  if (!device) return (
    <div className="text-center py-24">
      <Cpu size={40} style={{ color: 'var(--text-tertiary)' }} className="mx-auto mb-3" />
      <p className="font-medium" style={{ color: 'var(--text-secondary)' }}>Device not found</p>
      <Link to="/devices" className="text-primary-600 text-sm mt-2 block hover:underline">← Back to Devices</Link>
    </div>
  );

  const o  = outputs;
  const h  = health;
  const an = analytics;

  const liveRuntime = (key: string, stored: number, isOn: boolean | undefined) => {
    const onAtMs = onAt[key] || 0;
    const extra  = (isOn && onAtMs > 0) ? (now - onAtMs) / 3_600_000 : 0;
    return stored + extra;
  };

  const liveLight1  = liveRuntime('light1',  an?.light1Runtime  || 0, o?.light1);
  const liveLight2  = liveRuntime('light2',  an?.light2Runtime  || 0, o?.light2);
  const liveLight3  = liveRuntime('light3',  an?.light3Runtime  || 0, o?.light3);
  const liveFan1    = liveRuntime('fan1',    an?.fan1Runtime    || 0, o?.fan1);
  const liveFan2    = liveRuntime('fan2',    an?.fan2Runtime    || 0, o?.fan2);
  const liveCustom  = liveRuntime('custom1', an?.customRuntime  || 0, o?.custom1);

  const totalRuntime = liveLight1 + liveLight2 + liveLight3 + liveFan1 + liveFan2 + liveCustom;
  const maxRuntime   = Math.max(liveLight1, liveLight2, liveLight3, liveFan1, liveFan2, liveCustom, 0.001);

  const allOn  = !!(o?.light1 && o?.light2 && o?.light3 && o?.fan1 && o?.fan2 && o?.custom1);
  const allOff = !o?.light1 && !o?.light2 && !o?.light3 && !o?.fan1 && !o?.fan2 && !o?.custom1;
  const allLightsOn  = !!(o?.light1 && o?.light2 && o?.light3);
  const allLightsOff = !o?.light1 && !o?.light2 && !o?.light3;
  const allFansOn  = !!(o?.fan1 && o?.fan2);
  const allFansOff = !o?.fan1 && !o?.fan2;

  return (
    <div className="space-y-4 md:space-y-6 max-w-7xl pb-8">

      {/* ── Breadcrumb ── */}
      <div className="flex items-center gap-1.5 text-xs md:text-sm">
        <Link to="/devices" className="transition-colors font-medium" style={{ color: 'var(--text-tertiary)' }} onMouseEnter={e => e.currentTarget.style.color = 'var(--text-secondary)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--text-tertiary)'}>
          Devices
        </Link>
        <ChevronRight size={14} style={{ color: 'var(--border-color)' }} />
        <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{device.name}</span>
      </div>

      {/* ══════════════════════════════════════════════════════
          HEADER CARD
      ══════════════════════════════════════════════════════ */}
      <NeoCard>
        <div className="flex flex-col sm:flex-row items-start justify-between gap-4">

          {/* Left: icon + info */}
          <div className="flex items-start gap-3 md:gap-4 w-full sm:w-auto">
            {/* Device Icon */}
            <div
              className="w-12 h-12 md:w-16 md:h-16 rounded-2xl md:rounded-[22px] flex items-center justify-center flex-shrink-0"
              style={
                isOnline
                  ? {
                      background: 'linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)',
                      boxShadow: '4px 4px 12px rgba(37,99,235,0.35), -2px -2px 6px rgba(255,255,255,0.4)',
                    }
                  : {
                      background: '#D1D5DB',
                      boxShadow: '4px 4px 10px rgba(166,180,200,0.4), -4px -4px 10px rgba(255,255,255,0.8)',
                    }
              }
            >
              <Cpu size={20} className="text-white md:w-7 md:h-7" style={{ width: '20px', height: '20px' }} />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 md:gap-3 flex-wrap mb-2">
                <h2 className="text-lg md:text-xl font-bold truncate" style={{ color: 'var(--text-primary)' }}>{device.name}</h2>
                <OnlinePill online={isOnline} />
              </div>
              {/* Meta grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1.5">
                {[
                  { icon: <Cpu size={11} />,    text: device.deviceId,              mono: true  },
                  { icon: <Bolt size={11} />,   text: `Firmware ${device.firmware || 'v1.2.4'}` },
                  { icon: <Clock size={11} />,  text: `Last seen ${lastSeenLabel}`              },
                  { icon: <MapPin size={11} />, text: `${device.room} · ${device.location}`     },
                  { icon: <Cpu size={11} />,    text: 'ESP32 · Controller'                      },
                ].map((item, i) => (
                  <span
                    key={i}
                    className={`flex items-center gap-1.5 text-xs ${item.mono ? 'font-mono font-semibold' : ''}`}
                    style={{ color: item.mono ? 'var(--text-secondary)' : 'var(--text-secondary)' }}
                  >
                    <span style={{ color: 'var(--text-tertiary)' }}>{item.icon}</span>
                    {item.text}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Right: actions */}
          <div className="flex flex-col sm:flex-row flex-wrap gap-2 items-stretch sm:items-center w-full sm:w-auto justify-start sm:justify-end">
            <div className="flex gap-2 items-center">
              <PillBtn
                label="⚡ All On"
                active={allOn}
                activeColor="#ffffff"
                activeBg="linear-gradient(135deg,#2563eb,#3b82f6)"
                activeGlow="rgba(37,99,235,0.35)"
                onClick={() => toggleAllDevices(true)}
              />
              <PillBtn
                label="⚡ All Off"
                active={allOff}
                activeColor="#ffffff"
                activeBg="linear-gradient(135deg,#374151,#4b5563)"
                activeGlow="rgba(55,65,81,0.3)"
                onClick={() => toggleAllDevices(false)}
              />
            </div>
            <div className="w-px h-5 hidden sm:block" style={{ background: 'rgba(166,180,200,0.4)' }} />
            <div className="flex gap-2 items-center">
              <Button variant="secondary" size="sm" onClick={() => setEditModal(true)}>
                <Edit2 size={13} /> Edit
              </Button>
              <Button variant="danger" size="sm" onClick={() => setDeleteModal(true)}>
                <Trash size={13} /> Remove
              </Button>
            </div>
          </div>
        </div>
      </NeoCard>

      {/* ══════════════════════════════════════════════════════
          MAIN RESPONSIVE LAYOUT
      ══════════════════════════════════════════════════════ */}
      {/* Mobile: Single column stack | Tablet: 2 columns | Desktop: 3 columns */}
      <div className="space-y-4 lg:space-y-0 lg:grid lg:grid-cols-2 xl:grid-cols-3 lg:gap-4 md:gap-5">

        {/* ═══ DEVICE OUTPUTS (MAX 6) ═══ */}
        {/* Mobile: Full width | Desktop: Spans 2 columns */}
        <div className="lg:col-span-2 order-1">
          <NeoCard>
            <SectionHeader
              icon={<Zap size={17} />}
              iconBg="linear-gradient(135deg,#dbeafe,#bfdbfe)"
              iconColor="#2563eb"
              title="Output Controls"
              actions={
                <div className="flex items-center gap-2 flex-wrap">
                  <PillBtn
                    label="💡 Lights"
                    active={allLightsOn}
                    activeColor="#ffffff"
                    activeBg="linear-gradient(135deg,#f59e0b,#fbbf24)"
                    activeGlow="rgba(245,158,11,0.35)"
                    onClick={() => toggleAllLights(!allLightsOn)}
                  />
                </div>
              }
            />
            {/* Responsive grid for output cards */}
            <div className="grid grid-responsive-output-cards gap-3">
            {(() => {
              // Define all 6 output slots (hardware limit)
              const allOutputs: Array<{
                key: keyof DeviceOutputs;
                outputId: keyof DeviceOutputMetadata;
                stored: number;
              }> = [
                { key: 'light1', outputId: 'light1', stored: an?.light1Runtime || 0 },
                { key: 'light2', outputId: 'light2', stored: an?.light2Runtime || 0 },
                { key: 'light3', outputId: 'light3', stored: an?.light3Runtime || 0 },
                { key: 'fan1', outputId: 'fan1', stored: an?.fan1Runtime || 0 },
                { key: 'fan2', outputId: 'fan2', stored: an?.fan2Runtime || 0 },
                { key: 'custom1', outputId: 'custom1', stored: an?.customRuntime || 0 },
              ];

              // Filter to only show visible outputs
              const visibleOutputs = allOutputs.filter(item => {
                if (!outputMetadata) return false;
                const meta = getOutputMetadata(outputMetadata, item.outputId);
                return meta.visible !== false; // show if visible=true or undefined (for backwards compat)
              });

              // Count visible outputs
              const visibleCount = visibleOutputs.length;
              const canAddMore = visibleCount < 6;

              return (
                <>
                  {visibleOutputs.map(item => {
                    const liveExtra = (o?.[item.key] && onAt[item.key]) ? (now - onAt[item.key]) / 3_600_000 : 0;
                    const metadata = outputMetadata ? getOutputMetadata(outputMetadata, item.outputId) : { 
                      name: item.key === 'custom1' ? 'Custom Device' : item.key === 'fan1' || item.key === 'fan2' ? 'Fan' : 'Light', 
                      icon: item.key === 'custom1' ? 'zap' : item.key === 'fan1' || item.key === 'fan2' ? 'wind' : 'lightbulb', 
                      color: item.key === 'custom1' ? '#7c3aed' : item.key === 'fan1' || item.key === 'fan2' ? '#2563eb' : '#d97706',
                      visible: true 
                    };
                    return (
                      <CompactDeviceItem
                        key={item.key}
                        icon={getIconById(metadata.icon)}
                        customColor={metadata.color}
                        label={metadata.name}
                        runtime={item.stored + liveExtra}
                        checked={o?.[item.key] || false}
                        onChange={v => toggle(item.key, v, `${metadata.name} turned ${v ? 'ON' : 'OFF'}`)}
                        disabled={isOffline}
                        onMetadataChange={(name, icon, color) => handleMetadataChange(item.outputId, name, icon, color)}
                        outputId={item.outputId}
                        iconId={metadata.icon}
                        onRemove={() => handleRemoveClick(item.outputId)}
                      />
                    );
                  })}

                    {/* ═══ ADD BUTTON ═══ */}
                    {canAddMore && (
                      <button
                        onClick={handleShowNextOutput}
                        disabled={isOffline}
                        className="rounded-2xl p-4 transition-all duration-300 border-2 border-dashed flex flex-col items-center justify-center gap-2 min-h-[120px] hover:border-primary-400 touch-manipulation"
                        style={{
                          background: 'var(--bg-primary)',
                          boxShadow: 'var(--neo-shadow)',
                          borderColor: 'var(--border-color)',
                        }}
                        aria-label="Add new output"
                      >
                        <div 
                          className="w-11 h-11 rounded-2xl flex items-center justify-center"
                          style={{
                            background: 'var(--bg-secondary)',
                            boxShadow: 'var(--neo-shadow)',
                          }}
                        >
                          <Plus size={20} style={{ color: 'var(--text-secondary)' }} />
                        </div>
                        <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Add Output</span>
                        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{visibleCount} of 6</span>
                      </button>
                    )}
                </>
              );
            })()}
          </div>
        </NeoCard>
        </div>

        {/* ═══ DEVICE HEALTH ═══ */}
        {/* Mobile: Full width | Desktop: Right column */}
        <div className="order-2">
        <NeoCard>
          <SectionHeader
            icon={<Activity size={17} />}
            iconBg="linear-gradient(135deg,#dcfce7,#bbf7d0)"
            iconColor="#16a34a"
            title="Device Health"
            actions={
              <span
                className={`w-2.5 h-2.5 rounded-full ${isOnline ? 'animate-pulse' : ''}`}
                style={{ background: isOnline ? '#22c55e' : '#d1d5db' }}
              />
            }
          />
          <div>
            <HealthRow
              icon={<Wifi size={13} />}
              label="WiFi Status"
              ok={isOnline || h?.wifiStatus === 'connected'}
              value={
                <span style={{ color: (isOnline || h?.wifiStatus === 'connected') ? '#16a34a' : '#ef4444' }}>
                  {(isOnline || h?.wifiStatus === 'connected') ? 'Connected' : 'Disconnected'}
                </span>
              }
            />
            <HealthRow
              icon={<Server size={13} />}
              label="Firebase"
              ok={isOnline || h?.firebaseStatus === 'connected'}
              value={
                <span style={{ color: (isOnline || h?.firebaseStatus === 'connected') ? '#16a34a' : '#ef4444' }}>
                  {(isOnline || h?.firebaseStatus === 'connected') ? 'Connected' : 'Disconnected'}
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
                    <span style={{ color: rssiLabel(h.rssi).color, fontWeight: 400 }}>
                      ({rssiLabel(h.rssi).text})
                    </span>
                  </span>
                ) : '–'
              }
            />
            <HealthRow icon={<MemoryStick size={13} />} label="Free Heap"     value={fmtHeap(h?.heap || 0)} />
            <HealthRow icon={<Clock size={13} />}       label="Device Uptime" value={fmtUptime(h?.uptime || 0)} />
            <HealthRow icon={<Wifi size={13} />}        label="WiFi Uptime"   value={fmtUptime(h?.wifiUptime || 0)} />
            <HealthRow icon={<RotateCcw size={13} />}   label="Restart Count" value={h?.restartCount ?? '–'} />
          </div>
        </NeoCard>
        </div>

        {/* ═══ ANALYTICS (spans 2 cols on xl) ═══ */}
        {/* Mobile: Full width | Desktop: Spans 2 columns */}
        <div className="lg:col-span-2 xl:col-span-2 order-3">
          <NeoCard>
            <div className="flex items-center gap-3 mb-5 flex-wrap">
              <div
                className="w-9 h-9 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'linear-gradient(135deg,#dbeafe,#bfdbfe)', boxShadow: '3px 3px 8px rgba(166,180,200,0.35), -3px -3px 8px rgba(255,255,255,0.8)' }}
              >
                <BarChart3 size={17} style={{ color: '#2563eb' }} />
              </div>
              <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Runtime Analytics</h3>
              <span className="ml-auto text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Live · Cumulative</span>
              <button
                onClick={handleResetAnalytics}
                disabled={resetting}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl transition-all disabled:opacity-40 touch-manipulation"
                style={{
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-tertiary)',
                  boxShadow: 'var(--neo-shadow)',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#ef4444'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-tertiary)'; }}
              >
                <RotateCcw size={11} className={resetting ? 'animate-spin' : ''} />
                Reset
              </button>
            </div>

            {/* Summary stat cards - responsive grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
              {[
                { label: 'Total Runtime', value: fmtRuntime(totalRuntime),                            icon: <Clock size={15} />,    grad: 'linear-gradient(135deg,#dbeafe,#bfdbfe)', ic: '#2563eb' },
                { label: 'Energy Used',   value: `${(an?.energyUsage || 0).toFixed(3)} kWh`,         icon: <Zap size={15} />,      grad: 'linear-gradient(135deg,#fef9c3,#fde68a)', ic: '#d97706' },
                { label: 'Lights Active', value: `${[o?.light1,o?.light2,o?.light3].filter(Boolean).length} / 3`, icon: <Lightbulb size={15} />, grad: 'linear-gradient(135deg,#fef9c3,#fde68a)', ic: '#d97706' },
                { label: 'Fans Active',   value: `${[o?.fan1,o?.fan2].filter(Boolean).length} / 2`,  icon: <Wind size={15} />,     grad: 'linear-gradient(135deg,#dbeafe,#bfdbfe)', ic: '#2563eb' },
              ].map(item => (
                <div
                  key={item.label}
                  className="rounded-2xl p-3 sm:p-4 transition-colors duration-200"
                  style={{
                    background: 'var(--bg-secondary)',
                    boxShadow: 'var(--neo-inset)',
                  }}
                >
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center mb-3" style={{ background: item.grad }}>
                    <span style={{ color: item.ic }}>{item.icon}</span>
                  </div>
                  <p className="text-sm sm:text-base font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>{item.value}</p>
                  <p className="text-[10px] sm:text-xs font-medium mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{item.label}</p>
                </div>
              ))}
            </div>

            {/* Per-channel bars */}
            <div className="space-y-3">
              {[
                { key: 'light1' as const,  total: liveLight1, color: '#fbbf24', isOn: o?.light1  },
                { key: 'light2' as const,  total: liveLight2, color: '#fbbf24', isOn: o?.light2  },
                { key: 'light3' as const,  total: liveLight3, color: '#f59e0b', isOn: o?.light3  },
                { key: 'fan1' as const,    total: liveFan1,   color: '#60a5fa', isOn: o?.fan1    },
                { key: 'fan2' as const,    total: liveFan2,   color: '#38bdf8', isOn: o?.fan2    },
                { key: 'custom1' as const, total: liveCustom, color: '#a78bfa', isOn: o?.custom1 },
              ].map(item => {
                const metadata = outputMetadata ? getOutputMetadata(outputMetadata, item.key) : { name: item.key, icon: 'zap' };
                return (
                <div key={item.key} className="flex items-center gap-2 md:gap-3">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: item.color }} />
                  <span className="text-[11px] md:text-xs font-medium w-12 md:w-14 flex-shrink-0 truncate" style={{ color: 'var(--text-secondary)' }}>{metadata.name}</span>
                  <RuntimeBar value={item.total} max={maxRuntime} color={item.color} />
                  <div className="flex items-center gap-1 md:gap-1.5 w-20 md:w-24 justify-end flex-shrink-0">
                    {item.isOn && <span className="w-1.5 h-1.5 rounded-full animate-pulse flex-shrink-0" style={{ background: '#22c55e' }} />}
                    <span className="text-xs font-bold" style={{ color: item.isOn ? '#16a34a' : 'var(--text-primary)' }}>
                      {fmtRuntime(item.total)}
                    </span>
                  </div>
                </div>
                );
              })}
            </div>
          </NeoCard>
        </div>

        {/* ═══ OLED ═══ */}
        {/* Mobile: Full width | Desktop: Right column */}
        <div className="order-4">
        <NeoCard>
          <SectionHeader
            icon={<Monitor size={17} />}
            iconBg="linear-gradient(135deg,#f1f5f9,#e2e8f0)"
            iconColor="#475569"
            title="OLED Display"
          />
          {/* Screen preview */}
          <div
            className="rounded-2xl p-4 mb-4 min-h-[80px] flex items-center justify-center font-mono relative overflow-hidden"
            style={{
              background: '#0a0a0a',
              boxShadow: 'inset 3px 3px 8px rgba(0,0,0,0.5), inset -1px -1px 4px rgba(255,255,255,0.05)',
            }}
          >
            <div className="absolute inset-0 opacity-[0.04]"
              style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,.05) 2px, rgba(255,255,255,.05) 4px)' }}
            />
            {o?.oledMessage ? (
              <p className="text-green-400 text-sm text-center leading-relaxed z-10 break-all">{o.oledMessage}</p>
            ) : (
              <p className="text-xs z-10" style={{ color: 'var(--text-tertiary)' }}>— display empty —</p>
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
              <span className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>{oledDraft.length} / 64 chars</span>
            </div>
            <div className="flex gap-2">
              <Button className="flex-1" size="sm" onClick={handleSendOled} loading={sendingOled} disabled={!oledDraft.trim() || isOffline}>
                Send to Display
              </Button>
              <Button size="sm" variant="secondary" onClick={handleClearOled} disabled={!o?.oledMessage || isOffline}>
                Clear
              </Button>
            </div>
          </div>
        </NeoCard>
        </div>

        {/* ═══ BUZZER ═══ */}
        {/* Mobile: Full width | Desktop: Right column */}
        <div className="order-5">
        <NeoCard>
          <SectionHeader
            icon={<Volume2 size={17} />}
            iconBg="linear-gradient(135deg,#ffedd5,#fed7aa)"
            iconColor="#ea580c"
            title="Buzzer"
            actions={
              o?.buzzer ? (
                <span
                  className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full animate-pulse"
                  style={{ background: 'rgba(234,88,12,0.1)', color: '#ea580c' }}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#ea580c' }} />
                  Sounding
                </span>
              ) : null
            }
          />
          <div className="space-y-2.5">
            {([
              { mode: 'single' as const, label: 'Test Beep',   desc: 'Single short beep',    duration: '0.6s', accent: '#ea580c', glow: 'rgba(234,88,12,0.2)'  },
              { mode: 'double' as const, label: 'Double Beep', desc: 'Two consecutive beeps', duration: '1.2s', accent: '#ea580c', glow: 'rgba(234,88,12,0.2)'  },
              { mode: 'alarm'  as const, label: 'Alarm Test',  desc: 'Long alarm sound',      duration: '3.5s', accent: '#ef4444', glow: 'rgba(239,68,68,0.2)'  },
            ]).map(item => (
              <button
                key={item.mode}
                onClick={() => triggerBuzzer(item.mode)}
                disabled={buzzerMode !== 'idle' || isOffline}
                className="w-full flex items-center justify-between px-4 py-3.5 rounded-2xl text-sm transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed touch-manipulation"
                style={
                  buzzerMode === item.mode
                    ? { background: `rgba(234,88,12,0.08)`, boxShadow: `0 0 0 1.5px ${item.accent}40, 3px 3px 8px ${item.glow}` }
                    : { background: 'var(--bg-secondary)', boxShadow: 'var(--neo-shadow)' }
                }
              >
                <div className="text-left">
                  <p className="font-bold" style={{ color: 'var(--text-primary)' }}>{item.label}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{item.desc}</p>
                </div>
                <span
                  className="text-xs font-semibold px-2.5 py-1 rounded-xl"
                  style={{ background: 'var(--bg-primary)', color: 'var(--text-secondary)', boxShadow: 'var(--neo-shadow)' }}
                >
                  {item.duration}
                </span>
              </button>
            ))}
          </div>
        </NeoCard>
        </div>

        {/* ═══ CONTROLLER INFO ═══ */}
        {/* Mobile: Full width | Desktop: Right column */}
        <div className="order-6">
        <NeoCard>
          <SectionHeader
            icon={<Cpu size={17} />}
            iconBg="linear-gradient(135deg,#f1f5f9,#e2e8f0)"
            iconColor="#475569"
            title="Controller Info"
          />
          <div className="space-y-2">
            {[
              { label: 'Device ID',  value: device.deviceId, mono: true },
              { label: 'Room',       value: device.room },
              { label: 'Location',   value: device.location },
              { label: 'Firmware',   value: device.firmware || 'v1.2.4' },
              { label: 'Controller', value: 'ESP32' },
              { label: 'Channels',   value: '3 Lights · 2 Fans · 1 Custom' },
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
                className="flex items-center justify-between px-4 py-2.5 rounded-2xl transition-colors duration-200"
                style={{
                  background: 'var(--bg-secondary)',
                  boxShadow: 'var(--neo-inset)',
                }}
              >
                <span className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>{item.label}</span>
                <span className={`text-xs font-bold max-w-[55%] text-right truncate ${item.mono ? 'font-mono' : ''}`} style={{ color: 'var(--text-primary)' }}>
                  {item.value}
                </span>
              </div>
            ))}
          </div>
          <button
            onClick={() => setDeleteModal(true)}
            className="mt-4 w-full flex items-center justify-center gap-2 px-3 py-2.5 text-xs font-semibold rounded-2xl transition-all touch-manipulation"
            style={{
              color: '#ef4444',
              background: 'var(--bg-secondary)',
              boxShadow: 'var(--neo-shadow)',
            }}
          >
            <Trash size={13} /> Remove This Device
          </button>
        </NeoCard>
        </div>

      </div>

      {/* ── Edit Device Modal ── */}
      <Modal open={editModal} onClose={() => setEditModal(false)} title="Edit Device">
        <EditDeviceForm
          device={device}
          onSave={handleSaveEdit}
          onCancel={() => setEditModal(false)}
          loading={saving}
        />
      </Modal>

      {/* ── Delete Modal ── */}
      <Modal open={deleteModal} onClose={() => setDeleteModal(false)} title="Remove Device">
        <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
          Remove <strong style={{ color: 'var(--text-primary)' }}>{device.name}</strong>? All device data will be permanently deleted.
        </p>
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" onClick={() => setDeleteModal(false)}>Cancel</Button>
          <Button variant="danger" loading={deleting} onClick={handleDelete}>Remove Device</Button>
        </div>
      </Modal>

      {/* ── Remove Output Modal ── */}
      <Modal open={removeModal} onClose={handleRemoveCancel} title="Remove Output">
        <p className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
          Remove this button?
        </p>
        <p className="text-xs mb-6" style={{ color: 'var(--text-tertiary)' }}>
          This will remove the button configuration from this device. The output can be added again later.
        </p>
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" onClick={handleRemoveCancel}>Cancel</Button>
          <Button variant="danger" loading={removing} onClick={handleRemoveConfirm}>Remove</Button>
        </div>
      </Modal>
    </div>
  );
}


// ─── Edit Device Form Component ──────────────────────────────────────────────

function EditDeviceForm({
  device,
  onSave,
  onCancel,
  loading,
}: {
  device: Device | null;
  onSave: (data: { name: string; room: string; location: string; firmware: string }) => Promise<void>;
  onCancel: () => void;
  loading: boolean;
}) {
  const [formData, setFormData] = useState({
    name: '',
    room: '',
    location: '',
    firmware: '',
  });
  const [error, setError] = useState<string | null>(null);

  // Update form data when device changes
  useEffect(() => {
    if (device) {
      setFormData({
        name: device.name || '',
        room: device.room || '',
        location: device.location || '',
        firmware: device.firmware || '',
      });
    }
  }, [device]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.room.trim()) return;
    
    setError(null);
    try {
      await onSave(formData);
    } catch (err) {
      setError('Failed to update device. Please try again.');
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  if (!device) return null;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div
          className="p-3 rounded-lg text-xs"
          style={{
            background: 'rgba(239, 68, 68, 0.1)',
            color: '#ef4444',
            border: '1px solid rgba(239, 68, 68, 0.2)',
          }}
        >
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
          Device Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => handleChange('name', e.target.value)}
          className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors duration-200"
          style={{
            background: 'var(--bg-tertiary)',
            color: 'var(--text-primary)',
            borderColor: 'var(--border-color)',
          }}
          placeholder="Enter device name"
          required
          disabled={loading}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
          Room <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={formData.room}
          onChange={(e) => handleChange('room', e.target.value)}
          className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors duration-200"
          style={{
            background: 'var(--bg-tertiary)',
            color: 'var(--text-primary)',
            borderColor: 'var(--border-color)',
          }}
          placeholder="Enter room name"
          required
          disabled={loading}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
          Location
        </label>
        <input
          type="text"
          value={formData.location}
          onChange={(e) => handleChange('location', e.target.value)}
          className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors duration-200"
          style={{
            background: 'var(--bg-tertiary)',
            color: 'var(--text-primary)',
            borderColor: 'var(--border-color)',
          }}
          placeholder="Enter specific location"
          disabled={loading}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
          Firmware Version
        </label>
        <input
          type="text"
          value={formData.firmware}
          onChange={(e) => handleChange('firmware', e.target.value)}
          className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors duration-200"
          style={{
            background: 'var(--bg-tertiary)',
            color: 'var(--text-primary)',
            borderColor: 'var(--border-color)',
          }}
          placeholder="e.g., v1.2.4"
          disabled={loading}
        />
      </div>

      <div className="flex gap-3 justify-end pt-4">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button type="submit" loading={loading} disabled={!formData.name.trim() || !formData.room.trim()}>
          Save Changes
        </Button>
      </div>
    </form>
  );
}
