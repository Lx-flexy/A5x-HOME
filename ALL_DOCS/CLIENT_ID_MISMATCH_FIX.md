# OAuth Client ID Mismatch - Diagnostic Fix

## Problem Identified

Production Vercel logs show:
```
[OAuth Authorize] Validation error: Error: Invalid client ID
[OAuth Authorize] Redirecting to error URL: https://oauth-redirect.googleusercontent.com/r/a5x-home?error=invalid_client...
```

**Root Cause:** Client ID mismatch between:
1. Google Home's OAuth request (`client_id` parameter)
2. Vercel environment variable (`GOOGLE_OAUTH_CLIENT_ID`)

---

## Files Changed

### 1. api/lib/oauth.js
**Purpose:** Enhanced logging to diagnose exact mismatch

**Changes:**
- Added detailed comparison logging
- Logs received vs expected client_id
- Logs string lengths for comparison
- Logs first 10 characters for preview
- **Temporarily logs full values for diagnosis** (will show exact mismatch)

### 2. api/oauth/authorize.js
**Purpose:** Enhanced request logging

**Changes:**
- Added `client_id_length` to request logs
- Helps identify whitespace or encoding issues

---

## Enhanced Logging Output

After deploying, the logs will show:

```
[OAuth Authorize] GET received: {
  client_id: 'value-from-google',
  client_id_length: XX,
  redirect_uri: '...',
  response_type: 'code',
  state: '...',
  scope: 'openid'
}

[OAuth Authorize] Validating client_id against: SET

[OAuth Validation] Checking client_id
[OAuth Validation] Received client_id length: XX
[OAuth Validation] Expected client_id length: YY
[OAuth Validation] Received (first 10 chars): abc123...
[OAuth Validation] Expected (first 10 chars): xyz456...
[OAuth Validation] Client ID mismatch!
[OAuth Validation] Received: <EXACT_VALUE_FROM_GOOGLE>
[OAuth Validation] Expected: <EXACT_VALUE_IN_VERCEL>
```

---

## How to Fix

### Step 1: Deploy This Code
```bash
git add .
git commit -m "Add OAuth client ID diagnostic logging"
git push origin main
```

Wait for Vercel deployment.

### Step 2: Trigger OAuth Flow
1. Open Google Home app
2. Try to link A5X Smart Home account
3. This will trigger the authorization request

### Step 3: Check Vercel Logs
Go to: Vercel Dashboard → a5x-home → Logs

Look for the diagnostic output showing:
```
[OAuth Validation] Received: XXXXX
[OAuth Validation] Expected: YYYYY
```

### Step 4: Identify the Mismatch

**Common issues:**
- Extra spaces: `"a5x-home "` vs `"a5x-home"`
- Case difference: `"A5X-HOME"` vs `"a5x-home"`
- Different value: `"a5x-home-google"` vs `"a5x-home-production"`
- URL encoding: `"a5x%20home"` vs `"a5x home"`

### Step 5: Update Vercel Environment Variable

The **correct value** is what Google sends (the "Received" value).

1. Go to: Vercel Dashboard → a5x-home → Settings → Environment Variables
2. Find: `GOOGLE_OAUTH_CLIENT_ID`
3. Click Edit
4. Update to **EXACT** value shown in logs under "Received:"
5. Ensure it's enabled for: Production, Preview, Development
6. Save

### Step 6: Redeploy

Vercel will auto-redeploy, or manually:
```bash
vercel --prod
```

### Step 7: Test Again

1. Open Google Home app
2. Try to link A5X Smart Home account
3. Check logs for: `[OAuth Validation] Client ID validated successfully`
4. Account linking should complete

---

## Three Values That Must Match

### 1. Google Home Developer Console
**Location:** Actions Console → Account Linking → Client ID  
**This is the source of truth** - Google generates this during setup

### 2. Vercel Environment Variable
**Variable:** `GOOGLE_OAUTH_CLIENT_ID`  
**Must match:** The value Google Home sends in requests  
**Action:** Update this to match #1

### 3. OAuth Request from Google
**Sent as:** `?client_id=...` in authorization URL  
**This is:** What Google actually sends (should match #1)  
**Check:** Vercel logs show this value

---

## Validation Logic

The code in `api/lib/oauth.js` performs **strict string comparison**:

```javascript
if (clientId !== validClientId) {
  throw new Error('Invalid client ID');
}
```

This means:
- ✅ `"a5x-home"` === `"a5x-home"` → PASS
- ❌ `"a5x-home"` === `"a5x-home "` → FAIL (trailing space)
- ❌ `"a5x-home"` === `"A5X-HOME"` → FAIL (case difference)
- ❌ `"a5x-home"` === `"a5x-home-google"` → FAIL (different value)

---

## Security Considerations

### Client ID is NOT Secret
- Client ID is sent in URLs (visible in browser)
- Logging it for diagnosis is safe
- It's similar to a username (identifies the client)

### Client SECRET is Secret
- Never log the client secret
- Current code does not log secrets
- Secrets are only used in token exchange

### After Fixing
Once the mismatch is identified and fixed:
- Keep the diagnostic logging temporarily
- Or reduce it to just length and first 10 chars
- Full logging helps with future debugging

---

## What NOT To Do

❌ **DO NOT** change the client ID in Google Home Developer Console  
   Reason: Would break the integration

❌ **DO NOT** hardcode client ID in source code  
   Reason: Not configurable, security issue

❌ **DO NOT** remove client validation  
   Reason: Security vulnerability

❌ **DO NOT** make validation case-insensitive  
   Reason: OAuth spec requires exact match

✅ **DO** update Vercel environment variable to match Google's value  
   Reason: This is the correct and secure fix

---

## Expected Outcome

### Before Fix
```
[OAuth Validation] Received: a5x-home-google
[OAuth Validation] Expected: a5x-home-production
[OAuth Validation] Client ID mismatch!
→ Error: Invalid client ID
→ Redirect to error URL
→ Account linking FAILS ❌
```

### After Fix
```
[OAuth Validation] Received: a5x-home-google
[OAuth Validation] Expected: a5x-home-google
[OAuth Validation] Client ID validated successfully
→ Authorization code generated
→ Redirect to Google with code
→ Account linking SUCCEEDS ✅
```

---

## Current Status

**Diagnostic Logging:** ✅ Added  
**Build:** ✅ Success  
**Deployment:** Ready  
**Next Step:** Deploy → Test → Read logs → Update Vercel env var → Redeploy

---

## Summary

**Problem:** OAuth client ID mismatch causing validation failure  
**Solution:** Enhanced diagnostic logging to identify exact mismatch  
**Action Required:** 
1. Deploy this code
2. Trigger OAuth flow
3. Check logs for exact client_id values
4. Update Vercel `GOOGLE_OAUTH_CLIENT_ID` to match Google's value
5. Redeploy and test

**Files Modified:** 2
- `api/lib/oauth.js` (added diagnostic logging)
- `api/oauth/authorize.js` (added request logging)

**Build Status:** ✅ Success  
**Ready to Deploy:** ✅ Yes

The diagnostic code will reveal the exact client_id mismatch, allowing you to update the Vercel environment variable with the correct value.
