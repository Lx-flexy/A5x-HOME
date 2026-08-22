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
 * Uses base64url encoding to match Google's expected format
 * @param {string} uid - Firebase Auth UID
 */
export async function generateAuthCode(uid, clientId, redirectUri, scope = 'openid') {
  // Generate random token
  const randomToken = generateSecureToken(16);
  
  // Create a structured payload that Google might expect
  const payload = {
    uid,
    clientId,
    redirectUri,
    scope,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 600 // 10 minutes
  };
  
  // Encode as base64url (URL-safe base64)
  const payloadJson = JSON.stringify(payload);
  const code = Buffer.from(payloadJson)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  
  // Store with the base64url-encoded code as key
  await storeAuthCode(code, {
    uid,  // Store Firebase UID, not A5X userId
    clientId,
    redirectUri,
    scope
  });
  
  console.log('[OAuth] Generated base64url-encoded authorization code');
  console.log('[OAuth] Code length:', code.length);
  console.log('[OAuth] Code format: base64url JSON payload');
  
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
  
  // Generate new access token
  const newTokens = await generateTokens(tokenData.uid, tokenData.scope);
  
  return {
    access_token: newTokens.access_token,
    token_type: 'Bearer',
    expires_in: Math.floor(ACCESS_TOKEN_EXPIRY_MS / 1000),
    scope: tokenData.scope
  };
}

/**
 * Validate OAuth client credentials
 */
export function validateOAuthClient(clientId, clientSecret = null) {
  // In production, validate against registered Google Home client credentials
  const validClientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const validClientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  
  // TEMPORARY: Legacy Client ID for migration period while Google propagates new Client ID
  const legacyClientId = 'a5x-home-google';
  
  // Safe diagnostic logging using fingerprints
  console.log('[OAuth Validation] Environment check:');
  console.log('[OAuth Validation] GOOGLE_OAUTH_CLIENT_ID is:', validClientId ? 'SET' : 'NOT SET');
  console.log('[OAuth Validation] GOOGLE_OAUTH_CLIENT_SECRET is:', validClientSecret ? 'SET' : 'NOT SET');
  
  console.log('[OAuth Validation] Checking client_id');
  console.log('[OAuth Validation] Received length:', clientId ? clientId.length : 0);
  console.log('[OAuth Validation] Expected length:', validClientId ? validClientId.length : 0);
  console.log('[OAuth Validation] Received fingerprint:', createFingerprint(clientId));
  console.log('[OAuth Validation] Expected fingerprint:', createFingerprint(validClientId));
  
  if (!validClientId) {
    console.error('[OAuth Validation] ERROR: GOOGLE_OAUTH_CLIENT_ID not set in Vercel environment');
    console.error('[OAuth Validation] This must be configured in Vercel Dashboard → Settings → Environment Variables');
    console.error('[OAuth Validation] FATAL: Set GOOGLE_OAUTH_CLIENT_ID in Vercel Production env vars — this must exactly match the client_id configured in Google Actions Console account linking settings.');
    throw new Error('OAuth client not configured');
  }
  
  // TEMPORARY: Accept both new URL format and legacy Client ID during migration
  const isValidClientId = (clientId === validClientId) || (clientId === legacyClientId);
  
  if (!isValidClientId) {
    console.error('[OAuth Validation] ERROR: Client ID mismatch detected');
    console.error('[OAuth Validation] The client_id from Google does not match GOOGLE_OAUTH_CLIENT_ID');
    console.error('[OAuth Validation] Received length:', clientId ? clientId.length : 0);
    console.error('[OAuth Validation] Expected length:', validClientId ? validClientId.length : 0);
    console.error('[OAuth Validation] Received fingerprint:', createFingerprint(clientId));
    console.error('[OAuth Validation] Expected fingerprint:', createFingerprint(validClientId));
    
    // Check for common issues
    if (clientId && validClientId) {
      if (clientId.trim() === validClientId.trim()) {
        console.error('[OAuth Validation] HINT: Values match after trim - check for whitespace');
      }
      if (clientId.toLowerCase() === validClientId.toLowerCase()) {
        console.error('[OAuth Validation] HINT: Values match case-insensitively - check capitalization');
      }
    }
    
    throw new Error('Invalid client ID');
  }
  
  // Log which Client ID was used
  if (clientId === legacyClientId) {
    console.warn('[OAuth Validation] ⚠ Using legacy Client ID (temporary migration support)');
    console.warn('[OAuth Validation] This will be removed once Google propagates new Client ID');
  } else {
    console.log('[OAuth Validation] ✓ Using new URL-format Client ID');
  }
  
  console.log('[OAuth Validation] ✓ Client ID validated successfully');
  
  if (clientSecret && clientSecret !== validClientSecret) {
    console.error('[OAuth Validation] Client secret mismatch');
    throw new Error('Invalid client secret');
  }
  
  return true;
}

/**
 * Validate redirect URI against allowed list
 */
export function validateRedirectUri(redirectUri) {
  // Google Home redirect URIs typically follow this pattern
  const allowedPatterns = [
    /^https:\/\/oauth-redirect\.googleusercontent\.com\/r\/.+$/,
    /^https:\/\/oauth-redirect-sandbox\.googleusercontent\.com\/r\/.+$/,
    // Add your test redirect URIs for development
    /^https:\/\/localhost:3000\/oauth\/callback$/,
    /^http:\/\/localhost:3000\/oauth\/callback$/
  ];
  
  return allowedPatterns.some(pattern => pattern.test(redirectUri));
}