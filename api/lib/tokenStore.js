/**
 * Persistent token storage using Firebase Firestore
 * Replaces in-memory Map() to work correctly on Vercel serverless
 * 
 * SECURITY: All tokens and auth codes are hashed (SHA-256) before storage.
 * The raw token is never stored in the database.
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
 * Hash a token using SHA-256 to use as Firestore document ID
 * @param {string} token - Raw token string
 * @returns {string} Hex-encoded hash (64 characters)
 */
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Generate cryptographically secure random string
 */
export function generateSecureToken(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Store authorization code in Firestore
 * Code is hashed before storage for security
 */
export async function storeAuthCode(code, data) {
  const db = getAdminFirestore();
  const expiresAt = Date.now() + AUTH_CODE_EXPIRY_MS;
  const codeHash = hashToken(code);
  
  await db.collection(AUTH_CODES_COLLECTION).doc(codeHash).set({
    ...data,
    expiresAt,
    used: false,
    createdAt: Date.now()
  });
  
  console.log('[TokenStore] Authorization code stored (hash):', codeHash.substring(0, 12) + '...');
}

/**
 * Retrieve and consume authorization code from Firestore
 * Code is hashed to look up the document
 */
export async function consumeAuthCode(code) {
  const db = getAdminFirestore();
  const codeHash = hashToken(code);
  const docRef = db.collection(AUTH_CODES_COLLECTION).doc(codeHash);
  
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
  
  console.log('[TokenStore] Authorization code consumed (hash):', codeHash.substring(0, 12) + '...');
  
  return {
    uid: data.uid,
    clientId: data.clientId,
    redirectUri: data.redirectUri,
    scope: data.scope
  };
}

/**
 * Store access or refresh token in Firestore
 * Token is hashed before storage for security
 */
export async function storeToken(token, data) {
  const db = getAdminFirestore();
  
  const expiryMs = data.type === 'access_token' ? ACCESS_TOKEN_EXPIRY_MS : REFRESH_TOKEN_EXPIRY_MS;
  const expiresAt = Date.now() + expiryMs;
  const tokenHash = hashToken(token);
  
  await db.collection(TOKENS_COLLECTION).doc(tokenHash).set({
    ...data,
    expiresAt,
    createdAt: Date.now()
  });
  
  console.log('[TokenStore] Token stored:', data.type, '(hash):', tokenHash.substring(0, 12) + '...');
}

/**
 * Retrieve token from Firestore
 * Token is hashed to look up the document
 */
export async function getToken(token) {
  const db = getAdminFirestore();
  const tokenHash = hashToken(token);
  const docRef = db.collection(TOKENS_COLLECTION).doc(tokenHash);
  
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
 * Token is hashed to look up the document
 */
export async function deleteToken(token) {
  const db = getAdminFirestore();
  const tokenHash = hashToken(token);
  await db.collection(TOKENS_COLLECTION).doc(tokenHash).delete();
  console.log('[TokenStore] Token deleted (hash):', tokenHash.substring(0, 12) + '...');
}

/**
 * Delete all tokens for a specific user (used for DISCONNECT)
 * @param {string} uid - Firebase Auth UID
 */
export async function deleteAllTokensForUser(uid) {
  const db = getAdminFirestore();
  const tokensQuery = db.collection(TOKENS_COLLECTION).where('uid', '==', uid);
  
  const snapshot = await tokensQuery.get();
  
  if (snapshot.empty) {
    console.log('[TokenStore] No tokens found for user:', uid);
    return;
  }
  
  // Batch delete in chunks of 400 (Firestore batch limit is 500)
  const chunks = [];
  let currentChunk = [];
  
  snapshot.docs.forEach(doc => {
    currentChunk.push(doc.ref);
    if (currentChunk.length === 400) {
      chunks.push(currentChunk);
      currentChunk = [];
    }
  });
  
  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }
  
  // Execute batch deletes
  for (const chunk of chunks) {
    const batch = db.batch();
    chunk.forEach(ref => batch.delete(ref));
    await batch.commit();
  }
  
  console.log(`[TokenStore] Deleted ${snapshot.size} tokens for user: ${uid}`);
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
