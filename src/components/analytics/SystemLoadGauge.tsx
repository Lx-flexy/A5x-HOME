import { Zap, TrendingUp } from 'lucide-react';

interface SystemLoadGaugeProps {
  totalCurrent: number;
  totalPower: number;
  maxCurrent?: number;
  maxPower?: number;
}

/**
 * SystemLoadGauge - Shows total system load with visual gauge
 */
export default function SystemLoadGauge({
  totalCurrent,
  totalPower,
  maxCurrent = 16, // 16A circuit breaker
  maxPower = 3680,  // 16A × 230V
}: SystemLoadGaugeProps) {
  const currentPercent = Math.min((totalCurrent / maxCurrent) * 100, 100);
  const powerPercent = Math.min((totalPower / maxPower) * 100, 100);
  
  // Color based on load percentage
  const getColor = (percent: number) => {
    if (percent >= 90) return '#ef4444'; // Red - Critical
    if (percent >= 75) return '#f59e0b'; // Orange - Warning
    if (percent >= 50) return '#eab308'; // Yellow - Moderate
    return '#22c55e'; // Green - Safe
  };
  
  const loadColor = getColor(Math.max(currentPercent, powerPercent));
  
  // Format power
  const fmtPower = (watts: number): string => {
    if (watts >= 1000) return `${(watts / 1000).toFixed(2)} kW`;
    return `${Math.round(watts)} W`;
  };
  
  return (
    <div className="p-5 rounded-2xl" style={{ background: 'var(--bg-primary)', boxShadow: 'var(--neo-shadow-lg)' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Zap size={20} style={{ color: loadColor }} />
          <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
            Total System Load
          </h3>
        </div>
        <div className="flex items-center gap-1">
          <TrendingUp size={14} style={{ color: loadColor }} />
          <span className="text-xs font-semibold" style={{ color: loadColor }}>
            {Math.round(Math.max(currentPercent, powerPercent))}%
          </span>
        </div>
      </div>
      
      {/* Circular Gauge */}
      <div className="flex items-center justify-center mb-4">
        <div className="relative w-40 h-40">
          {/* Background circle */}
          <svg className="w-full h-full transform -rotate-90">
            <circle
              cx="80"
              cy="80"
              r="70"
              fill="none"
              stroke="var(--bg-secondary)"
              strokeWidth="12"
            />
            {/* Progress circle */}
            <circle
              cx="80"
              cy="80"
              r="70"
              fill="none"
              stroke={loadColor}
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 70}`}
              strokeDashoffset={`${2 * Math.PI * 70 * (1 - Math.max(currentPercent, powerPercent) / 100)}`}
              style={{ transition: 'stroke-dashoffset 0.5s ease' }}
            />
          </svg>
          
          {/* Center text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p className="text-3xl font-bold" style={{ color: loadColor }}>
              {totalCurrent.toFixed(1)}
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
              Amps
            </p>
          </div>
        </div>
      </div>
      
      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4 pt-4" style={{ borderTop: '1px solid var(--border-color)' }}>
        <div>
          <p className="text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>Current Load</p>
          <p className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
            {totalCurrent.toFixed(2)} A
          </p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
            of {maxCurrent}A max
          </p>
        </div>
        
        <div>
          <p className="text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>Power Draw</p>
          <p className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
            {fmtPower(totalPower)}
          </p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
            of {fmtPower(maxPower)} max
          </p>
        </div>
      </div>
      
      {/* Warning/Status Message */}
      <div 
        className="mt-4 p-3 rounded-lg"
        style={{
          background: currentPercent >= 90 
            ? 'rgba(239, 68, 68, 0.1)' 
            : currentPercent >= 75 
              ? 'rgba(245, 158, 11, 0.1)'
              : 'rgba(34, 197, 94, 0.1)',
        }}
      >
        <p className="text-xs font-medium" style={{ color: loadColor }}>
          {currentPercent >= 90 
            ? '🔴 CRITICAL: Reduce load immediately to prevent circuit trip'
            : currentPercent >= 75 
              ? '⚠️ WARNING: High load - consider turning off non-essential devices'
              : currentPercent >= 50
                ? '✓ MODERATE: Load is within safe operating range'
                : '✓ OPTIMAL: System running efficiently'}
        </p>
      </div>
    </div>
  );
}
