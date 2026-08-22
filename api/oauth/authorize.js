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

  // Validate required OAuth parameters
  if (!client_id) {
    return res.status(400).json({ 
      error: 'invalid_request',
      error_description: 'Missing client_id parameter' 
    });
  }

  if (!redirect_uri) {
    return res.status(400).json({ 
      error: 'invalid_request',
      error_description: 'Missing redirect_uri parameter' 
    });
  }

  if (response_type !== 'code') {
    return res.status(400).json({ 
      error: 'unsupported_response_type',
      error_description: 'Only authorization code flow is supported' 
    });
  }

  try {
    // Validate client credentials
    validateOAuthClient(client_id);
    
    // Validate redirect URI
    if (!validateRedirectUri(redirect_uri)) {
      return res.status(400).json({ 
        error: 'invalid_request',
        error_description: 'Invalid redirect_uri' 
      });
    }

    // Generate a login page with OAuth context
    const loginPageHtml = generateLoginPage({
      clientId: client_id,
      redirectUri: redirect_uri,
      state: state || '',
      scope
    });

    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(loginPageHtml);

  } catch (error) {
    console.error('[OAuth Authorize] Validation error:', error);
    
    // Redirect back to Google with error if redirect_uri is valid
    if (validateRedirectUri(redirect_uri)) {
      const errorUrl = `${redirect_uri}?error=invalid_client&error_description=${encodeURIComponent(error.message)}&state=${state || ''}`;
      res.redirect(302, errorUrl);
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

  // Validate required parameters
  if (!client_id || !redirect_uri || !id_token) {
    return res.status(400).json({ 
      error: 'invalid_request',
      error_description: 'Missing required parameters' 
    });
  }

  try {
    // Validate client and redirect URI
    validateOAuthClient(client_id);
    if (!validateRedirectUri(redirect_uri)) {
      throw new Error('Invalid redirect_uri');
    }

    // Verify Firebase ID token and get user
    const uid = await verifyAuthToken(id_token);
    const userData = await getUserByUid(uid);

    // Generate authorization code using Firebase UID (not A5X userId)
    const authCode = generateAuthCode(uid, client_id, redirect_uri, scope);

    // Redirect back to Google with authorization code
    const successUrl = `${redirect_uri}?code=${authCode}&state=${state || ''}`;
    
    res.status(200).json({ 
      redirect_url: successUrl,
      success: true 
    });

  } catch (error) {
    console.error('[OAuth Authorize] Grant error:', error);
    
    // Redirect back to Google with error
    const errorUrl = `${redirect_uri}?error=access_denied&error_description=${encodeURIComponent(error.message)}&state=${state || ''}`;
    
    res.status(400).json({ 
      redirect_url: errorUrl,
      success: false,
      error: error.message
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
                
                try {
                    // Authenticate with Google
                    const result = await signInWithPopup(auth, googleProvider);
                    const idToken = await result.user.getIdToken();
                    
                    // Send to authorization endpoint
                    const response = await fetch('/api/oauth/authorize', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            client_id: '${clientId}',
                            redirect_uri: '${redirectUri}',
                            state: '${state}',
                            scope: '${scope}',
                            id_token: idToken
                        })
                    });
                    
                    const data = await response.json();
                    
                    if (data.success && data.redirect_url) {
                        // Success - redirect back to Google
                        window.location.href = data.redirect_url;
                    } else {
                        throw new Error(data.error || 'Authorization failed');
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