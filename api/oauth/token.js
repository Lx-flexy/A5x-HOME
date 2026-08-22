/**
 * Google Home OAuth Token Exchange Endpoint
 * 
 * Handles OAuth 2.0 token exchange for Google Home integration.
 * Supports both authorization code exchange and refresh token flows.
 */

import { validateAuthCode, generateTokens, refreshAccessToken, validateOAuthClient } from '../lib/oauth.js';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ 
      error: 'invalid_request',
      error_description: 'Method not allowed' 
    });
  }

  try {
    const { 
      grant_type, 
      client_id, 
      client_secret,
      code,
      redirect_uri,
      refresh_token 
    } = req.body;

    // Validate required parameters
    if (!grant_type || !client_id) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'Missing required parameters'
      });
    }

    // Validate client credentials
    try {
      validateOAuthClient(client_id, client_secret);
    } catch (error) {
      return res.status(401).json({
        error: 'invalid_client',
        error_description: error.message
      });
    }

    // Handle different grant types
    if (grant_type === 'authorization_code') {
      return handleAuthorizationCodeGrant(req, res, {
        code,
        client_id,
        redirect_uri
      });
    } else if (grant_type === 'refresh_token') {
      return handleRefreshTokenGrant(req, res, {
        refresh_token
      });
    } else {
      return res.status(400).json({
        error: 'unsupported_grant_type',
        error_description: 'Only authorization_code and refresh_token grants are supported'
      });
    }

  } catch (error) {
    console.error('[OAuth Token] Error:', error);
    res.status(500).json({
      error: 'server_error',
      error_description: 'Internal server error'
    });
  }
}

/**
 * Handle authorization code grant (initial token request)
 */
async function handleAuthorizationCodeGrant(req, res, params) {
  const { code, client_id, redirect_uri } = params;

  if (!code || !redirect_uri) {
    return res.status(400).json({
      error: 'invalid_request',
      error_description: 'Missing code or redirect_uri'
    });
  }

  try {
    // Validate and consume authorization code
    const codeData = validateAuthCode(code, client_id, redirect_uri);
    
    // Generate access and refresh tokens
    const tokens = generateTokens(codeData.uid, codeData.scope);

    console.log('[OAuth Token] Authorization code exchanged successfully for user UID:', codeData.uid);

    res.status(200).json(tokens);

  } catch (error) {
    console.error('[OAuth Token] Authorization code grant error:', error);
    
    if (error.message.includes('Invalid') || error.message.includes('expired') || error.message.includes('used')) {
      return res.status(400).json({
        error: 'invalid_grant',
        error_description: error.message
      });
    }
    
    return res.status(500).json({
      error: 'server_error',
      error_description: 'Failed to process authorization code'
    });
  }
}

/**
 * Handle refresh token grant (token refresh)
 */
async function handleRefreshTokenGrant(req, res, params) {
  const { refresh_token } = params;

  if (!refresh_token) {
    return res.status(400).json({
      error: 'invalid_request',
      error_description: 'Missing refresh_token'
    });
  }

  try {
    // Refresh the access token
    const newTokens = refreshAccessToken(refresh_token);

    console.log('[OAuth Token] Access token refreshed successfully');

    res.status(200).json(newTokens);

  } catch (error) {
    console.error('[OAuth Token] Refresh token grant error:', error);
    
    if (error.message.includes('Invalid') || error.message.includes('expired')) {
      return res.status(400).json({
        error: 'invalid_grant',
        error_description: error.message
      });
    }
    
    return res.status(500).json({
      error: 'server_error',
      error_description: 'Failed to refresh token'
    });
  }
}