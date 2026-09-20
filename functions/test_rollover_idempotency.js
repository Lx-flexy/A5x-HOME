/**
 * Test rollover idempotency - run 3 times for same device/date
 * This test verifies that running rollover multiple times for the same date
 * does not cause duplicate writes or data corruption.
 */

const admin = require('firebase-admin');
const serviceAccount = require('./service-account-key.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://a5x-home-default-rtdb.asia-southeast1.firebasedatabase.app'
});

const rtdb = admin.database();
const db = admin.firestore();

const TRACKABLE = ['light2', 'light3', 'fan1', 'custom1'];
const IST_OFFSET_MS = 5.5 * 3_600_000;

function getISTDateString(date) {
  const istDate = new Date(date.getTime() + IST_OFFSET_MS);
  return istDate.toISOString().split('T')[0];
}

function getTodayMidnightMs() {
  const now = new Date(Date.now() + IST_OFFSET_MS);
  const midnightUTC = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    0, 0, 0, 0
  );
  return midnightUTC - IST_OFFSET_MS;
}

async function flushToFirestore(deviceId, date, analytics) {
  const docId = `${deviceId}_${date}`;
  const data = {
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
}

async function rolloverDeviceAnalytics(deviceId, targetDate) {
  // IDEMPOTENCY CHECK
  const currentDateSnap = await rtdb.ref(`devices/${deviceId}/analyticsDate`).once('value');
  const storedDate = currentDateSnap.val();
  
  if (storedDate === targetDate) {
    console.log(`  ✓ Already rolled to ${targetDate} - SKIPPED`);
    return { rolled: false, hadChannelsOn: false };
  }

  // Get current state
  const [analyticsSnap, onAtSnap, outputsSnap] = await Promise.all([
    rtdb.ref(`devices/${deviceId}/analytics`).once('value'),
    rtdb.ref(`devices/${deviceId}/onAt`).once('value'),
    rtdb.ref(`devices/${deviceId}/outputs`).once('value'),
  ]);

  const currentAnalytics = analyticsSnap.val() || {};
  const currentOnAt = onAtSnap.val() || {};
  const currentOutputs = outputsSnap.val() || {};

  const channelsOn = TRACKABLE.filter(key => currentOnAt[key] > 0 && currentOutputs[key] === true);
  const hadChannelsOn = channelsOn.length > 0;

  // STEP 1: Handle cross-midnight
  if (hadChannelsOn) {
    const midnight = getTodayMidnightMs();
    const crossMidnightRuntimes = {};

    for (const channel of channelsOn) {
      const onAtMs = currentOnAt[channel];
      
      if (onAtMs < midnight) {
        const elapsedHours = (midnight - onAtMs) / 3_600_000;
        
        if (elapsedHours > 0 && elapsedHours <= 24 && isFinite(elapsedHours)) {
          const field = channel === 'custom1' ? 'customRuntime' : `${channel}Runtime`;
          const currentValue = currentAnalytics[field] || 0;
          crossMidnightRuntimes[field] = Math.min(currentValue + elapsedHours, 24);
        }
      }
    }

    if (Object.keys(crossMidnightRuntimes).length > 0) {
      Object.assign(currentAnalytics, crossMidnightRuntimes);
    }
  }

  // STEP 2: Flush to Firestore
  if (storedDate) {
    const MAX_DAILY_HOURS = 24;
    const values = Object.values(currentAnalytics).filter(v => typeof v === 'number');
    const isCorrupted = values.some(v => v > MAX_DAILY_HOURS || v < 0 || !isFinite(v));
    const hasData = values.some(v => v > 0);
    
    if (hasData && !isCorrupted) {
      await flushToFirestore(deviceId, storedDate, currentAnalytics);
      console.log(`  ✓ Flushed ${storedDate} to Firestore`);
    }
  }

  // STEP 3: Reset analytics
  const analyticsRef = rtdb.ref(`devices/${deviceId}/analytics`);
  
  await analyticsRef.transaction((current) => {
    const preservedEnergy = current?.energyUsage || 0;
    
    return {
      light2Runtime: 0,
      light3Runtime: 0,
      fan1Runtime: 0,
      customRuntime: 0,
      energyUsage: preservedEnergy,
    };
  });

  // STEP 4: Update date marker
  await rtdb.ref(`devices/${deviceId}/analyticsDate`).set(targetDate);

  // STEP 5: Reset onAt for cross-midnight channels
  if (hadChannelsOn) {
    const midnight = getTodayMidnightMs();
    const onAtUpdates = {};

    for (const channel of channelsOn) {
      const onAtMs = currentOnAt[channel];
      
      if (onAtMs < midnight) {
        onAtUpdates[channel] = midnight;
      }
    }

    if (Object.keys(onAtUpdates).length > 0) {
      await rtdb.ref(`devices/${deviceId}/onAt`).update(onAtUpdates);
    }
  }

  console.log(`  ✓ Rolled from ${storedDate || 'null'} to ${targetDate}`);
  return { rolled: true, hadChannelsOn };
}

async function testIdempotency() {
  console.log('\n=== IDEMPOTENCY TEST ===\n');
  
  const testDeviceId = 'TEST_DEVICE_IDEMPOTENCY';
  const targetDate = getISTDateString(new Date());
  
  console.log(`Device: ${testDeviceId}`);
  console.log(`Target Date: ${targetDate}\n`);

  // Setup test device with data
  console.log('Setup: Creating test device with analytics data...');
  await rtdb.ref(`devices/${testDeviceId}`).set({
    analyticsDate: '2024-01-01',
    analytics: {
      light2Runtime: 5.5,
      light3Runtime: 3.2,
      fan1Runtime: 8.1,
      customRuntime: 2.3,
      energyUsage: 12.4,
    },
    onAt: {},
    outputs: {
      light2: false,
      light3: false,
      fan1: false,
      custom1: false,
    },
    status: 'online',
  });
  console.log('  ✓ Test device created\n');

  // Run rollover 3 times
  for (let i = 1; i <= 3; i++) {
    console.log(`--- Execution #${i} ---`);
    
    const beforeSnap = await rtdb.ref(`devices/${testDeviceId}`).once('value');
    const before = beforeSnap.val();
    
    console.log(`Before: analyticsDate="${before.analyticsDate}", light2Runtime=${before.analytics?.light2Runtime || 0}`);
    
    const result = await rolloverDeviceAnalytics(testDeviceId, targetDate);
    
    const afterSnap = await rtdb.ref(`devices/${testDeviceId}`).once('value');
    const after = afterSnap.val();
    
    console.log(`After:  analyticsDate="${after.analyticsDate}", light2Runtime=${after.analytics?.light2Runtime || 0}`);
    console.log(`Result: rolled=${result.rolled}, hadChannelsOn=${result.hadChannelsOn}\n`);
    
    // Verify data integrity
    if (i === 1) {
      if (!result.rolled) {
        console.error('❌ FAIL: First execution should have rolled over');
        process.exit(1);
      }
      if (after.analyticsDate !== targetDate) {
        console.error(`❌ FAIL: analyticsDate should be ${targetDate}, got ${after.analyticsDate}`);
        process.exit(1);
      }
      if (after.analytics.light2Runtime !== 0) {
        console.error(`❌ FAIL: light2Runtime should be 0, got ${after.analytics.light2Runtime}`);
        process.exit(1);
      }
    } else {
      if (result.rolled) {
        console.error(`❌ FAIL: Execution #${i} should have been skipped (already rolled)`);
        process.exit(1);
      }
      if (after.analytics.light2Runtime !== 0) {
        console.error(`❌ FAIL: light2Runtime changed after skip, got ${after.analytics.light2Runtime}`);
        process.exit(1);
      }
    }
  }

  console.log('=== ✅ IDEMPOTENCY TEST PASSED ===');
  console.log('First execution rolled over');
  console.log('Second and third executions correctly skipped');
  console.log('No data corruption detected\n');

  // Cleanup
  console.log('Cleanup: Removing test device...');
  await rtdb.ref(`devices/${testDeviceId}`).remove();
  await db.collection('device_analytics').doc(`${testDeviceId}_2024-01-01`).delete();
  console.log('  ✓ Cleanup complete\n');

  process.exit(0);
}

testIdempotency().catch(error => {
  console.error('❌ TEST FAILED:', error);
  process.exit(1);
});
