# Google Home Cloud-to-Cloud Integration - API Documentation

## Overview

This document describes the Google Home Cloud-to-Cloud integration backend for A5X_HOME. The implementation provides OAuth 2.0 authentication and Smart Home device control capabilities that integrate with Google Home/Assistant.

## Architecture

The backend reuses the existing A5X_HOME Firebase infrastructure:

- **Firebase Auth**: User authentication (existing)
- **Firestore**: Device metadata and user profiles (existing)  
- **Realtime Database**: Live device state and control (existing)
- **Firebase Admin SDK**: Backend access to Firebase services (new)
- **Vercel Serverless Functions**: API endpoints (new)

## API Endpoints

### 1. OAuth Authorization Endpoint

**GET/POST `/api/oauth/authorize`**

Handles OAuth 2.0 authorization code flow for Google Home integration.

#### GET Request (Authorization Request)
- **Purpose**: Display login page for A5X users
- **Parameters**: 
  - `client_id` (required): Google Home OAuth client ID
  - `redirect_uri` (required): Google's callback URL
  - `response_type` (required): Must be "code"
  - `state` (optional): State parameter for CSRF protection
  - `scope` (optional): OAuth scope, defaults to "openid"

#### POST Request (Authorization Grant)
- **Purpose**: Process user authentication and generate authorization code
- **Body**:
  ```json
  {
    "client_id": "google_oauth_client_id",
    "redirect_uri": "https://oauth-redirect.googleusercontent.com/r/...",
    "state": "csrf_state_token",
    "scope": "openid", 
    "id_token": "firebase_id_token_from_frontend"
  }
  ```

#### Response
- **Success**: Redirects to Google with authorization code
- **Error**: Returns error details in JSON format

### 2. OAuth Token Exchange Endpoint

**POST `/api/oauth/token`**

Exchanges authorization codes for access tokens and handles token refresh.

#### Authorization Code Grant
```json
{
  "grant_type": "authorization_code",
  "client_id": "google_oauth_client_id",
  "client_secret": "google_oauth_client_secret",
  "code": "authorization_code",
  "redirect_uri": "https://oauth-redirect.googleusercontent.com/r/..."
}
```

#### Refresh Token Grant
```json
{
  "grant_type": "refresh_token", 
  "client_id": "google_oauth_client_id",
  "client_secret": "google_oauth_client_secret",
  "refresh_token": "refresh_token_value"
}
```

#### Response
```json
{
  "access_token": "access_token_value",
  "refresh_token": "refresh_token_value",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "openid"
}
```

### 3. Smart Home Fulfillment Endpoint

**POST `/api/fulfillment`**

Handles Google Assistant Smart Home intents.

#### Request Headers
- `Authorization: Bearer access_token`
- `Content-Type: application/json`

#### Request Body Format
```json
{
  "requestId": "unique_request_id",
  "inputs": [
    {
      "intent": "action.devices.SYNC|QUERY|EXECUTE|DISCONNECT",
      "payload": { /* intent-specific payload */ }
    }
  ]
}
```

#### Supported Intents

##### SYNC Intent
- **Purpose**: Discover user's A5X devices
- **Response**: Returns list of Google Home compatible devices
- **Device Types Supported**:
  - `action.devices.types.LIGHT` (light1, light2, light3)
  - `action.devices.types.FAN` (fan1, fan2)
  - `action.devices.types.SWITCH` (custom1)

##### QUERY Intent  
- **Purpose**: Get current device states
- **Payload**: Array of device objects with IDs
- **Response**: Current ON/OFF states for requested devices

##### EXECUTE Intent
- **Purpose**: Control devices (ON/OFF commands)
- **Payload**: Commands array with device IDs and execution parameters
- **Supported Commands**: `action.devices.commands.OnOff`

##### DISCONNECT Intent
- **Purpose**: Handle account unlinking
- **Response**: Empty payload for successful disconnection

## Device Mapping

Each A5X device can expose up to 6 outputs to Google Home:

| A5X Output | Google Device Type | Default Visibility |
|------------|-------------------|-------------------|
| light1     | LIGHT             | Visible           |
| light2     | LIGHT             | Visible           | 
| light3     | LIGHT             | Visible           |
| fan1       | FAN               | Hidden            |
| fan2       | FAN               | Hidden            |
| custom1    | SWITCH            | Hidden            |

Device visibility is controlled by the `visible` flag in RTDB path:
`devices/{deviceId}/metadata/outputs/{outputId}/visible`

## Environment Variables Required

### Firebase Admin SDK
```bash
FIREBASE_ADMIN_PROJECT_ID=your-firebase-project-id
FIREBASE_ADMIN_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com  
FIREBASE_ADMIN_PRIVATE_KEY=base64_encoded_private_key
FIREBASE_DATABASE_URL=https://your-project-default-rtdb.region.firebasedatabase.app
```

### Google OAuth Configuration
```bash
GOOGLE_OAUTH_CLIENT_ID=google_home_oauth_client_id
GOOGLE_OAUTH_CLIENT_SECRET=google_home_oauth_client_secret
```

### Frontend Firebase Configuration (for OAuth login page)
```bash
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_DATABASE_URL=https://your-project-default-rtdb.region.firebasedatabase.app
VITE_FIREBASE_PROJECT_ID=your-firebase-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_firebase_app_id
```

## Security Features

1. **OAuth 2.0 Authorization Code Flow**: Secure token exchange
2. **Firebase ID Token Verification**: Authenticate A5X users
3. **Device Access Control**: Users can only control their own devices or shared devices
4. **Client Credential Validation**: Verify Google Home OAuth client
5. **Redirect URI Validation**: Prevent OAuth redirection attacks
6. **Authorization Code Expiry**: Codes expire after 10 minutes
7. **Access Token Expiry**: Tokens expire after 1 hour
8. **CORS Headers**: Proper cross-origin resource sharing

## Local Development & Testing

### 1. Install Dependencies
```bash
npm install
```

### 2. Set Environment Variables
Create `.env.local` with the required environment variables listed above.

### 3. Run Development Server
```bash
npm run dev
```

### 4. Test API Endpoints

#### Test OAuth Authorization (GET)
```bash
curl "http://localhost:3000/api/oauth/authorize?client_id=test&redirect_uri=https://oauth-redirect.googleusercontent.com/r/test&response_type=code&state=test123"
```

#### Test Token Exchange (with valid authorization code)
```bash
curl -X POST http://localhost:3000/api/oauth/token \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "authorization_code",
    "client_id": "test_client",
    "client_secret": "test_secret", 
    "code": "valid_auth_code",
    "redirect_uri": "https://oauth-redirect.googleusercontent.com/r/test"
  }'
```

#### Test Smart Home Fulfillment (with valid access token)
```bash
curl -X POST http://localhost:3000/api/fulfillment \
  -H "Authorization: Bearer valid_access_token" \
  -H "Content-Type: application/json" \
  -d '{
    "requestId": "test-request-123",
    "inputs": [{
      "intent": "action.devices.SYNC",
      "payload": {}
    }]
  }'
```

## Google Home Developer Console Configuration

After deploying to Vercel, configure these URLs in the Google Home Developer Console:

### OAuth Settings
- **Authorization URL**: `https://your-vercel-domain.vercel.app/api/oauth/authorize`
- **Token Exchange URL**: `https://your-vercel-domain.vercel.app/api/oauth/token`

### Smart Home Settings  
- **Fulfillment URL**: `https://your-vercel-domain.vercel.app/api/fulfillment`

### Account Linking
- **Linking Type**: OAuth 2.0 Authorization Code
- **Client ID**: Your Google OAuth client ID
- **Client Secret**: Your Google OAuth client secret
- **Authorization URL**: `https://your-vercel-domain.vercel.app/api/oauth/authorize`
- **Token URL**: `https://your-vercel-domain.vercel.app/api/oauth/token`
- **Scopes**: `openid`

## Deployment

### 1. Production Build
```bash
npm run build
```

### 2. Deploy to Vercel
```bash
vercel --prod
```

### 3. Configure Environment Variables in Vercel
Add all required environment variables in Vercel Dashboard → Project Settings → Environment Variables.

## File Structure

```
api/
├── lib/
│   ├── firebaseAdmin.js      # Firebase Admin SDK configuration
│   ├── oauth.js              # OAuth utilities and token management  
│   └── deviceMetadata.js     # Device metadata helper functions
├── oauth/
│   ├── authorize.js          # OAuth authorization endpoint
│   └── token.js             # OAuth token exchange endpoint
└── fulfillment.js           # Google Home Smart Home fulfillment

vercel.json                  # Updated with API route configuration
package.json                 # Updated with firebase-admin dependency
```

## Limitations & Production Considerations

1. **In-Memory Token Storage**: Current implementation uses Map() for tokens. For production, use Redis or database storage.

2. **Rate Limiting**: Add rate limiting to prevent abuse of OAuth endpoints.

3. **Logging**: Implement structured logging for debugging and monitoring.

4. **Error Handling**: Enhanced error reporting for production debugging.

5. **Token Cleanup**: Implement periodic cleanup of expired tokens.

6. **Device Limits**: Google Home supports maximum 6 outputs per A5X device.

7. **State Reporting**: Consider implementing proactive state reporting for real-time updates.

## Integration Testing

1. **Unit Tests**: Test individual API endpoints with mock data
2. **Integration Tests**: Test with actual Firebase and Google Home simulator  
3. **End-to-End Tests**: Test complete OAuth flow and device control
4. **Load Tests**: Verify performance under concurrent requests

## Support & Troubleshooting

### Common Issues

1. **Firebase Admin SDK Authentication**: Verify service account credentials
2. **OAuth Client Validation**: Ensure client ID/secret match Google Home configuration
3. **Device Access Denied**: Check user permissions in Firestore
4. **RTDB Connection Issues**: Verify database URL and permissions
5. **Token Expiry**: Implement proper refresh token handling

### Debug Logging

Enable detailed logging by checking server console outputs for:
- `[OAuth Authorize]` - Authorization flow issues
- `[OAuth Token]` - Token exchange problems  
- `[Fulfillment]` - Smart Home intent errors
- `[Firebase Admin]` - Backend Firebase connectivity
