/**
 * Persistent token storage using Firebase Firestore
 * Replaces in-memory Map() to work correctly on Vercel serverless
 */

import { getAdminFirestore } from './firebaseAdmin.js';
import crypto from 'crypto';

// Token expiration times
export const AUTH_CODE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
export const ACCESS_TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour
export const REFRESH_TOKEN_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// Firestore collections
const AUTH_CODES_COLLECTION = 'oauth_auth_codes';
const TOKENS_COLLECTION = 'oauth_tokens';

/**
 * Generate cryptographically secure random string
 */
export function generateSecureToken(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Store authorization code in Firestore
 */
export async function storeAuthCode(code, data) {
  const db = getAdminFirestore();
  const expiresAt = Date.now() + AUTH_CODE_EXPIRY_MS;
  
  await db.collection(AUTH_CODES_COLLECTION).doc(code).set({
    ...data,
    expiresAt,
    used: false,
    createdAt: Date.now()
  });
  
  console.log('[TokenStore] Authorization code stored:', code.substring(0, 8) + '...');
}

/**
 * Retrieve and consume authorization code from Firestore
 */
export async function consumeAuthCode(code) {
  const db = getAdminFirestore();
  const docRef = db.collection(AUTH_CODES_COLLECTION).doc(code);
  
  const doc = await docRef.get();
  
  if (!doc.exists) {
    throw new Error('Invalid authorization code');
  }
  
  const data = doc.data();
  
  if (data.used) {
    // Delete used code
    await docRef.delete();
    throw new Error('Authorization code already used');
  }
  
  if (Date.now() > data.expiresAt) {
    // Delete expired code
    await docRef.delete();
    throw new Error('Authorization code expired');
  }
  
  // Mark as used and delete immediately
  await docRef.delete();
  
  console.log('[TokenStore] Authorization code consumed:', code.substring(0, 8) + '...');
  
  return {
    uid: data.uid,
    clientId: data.clientId,
    redirectUri: data.redirectUri,
    scope: data.scope
  };
}

/**
 * Store access or refresh token in Firestore
 */
export async function storeToken(token, data) {
  const db = getAdminFirestore();
  
  const expiryMs = data.type === 'access_token' ? ACCESS_TOKEN_EXPIRY_MS : REFRESH_TOKEN_EXPIRY_MS;
  const expiresAt = Date.now() + expiryMs;
  
  await db.collection(TOKENS_COLLECTION).doc(token).set({
    ...data,
    expiresAt,
    createdAt: Date.now()
  });
  
  console.log('[TokenStore] Token stored:', data.type, token.substring(0, 8) + '...');
}

/**
 * Retrieve token from Firestore
 */
export async function getToken(token) {
  const db = getAdminFirestore();
  const docRef = db.collection(TOKENS_COLLECTION).doc(token);
  
  const doc = await docRef.get();
  
  if (!doc.exists) {
    throw new Error('Invalid token');
  }
  
  const data = doc.data();
  
  if (Date.now() > data.expiresAt) {
    // Delete expired token
    await docRef.delete();
    throw new Error('Token expired');
  }
  
  return data;
}

/**
 * Delete token from Firestore
 */
export async function deleteToken(token) {
  const db = getAdminFirestore();
  await db.collection(TOKENS_COLLECTION).doc(token).delete();
  console.log('[TokenStore] Token deleted:', token.substring(0, 8) + '...');
}

/**
 * Clean up expired codes and tokens (can be called periodically)
 */
export async function cleanupExpired() {
  const db = getAdminFirestore();
  const now = Date.now();
  
  // Clean up expired auth codes
  const expiredCodes = await db.collection(AUTH_CODES_COLLECTION)
    .where('expiresAt', '<', now)
    .limit(100)
    .get();
  
  const codeDeletes = [];
  expiredCodes.forEach(doc => {
    codeDeletes.push(doc.ref.delete());
  });
  
  // Clean up expired tokens
  const expiredTokens = await db.collection(TOKENS_COLLECTION)
    .where('expiresAt', '<', now)
    .limit(100)
    .get();
  
  const tokenDeletes = [];
  expiredTokens.forEach(doc => {
    tokenDeletes.push(doc.ref.delete());
  });
  
  await Promise.all([...codeDeletes, ...tokenDeletes]);
  
  console.log('[TokenStore] Cleanup:', codeDeletes.length, 'codes,', tokenDeletes.length, 'tokens');
}
