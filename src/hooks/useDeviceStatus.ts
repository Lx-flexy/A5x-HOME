/**
 * useDeviceStatus
 * Derives online/offline from RTDB lastSeen timestamp.
 * Re-evaluates every second so the badge flips automatically
 * when the device stops reporting without a page reload.
 *
 * Logic:
 *   online  → lastSeen exists AND (now - lastSeen) < 30 000 ms
 *   offline → anything else
 */

import { useEffect, useRef, useState } from 'react';
import { subscribeToLastSeen, ONLINE_THRESHOLD_MS } from '../services/deviceService';

export interface DeviceStatusResult {
  isOnline: boolean;
  lastSeenMs: number;       // raw unix ms from RTDB (0 = never seen)
  lastSeenLabel: string;    // e.g. "5s ago" | "just now" | "–"
}

function buildLabel(lastSeenMs: number): string {
  if (!lastSeenMs) return '–';
  const diffMs = Date.now() - lastSeenMs;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 5)    return 'just now';
  if (diffSec < 60)   return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400)return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

export function useDeviceStatus(deviceId: string | undefined): DeviceStatusResult {
  const [lastSeenMs, setLastSeenMs] = useState<number>(0);
  const [, tick] = useState(0);          // forces re-render every second
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Subscribe to RTDB lastSeen — fires whenever ESP32 updates it
  useEffect(() => {
    if (!deviceId) return;
    const unsub = subscribeToLastSeen(deviceId, setLastSeenMs);
    return unsub;
  }, [deviceId]);

  // Tick every second so the label and isOnline re-evaluate without new RTDB data
  useEffect(() => {
    timerRef.current = setInterval(() => tick(n => n + 1), 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const isOnline =
    lastSeenMs > 0 && Date.now() - lastSeenMs < ONLINE_THRESHOLD_MS;

  return {
    isOnline,
    lastSeenMs,
    lastSeenLabel: buildLabel(lastSeenMs),
  };
}
