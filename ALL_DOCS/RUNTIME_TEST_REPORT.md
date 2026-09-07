# Google Home OAuth Implementation - Runtime Test Report

## Test Status: ❌ FAIL

Unable to complete runtime testing due to critical blocking issues.

---

## Test Results Summary

| Test # | Test Name | Status | Details |
|--------|-----------|--------|---------|
| 1 | Test /api/oauth/authorize with realistic OAuth request | ❌ FAIL | Blocker: Environment variable access issue |
| 2 | Verify A5X Firebase login authenticates real user | ❌ FAIL | Cannot test - depends on Test 1 |
| 3 | Verify authorization code generation after auth | ❌ FAIL | Cannot test - depends on Test 1 |
| 4 | Test /api/oauth/token with authorization code | ❌ FAIL | Cannot test - depends on Test 3 |
| 5 | Test refresh_token flow | ❌ FAIL | Cannot test - depends on Test 4 |
| 6 | Test /api/fulfillment with access token | ❌ FAIL | Cannot test - depends on Test 4 |
| 7 | Test SYNC against real Firebase project | ❌ FAIL | Cannot test - depends on Test 6 |
| 8 | Test QUERY against real Firebase project | ❌ FAIL | Cannot test - depends on Test 6 |
| 9 | Test EXECUTE changes RTDB output path | ❌ FAIL | Cannot test - depends on Test 6 |

---

## Blocking Issues

### BLOCKER #1: Environment Variable Access in OAuth Login Page
**File**: `api/oauth/authorize.js`  
**Line**: ~176-184  
**Issue**: OAuth login page accesses `VITE_*` prefixed environment variables

```javascript
const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || '',
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  // ... more VITE_* variables
};
```

**Problem**:
- `VITE_*` prefixed variables are build-time variables for Vite frontend
- Vercel serverless functions do NOT have access to `VITE_*` variables at runtime
- These variables are injected during build, not available in `process.env` at runtime

**Impact**: 
- OAuth login page will have empty Firebase config
- Firebase initialization will fail
- User cannot authenticate
- **BLOCKS ALL SUBSEQUENT TESTS**

**Solution Required**:
1. Create separate non-VITE prefixed environment variables for API usage
2. OR use a different approach for OAuth login (redirect to main app)

### BLOCKER #2: Cannot Test API Endpoints Locally
**Issue**: Vercel serverless functions require Vercel runtime

**Attempted Solutions**:
- ❌ Vite dev server (`npm run dev`) - Does not serve `api/` directory
- ❌ Vercel CLI (`vercel dev`) - Not installed

**Problem**:
- Cannot test API endpoints without deploying to Vercel
- Cannot verify OAuth flow works before deployment
- Risk of discovering issues only after production deployment

**Solution Required**:
1. Install Vercel CLI: `npm install -g vercel`
2. Run `vercel dev` for local testing
3. OR deploy to Vercel preview environment for testing

---

## Detailed Analysis

### Test 1: /api/oauth/authorize with realistic OAuth request

**Expected Request**:
```
GET /api/oauth/authorize?
  client_id=test_client&
  redirect_uri=https://oauth-redirect.googleusercontent.com/r/test&
  response_type=code&
  state=test_state_123&
  scope=openid
```

**Expected Response**:
HTML page with Firebase Auth login

**Actual Result**: ❌ CANNOT TEST
**Reason**: Environment variable blocker

**Code Analysis**:
```javascript
// api/oauth/authorize.js line ~176
const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || '',  // ❌ Will be empty string
  // ...
};

// Line ~215 - Firebase config embedded in HTML
const firebaseConfig = ${JSON.stringify(firebaseConfig, null, 2)};
```

**What Will Happen**:
1. User visits authorization URL
2. HTML page loads with empty Firebase config
3. Firebase SDK initialization fails
4. Error message: "Firebase configuration missing. Please contact administrator."
5. Login button is disabled
6. **USER CANNOT AUTHENTICATE**

---

### Test 2-9: Dependent Tests

All subsequent tests depend on Test 1 succeeding, therefore:
- ❌ Cannot generate valid authorization code
- ❌ Cannot exchange code for access token
- ❌ Cannot test fulfillment endpoints
- ❌ Cannot verify Firebase integration
- ❌ Cannot verify RTDB writes

---

## Files That Need Fixing

### 1. api/oauth/authorize.js
**Issue**: Uses `VITE_*` environment variables in serverless function

**Current Code** (Lines ~176-184):
```javascript
const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || '',
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  databaseURL: process.env.VITE_FIREBASE_DATABASE_URL || '',
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: process.env.VITE_FIREBASE_APP_ID || ''
};
```

**Required Fix**: Change to non-VITE prefixed variables
```javascript
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || '',
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || '',
  databaseURL: process.env.FIREBASE_DATABASE_URL || '',
  projectId: process.env.FIREBASE_PROJECT_ID || '',
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
  appId: process.env.FIREBASE_APP_ID || ''
};
```

**Required Vercel Environment Variables** (NEW):
```bash
# Add these to Vercel (without VITE_ prefix)
FIREBASE_API_KEY=AIzaSyCjPTuY4QnhRbM8ZmbcNgY49TdfS5poxZQ
FIREBASE_AUTH_DOMAIN=home-automation-a5x.firebaseapp.com
FIREBASE_DATABASE_URL=https://home-automation-a5x-default-rtdb.asia-southeast1.firebasedatabase.app
FIREBASE_PROJECT_ID=home-automation-a5x
FIREBASE_STORAGE_BUCKET=home-automation-a5x.firebasestorage.app
FIREBASE_MESSAGING_SENDER_ID=412536927952
FIREBASE_APP_ID=1:412536927952:web:a98ab4de410986d78e10d5
```

---

## Additional Issues Found (Code Review)

### Issue: In-Memory Token Storage
**Severity**: ⚠️ WARNING (Not a blocker, but production issue)
**Files**: `api/lib/oauth.js`
**Lines**: 7-8

```javascript
const authCodeStore = new Map();
const tokenStore = new Map();
```

**Problem**: Tokens lost on serverless cold starts (every 5-15 minutes)
**Impact**: Users must re-authenticate frequently
**Status**: Already documented in verification report

---

## What Actually Works (Code Review)

Based on static code analysis, if the environment variable issue is fixed:

✅ **OAuth Flow Structure**:
- Authorization endpoint properly validates parameters
- Token exchange implements both grant types correctly
- Authorization codes are one-time use
- Client validation logic is correct

✅ **Smart Home Fulfillment**:
- SYNC/QUERY/EXECUTE intent handling is correct
- Device ownership verification implemented
- Firebase Admin SDK integration looks correct
- RTDB paths match existing structure

✅ **Security**:
- Bearer token authentication implemented
- Device access control implemented
- No hardcoded secrets
- Proper error handling

---

## Recommended Next Steps

### Option 1: Fix and Test Locally (Recommended)
1. Fix environment variable issue in `api/oauth/authorize.js`
2. Install Vercel CLI: `npm install -g vercel`
3. Add non-VITE environment variables to `.env`
4. Run `vercel dev` to test locally
5. Complete all 9 tests
6. Deploy to production

### Option 2: Fix and Deploy to Preview
1. Fix environment variable issue in `api/oauth/authorize.js`
2. Add environment variables to Vercel Dashboard
3. Deploy to Vercel preview: `vercel` (without --prod)
4. Test on preview URL
5. Deploy to production if tests pass

### Option 3: Alternative OAuth Approach
Instead of embedded Firebase Auth in API endpoint, redirect to main app:
1. OAuth endpoint redirects to main app with OAuth context
2. Main app handles authentication (has VITE_ variables)
3. Main app calls API endpoint with Firebase ID token
4. Requires frontend modification (NOT ALLOWED per requirements)

**Recommendation**: Option 1 or Option 2

---

## Environment Variable Fix - Detailed Instructions

### Current State
```bash
# Frontend build (works)
VITE_FIREBASE_API_KEY=AIzaSyCjPTuY4QnhRbM8ZmbcNgY49TdfS5poxZQ
# ... other VITE_* variables

# Backend Admin SDK (works)
FIREBASE_ADMIN_PROJECT_ID=home-automation-a5x
# ... other ADMIN variables
```

### Required Addition
```bash
# Backend Client SDK (for OAuth login page) - MISSING
FIREBASE_API_KEY=AIzaSyCjPTuY4QnhRbM8ZmbcNgY49TdfS5poxZQ
FIREBASE_AUTH_DOMAIN=home-automation-a5x.firebaseapp.com
FIREBASE_DATABASE_URL=https://home-automation-a5x-default-rtdb.asia-southeast1.firebasedatabase.app
FIREBASE_PROJECT_ID=home-automation-a5x
FIREBASE_STORAGE_BUCKET=home-automation-a5x.firebasestorage.app
FIREBASE_MESSAGING_SENDER_ID=412536927952
FIREBASE_APP_ID=1:412536927952:web:a98ab4de410986d78e10d5
```

**Note**: These are the SAME VALUES as VITE_* versions, just without the VITE_ prefix, so they're accessible in serverless functions at runtime.

---

## Conclusion

### Test Status: ❌ FAIL

**Reason**: Critical blocking issue prevents all runtime tests

**Exact Failure Reason**:
OAuth login page in `api/oauth/authorize.js` attempts to access `VITE_*` prefixed environment variables which are NOT available in Vercel serverless functions at runtime. This causes the Firebase configuration to be empty, preventing user authentication and blocking the entire OAuth flow.

**Exact File That Needs Fixing**:
- `api/oauth/authorize.js` (lines ~176-184)

**Required Change**:
Replace `process.env.VITE_FIREBASE_*` with `process.env.FIREBASE_*` (without VITE_ prefix)

**Additional Requirement**:
Add 7 new environment variables to Vercel (non-VITE prefixed versions of existing frontend config)

**Cannot Proceed Until**: Environment variable issue is fixed

**Recommendation**: Fix the single identified issue, then re-test using `vercel dev` or Vercel preview deployment.
