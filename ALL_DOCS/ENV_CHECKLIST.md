# Environment Variables Checklist for Google Home OAuth Integration

## Required for OAuth & Fulfillment API (`/api/oauth/*` and `/api/fulfillment`)

This checklist identifies all environment variables required for the Google Home Cloud-to-Cloud integration serverless functions.

---

## 🔴 CRITICAL - OAuth Client Credentials

### `GOOGLE_OAUTH_CLIENT_ID`
- **Required by:** `api/lib/oauth.js` (validateOAuthClient)
- **Used by:** `api/oauth/authorize.js`, `api/oauth/token.js`
- **Present in .env:** ❌ NO (empty)
- **Present in .env.example:** ✅ YES (placeholder)
- **Purpose:** OAuth client ID for Google Home account linking
- **⚠️ MUST MATCH:** The client_id configured in Google Actions Console → Account Linking settings

### `GOOGLE_OAUTH_CLIENT_SECRET`
- **Required by:** `api/lib/oauth.js` (validateOAuthClient)
- **Used by:** `api/oauth/token.js`
- **Present in .env:** ❌ NO (empty)
- **Present in .env.example:** ✅ YES (placeholder)
- **Purpose:** OAuth client secret for token exchange
- **⚠️ MUST MATCH:** The client_secret from Google Actions Console

---

## 🟡 REQUIRED - Firebase Admin SDK (Backend)

### `FIREBASE_ADMIN_PROJECT_ID`
- **Required by:** `api/lib/firebaseAdmin.js` (getAdminApp)
- **Used by:** All OAuth and fulfillment endpoints
- **Present in .env:** ❌ NO
- **Present in .env.example:** ✅ YES (placeholder)
- **Purpose:** Firebase project ID for Admin SDK initialization

### `FIREBASE_ADMIN_CLIENT_EMAIL`
- **Required by:** `api/lib/firebaseAdmin.js` (getAdminApp)
- **Used by:** All OAuth and fulfillment endpoints
- **Present in .env:** ❌ NO
- **Present in .env.example:** ✅ YES (placeholder)
- **Purpose:** Service account email for Admin SDK authentication

### `FIREBASE_ADMIN_PRIVATE_KEY`
- **Required by:** `api/lib/firebaseAdmin.js` (getAdminApp)
- **Used by:** All OAuth and fulfillment endpoints
- **Present in .env:** ❌ NO
- **Present in .env.example:** ✅ YES (placeholder)
- **Purpose:** Service account private key (base64 encoded) for Admin SDK authentication
- **Note:** Must be base64 encoded for Vercel environment variables

### `FIREBASE_DATABASE_URL`
- **Required by:** `api/lib/firebaseAdmin.js` (getAdminApp)
- **Used by:** OAuth endpoints, fulfillment (device state reads/writes)
- **Present in .env:** ❌ NO (only VITE_ prefixed version exists)
- **Present in .env.example:** ✅ YES (placeholder)
- **Purpose:** Firebase Realtime Database URL for device state management

---

## 🟢 REQUIRED - Firebase Client Config (OAuth Login Page)

These variables are injected into the HTML login page served by `/api/oauth/authorize` (GET request).

### `FIREBASE_API_KEY`
- **Required by:** `api/oauth/authorize.js` (generateLoginPage)
- **Used by:** OAuth login page HTML
- **Present in .env:** ❌ NO (only VITE_ prefixed version exists)
- **Present in .env.example:** ✅ YES (placeholder)
- **Purpose:** Public Firebase API key for client-side Firebase Auth in OAuth login page

### `FIREBASE_AUTH_DOMAIN`
- **Required by:** `api/oauth/authorize.js` (generateLoginPage)
- **Used by:** OAuth login page HTML
- **Present in .env:** ❌ NO (only VITE_ prefixed version exists)
- **Present in .env.example:** ✅ YES (placeholder)
- **Purpose:** Firebase Auth domain for OAuth login page

### `FIREBASE_PROJECT_ID`
- **Required by:** `api/oauth/authorize.js` (generateLoginPage)
- **Used by:** OAuth login page HTML
- **Present in .env:** ❌ NO (only VITE_ prefixed version exists)
- **Present in .env.example:** ✅ YES (placeholder)
- **Purpose:** Firebase project ID for OAuth login page

### `FIREBASE_STORAGE_BUCKET`
- **Required by:** `api/oauth/authorize.js` (generateLoginPage)
- **Used by:** OAuth login page HTML
- **Present in .env:** ❌ NO (only VITE_ prefixed version exists)
- **Present in .env.example:** ✅ YES (placeholder)
- **Purpose:** Firebase storage bucket for OAuth login page

### `FIREBASE_MESSAGING_SENDER_ID`
- **Required by:** `api/oauth/authorize.js` (generateLoginPage)
- **Used by:** OAuth login page HTML
- **Present in .env:** ❌ NO (only VITE_ prefixed version exists)
- **Present in .env.example:** ✅ YES (placeholder)
- **Purpose:** Firebase messaging sender ID for OAuth login page

### `FIREBASE_APP_ID`
- **Required by:** `api/oauth/authorize.js` (generateLoginPage)
- **Used by:** OAuth login page HTML
- **Present in .env:** ❌ NO (only VITE_ prefixed version exists)
- **Present in .env.example:** ✅ YES (placeholder)
- **Purpose:** Firebase app ID for OAuth login page

---

## 📋 Summary

### Total Variables Required: 13

| Status | Count | Variables |
|--------|-------|-----------|
| ❌ Missing from .env | 11 | All Firebase non-VITE and Google OAuth vars |
| ✅ In .env.example | 13 | All variables have placeholders |
| 🟡 Partial (VITE_ only) | 6 | Firebase client config exists with VITE_ prefix only |

---

## 🚨 Current Blocking Issue

**Root Cause:** `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` are missing from Vercel Production environment variables.

**Impact:** When Google Home sends `GET /api/oauth/authorize?client_id=a5x-home-google`, the server validates the client_id against `process.env.GOOGLE_OAUTH_CLIENT_ID`. Since this env var is not set (or doesn't match), validation fails and returns HTTP 302 redirect to Google with `error=access_denied` instead of showing the login page.

---

## ✅ Action Required

### For Vercel Production Deployment:

1. **Go to:** Vercel Dashboard → Project: a5x-home → Settings → Environment Variables

2. **Add/Update these variables (Scope: Production):**

   ```bash
   # Critical - OAuth
   GOOGLE_OAUTH_CLIENT_ID=<value from Google Actions Console>
   GOOGLE_OAUTH_CLIENT_SECRET=<secret from Google Actions Console>
   
   # Firebase Admin SDK
   FIREBASE_ADMIN_PROJECT_ID=home-automation-a5x
   FIREBASE_ADMIN_CLIENT_EMAIL=<service-account-email>
   FIREBASE_ADMIN_PRIVATE_KEY=<base64-encoded-private-key>
   FIREBASE_DATABASE_URL=https://home-automation-a5x-default-rtdb.asia-southeast1.firebasedatabase.app
   
   # Firebase Client Config (same values as VITE_ versions)
   FIREBASE_API_KEY=AIzaSyCjPTuY4QnhRbM8ZmbcNgY49TdfS5poxZQ
   FIREBASE_AUTH_DOMAIN=home-automation-a5x.firebaseapp.com
   FIREBASE_PROJECT_ID=home-automation-a5x
   FIREBASE_STORAGE_BUCKET=home-automation-a5x.firebasestorage.app
   FIREBASE_MESSAGING_SENDER_ID=412536927952
   FIREBASE_APP_ID=1:412536927952:web:a98ab4de410986d78e10d5
   ```

3. **Redeploy** or wait for automatic deployment

4. **Verify:** Check Vercel logs for `[OAuth Validation] GOOGLE_OAUTH_CLIENT_ID is: SET` instead of `NOT SET`

---

## 🔍 How to Get Missing Values

### `GOOGLE_OAUTH_CLIENT_ID` & `GOOGLE_OAUTH_CLIENT_SECRET`
- **Source:** Google Actions Console → Your Project → Account Linking → OAuth Client Information
- **URL:** https://console.actions.google.com/
- **Note:** The client_id MUST exactly match what Google Home sends in authorization requests

### Firebase Admin SDK Credentials
- **Source:** Firebase Console → Project Settings → Service Accounts → Generate New Private Key
- **URL:** https://console.firebase.google.com/project/home-automation-a5x/settings/serviceaccounts/adminsdk
- **Note:** Private key must be base64 encoded before adding to Vercel env vars:
  ```bash
  # Encode the private key:
  cat service-account-key.json | base64
  ```

---

## 📝 Notes

1. **VITE_ prefix:** Variables with `VITE_` prefix are for Vite frontend build-time injection. Serverless functions cannot access them at runtime.

2. **Non-VITE versions:** Required for Vercel serverless functions (`/api/*` routes) to access at runtime via `process.env`.

3. **Duplicate values:** Firebase client config values (without VITE_ prefix) should match the VITE_ prefixed versions, as they are the same Firebase project.

4. **Security:** Public client config (API keys, project IDs) are safe to expose. Private keys (Admin SDK, OAuth secrets) must remain secret.
