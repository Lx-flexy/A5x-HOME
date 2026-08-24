/**
 * Google Home OAuth Token Exchange Endpoint
 * 
 * Handles OAuth 2.0 token exchange for Google Home integration.
 * Supports both authorization code exchange and refresh token flows.
 */

import { validateAuthCode, generateTokens, refreshAccessToken, validateOAuthClient } from '../lib/oauth.js';

/**
 * Parse request body from stream (supports both application/x-www-form-urlencoded and application/json)
 * RFC 6749 Section 4.1.3 requires application/x-www-form-urlencoded for token requests
 */
async function parseRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        if (!body) {
          resolve({});
          return;
        }

        const contentType = req.headers['content-type'] || '';

        // Parse application/x-www-form-urlencoded (standard OAuth 2.0 format)
        if (contentType.includes('application/x-www-form-urlencoded')) {
          const params = new URLSearchParams(body);
          const parsed = {};
          for (const [key, value] of params.entries()) {
            parsed[key] = value;
          }
          resolve(parsed);
        }
        // Parse application/json (also supported)
        else if (contentType.includes('application/json')) {
          resolve(JSON.parse(body));
        }
        // Unsupported content type
        else {
          reject(new Error(`Unsupported Content-Type: ${contentType}`));
        }
      } catch (error) {
        reject(new Error(`Body parsing failed: ${error.message}`));
      }
    });
    req.on('error', reject);
  });
}

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
    // Parse request body (supports both form-urlencoded and JSON)
    console.log('[OAuth Token] POST request received');
    console.log('[OAuth Token] Content-Type:', req.headers['content-type']);
    
    try {
      req.body = await parseRequestBody(req);
      const contentType = req.headers['content-type'] || '';
      const parserUsed = contentType.includes('application/x-www-form-urlencoded') 
        ? 'form-urlencoded' 
        : contentType.includes('application/json') 
        ? 'json' 
        : 'unknown';
      
      console.log('[OAuth Token] Body parsed successfully using:', parserUsed);
      console.log('[OAuth Token] Body keys:', Object.keys(req.body || {}));
    } catch (parseError) {
      console.error('[OAuth Token] Body parsing failed:', parseError.message);
      return res.status(400).json({
        error: 'invalid_request',
        error_description: parseError.message
      });
    }
    
    const { 
      grant_type, 
      client_id, 
      client_secret,
      code,
      redirect_uri,
      refresh_token 
    } = req.body;

    console.log('[OAuth Token] POST received:', {
      grant_type,
      client_id,
      code: code ? code.substring(0, 8) + '...' : undefined,
      redirect_uri,
      refresh_token: refresh_token ? refresh_token.substring(0, 8) + '...' : undefined,
      has_client_secret: !!client_secret
    });

    // Validate required parameters
    if (!grant_type || !client_id) {
      console.error('[OAuth Token] Missing grant_type or client_id');
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'Missing required parameters'
      });
    }

    // Validate client credentials
    try {
      console.log('[OAuth Token] Validating client credentials');
      validateOAuthClient(client_id, client_secret);
      console.log('[OAuth Token] Client validation passed');
    } catch (error) {
      console.error('[OAuth Token] Client validation failed:', error.message);
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

  console.log('[OAuth Token] Authorization code grant request:', {
    code: code ? code.substring(0, 8) + '...' : 'missing',
    client_id,
    redirect_uri
  });

  if (!code || !redirect_uri) {
    console.error('[OAuth Token] Missing code or redirect_uri');
    return res.status(400).json({
      error: 'invalid_request',
      error_description: 'Missing code or redirect_uri'
    });
  }

  try {
    // Validate and consume authorization code
    console.log('[OAuth Token] Validating authorization code');
    const codeData = await validateAuthCode(code, client_id, redirect_uri);
    console.log('[OAuth Token] Code validated for user UID:', codeData.uid);
    
    // Generate access and refresh tokens
    console.log('[OAuth Token] Generating tokens');
    const tokens = await generateTokens(codeData.uid, codeData.scope);

    console.log('[OAuth Token] Authorization code exchanged successfully for user UID:', codeData.uid);
    console.log('[OAuth Token] Token response:', {
      access_token: tokens.access_token.substring(0, 8) + '...',
      refresh_token: tokens.refresh_token.substring(0, 8) + '...',
      token_type: tokens.token_type,
      expires_in: tokens.expires_in
    });

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
    const newTokens = await refreshAccessToken(refresh_token);

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