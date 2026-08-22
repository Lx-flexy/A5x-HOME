/**
 * Google Home OAuth Authorization Endpoint
 * 
 * Handles the OAuth 2.0 authorization code flow for Google Home integration.
 * This endpoint authenticates A5X users and generates authorization codes.
 * 
 * Flow:
 * 1. Google Home redirects user here with OAuth parameters
 * 2. User logs in with existing A5X Firebase Auth
 * 3. We generate an authorization code
 * 4. Redirect back to Google with code and state
 */

import { generateAuthCode, validateOAuthClient, validateRedirectUri } from '../lib/oauth.js';
import { verifyAuthToken, getUserByUid } from '../lib/firebaseAdmin.js';

/**
 * Parse JSON body from request stream (required for Vercel serverless functions)
 */
async function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(new Error('Invalid JSON in request body'));
      }
    });
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  // Set CORS headers for preflight requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    // Parse JSON body for POST requests (Vercel doesn't auto-parse)
    if (req.method === 'POST') {
      console.log('[OAuth Authorize] POST request received');
      console.log('[OAuth Authorize] Content-Type:', req.headers['content-type']);
      
      try {
        req.body = await parseJsonBody(req);
        console.log('[OAuth Authorize] Body parsed successfully');
        console.log('[OAuth Authorize] Body keys:', Object.keys(req.body || {}));
        console.log('[OAuth Authorize] has_id_token:', !!req.body.id_token);
        console.log('[OAuth Authorize] has_client_id:', !!req.body.client_id);
      } catch (parseError) {
        console.error('[OAuth Authorize] Body parsing failed:', parseError.message);
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'Invalid JSON in request body'
        });
      }
    }
    
    if (req.method === 'GET') {
      return handleAuthorizationRequest(req, res);
    } else if (req.method === 'POST') {
      return handleAuthorizationGrant(req, res);
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('[OAuth Authorize] Error:', error);
    res.status(500).json({ 
      error: 'internal_server_error',
      error_description: error.message 
    });
  }
}

/**
 * GET /api/oauth/authorize - Initial authorization request from Google Home
 */
async function handleAuthorizationRequest(req, res) {
  const { 
    client_id, 
    redirect_uri, 
    response_type, 
    state, 
    scope = 'openid'
  } = req.query;

  console.log('[OAuth Authorize] GET received');
  console.log('[OAuth Authorize] client_id_length:', client_id ? client_id.length : 0);
  console.log('[OAuth Authorize] redirect_uri:', redirect_uri || 'missing');
  console.log('[OAuth Authorize] response_type:', response_type || 'missing');
  console.log('[OAuth Authorize] state_present:', !!state);
  console.log('[OAuth Authorize] scope:', scope);

  // Validate required OAuth parameters
  if (!client_id) {
    console.error('[OAuth Authorize] Missing client_id');
    return res.status(400).json({ 
      error: 'invalid_request',
      error_description: 'Missing client_id parameter' 
    });
  }

  if (!redirect_uri) {
    console.error('[OAuth Authorize] Missing redirect_uri');
    return res.status(400).json({ 
      error: 'invalid_request',
      error_description: 'Missing redirect_uri parameter' 
    });
  }

  if (response_type !== 'code') {
    console.error('[OAuth Authorize] Invalid response_type:', response_type);
    return res.status(400).json({ 
      error: 'unsupported_response_type',
      error_description: 'Only authorization code flow is supported' 
    });
  }

  try {
    // Validate client credentials
    console.log('[OAuth Authorize] Validating client_id');
    console.log('[OAuth Authorize] GOOGLE_OAUTH_CLIENT_ID env var:', process.env.GOOGLE_OAUTH_CLIENT_ID ? 'SET' : 'NOT SET');
    validateOAuthClient(client_id);
    console.log('[OAuth Authorize] ✓ Client validation passed');
    
    // Validate redirect URI
    console.log('[OAuth Authorize] Validating redirect_uri');
    if (!validateRedirectUri(redirect_uri)) {
      console.error('[OAuth Authorize] Invalid redirect_uri pattern');
      return res.status(400).json({ 
        error: 'invalid_request',
        error_description: 'Invalid redirect_uri' 
      });
    }
    console.log('[OAuth Authorize] ✓ Redirect URI validation passed');

    // Generate a login page with OAuth context
    console.log('[OAuth Authorize] Generating login page');
    const loginPageHtml = generateLoginPage({
      clientId: client_id,
      redirectUri: redirect_uri,
      state: state || '',
      scope
    });

    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(loginPageHtml);
    console.log('[OAuth Authorize] ✓ Login page sent successfully');

  } catch (error) {
    console.error('[OAuth Authorize] Validation error:', error.message);
    
    // Redirect back to Google with error if redirect_uri is valid
    if (validateRedirectUri(redirect_uri)) {
     const errorUrl = new URL(redirect_uri);

errorUrl.searchParams.set('error', 'access_denied');
errorUrl.searchParams.set('error_description', error.message);
errorUrl.searchParams.set('state', state || '');

res.writeHead(302, {
  Location: errorUrl.toString(),
  'Cache-Control': 'no-store'
});
res.end();
return;
    } else {
      res.status(400).json({ 
        error: 'invalid_client',
        error_description: error.message 
      });
    }
  }
}

/**
 * POST /api/oauth/authorize - Handle user authentication and authorization
 */
async function handleAuthorizationGrant(req, res) {
  const { 
    client_id, 
    redirect_uri, 
    state, 
    scope = 'openid',
    id_token 
  } = req.body;

  console.log('[OAuth Authorize] POST received');
  console.log('[OAuth Authorize] client_id_length:', client_id ? client_id.length : 0);
  console.log('[OAuth Authorize] redirect_uri present:', !!redirect_uri);
  console.log('[OAuth Authorize] state_present:', !!state);
  console.log('[OAuth Authorize] scope:', scope);
  console.log('[OAuth Authorize] has_id_token:', !!id_token);

  // Validate required parameters
  if (!client_id || !redirect_uri || !id_token) {
    console.error('[OAuth Authorize] Missing required parameters');
    console.error('[OAuth Authorize] client_id present:', !!client_id);
    console.error('[OAuth Authorize] redirect_uri present:', !!redirect_uri);
    console.error('[OAuth Authorize] id_token present:', !!id_token);
    return res.status(400).json({ 
      error: 'invalid_request',
      error_description: 'Missing required parameters: client_id, redirect_uri, or id_token' 
    });
  }

  try {
    // Validate client and redirect URI
    console.log('[OAuth Authorize] Validating client_id');
    validateOAuthClient(client_id);
    console.log('[OAuth Authorize] ✓ Client validated');
    
    console.log('[OAuth Authorize] Validating redirect_uri');
    if (!validateRedirectUri(redirect_uri)) {
      throw new Error('Invalid redirect_uri');
    }
    console.log('[OAuth Authorize] ✓ Redirect URI validated');

    // Verify Firebase ID token and get user
    console.log('[OAuth Authorize] Verifying Firebase ID token');
    const uid = await verifyAuthToken(id_token);
    const userData = await getUserByUid(uid);
    console.log('[OAuth Authorize] ✓ User authenticated:', { uid, userId: userData.userId });

    // Generate authorization code using Firebase UID (not A5X userId)
    const authCode = await generateAuthCode(uid, client_id, redirect_uri, scope);
    console.log('[OAuth Authorize] ✓ Authorization code generated');

    // Build redirect URL with code and state
    const callbackUrl = new URL(redirect_uri);
    callbackUrl.searchParams.set('code', authCode);
    if (state) {
      callbackUrl.searchParams.set('state', state);
    }
    
    // Return the redirect URL to the client for navigation
    // The client will use window.location to navigate (full page redirect)
    return res.status(200).json({
      redirectUrl: callbackUrl.toString()
    });
  } catch (error) {
    console.error('[OAuth Authorize] Grant error:', error.message);
    
    // Return error as JSON (client will handle display)
    return res.status(400).json({
      error: 'access_denied',
      error_description: error.message
    });
  }
}

/**
 * Generate HTML login page for OAuth authorization
 * Uses environment variables for Firebase configuration (client-safe public config)
 */
function generateLoginPage(context) {
  const { clientId, redirectUri, state, scope } = context;
  
  // Get Firebase config from environment (non-VITE prefixed for serverless runtime)
  const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY || '',
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || '',
    databaseURL: process.env.FIREBASE_DATABASE_URL || '',
    projectId: process.env.FIREBASE_PROJECT_ID || '',
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
    appId: process.env.FIREBASE_APP_ID || ''
  };
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>A5X Home - Google Home Authorization</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            margin: 0;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .auth-container {
            background: white;
            padding: 2rem;
            border-radius: 12px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.1);
            max-width: 400px;
            width: 100%;
            text-align: center;
        }
        .logo {
            width: 60px;
            height: 60px;
            background: #667eea;
            border-radius: 12px;
            margin: 0 auto 1rem;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            color: white;
            font-size: 18px;
        }
        h1 { color: #333; margin-bottom: 0.5rem; }
        .subtitle { color: #666; margin-bottom: 2rem; font-size: 14px; }
        .auth-button {
            width: 100%;
            padding: 12px 24px;
            background: #667eea;
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            cursor: pointer;
            transition: background 0.2s;
            margin-bottom: 1rem;
        }
        .auth-button:hover {
            background: #5a6fd8;
        }
        .auth-button:disabled {
            background: #ccc;
            cursor: not-allowed;
        }
        .error-message {
            color: #dc3545;
            margin-top: 1rem;
            padding: 10px;
            background: #f8d7da;
            border-radius: 4px;
            display: none;
            font-size: 14px;
        }
        .loading {
            display: none;
            margin-top: 1rem;
        }
        .info-text {
            font-size: 12px;
            color: #666;
            margin-top: 2rem;
            line-height: 1.4;
        }
    </style>
    <script type="module">
        import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
        import { getAuth, signInWithPopup, GoogleAuthProvider } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
        
        // Firebase configuration (public client config from environment)
        const firebaseConfig = ${JSON.stringify(firebaseConfig, null, 2)};
        
        // Validate Firebase config
        if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
            document.getElementById('error-message').textContent = 'Firebase configuration missing. Please contact administrator.';
            document.getElementById('error-message').style.display = 'block';
            document.getElementById('auth-button').disabled = true;
        } else {
            const app = initializeApp(firebaseConfig);
            const auth = getAuth(app);
            const googleProvider = new GoogleAuthProvider();
            googleProvider.setCustomParameters({ prompt: 'select_account' });
            
            window.authenticateUser = async function() {
                const button = document.getElementById('auth-button');
                const errorDiv = document.getElementById('error-message');
                const loading = document.getElementById('loading');
                
                button.disabled = true;
                errorDiv.style.display = 'none';
                loading.style.display = 'block';
                loading.textContent = 'Signing in...';
                
                try {
                    // Authenticate with Google
                    const result = await signInWithPopup(auth, googleProvider);
                    const idToken = await result.user.getIdToken();
                    
                    loading.textContent = 'Completing authorization...';
                    
                    // Submit authorization request to server
                    const params = {
                        client_id: '${clientId}',
                        redirect_uri: '${redirectUri}',
                        state: '${state}',
                        scope: '${scope}',
                        id_token: idToken
                    };
                    
                    const response = await fetch('/api/oauth/authorize', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(params)
                    });
                    
                    if (!response.ok) {
                        const data = await response.json().catch(() => ({ error_description: 'Authorization failed' }));
                        throw new Error(data.error_description || 'Authorization failed');
                    }
                    
                    const data = await response.json();
                    
                    if (data.redirectUrl) {
                        // Navigate to Google's callback URL (full page navigation)
                        window.location.href = data.redirectUrl;
                    } else {
                        throw new Error('No redirect URL received from server');
                    }
                    
                } catch (error) {
                    console.error('Authentication error:', error);
                    errorDiv.textContent = error.message || 'Authentication failed. Please try again.';
                    errorDiv.style.display = 'block';
                    button.disabled = false;
                    loading.style.display = 'none';
                }
            };
        }
    </script>
</head>
<body>
    <div class="auth-container">
        <div class="logo">A5X</div>
        <h1>Connect Google Home</h1>
        <p class="subtitle">Sign in to your A5X Home account to link your devices with Google Home</p>
        
        <button id="auth-button" class="auth-button" onclick="authenticateUser()">
            Sign in with Google
        </button>
        
        <div id="loading" class="loading">
            <p>Authenticating...</p>
        </div>
        
        <div id="error-message" class="error-message"></div>
        
        <p class="info-text">
            By connecting, you allow Google Assistant to control your A5X smart home devices
        </p>
    </div>
</body>
</html>`;
}
