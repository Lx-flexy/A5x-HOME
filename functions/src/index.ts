/**
 * Firebase Cloud Functions for A5X Home Automation
 * 
 * - Scheduled periodic energy accumulation (runs every 60 seconds)
 * - Scheduled cleanup of old analytics data (runs daily at 2 AM IST)
 */

import {onSchedule} from 'firebase-functions/v2/scheduler';
import {logger} from 'firebase-functions/v2';
import * as admin from 'firebase-admin';

admin.initializeApp();

const rtdb = admin.database();
const db = admin.firestore();

// IST offset: UTC +5:30 = 19800 seconds (matching web app)
const IST_OFFSET_MS = 19800 * 1000;

// Power consumption constants (matching web app)
const NOMINAL_VOLTAGE = 230; // Volts (Indian standard)
const WATT: Record<string, number> = {
  light2: 40,
  light3: 40,
  fan1: 25,
  custom1: 30,
};

const TRACKABLE = ['light2', 'light3', 'fan1', 'custom1'] as const;
type TrackableKey = typeof TRACKABLE[number];

/**
 * Get date string in IST timezone (YYYY-MM-DD)
 */
function getISTDateString(date: Date): string {
  const istDate = new Date(date.getTime() + IST_OFFSET_MS);
  const year = istDate.getUTCFullYear();
  const month = String(istDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(istDate.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Periodic Energy Accumulation — runs every 60 seconds
 * 
 * Background job that accumulates energy for all devices with channels currently ON.
 * Runs independent of any client connections, ensuring continuous accumulation 24/7.
 * 
 * Uses RTDB transactions to prevent race conditions with client-side OFF events.
 * 
 * CRITICAL: Transaction pattern extracts computed energy values from the transaction's
 * return value (committed snapshot), NOT from side-channel properties on ref objects.
 */
export const periodicEnergyAccumulation = onSchedule(
  {
    schedule: 'every 1 minutes',
    timeZone: 'Asia/Kolkata',
  },
  async (_event) => {
    const startTime = Date.now();
    logger.info('[periodicEnergy] Starting energy accumulation cycle');

    try {
      // Get all devices
      const devicesSnapshot = await rtdb.ref('devices').once('value');
      
      if (!devicesSnapshot.exists()) {
        logger.info('[periodicEnergy] No devices found');
        return;
      }

      const devices = devicesSnapshot.val();
      const deviceIds = Object.keys(devices);
      let processedDevices = 0;
      let channelsUpdated = 0;

      for (const deviceId of deviceIds) {
        try {
          const device = devices[deviceId];
          const onAt = device.onAt || {};
          
          // Check if any channels are currently ON
          const channelsOn = TRACKABLE.filter(key => onAt[key] > 0);
          
          if (channelsOn.length === 0) {
            continue; // Skip devices with no channels ON
          }

          processedDevices++;
          
          // Process energy accumulation for this device
          const updated = await accumulateEnergyForDevice(deviceId, channelsOn, device);
          channelsUpdated += updated;
          
        } catch (deviceError) {
          logger.error(`[periodicEnergy] Error processing device ${deviceId}:`, deviceError);
        }
      }

      const elapsed = Date.now() - startTime;
      logger.info(
        `[periodicEnergy] Completed: ${processedDevices} devices, ${channelsUpdated} channels updated in ${elapsed}ms`
      );
    } catch (error) {
      logger.error('[periodicEnergy] Fatal error:', error);
      throw error;
    }
  }
);

/**
 * Accumulate energy for a single device using atomic RTDB transactions.
 * Returns count of channels updated.
 * 
 * CORRECT PATTERN:
 * 1. Read current tick value BEFORE transaction (previousTickMs)
 * 2. Run transaction to atomically update tick timestamp
 * 3. Extract new timestamp from transaction's committed snapshot
 * 4. Calculate energy using previousTickMs (from step 1) and newTickMs (from step 3)
 * 
 * This avoids side-channel properties on ref objects and correctly handles transaction retries.
 */
async function accumulateEnergyForDevice(
  deviceId: string,
  channelsOn: readonly TrackableKey[],
  device: any
): Promise<number> {
  const now = Date.now();
  let channelsUpdated = 0;

  // Get current sense data (read-only reference data, outside transaction)
  const currentSense = device.currentSense || {};
  
  // Collect successful tick updates for batch energy calculation
  const tickUpdates: Array<{ channel: TrackableKey; previousMs: number; newMs: number }> = [];

  for (const channel of channelsOn) {
    const onAtMs = device.onAt?.[channel] || 0;
    if (onAtMs === 0) continue;

    try {
      const tickRef = rtdb.ref(`devices/${deviceId}/energyTick/${channel}`);
      
      // CORRECT PATTERN: Capture previous value via closure, NOT separate get()
      // The transaction callback may run multiple times on conflict — that's expected.
      // capturedPreviousMs will be overwritten each time, ending with the value from
      // the exact invocation that commits.
      let capturedPreviousMs: number | null = null;
      
      const transactionResult = await tickRef.transaction((currentValue: number | string | null) => {
        // Capture the current value at this moment (may be overwritten on retry)
        capturedPreviousMs = (typeof currentValue === 'number') ? currentValue : null;
        
        if (currentValue === null || currentValue === 'PROCESSED') {
          // Not yet initialized OR client already processed the previous OFF event.
          // 'PROCESSED' is a sentinel marker from client-side OFF to prevent double-counting.
          // Treat both as "first tick for this ON period" — initialize to now.
          // The caller already confirmed onAt[channel] > 0 before calling this function,
          // so these states mean "never ticked yet" or "previous cycle ended, new cycle starting."
          // Initialize the tick to now; capturedPreviousMs (null) will correctly fall back
          // to onAtMs below, so energy gets counted for [onAtMs → now] on this first cycle.
          return now;
        }

        // currentValue is a number (valid timestamp from previous tick)
        // Calculate elapsed time since last tick
        const elapsedMs = now - (currentValue as number);
        
        // Only update if at least 1 second has elapsed (prevent sub-second noise)
        if (elapsedMs < 1000) {
          return; // Abort this cycle only (too soon), not an OFF signal
        }

        // Update tick timestamp to now
        return now;
      });

      // Check if transaction committed
      if (!transactionResult.committed) {
        // Transaction aborted (channel OFF or elapsed < 1s) - skip this channel
        logger.debug(`[accumulateEnergy] Transaction aborted for ${channel} (device ${deviceId})`);
        continue;
      }

      // Safe to use capturedPreviousMs here — it reflects the value from the
      // exact invocation that committed, not a stale read from before transaction
      const baselineMs = capturedPreviousMs || onAtMs;
      const newTickMs = transactionResult.snapshot.val() as number;
      
      // CRITICAL: If we initialized from null (capturedPreviousMs === null), verify
      // the channel is still ON by re-checking onAt. If client turned OFF during our
      // transaction (race condition), onAt will now be cleared/null, and client already
      // calculated the energy. Skip to avoid double-counting.
      if (capturedPreviousMs === null) {
        const onAtRecheck = await rtdb.ref(`devices/${deviceId}/onAt/${channel}`).once('value');
        const currentOnAt = onAtRecheck.val() as number | null;
        
        if (!currentOnAt || currentOnAt === 0) {
          // Channel was turned OFF (client cleared onAt) — client already calculated energy
          logger.debug(`[accumulateEnergy] Channel ${channel} turned OFF during init, skipping (client handled)`);
          continue;
        }
      }
      
      tickUpdates.push({
        channel,
        previousMs: baselineMs,
        newMs: newTickMs,
      });
      
    } catch (error) {
      logger.error(`[accumulateEnergy] Channel ${channel} error:`, error);
    }
  }

  // Calculate total energy delta from all successful tick updates
  if (tickUpdates.length > 0) {
    let totalEnergyDelta = 0;
    
    for (const update of tickUpdates) {
      const elapsedHours = (update.newMs - update.previousMs) / 3_600_000;
      
      // Calculate energy for this period
      const currentField = `${update.channel}Current`;
      const actualCurrent = currentSense[currentField];
      
      let energyDelta = 0;
      if (actualCurrent && actualCurrent > 0.01 && actualCurrent < 15) {
        // Use actual measured current
        const powerW = NOMINAL_VOLTAGE * actualCurrent;
        energyDelta = (powerW / 1000) * elapsedHours;
      } else {
        // Fallback to placeholder wattage
        energyDelta = (WATT[update.channel] / 1000) * elapsedHours;
      }
      
      totalEnergyDelta += energyDelta;
      channelsUpdated++;
    }

    // Update energy in analytics (additive operation, safe outside transaction)
    if (totalEnergyDelta > 0) {
      const analyticsRef = rtdb.ref(`devices/${deviceId}/analytics`);
      const analyticsSnap = await analyticsRef.once('value');
      const analytics = analyticsSnap.val() || {};
      const prevEnergy = analytics.energyUsage || 0;

      await analyticsRef.update({
        energyUsage: prevEnergy + totalEnergyDelta,
      });

      // Flush to Firestore
      const today = getISTDateString(new Date());
      await flushToFirestore(deviceId, today, { 
        ...analytics, 
        energyUsage: prevEnergy + totalEnergyDelta 
      });
    }
  }

  return channelsUpdated;
}

/**
 * Flush current analytics to Firestore daily document
 */
async function flushToFirestore(
  deviceId: string,
  date: string,
  analytics: any
): Promise<void> {
  try {
    const docId = `${deviceId}_${date}`;
    const data: any = {
      deviceId,
      date,
      light2Runtime: analytics?.light2Runtime || 0,
      light3Runtime: analytics?.light3Runtime || 0,
      fan1Runtime: analytics?.fan1Runtime || 0,
      customRuntime: analytics?.customRuntime || 0,
      energyUsage: analytics?.energyUsage || 0,
      savedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await db.collection('device_analytics').doc(docId).set(data, { merge: true });
  } catch (error) {
    logger.warn(`[flushToFirestore] Failed for ${deviceId}:`, error);
  }
}

/**
 * Cleanup old analytics data — runs daily at 2 AM IST (8:30 PM UTC)
 * Keeps only the last 7 days (today + 6 previous days)
 */
export const cleanupOldAnalytics = onSchedule(
  {
    schedule: '30 20 * * *',
    timeZone: 'Asia/Kolkata',
  },
  async (_event) => {
    const now = new Date();
    const cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const cutoffDateStr = getISTDateString(cutoffDate);

    logger.info(`Starting analytics cleanup. Cutoff date: ${cutoffDateStr}`);

    try {
      const snapshot = await db.collection('device_analytics').get();
      
      const batch = db.batch();
      let deleteCount = 0;

      snapshot.docs.forEach(doc => {
        const docId = doc.id;
        const lastUnderscore = docId.lastIndexOf('_');
        
        if (lastUnderscore === -1) {
          logger.warn(`Invalid doc ID format: ${docId}`);
          return;
        }

        const dateStr = docId.substring(lastUnderscore + 1);
        
        if (dateStr < cutoffDateStr) {
          batch.delete(doc.ref);
          deleteCount++;
        }
      });

      if (deleteCount > 0) {
        await batch.commit();
        logger.info(`Successfully deleted ${deleteCount} old analytics documents`);
      } else {
        logger.info('No old analytics documents to delete');
      }
    } catch (error) {
      logger.error('Error cleaning up old analytics:', error);
      throw error;
    }
  }
);
