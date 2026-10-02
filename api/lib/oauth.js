/**
 * OAuth 2.0 utilities for Google Home Cloud-to-Cloud integration.
 * Implements Authorization Code flow with Firestore persistent storage.
 */

import crypto from 'crypto';
import {
  generateSecureToken,
  storeAuthCode,
  consumeAuthCode,
  storeToken,
  getToken,
  deleteToken,
  AUTH_CODE_EXPIRY_MS,
  ACCESS_TOKEN_EXPIRY_MS,
  REFRESH_TOKEN_EXPIRY_MS
} from './tokenStore.js';

/**
 * Create a safe fingerprint of a string for logging (SHA-256 hash)
 * @param {string} value - Value to fingerprint
 * @returns {string} First 12 characters of SHA-256 hash
 */
function createFingerprint(value) {
  if (!value) return 'null';
  return crypto.createHash('sha256').update(value).digest('hex').substring(0, 12);
}

/**
 * Generate authorization code for OAuth flow
 * @param {string} uid - Firebase Auth UID
 * @param {string} clientId - OAuth client ID
 * @param {string} redirectUri - OAuth redirect URI
 * @param {string} scope - OAuth scope
 * @returns {Promise<string>} Opaque authorization code
 */
export async function generateAuthCode(uid, clientId, redirectUri, scope = 'openid') {
  // Generate simple random opaque token
  const code = generateSecureToken(32);
  
  // Store authorization code with associated data
  await storeAuthCode(code, {
    uid,  // Store Firebase UID, not A5X userId
    clientId,
    redirectUri,
    scope
  });
  
  console.log('[OAuth] Generated authorization code');
  console.log('[OAuth] Code length:', code.length);
  
  return code;
}

/**
 * Validate and consume authorization code
 */
export async function validateAuthCode(code, clientId, redirectUri) {
  const codeData = await consumeAuthCode(code);
  
  if (codeData.clientId !== clientId) {
    throw new Error('Client ID mismatch');
  }
  
  if (codeData.redirectUri !== redirectUri) {
    throw new Error('Redirect URI mismatch');
  }
  
  return {
    uid: codeData.uid,  // Return Firebase UID
    scope: codeData.scope
  };
}

/**
 * Generate access token only (for refresh token flow)
 * @param {string} uid - Firebase Auth UID
 */
export async function generateAccessToken(uid, scope = 'openid') {
  const accessToken = generateSecureToken(32);
  
  // Store access token
  await storeToken(accessToken, {
    uid,
    scope,
    type: 'access_token'
  });
  
  return {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: Math.floor(ACCESS_TOKEN_EXPIRY_MS / 1000),
    scope
  };
}

/**
 * Generate access and refresh tokens
 * @param {string} uid - Firebase Auth UID
 */
export async function generateTokens(uid, scope = 'openid') {
  const accessToken = generateSecureToken(32);
  const refreshToken = generateSecureToken(32);
  
  // Store access token
  await storeToken(accessToken, {
    uid,  // Store Firebase UID
    scope,
    type: 'access_token'
  });
  
  // Store refresh token
  await storeToken(refreshToken, {
    uid,  // Store Firebase UID
    scope,
    type: 'refresh_token'
  });
  
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: 'Bearer',
    expires_in: Math.floor(ACCESS_TOKEN_EXPIRY_MS / 1000),
    scope
  };
}

/**
 * Validate access token and return user info
 */
export async function validateAccessToken(token) {
  const tokenData = await getToken(token);
  
  if (tokenData.type !== 'access_token') {
    throw new Error('Token is not an access token');
  }
  
  return {
    uid: tokenData.uid,  // Return Firebase UID
    scope: tokenData.scope
  };
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(refreshToken) {
  const tokenData = await getToken(refreshToken);
  
  if (tokenData.type !== 'refresh_token') {
    throw new Error('Token is not a refresh token');
  }
  
  // Generate new access token ONLY (no new refresh token)
  const newAccessToken = await generateAccessToken(tokenData.uid, tokenData.scope);
  
  return newAccessToken;
}

/**
 * Validate OAuth client ID only (used by authorize endpoint)
 */
export function validateClientId(clientId) {
  const validClientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  
  if (!validClientId) {
    console.error('[OAuth Validation] ERROR: GOOGLE_OAUTH_CLIENT_ID not set in Vercel environment');
    console.error('[OAuth Validation] This must be configured in Vercel Dashboard → Settings → Environment Variables');
    throw new Error('OAuth client not configured');
  }
  
  if (!clientId || clientId.trim() !== validClientId.trim()) {
    console.error('[OAuth Validation] ERROR: Client ID mismatch detected');
    throw new Error('Invalid client ID');
  }
  
  console.log('[OAuth Validation] ✓ Client ID validated successfully');
  return true;
}

/**
 * Validate OAuth client credentials (used by token endpoint)
 * Requires both client_id and client_secret
 */
export function validateClientCredentials(clientId, clientSecret) {
  const validClientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const validClientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  
  if (!validClientId || !validClientSecret) {
    console.error('[OAuth Validation] ERROR: OAuth credentials not configured');
    throw new Error('OAuth client not configured');
  }
  
  // Client ID validation
  if (!clientId || clientId.trim() !== validClientId.trim()) {
    console.error('[OAuth Validation] ERROR: Client ID invalid');
    throw new Error('Invalid client credentials');
  }
  
  // Client secret validation - REQUIRED
  if (!clientSecret) {
    console.error('[OAuth Validation] ERROR: Client secret missing');
    throw new Error('Invalid client credentials');
  }
  
  // Timing-safe comparison using SHA-256 to normalize lengths
  const hashReceived = crypto.createHash('sha256').update(clientSecret).digest();
  const hashExpected = crypto.createHash('sha256').update(validClientSecret).digest();
  
  if (!crypto.timingSafeEqual(hashReceived, hashExpected)) {
    console.error('[OAuth Validation] ERROR: Client secret mismatch');
    throw new Error('Invalid client credentials');
  }
  
  console.log('[OAuth Validation] ✓ Client credentials validated successfully');
  return true;
}

/**
 * Validate redirect URI against exact-match allowlist
 * Pins to the configured Google Home project ID
 */
export function validateRedirectUri(redirectUri) {
  const projectId = process.env.GOOGLE_HOME_PROJECT_ID;
  
  if (!projectId) {
    console.error('[OAuth Validation] ERROR: GOOGLE_HOME_PROJECT_ID not set');
    console.error('[OAuth Validation] This must be set to your Google Actions project ID');
    return false;
  }
  
  // Exact-match allowlist pinned to the configured project
  const allowedUris = [
    `https://oauth-redirect.googleusercontent.com/r/${projectId}`,
    `https://oauth-redirect-sandbox.googleusercontent.com/r/${projectId}`
  ];
  
  // Allow localhost only in non-production environments
  if (process.env.VERCEL_ENV !== 'production') {
    allowedUris.push('https://localhost:3000/oauth/callback');
    allowedUris.push('http://localhost:3000/oauth/callback');
  }
  
  return allowedUris.includes(redirectUri);
}