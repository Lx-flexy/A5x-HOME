import { Zap, AlertTriangle, Activity } from 'lucide-react';

interface LivePowerCardProps {
  label: string;
  current: number;
  voltage?: number;
  powerFactor?: number;
  isOn: boolean;
  mismatch: boolean;
  runtime: number;
  energy: number;
  color: string;
  icon?: React.ReactNode;
}

/**
 * LivePowerCard - Real-time power monitoring card
 * Shows current, power, runtime, and energy with live updates
 */
export default function LivePowerCard({
  label,
  current,
  voltage = 230,
  powerFactor = 0.9,
  isOn,
  mismatch,
  runtime,
  energy,
  color,
  icon,
}: LivePowerCardProps) {
  // Calculate real-time power: P = V × I × PF
  const power = current * voltage * powerFactor;
  
  // Format runtime
  const fmtRuntime = (h: number): string => {
    if (!isFinite(h) || h < 0) return '0s';
    if (h === 0) return '0s';
    const totalSec = Math.round(h * 3600);
    if (totalSec < 60) return `${totalSec}s`;
    const hh = Math.floor(h);
    const mm = Math.floor((h - hh) * 60);
    if (hh === 0) return `${mm}m`;
    return `${hh}h ${mm}m`;
  };
  
  // Format current
  const fmtCurrent = (amps: number): string => {
    if (!isFinite(amps) || amps < 0) return '0.00 A';
    if (amps < 0.01) return '0.00 A';
    return `${amps.toFixed(2)} A`;
  };
  
  // Format power
  const fmtPower = (watts: number): string => {
    if (!isFinite(watts) || watts < 0) return '0 W';
    if (watts < 1) return '0 W';
    return watts >= 1000 ? `${(watts / 1000).toFixed(2)} kW` : `${Math.round(watts)} W`;
  };
  
  return (
    <div
      className="p-4 rounded-2xl border transition-all duration-300"
      style={{
        background: mismatch 
          ? 'rgba(239, 68, 68, 0.05)' 
          : isOn 
            ? `linear-gradient(135deg, ${color}08 0%, var(--bg-primary) 100%)`
            : 'var(--bg-primary)',
        borderColor: mismatch ? '#ef4444' : isOn ? `${color}30` : 'var(--border-color)',
        boxShadow: isOn ? `0 0 20px ${color}15` : 'none',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{
              background: isOn ? `${color}15` : 'var(--bg-secondary)',
            }}
          >
            {icon || <Zap size={16} style={{ color: isOn ? color : 'var(--text-tertiary)' }} />}
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              {label}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span
                className={`w-1.5 h-1.5 rounded-full ${isOn ? 'animate-pulse' : ''}`}
                style={{ background: isOn ? '#22c55e' : '#9ca3af' }}
              />
              <span className="text-xs" style={{ color: isOn ? '#16a34a' : 'var(--text-tertiary)' }}>
                {isOn ? 'ON' : 'OFF'}
              </span>
            </div>
          </div>
        </div>
        {mismatch && (
          <AlertTriangle size={18} style={{ color: '#ef4444' }} />
        )}
      </div>
      
      {/* Live Metrics Grid */}
      <div className="grid grid-cols-2 gap-3">
        {/* Current */}
        <div>
          <p className="text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>Current</p>
          <p className="text-lg font-bold" style={{ color: isOn ? color : 'var(--text-secondary)' }}>
            {fmtCurrent(current)}
          </p>
        </div>
        
        {/* Power */}
        <div>
          <div className="flex items-center gap-1 mb-1">
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Power</p>
            {isOn && (
              <Activity size={10} className="animate-pulse" style={{ color: '#ef4444' }} />
            )}
          </div>
          <p className="text-lg font-bold" style={{ color: isOn ? '#ef4444' : 'var(--text-secondary)' }}>
            {fmtPower(power)}
          </p>
        </div>
        
        {/* Runtime */}
        <div>
          <p className="text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>Runtime</p>
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            {fmtRuntime(runtime)}
          </p>
        </div>
        
        {/* Energy */}
        <div>
          <p className="text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>Energy</p>
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            {energy.toFixed(3)} kWh
          </p>
        </div>
      </div>
      
      {/* Mismatch Alert */}
      {mismatch && (
        <div 
          className="mt-3 pt-3 flex items-start gap-2" 
          style={{ borderTop: '1px solid rgba(239, 68, 68, 0.2)' }}
        >
          <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" style={{ color: '#ef4444' }} />
          <p className="text-xs leading-tight" style={{ color: '#ef4444' }}>
            Device not responding - check switch or bulb
          </p>
        </div>
      )}
    </div>
  );
}
