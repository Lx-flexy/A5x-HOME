import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getDatabase } from 'firebase-admin/database';

/**
 * Firebase Admin SDK configuration for Google Home API backend.
 * Uses service account credentials stored in Vercel environment variables.
 * 
 * Required environment variables:
 * - FIREBASE_ADMIN_PROJECT_ID
 * - FIREBASE_ADMIN_CLIENT_EMAIL  
 * - FIREBASE_ADMIN_PRIVATE_KEY (base64 encoded)
 * - FIREBASE_DATABASE_URL
 */

let adminApp = null;

function getAdminApp() {
  if (adminApp) return adminApp;

  // Check if already initialized (Vercel serverless functions can be reused)
  const existingApps = getApps();
  if (existingApps.length > 0) {
    adminApp = existingApps[0];
    return adminApp;
  }

  // Validate required environment variables
  const requiredEnvVars = [
    'FIREBASE_ADMIN_PROJECT_ID',
    'FIREBASE_ADMIN_CLIENT_EMAIL', 
    'FIREBASE_ADMIN_PRIVATE_KEY',
    'FIREBASE_DATABASE_URL'
  ];

  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      throw new Error(`Missing required environment variable: ${envVar}`);
    }
  }

  try {
    // Parse private key with robust handling for different storage formats
    let privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
    
    // Handle base64-encoded keys (if stored that way)
    // Check if it looks like base64 (no PEM headers and valid base64 chars)
    if (!privateKey.includes('BEGIN PRIVATE KEY') && /^[A-Za-z0-9+/=]+$/.test(privateKey)) {
      try {
        privateKey = Buffer.from(privateKey, 'base64').toString('utf8');
      } catch (decodeError) {
        console.error('[Firebase Admin] Base64 decode failed, using raw value');
      }
    }
    
    // Handle escaped newlines (\\n stored as literal string in env vars)
    // This is common in Vercel and other platforms
    privateKey = privateKey.replace(/\\n/g, '\n');
    
    // Validate PEM format
    if (!privateKey.includes('BEGIN PRIVATE KEY')) {
      console.error('[Firebase Admin] Private key does not contain PEM header');
      throw new Error('Invalid private key format: missing PEM header');
    }
    
    adminApp = initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: privateKey,
      }),
      databaseURL: process.env.FIREBASE_DATABASE_URL,
    });

    console.log('[Firebase Admin] Successfully initialized');
    return adminApp;
  } catch (error) {
    console.error('[Firebase Admin] Initialization failed:', error.message);
    if (error.message.includes('PEM')) {
      console.error('[Firebase Admin] Hint: Ensure FIREBASE_ADMIN_PRIVATE_KEY contains proper PEM format with \\n for newlines');
    }
    throw new Error('Failed to initialize Firebase Admin SDK: ' + error.message);
  }
}

// Export initialized services
export function getAdminAuth() {
  return getAuth(getAdminApp());
}

export function getAdminFirestore() {
  return getFirestore(getAdminApp());
}

export function getAdminDatabase() {
  return getDatabase(getAdminApp());
}

/**
 * Verify Firebase Auth ID token and return user UID
 */
export async function verifyAuthToken(idToken) {
  try {
    const decodedToken = await getAdminAuth().verifyIdToken(idToken);
    return decodedToken.uid;
  } catch (error) {
    console.error('[Firebase Admin] Token verification failed:', error);
    throw new Error('Invalid or expired authentication token');
  }
}

/**
 * Get user data from Firestore using UID
 */
export async function getUserByUid(uid) {
  try {
    const userDoc = await getAdminFirestore().collection('users').doc(uid).get();
    if (!userDoc.exists) {
      throw new Error('User not found');
    }
    return { uid, ...userDoc.data() };
  } catch (error) {
    console.error('[Firebase Admin] Get user failed:', error);
    throw new Error('Failed to retrieve user data');
  }
}

/**
 * Get devices owned by or shared with a user
 * @param {string} uid - Firebase Auth UID (NOT A5X userId)
 */
export async function getUserDevices(uid) {
  try {
    const firestore = getAdminFirestore();
    
    // Get owned devices (ownerId is the Firebase UID)
    const ownedQuery = firestore.collection('devices_meta')
      .where('ownerId', '==', uid)
      .orderBy('createdAt', 'desc');
    
    const ownedSnapshot = await ownedQuery.get();
    const ownedDevices = ownedSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Get shared devices via members collection
    const membersQuery = firestore.collection('members')
      .where('uid', '==', uid);
    
    const membersSnapshot = await membersQuery.get();
    const sharedDeviceIds = membersSnapshot.docs
      .map(doc => doc.data().deviceId)
      .filter(Boolean);
    
    let sharedDevices = [];
    if (sharedDeviceIds.length > 0) {
      // Batch shared device queries (Firestore 'in' limit is 30)
      const chunks = [];
      for (let i = 0; i < sharedDeviceIds.length; i += 30) {
        chunks.push(sharedDeviceIds.slice(i, i + 30));
      }
      
      for (const chunk of chunks) {
        const sharedQuery = firestore.collection('devices_meta')
          .where('deviceId', 'in', chunk);
        const sharedSnapshot = await sharedQuery.get();
        sharedSnapshot.docs.forEach(doc => {
          const deviceData = { id: doc.id, ...doc.data() };
          // Exclude devices already owned by this user
          if (deviceData.ownerId !== uid) {
            sharedDevices.push(deviceData);
          }
        });
      }
    }
    
    // Return merged list (owned devices first)
    return [...ownedDevices, ...sharedDevices];
  } catch (error) {
    console.error('[Firebase Admin] Get user devices failed:', error);
    throw new Error('Failed to retrieve user devices');
  }
}

/**
 * Get real-time device state from RTDB
 */
export async function getDeviceState(deviceId) {
  try {
    const database = getAdminDatabase();
    const snapshot = await database.ref(`devices/${deviceId}/outputs`).get();
    
    if (!snapshot.exists()) {
      // Return default state if device not found in RTDB
      return {
        light1: false,
        light2: false, 
        light3: false,
        fan1: false,
        fan2: false,
        custom1: false,
        oledMessage: '',
        buzzer: false
      };
    }
    
    return snapshot.val();
  } catch (error) {
    console.error('[Firebase Admin] Get device state failed:', error);
    throw new Error('Failed to retrieve device state');
  }
}

/**
 * Update device state in RTDB
 */
export async function updateDeviceState(deviceId, updates) {
  try {
    const database = getAdminDatabase();
    await database.ref(`devices/${deviceId}/outputs`).update(updates);
  } catch (error) {
    console.error('[Firebase Admin] Update device state failed:', error);
    throw new Error('Failed to update device state');
  }
}

/**
 * Verify user has access to a device (owns it or is a member)
 * @param {string} uid - Firebase Auth UID (NOT A5X userId)
 * @param {string} deviceId - A5X device ID (e.g. "A5X-HA-2647")
 */
export async function verifyDeviceAccess(uid, deviceId) {
  try {
    const devices = await getUserDevices(uid);
    return devices.some(device => device.deviceId === deviceId);
  } catch (error) {
    console.error('[Firebase Admin] Verify device access failed:', error);
    return false;
  }
}