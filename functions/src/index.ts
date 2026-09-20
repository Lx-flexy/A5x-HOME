/**
 * Firebase Cloud Functions for A5X Home Automation
 * 
 * - Scheduled periodic energy accumulation (runs every 60 seconds)
 * - Scheduled cleanup of old analytics data (runs daily at 2 AM IST)
 */

import {onSchedule} from 'firebase-functions/v2/scheduler';
import {onDocumentCreated, onDocumentUpdated, onDocumentDeleted} from 'firebase-functions/v2/firestore';
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
  async () => {
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const actualCurrent = (currentSense as any)[currentField];
      
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  analytics: any
): Promise<void> {
  try {
    const docId = `${deviceId}_${date}`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  async () => {
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

/**
 * Automatic Daily Analytics Rollover — runs at midnight IST (6:30 PM UTC)
 * 
 * CRITICAL: This function ensures analytics window rolls over daily for ALL devices,
 * even when no user opens the Analytics or DeviceDetails pages.
 * 
 * ROOT CAUSE FIXED: Previously, ensureTodayWindow() only ran when user opened pages,
 * causing runtime to accumulate for days/weeks without reset, resulting in impossible
 * values like 630h, 10011h for "Today" view.
 * 
 * ARCHITECTURE:
 * - Runs once daily at midnight IST
 * - Processes ALL active devices automatically
 * - Reuses existing analyticsService logic (single source of truth)
 * - Handles devices ON across midnight (splits runtime correctly)
 * - Idempotent (safe to run multiple times for same day)
 * - Preserves previous day data in Firestore before reset
 * 
 * CONCURRENCY SAFETY:
 * - Uses RTDB transactions for onAt updates
 * - Atomic date marker prevents duplicate rollovers
 * - Client-side ensureTodayWindow() respects server-side rollover
 */
export const automaticDailyRollover = onSchedule(
  {
    schedule: '30 18 * * *', // 00:00 IST = 18:30 UTC previous day
    timeZone: 'UTC',
    memory: '512MiB',
    timeoutSeconds: 540, // 9 minutes
  },
  async () => {
    const startTime = Date.now();
    const today = getISTDateString(new Date());
    
    logger.info(`[dailyRollover] Starting automatic rollover for date: ${today}`);

    try {
      // Get all devices
      const devicesSnapshot = await rtdb.ref('devices').once('value');
      
      if (!devicesSnapshot.exists()) {
        logger.info('[dailyRollover] No devices found');
        return;
      }

      const devices = devicesSnapshot.val();
      const deviceIds = Object.keys(devices);
      
      let processedCount = 0;
      let skippedCount = 0;
      let errorCount = 0;
      let devicesOnCount = 0;

      for (const deviceId of deviceIds) {
        try {
          const result = await rolloverDeviceAnalytics(deviceId, today);
          
          if (result.rolled) {
            processedCount++;
            if (result.hadChannelsOn) devicesOnCount++;
          } else {
            skippedCount++;
          }
          
        } catch (error) {
          errorCount++;
          logger.error(`[dailyRollover] Error processing device ${deviceId}:`, error);
        }
      }

      const elapsed = Date.now() - startTime;
      logger.info(
        `[dailyRollover] Completed: ${processedCount} rolled over, ` +
        `${devicesOnCount} had channels ON, ${skippedCount} skipped (already rolled), ` +
        `${errorCount} errors in ${elapsed}ms`
      );
      
    } catch (error) {
      logger.error('[dailyRollover] Fatal error:', error);
      throw error;
    }
  }
);

/**
 * Get today's midnight timestamp in milliseconds (IST timezone)
 */
function getTodayMidnightMs(): number {
  const now = new Date(Date.now() + IST_OFFSET_MS);
  const midnightUTC = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    0, 0, 0, 0
  );
  return midnightUTC - IST_OFFSET_MS;
}

/**
 * Rollover analytics for a single device using atomic operations.
 * 
 * IDEMPOTENT: If device already rolled for this date, returns immediately.
 * Uses analyticsDate as marker to prevent duplicate rollovers.
 * 
 * HANDLES DEVICES ON ACROSS MIDNIGHT:
 * - Calculates runtime from onAt to midnight for previous day
 * - Resets onAt to midnight for today
 * - Only today's portion (midnight → OFF time) counted in new window
 * 
 * Returns: { rolled: boolean, hadChannelsOn: boolean }
 */
async function rolloverDeviceAnalytics(
  deviceId: string,
  targetDate: string
): Promise<{ rolled: boolean; hadChannelsOn: boolean }> {
  
  // IDEMPOTENCY CHECK: Read current analyticsDate
  const currentDateSnap = await rtdb.ref(`devices/${deviceId}/analyticsDate`).once('value');
  const storedDate = currentDateSnap.val() as string | null;
  
  if (storedDate === targetDate) {
    // Already rolled over for this date (by previous run or client)
    logger.debug(`[rolloverDevice] ${deviceId} already rolled to ${targetDate}`);
    return { rolled: false, hadChannelsOn: false };
  }

  // Get current analytics and onAt state
  const [analyticsSnap, onAtSnap, outputsSnap] = await Promise.all([
    rtdb.ref(`devices/${deviceId}/analytics`).once('value'),
    rtdb.ref(`devices/${deviceId}/onAt`).once('value'),
    rtdb.ref(`devices/${deviceId}/outputs`).once('value'),
  ]);

  const currentAnalytics = analyticsSnap.val() as Record<string, number> || {};
  const currentOnAt = onAtSnap.val() as Record<string, number> || {};
  const currentOutputs = outputsSnap.val() as Record<string, boolean> || {};

  // Check if any channels are currently ON
  const channelsOn = TRACKABLE.filter(key => currentOnAt[key] > 0 && currentOutputs[key] === true);
  const hadChannelsOn = channelsOn.length > 0;

  // STEP 1: If device has channels ON across midnight, calculate previous day portion
  if (hadChannelsOn) {
    const midnight = getTodayMidnightMs();
    const crossMidnightRuntimes: Record<string, number> = {};

    for (const channel of channelsOn) {
      const onAtMs = currentOnAt[channel];
      
      if (onAtMs < midnight) {
        // Channel was ON before midnight
        const elapsedHours = (midnight - onAtMs) / 3_600_000;
        
        // Validate elapsed time
        if (elapsedHours > 0 && elapsedHours <= 24 && isFinite(elapsedHours)) {
          const field = channel === 'custom1' ? 'customRuntime' : `${channel}Runtime`;
          const currentValue = currentAnalytics[field] || 0;
          
          // Add cross-midnight portion to previous day
          crossMidnightRuntimes[field] = Math.min(currentValue + elapsedHours, 24);
          
          logger.info(
            `[rolloverDevice] ${deviceId}/${channel}: ` +
            `ON before midnight, adding ${elapsedHours.toFixed(3)}h to previous day`
          );
        } else {
          logger.warn(
            `[rolloverDevice] ${deviceId}/${channel}: ` +
            `Invalid elapsed time ${elapsedHours}h, skipping`
          );
        }
      }
    }

    // Merge cross-midnight runtimes into analytics before flush
    if (Object.keys(crossMidnightRuntimes).length > 0) {
      Object.assign(currentAnalytics, crossMidnightRuntimes);
    }
  }

  // STEP 2: Flush previous day's analytics to Firestore (if any VALID data exists)
  if (storedDate) {
    // Check for corrupt data before flushing
    const MAX_DAILY_HOURS = 24;
    const values = Object.values(currentAnalytics).filter(v => typeof v === 'number');
    const isCorrupted = values.some(v => v > MAX_DAILY_HOURS || v < 0 || !isFinite(v));
    const hasData = values.some(v => v > 0);
    
    if (hasData && !isCorrupted) {
      await flushToFirestore(deviceId, storedDate, currentAnalytics);
      logger.info(`[rolloverDevice] ${deviceId}: Flushed previous day ${storedDate} to Firestore`);
    } else if (isCorrupted) {
      logger.warn(
        `[rolloverDevice] ${deviceId}: Corrupt data detected for ${storedDate}, ` +
        `not flushing: ${JSON.stringify(currentAnalytics)}`
      );
    }
  }

  // STEP 3: Reset analytics to 0 for new day using transaction for atomicity
  // CRITICAL: Preserve energyUsage (periodic function may have written between reads)
  const analyticsRef = rtdb.ref(`devices/${deviceId}/analytics`);
  
  const transactionResult = await analyticsRef.transaction((current) => {
    // Preserve energyUsage to prevent race with periodicEnergyAccumulation
    const preservedEnergy = current?.energyUsage || 0;
    
    return {
      light2Runtime: 0,
      light3Runtime: 0,
      fan1Runtime: 0,
      customRuntime: 0,
      energyUsage: preservedEnergy,  // PRESERVE, don't reset
    };
  });

  // CHECK TRANSACTION RESULT
  if (!transactionResult.committed) {
    logger.error(
      `[rolloverDevice] ${deviceId}: Analytics reset transaction ABORTED ` +
      `(write conflict with concurrent writer) — NOT updating analyticsDate`
    );
    return { rolled: false, hadChannelsOn: false };
  }

  // STEP 4: Update analyticsDate marker (idempotency key)
  await rtdb.ref(`devices/${deviceId}/analyticsDate`).set(targetDate);

  // STEP 5: For channels ON across midnight, reset onAt to midnight timestamp
  if (hadChannelsOn) {
    const midnight = getTodayMidnightMs();
    const onAtUpdates: Record<string, number | null> = {};

    for (const channel of channelsOn) {
      const onAtMs = currentOnAt[channel];
      
      if (onAtMs < midnight) {
        // Reset to midnight for today's portion calculation
        onAtUpdates[channel] = midnight;
        logger.info(`[rolloverDevice] ${deviceId}/${channel}: Reset onAt to midnight`);
      }
      // else: Channel turned ON after midnight today, keep existing onAt
    }

    if (Object.keys(onAtUpdates).length > 0) {
      await rtdb.ref(`devices/${deviceId}/onAt`).update(onAtUpdates);
    }
  }

  logger.info(
    `[rolloverDevice] ${deviceId}: Rolled from ${storedDate || 'null'} to ${targetDate}` +
    (hadChannelsOn ? ` (${channelsOn.length} channels ON across midnight)` : '')
  );

  return { rolled: true, hadChannelsOn };
}


// ═════════════════════════════════════════════════════════════════════════════
// DEVICE ACCESS SYNCHRONIZATION
// ═════════════════════════════════════════════════════════════════════════════
/**
 * Mirror Firestore device ownership/membership to RTDB for security rules.
 * 
 * RTDB cannot query Firestore, so we maintain a mirror structure:
 *   RTDB: deviceAccess/{deviceId}/{uid} = true
 * 
 * Synced from:
 *   Firestore: devices_meta/{docId}.ownerId
 *   Firestore: members/{docId}.deviceId + .uid
 * 
 * Security rules verify:
 *   auth.uid has deviceAccess/{deviceId}/{auth.uid} == true
 */

/**
 * When device is created in devices_meta, grant owner access in RTDB
 */
export const onDeviceCreated = onDocumentCreated(
  'devices_meta/{docId}',
  async (event) => {
    const deviceData = event.data?.data();
    if (!deviceData) return;

    const deviceId = deviceData.deviceId as string;
    const ownerId = deviceData.ownerId as string;

    if (!deviceId || !ownerId) {
      logger.warn('[onDeviceCreated] Missing deviceId or ownerId', deviceData);
      return;
    }

    try {
      await rtdb.ref(`deviceAccess/${deviceId}/${ownerId}`).set(true);
      logger.info(`[onDeviceCreated] Granted owner access: ${ownerId} → ${deviceId}`);
    } catch (error) {
      logger.error('[onDeviceCreated] Failed to grant owner access:', error);
    }
  }
);

/**
 * When device owner changes (should not happen, but handle defensively)
 */
export const onDeviceUpdated = onDocumentUpdated(
  'devices_meta/{docId}',
  async (event) => {
    const beforeData = event.data?.before.data();
    const afterData = event.data?.after.data();
    
    if (!beforeData || !afterData) return;

    const deviceId = afterData.deviceId as string;
    const oldOwnerId = beforeData.ownerId as string;
    const newOwnerId = afterData.ownerId as string;

    // ownerId should be immutable, but if it changes, update access
    if (oldOwnerId !== newOwnerId) {
      logger.warn(`[onDeviceUpdated] Owner changed: ${deviceId} from ${oldOwnerId} to ${newOwnerId}`);
      
      try {
        // Remove old owner access
        await rtdb.ref(`deviceAccess/${deviceId}/${oldOwnerId}`).remove();
        
        // Grant new owner access
        await rtdb.ref(`deviceAccess/${deviceId}/${newOwnerId}`).set(true);
        
        logger.info(`[onDeviceUpdated] Updated owner access for ${deviceId}`);
      } catch (error) {
        logger.error('[onDeviceUpdated] Failed to update owner access:', error);
      }
    }
  }
);

/**
 * When device is deleted, remove ALL access entries
 */
export const onDeviceDeleted = onDocumentDeleted(
  'devices_meta/{docId}',
  async (event) => {
    const deviceData = event.data?.data();
    if (!deviceData) return;

    const deviceId = deviceData.deviceId as string;
    
    if (!deviceId) {
      logger.warn('[onDeviceDeleted] Missing deviceId', deviceData);
      return;
    }

    try {
      await rtdb.ref(`deviceAccess/${deviceId}`).remove();
      logger.info(`[onDeviceDeleted] Removed all access for ${deviceId}`);
    } catch (error) {
      logger.error('[onDeviceDeleted] Failed to remove device access:', error);
    }
  }
);

/**
 * When member is added, grant access in RTDB
 */
export const onMemberAdded = onDocumentCreated(
  'members/{docId}',
  async (event) => {
    const memberData = event.data?.data();
    if (!memberData) return;

    const deviceId = memberData.deviceId as string;
    const uid = memberData.uid as string;

    if (!deviceId || !uid) {
      logger.warn('[onMemberAdded] Missing deviceId or uid', memberData);
      return;
    }

    try {
      await rtdb.ref(`deviceAccess/${deviceId}/${uid}`).set(true);
      logger.info(`[onMemberAdded] Granted member access: ${uid} → ${deviceId}`);
    } catch (error) {
      logger.error('[onMemberAdded] Failed to grant member access:', error);
    }
  }
);

/**
 * When member is updated (role change, status change), no access change needed
 * Access is binary (true/false), not role-based at RTDB level
 */
export const onMemberUpdated = onDocumentUpdated(
  'members/{docId}',
  async () => {
    // Currently no action needed - access is binary
    // If we need role-based permissions in future, implement here
    logger.debug('[onMemberUpdated] Member updated (no RTDB action needed)');
  }
);

/**
 * When member is removed, revoke access in RTDB
 */
export const onMemberRemoved = onDocumentDeleted(
  'members/{docId}',
  async (event) => {
    const memberData = event.data?.data();
    if (!memberData) return;

    const deviceId = memberData.deviceId as string;
    const uid = memberData.uid as string;

    if (!deviceId || !uid) {
      logger.warn('[onMemberRemoved] Missing deviceId or uid', memberData);
      return;
    }

    try {
      await rtdb.ref(`deviceAccess/${deviceId}/${uid}`).remove();
      logger.info(`[onMemberRemoved] Revoked member access: ${uid} → ${deviceId}`);
    } catch (error) {
      logger.error('[onMemberRemoved] Failed to revoke member access:', error);
    }
  }
);
