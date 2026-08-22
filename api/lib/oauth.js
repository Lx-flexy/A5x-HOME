/**
 * OAuth 2.0 utilities for Google Home Cloud-to-Cloud integration.
 * Implements Authorization Code flow with temporary code storage.
 */

import crypto from 'crypto';

// In-memory store for authorization codes (replace with Redis in production)
const authCodeStore = new Map();
const tokenStore = new Map();

// Token expiration times
const AUTH_CODE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const ACCESS_TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour
const REFRESH_TOKEN_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Generate cryptographically secure random string
 */
function generateSecureToken(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Generate authorization code for OAuth flow
 * @param {string} uid - Firebase Auth UID
 */
export function generateAuthCode(uid, clientId, redirectUri, scope = 'openid') {
  const code = generateSecureToken(16);
  const expiresAt = Date.now() + AUTH_CODE_EXPIRY_MS;
  
  authCodeStore.set(code, {
    uid,  // Store Firebase UID, not A5X userId
    clientId,
    redirectUri,
    scope,
    expiresAt,
    used: false
  });
  
  // Clean up expired codes periodically
  setTimeout(() => authCodeStore.delete(code), AUTH_CODE_EXPIRY_MS + 1000);
  
  return code;
}

/**
 * Validate and consume authorization code
 */
export function validateAuthCode(code, clientId, redirectUri) {
  const codeData = authCodeStore.get(code);
  
  if (!codeData) {
    throw new Error('Invalid authorization code');
  }
  
  if (codeData.used) {
    authCodeStore.delete(code);
    throw new Error('Authorization code already used');
  }
  
  if (Date.now() > codeData.expiresAt) {
    authCodeStore.delete(code);
    throw new Error('Authorization code expired');
  }
  
  if (codeData.clientId !== clientId) {
    throw new Error('Client ID mismatch');
  }
  
  if (codeData.redirectUri !== redirectUri) {
    throw new Error('Redirect URI mismatch');
  }
  
  // Mark as used and return user info
  codeData.used = true;
  authCodeStore.delete(code);
  
  return {
    uid: codeData.uid,  // Return Firebase UID
    scope: codeData.scope
  };
}

/**
 * Generate access and refresh tokens
 * @param {string} uid - Firebase Auth UID
 */
export function generateTokens(uid, scope = 'openid') {
  const accessToken = generateSecureToken(32);
  const refreshToken = generateSecureToken(32);
  
  const accessTokenData = {
    uid,  // Store Firebase UID
    scope,
    type: 'access_token',
    expiresAt: Date.now() + ACCESS_TOKEN_EXPIRY_MS
  };
  
  const refreshTokenData = {
    uid,  // Store Firebase UID
    scope,
    type: 'refresh_token',
    expiresAt: Date.now() + REFRESH_TOKEN_EXPIRY_MS
  };
  
  tokenStore.set(accessToken, accessTokenData);
  tokenStore.set(refreshToken, refreshTokenData);
  
  // Clean up expired tokens
  setTimeout(() => tokenStore.delete(accessToken), ACCESS_TOKEN_EXPIRY_MS + 1000);
  setTimeout(() => tokenStore.delete(refreshToken), REFRESH_TOKEN_EXPIRY_MS + 1000);
  
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
export function validateAccessToken(token) {
  const tokenData = tokenStore.get(token);
  
  if (!tokenData) {
    throw new Error('Invalid access token');
  }
  
  if (tokenData.type !== 'access_token') {
    throw new Error('Token is not an access token');
  }
  
  if (Date.now() > tokenData.expiresAt) {
    tokenStore.delete(token);
    throw new Error('Access token expired');
  }
  
  return {
    uid: tokenData.uid,  // Return Firebase UID
    scope: tokenData.scope
  };
}

/**
 * Refresh access token using refresh token
 */
export function refreshAccessToken(refreshToken) {
  const tokenData = tokenStore.get(refreshToken);
  
  if (!tokenData) {
    throw new Error('Invalid refresh token');
  }
  
  if (tokenData.type !== 'refresh_token') {
    throw new Error('Token is not a refresh token');
  }
  
  if (Date.now() > tokenData.expiresAt) {
    tokenStore.delete(refreshToken);
    throw new Error('Refresh token expired');
  }
  
  // Generate new access token
  const newTokens = generateTokens(tokenData.uid, tokenData.scope);
  
  return {
    access_token: newTokens.access_token,
    token_type: 'Bearer',
    expires_in: Math.floor(ACCESS_TOKEN_EXPIRY_MS / 1000),
    scope: tokenData.scope
  };
}

/**
 * Validate OAuth client credentials (replace with actual client validation)
 */
export function validateOAuthClient(clientId, clientSecret = null) {
  // In production, validate against registered Google Home client credentials
  const validClientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const validClientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  
  if (!validClientId) {
    throw new Error('OAuth client not configured');
  }
  
  if (clientId !== validClientId) {
    throw new Error('Invalid client ID');
  }
  
  if (clientSecret && clientSecret !== validClientSecret) {
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