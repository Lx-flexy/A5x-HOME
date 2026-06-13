/**
 * useDeviceStatus
 * ─────────────────────────────────────────────────────────────────────────────
 * Reads devices/{deviceId}/health/lastSeen from RTDB.
 * ESP32 writes this as unix SECONDS every ~10s.
 *
 * Online logic:
 *   const isOnline = Date.now() - (lastSeen * 1000) < 30_000
 *
 * Re-evaluates every second via setInterval so badges flip automatically
 * without any new RTDB push (covers the "device unplugged" case).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef, useState } from 'react';
import { subscribeToLastSeen, ONLINE_THRESHOLD_MS } from '../services/deviceService';

export interface DeviceStatusResult {
  isOnline: boolean;
  lastSeenMs: number;     // normalised unix ms (0 = never seen)
  lastSeenLabel: string;  // "just now" | "5s ago" | "1m ago" | "–"
}

/**
 * Build a human-readable label.
 * Caps at hours — never shows "20617 days ago".
 */
function buildLabel(lastSeenMs: number): string {
  if (!lastSeenMs || lastSeenMs <= 0) return '–';

  const diffMs  = Date.now() - lastSeenMs;
  const diffSec = Math.floor(diffMs / 1000);

  // Sanity check — if diff is negative or absurdly large, show '–'
  if (diffSec < 0 || diffSec > 86400 * 7) return '–';

  if (diffSec < 5)    return 'just now';
  if (diffSec < 60)   return `${diffSec} sec ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} min ago`;
  return `${Math.floor(diffSec / 3600)}h ago`;
}

export function useDeviceStatus(deviceId: string | undefined): DeviceStatusResult {
  const [lastSeenMs, setLastSeenMs] = useState<number>(0);
  const [, tick]  = useState(0);
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  // Subscribe to RTDB health/lastSeen
  useEffect(() => {
    if (!deviceId) return;
    const unsub = subscribeToLastSeen(deviceId, setLastSeenMs);
    return unsub;
  }, [deviceId]);

  // Tick every second — re-renders so isOnline flips without new RTDB data
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

/**
 * Standalone helper for pages that need isOnline without the hook.
 * Takes lastSeenMs (already normalised to ms).
 */
export function calcIsOnline(lastSeenMs: number): boolean {
  return lastSeenMs > 0 && Date.now() - lastSeenMs < ONLINE_THRESHOLD_MS;
}
