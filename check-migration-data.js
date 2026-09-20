/**
 * Real Data Check Script
 * Queries actual Firebase RTDB and Firestore to determine migration needs
 */

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://home-automation-a5x-default-rtdb.firebaseio.com'
});

const rtdb = admin.database();
const db = admin.firestore();

async function checkMigrationData() {
  console.log('\n=== FIREBASE MIGRATION DATA CHECK ===\n');

  try {
    // Get all device IDs first
    console.log('📦 Fetching all devices...');
    const devicesSnap = await rtdb.ref('devices').once('value');
    
    if (!devicesSnap.exists()) {
      console.log('❌ No devices found in RTDB');
      return;
    }

    const devices = devicesSnap.val();
    const deviceIds = Object.keys(devices);
    console.log(`✅ Found ${deviceIds.length} device(s): ${deviceIds.join(', ')}\n`);

    // Check each device
    for (const deviceId of deviceIds) {
      console.log(`\n━━━ DEVICE: ${deviceId} ━━━\n`);
      await checkDevice(deviceId, devices[deviceId]);
    }

    // Check Firestore activity_logs
    console.log('\n━━━ FIRESTORE: activity_logs ━━━\n');
    await checkActivityLogs();

    console.log('\n=== CHECK COMPLETE ===\n');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error during check:', error);
    process.exit(1);
  }
}

async function checkDevice(deviceId, deviceData) {
  const oldKeys = ['light2', 'light3', 'fan1', 'custom1'];
  const newKeys = ['x2', 'x3', 'x4', 'x6'];

  // 1. Check outputs/
  console.log('1️⃣  RTDB: outputs/');
  const outputs = deviceData.outputs || {};
  const hasOldOutputs = oldKeys.some(k => outputs[k] !== undefined);
  const hasNewOutputs = newKeys.some(k => outputs[k] !== undefined);
  
  console.log(`   Old keys (light2/light3/fan1/custom1): ${hasOldOutputs ? '✅ EXISTS' : '❌ NONE'}`);
  if (hasOldOutputs) {
    oldKeys.forEach(k => {
      if (outputs[k] !== undefined) {
        console.log(`      - ${k}: ${outputs[k]}`);
      }
    });
  }
  console.log(`   New keys (x2/x3/x4/x6): ${hasNewOutputs ? '✅ EXISTS' : '❌ NONE'}`);
  if (hasNewOutputs) {
    newKeys.forEach(k => {
      if (outputs[k] !== undefined) {
        console.log(`      - ${k}: ${outputs[k]}`);
      }
    });
  }

  // 2. Check metadata/outputs/
  console.log('\n2️⃣  RTDB: metadata/outputs/');
  const metadata = deviceData.metadata?.outputs || {};
  const hasOldMetadata = oldKeys.some(k => metadata[k] !== undefined);
  const hasNewMetadata = newKeys.some(k => metadata[k] !== undefined);
  
  console.log(`   Old keys: ${hasOldMetadata ? '✅ EXISTS' : '❌ NONE'}`);
  if (hasOldMetadata) {
    oldKeys.forEach(k => {
      if (metadata[k]) {
        console.log(`      - ${k}: ${JSON.stringify(metadata[k])}`);
      }
    });
  }
  console.log(`   New keys: ${hasNewMetadata ? '✅ EXISTS' : '❌ NONE'}`);

  // 3. Check analytics/
  console.log('\n3️⃣  RTDB: analytics/');
  const analytics = deviceData.analytics || {};
  const oldRuntimeKeys = ['light2Runtime', 'light3Runtime', 'fan1Runtime', 'customRuntime'];
  const newRuntimeKeys = ['x2Runtime', 'x3Runtime', 'x4Runtime', 'x6Runtime'];
  const hasOldAnalytics = oldRuntimeKeys.some(k => analytics[k] !== undefined);
  const hasNewAnalytics = newRuntimeKeys.some(k => analytics[k] !== undefined);
  
  console.log(`   Old keys: ${hasOldAnalytics ? '✅ EXISTS' : '❌ NONE'}`);
  if (hasOldAnalytics) {
    oldRuntimeKeys.forEach(k => {
      if (analytics[k] !== undefined) {
        console.log(`      - ${k}: ${analytics[k]}`);
      }
    });
  }
  console.log(`   New keys: ${hasNewAnalytics ? '✅ EXISTS' : '❌ NONE'}`);

  // 4. Check onAt/
  console.log('\n4️⃣  RTDB: onAt/');
  const onAt = deviceData.onAt || {};
  const hasOldOnAt = oldKeys.some(k => onAt[k] !== undefined);
  const hasNewOnAt = newKeys.some(k => onAt[k] !== undefined);
  
  console.log(`   Old keys: ${hasOldOnAt ? '✅ EXISTS' : '❌ NONE'}`);
  if (hasOldOnAt) {
    oldKeys.forEach(k => {
      if (onAt[k] !== undefined) {
        console.log(`      - ${k}: ${onAt[k]}`);
      }
    });
  }
  console.log(`   New keys: ${hasNewOnAt ? '✅ EXISTS' : '❌ NONE'}`);

  // 5. Check energyTick/
  console.log('\n5️⃣  RTDB: energyTick/');
  const energyTick = deviceData.energyTick || {};
  const hasOldTick = oldKeys.some(k => energyTick[k] !== undefined);
  const hasNewTick = newKeys.some(k => energyTick[k] !== undefined);
  
  console.log(`   Old keys: ${hasOldTick ? '✅ EXISTS' : '❌ NONE'}`);
  if (hasOldTick) {
    oldKeys.forEach(k => {
      if (energyTick[k] !== undefined) {
        console.log(`      - ${k}: ${energyTick[k]}`);
      }
    });
  }
  console.log(`   New keys: ${hasNewTick ? '✅ EXISTS' : '❌ NONE'}`);

  // 6. Check currentSense/
  console.log('\n6️⃣  RTDB: currentSense/');
  const currentSense = deviceData.currentSense || {};
  const oldCurrentKeys = ['light2Current', 'light3Current', 'fan1Current', 'customCurrent',
                          'light2Mismatch', 'light3Mismatch', 'fan1Mismatch', 'customMismatch'];
  const newCurrentKeys = ['x2Current', 'x3Current', 'x4Current', 'x6Current',
                          'x2Mismatch', 'x3Mismatch', 'x4Mismatch', 'x6Mismatch'];
  const hasOldCurrent = oldCurrentKeys.some(k => currentSense[k] !== undefined);
  const hasNewCurrent = newCurrentKeys.some(k => currentSense[k] !== undefined);
  
  console.log(`   Old keys: ${hasOldCurrent ? '✅ EXISTS' : '❌ NONE'}`);
  if (hasOldCurrent) {
    oldCurrentKeys.forEach(k => {
      if (currentSense[k] !== undefined) {
        console.log(`      - ${k}: ${currentSense[k]}`);
      }
    });
  }
  console.log(`   New keys: ${hasNewCurrent ? '✅ EXISTS' : '❌ NONE'}`);

  // 7. Check Firestore device_analytics
  console.log('\n7️⃣  FIRESTORE: device_analytics/');
  try {
    const analyticsQuery = await db.collection('device_analytics')
      .where('deviceId', '==', deviceId)
      .get();
    
    console.log(`   Total documents: ${analyticsQuery.size}`);
    
    if (analyticsQuery.size > 0) {
      // Check first document for field structure
      const sampleDoc = analyticsQuery.docs[0].data();
      console.log(`   Sample document (${analyticsQuery.docs[0].id}):`);
      console.log(`      - date: ${sampleDoc.date}`);
      
      const hasOldFields = oldRuntimeKeys.some(k => sampleDoc[k] !== undefined);
      const hasNewFields = newRuntimeKeys.some(k => sampleDoc[k] !== undefined);
      
      console.log(`      - Old runtime fields: ${hasOldFields ? '✅ EXISTS' : '❌ NONE'}`);
      if (hasOldFields) {
        oldRuntimeKeys.forEach(k => {
          if (sampleDoc[k] !== undefined) {
            console.log(`         • ${k}: ${sampleDoc[k]}`);
          }
        });
      }
      
      console.log(`      - New runtime fields: ${hasNewFields ? '✅ EXISTS' : '❌ NONE'}`);
      if (hasNewFields) {
        newRuntimeKeys.forEach(k => {
          if (sampleDoc[k] !== undefined) {
            console.log(`         • ${k}: ${sampleDoc[k]}`);
          }
        });
      }
    }
  } catch (error) {
    console.log(`   ❌ Error querying Firestore: ${error.message}`);
  }
}

async function checkActivityLogs() {
  try {
    const oldOutputIds = ['light2', 'light3', 'fan1', 'custom1'];
    
    // Query for documents with old outputId values
    const logsQuery = await db.collection('activity_logs')
      .where('outputId', 'in', oldOutputIds)
      .limit(100)
      .get();
    
    console.log(`   Documents with old outputId values: ${logsQuery.size}`);
    
    if (logsQuery.size > 0) {
      console.log('   Sample entries:');
      logsQuery.docs.slice(0, 5).forEach(doc => {
        const data = doc.data();
        console.log(`      - ${doc.id}: outputId="${data.outputId}", action="${data.action}"`);
      });
      
      if (logsQuery.size === 100) {
        console.log('   ⚠️  Showing first 100, there may be more...');
      }
    }
    
    // Also check for new outputId values
    const newOutputIds = ['x2', 'x3', 'x4', 'x6'];
    const newLogsQuery = await db.collection('activity_logs')
      .where('outputId', 'in', newOutputIds)
      .limit(10)
      .get();
    
    console.log(`   Documents with new outputId values: ${newLogsQuery.size}`);
    
  } catch (error) {
    console.log(`   ❌ Error querying activity_logs: ${error.message}`);
  }
}

// Run the check
checkMigrationData();
