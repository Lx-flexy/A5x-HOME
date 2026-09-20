/**
 * Migration Data Check Script
 * Queries real Firebase data to determine if migration is needed
 */

import admin from 'firebase-admin';

// Firebase Admin SDK credentials from .env
const serviceAccount = {
  type: 'service_account',
  project_id: 'home-automation-a5x',
  private_key_id: '',
  private_key: Buffer.from('LS0tLS1CRUdJTiBQUklWQVRFIEtFWS0tLS0tCk1JSUV2d0lCQURBTkJna3Foa2lHOXcwQkFRRUZBQVNDQktrd2dnU2xBZ0VBQW9JQkFRQzRaYnhZMENPSHRucmcKOThXa2Z3RGVXU1dFVnBWaTZJQnNCYTJlOCtuSk5yLzJjRDVRU0R4a0FkZ2RWaTBzbzNrQklHS1NXYW0rVS9jdgpHR0ltKzdVL0pRVVNlL1htemNFaFdsaWRFUGFLKy9xRkpWeU5DNXpVck1makw5eldqTk1OYXlDK0lsY3gybnRFCm40VGl1ZlNOUllxdW9EeWxOS0ZCZjkxUGIvNHJXeGtha20vaG5EK3ZvbWdtQk9Rb01CTzdPRU9DOWNkS3BzM0sKcnZzWlUvTHVqdjRGVDBvMXZhazFjSXlzNTRsV2lBODk1YWZ3Tjlqd2NOMmQ3UnlZZXc2Mmowb0J4UUNJdmFhRwpMRHhSU0lINTJiUmNoai9HRytMdFNHOTdFVzBjdzV2ZGk5KzMzc200SGFuYXY4dEUzREdIajVjNG1TV0pvdmNyCnYwTEF0VURQQWdNQkFBRUNnZ0VBUERHTnNjcEVCdTNGSUFJUjVSaEdYczdvQmRMRDBqVkdrcnlweUEwa1lIZzgKWXNTU090L1J3dTJ0TUNwczlianBhN280STBFY3ZaSW9TeG5oRkl1dlIwMGM0a05QNnNkNHg1djMrRkhNd1dMdgpEUjY4bnhoTzJrZ0t1amxxRkNtRlRjaU9PREw2bHI0VTVqcFNoVGFodzZvVFV0emczeWNXaXN5a0lHWFZLUzUxCjdzeHkxVFJBL25RaERTVS8rN3FHQlhicEZJamVOWVFxdi8rRExBaXl4YVBuUlR5cVE1QWxtRkt2V1UwbVZFcFcKQXRaZnpJdWpHU3l4bWlqbmNmTGRPTGlIUXpGRlZDM2NSeENmMnJUT0g1K0xIS29XRnRGdzY1N3dkM1pzdC9aSApkUjU5U1pCZE5xV0tOTHQrVW9naEVLN1RMeVpzcU15TXNQOC9vRFFpT1FLQmdRRHJUZ0U2VTc3M2VTZXQ4azk3ClNIU21kdnlUdTVHcmpRR0lxS3l4c0d6WmpJZmVKQUFmM2FadFp4WExlUC95WEtqV1F4UmdUeCtOYkhXZkNWYmEKaC9NemtoemxxS1Q5d2dZdEVZUkRwaEsxYlJwWHkzK1BVeCtDODJwNlJDM3lzQlRYRGIwVTM0MFZ5cDMwTGNhdApMaWRzNkhNTUxHSWYwV3Q1TUl2SVlBc25lUUtCZ1FESW5ZZUF4Q1h6Wkw3VlRXRHRKN2NNMTdaSHhOUzFOeURpClhJYll5M250YUt4SXAwZVl4QlROZGF0VldGa080LzFjcVRvYng2Z3JZMitLaUM4UTJ1bUZ4S1JjL2dON3FPKzQKNmVKN04zVnM5VkFHVjFpdldYTVNQNTYzRmpqV1djT2FYbUZjczNTT3BaRVRFQ0tTN3Mrc1NsZ0k4M0FBZm1BWgpoaVhlOWVMd2h3S0JnUUM3cktDZ0U5RjVjb0ZxWkp4dU9QRUpJRmY5d0puRDJSaERGajEvRDdjUm9OdHhHd2VhCll0L3QzRTF1MTFoVXh3REd2QVBSZU9veWt6SVJJWkxMZzZrL0ZhZkVxTWpIdUd2U29Hajh4OFdlUEtISktuN1kKSXJVOGJjY2NNNnJ1S1BER1FhZndzUWpITzY3VjVYalVBYjdpUjFnVGVvYmMxOXcvY2EvYnBuYmZDUUtCZ1FDYQpXbG4vZ091U01WbUMxRjVYR2MrRldoTXRkUXdUd2E3VGUwMWxVR2tuZVBuVmpKOVJzc3d1cVBLQ1g4OWwzWlQ2CnpsbWZOaWIxK3pPKzZya0x4dU1Wd1E2VlhmdGdFY01nQ3hQdXFlVDNTR2VoK1dLS3g4LzVvbW1EaE4yR1R0cG8KMDJVbDVnMHdFOE5qWDI2NmpuUEtwQWpJR2tWNm04Rms0Z29SV2k2WjBRS0JnUUNDM2xkK3phU0dlakhLTTZVVAp0ZXVSK1R4R3FwbnZYNGNiWnpBTmZGSkUyL3hpbXNJeFhCWjBlcDVLcEx2NVN4UkZSTUx0aVVCVFlKNHpGSWJaCmovWVJ6TmorV2tHQTRCVHBaV0tHeWUyOXcxZ0RrSDdPdlpRRVRqRlpQT1JTSHRNdXhFSlRpWEhFRFBucVl0N0wKYlczdUNjbHJTNTBHVExKSFlZdmRxREYwMnc9PQotLS0tLUVORCBQUklWQVRFIEtFWS0tLS0tCg==', 'base64').toString('utf8'),
  client_email: 'firebase-adminsdk-fbsvc@home-automation-a5x.iam.gserviceaccount.com',
  client_id: '',
  auth_uri: 'https://accounts.google.com/o/oauth2/auth',
  token_uri: 'https://oauth2.googleapis.com/token',
  auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://home-automation-a5x-default-rtdb.asia-southeast1.firebasedatabase.app',
});

const rtdb = admin.database();
const firestore = admin.firestore();

const DEVICE_ID = 'A5X-HA-2847';

async function checkRTDBData() {
  console.log('\n=== RTDB DATA CHECK ===\n');

  const basePath = `devices/${DEVICE_ID}`;
  
  // Check outputs
  const outputsRef = rtdb.ref(`${basePath}/outputs`);
  const outputsSnap = await outputsRef.once('value');
  const outputs = outputsSnap.val();
  console.log('outputs/:', outputs);
  
  // Check metadata/outputs
  const metadataRef = rtdb.ref(`${basePath}/metadata/outputs`);
  const metadataSnap = await metadataRef.once('value');
  const metadata = metadataSnap.val();
  console.log('\nmetadata/outputs/:', metadata);
  
  // Check analytics
  const analyticsRef = rtdb.ref(`${basePath}/analytics`);
  const analyticsSnap = await analyticsRef.once('value');
  const analytics = analyticsSnap.val();
  console.log('\nanalytics/:', analytics);
  
  // Check onAt
  const onAtRef = rtdb.ref(`${basePath}/onAt`);
  const onAtSnap = await onAtRef.once('value');
  const onAt = onAtSnap.val();
  console.log('\nonAt/:', onAt);
  
  // Check energyTick
  const energyTickRef = rtdb.ref(`${basePath}/energyTick`);
  const energyTickSnap = await energyTickRef.once('value');
  const energyTick = energyTickSnap.val();
  console.log('\nenergyTick/:', energyTick);
  
  // Check currentSense
  const currentSenseRef = rtdb.ref(`${basePath}/currentSense`);
  const currentSenseSnap = await currentSenseRef.once('value');
  const currentSense = currentSenseSnap.val();
  console.log('\ncurrentSense/:', currentSense);
  
  return {
    hasOutputs: outputs && Object.keys(outputs).some(k => ['light2', 'light3', 'fan1', 'custom1'].includes(k)),
    hasMetadata: metadata && Object.keys(metadata).some(k => ['light2', 'light3', 'fan1', 'custom1'].includes(k)),
    hasAnalytics: analytics && (analytics.light2Runtime !== undefined || analytics.light3Runtime !== undefined || analytics.fan1Runtime !== undefined || analytics.customRuntime !== undefined),
    hasOnAt: onAt && Object.keys(onAt).some(k => ['light2', 'light3', 'fan1', 'custom1'].includes(k)),
    hasEnergyTick: energyTick && Object.keys(energyTick).some(k => ['light2', 'light3', 'fan1', 'custom1'].includes(k)),
    hasCurrentSense: currentSense && (currentSense.light2Current !== undefined || currentSense.light3Current !== undefined || currentSense.fan1Current !== undefined || currentSense.customCurrent !== undefined),
  };
}

async function checkFirestoreAnalytics() {
  console.log('\n\n=== FIRESTORE device_analytics CHECK ===\n');
  
  const analyticsCollection = firestore.collection('device_analytics');
  const querySnapshot = await analyticsCollection
    .where('deviceId', '==', DEVICE_ID)
    .get();
  
  console.log(`Found ${querySnapshot.size} analytics documents for ${DEVICE_ID}`);
  
  if (querySnapshot.size > 0) {
    console.log('\nSample documents:');
    querySnapshot.docs.slice(0, 3).forEach(doc => {
      console.log(`\n${doc.id}:`, doc.data());
    });
  }
  
  return querySnapshot.size;
}

async function checkActivityLogs() {
  console.log('\n\n=== FIRESTORE activity_logs CHECK ===\n');
  
  const logsCollection = firestore.collection('activity_logs');
  
  // Check for old keys in outputId
  const oldKeys = ['light2', 'light3', 'fan1', 'custom1'];
  let totalCount = 0;
  
  for (const key of oldKeys) {
    const querySnapshot = await logsCollection
      .where('outputId', '==', key)
      .limit(5)
      .get();
    
    if (querySnapshot.size > 0) {
      console.log(`\nFound ${querySnapshot.size}+ logs with outputId="${key}"`);
      totalCount += querySnapshot.size;
    }
  }
  
  if (totalCount === 0) {
    console.log('No activity logs found with old outputId keys');
  } else {
    console.log(`\nTotal activity logs with old keys (sample): ${totalCount}+`);
  }
  
  return totalCount;
}

async function main() {
  console.log(`\n${'='.repeat(60)}`);
  console.log('MIGRATION DATA CHECK FOR DEVICE:', DEVICE_ID);
  console.log(`${'='.repeat(60)}`);
  
  try {
    // 1. Check RTDB
    const rtdbStatus = await checkRTDBData();
    
    // 2. Check Firestore analytics
    const analyticsCount = await checkFirestoreAnalytics();
    
    // 3. Check activity logs
    const activityLogsCount = await checkActivityLogs();
    
    // Summary
    console.log(`\n\n${'='.repeat(60)}`);
    console.log('MIGRATION SUMMARY');
    console.log(`${'='.repeat(60)}`);
    console.log('\nRTDB Status:');
    console.log(`  - outputs/        : ${rtdbStatus.hasOutputs ? 'HAS OLD KEYS' : 'No old keys'}`);
    console.log(`  - metadata/outputs: ${rtdbStatus.hasMetadata ? 'HAS OLD KEYS' : 'No old keys'}`);
    console.log(`  - analytics/      : ${rtdbStatus.hasAnalytics ? 'HAS OLD KEYS' : 'No old keys'}`);
    console.log(`  - onAt/           : ${rtdbStatus.hasOnAt ? 'HAS OLD KEYS' : 'No old keys'}`);
    console.log(`  - energyTick/     : ${rtdbStatus.hasEnergyTick ? 'HAS OLD KEYS' : 'No old keys'}`);
    console.log(`  - currentSense/   : ${rtdbStatus.hasCurrentSense ? 'HAS OLD KEYS' : 'No old keys'}`);
    
    console.log(`\nFirestore device_analytics: ${analyticsCount} documents`);
    console.log(`Firestore activity_logs:    ${activityLogsCount > 0 ? `${activityLogsCount}+ documents` : '0 documents'}`);
    
    console.log('\n' + '='.repeat(60));
    
    const needsMigration = 
      rtdbStatus.hasOutputs || 
      rtdbStatus.hasMetadata || 
      rtdbStatus.hasAnalytics ||
      rtdbStatus.hasOnAt ||
      rtdbStatus.hasEnergyTick ||
      rtdbStatus.hasCurrentSense ||
      analyticsCount > 0 ||
      activityLogsCount > 0;
    
    if (needsMigration) {
      console.log('\n✅ MIGRATION REQUIRED — Device has data under old keys');
    } else {
      console.log('\n❌ NO MIGRATION NEEDED — No data found under old keys');
    }
    console.log('\n' + '='.repeat(60) + '\n');
    
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error(error);
  } finally {
    process.exit(0);
  }
}

main();
