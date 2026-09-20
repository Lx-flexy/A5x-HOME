/**
 * Firestore Check using Admin SDK
 * Run: node check-firestore-admin.js
 */

import admin from 'firebase-admin';
import { readFileSync } from 'fs';

// Try to load service account key
let serviceAccount;
try {
  serviceAccount = JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'));
} catch (err) {
  console.error('❌ serviceAccountKey.json not found. Creating from environment variables...\n');
  
  // Construct from .env FIREBASE_ADMIN_* variables
  import('dotenv').then(dotenv => {
    dotenv.config({ path: '.env' });
    
    serviceAccount = {
      type: 'service_account',
      project_id: process.env.FIREBASE_ADMIN_PROJECT_ID,
      private_key: Buffer.from(process.env.FIREBASE_ADMIN_PRIVATE_KEY, 'base64').toString('utf8'),
      client_email: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    };
    
    runCheck();
  });
}

if (serviceAccount) {
  runCheck();
}

async function runCheck() {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL || 'https://home-automation-a5x-default-rtdb.asia-southeast1.firebasedatabase.app'
  });

  const db = admin.firestore();

  console.log('\n=== FIRESTORE DATA CHECK (Admin SDK) ===\n');

  // Check device_analytics
  console.log('7️⃣  FIRESTORE: device_analytics/\n');
  
  const deviceIds = ['A5X-HA-2847', 'A5X-HA-XXXX'];
  
  for (const deviceId of deviceIds) {
    console.log(`   Device: ${deviceId}`);
    
    try {
      const analyticsQuery = await db.collection('device_analytics')
        .where('deviceId', '==', deviceId)
        .get();
      
      console.log(`   Total documents: ${analyticsQuery.size}`);
      
      if (analyticsQuery.size > 0) {
        const sampleDoc = analyticsQuery.docs[0].data();
        console.log(`   Sample document (${analyticsQuery.docs[0].id}):`);
        console.log(`      - date: ${sampleDoc.date}`);
        
        const oldRuntimeKeys = ['light2Runtime', 'light3Runtime', 'fan1Runtime', 'customRuntime'];
        const newRuntimeKeys = ['x2Runtime', 'x3Runtime', 'x4Runtime', 'x6Runtime'];
        
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
      }
      console.log('');
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}\n`);
    }
  }

  // Check activity_logs
  console.log('8️⃣  FIRESTORE: activity_logs/\n');
  
  try {
    const oldOutputIds = ['light2', 'light3', 'fan1', 'custom1'];
    
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
    
    // Check for new outputId values
    const newOutputIds = ['x2', 'x3', 'x4', 'x6'];
    const newLogsQuery = await db.collection('activity_logs')
      .where('outputId', 'in', newOutputIds)
      .limit(10)
      .get();
    
    console.log(`   Documents with new outputId values: ${newLogsQuery.size}\n`);
    
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}\n`);
  }

  console.log('=== CHECK COMPLETE ===\n');
  process.exit(0);
}
