# OAuth Client ID Mismatch - Diagnostic Report

## Problem

Production logs show:
```
[OAuth Authorize] Validation error: Error: Invalid client ID
[OAuth Authorize] Redirecting to error URL: https://oauth-redirect.googleusercontent.com/r/a5x-home?error=invalid_client...
```

This confirms **client_id mismatch** between:
1. Google Home's OAuth request
2. Vercel's `GOOGLE_OAUTH_CLIENT_ID` environment variable

---

## Root Cause

The validation in `api/lib/oauth.js` performs strict equality check:

```javascript
if (clientId !== validClientId) {
  throw new Error('Invalid client ID');
}
```

This fails when:
- Google Home sends: `client_id=X`
- Vercel environment has: `GOOGLE_OAUTH_CLIENT_ID=Y`
- X ≠ Y (even by a single character)

---

## Enhanced Logging Added

### In api/lib/oauth.js - validateOAuthClient()

Now logs:
```javascript
[OAuth Validation] Checking client_id
[OAuth Validation] Received client_id length: XX
[OAuth Validation] Expected client_id length: YY
[OAuth Validation] Received (first 10 chars): abc123...
[OAuth Validation] Expected (first 10 chars): xyz456...
[OAuth Validation] Client ID mismatch!
[OAuth Validation] Received: <full_client_id_from_google>
[OAuth Validation] Expected: <full_client_id_from_vercel>
```

### In api/oauth/authorize.js - GET handler

Now logs:
```javascript
[OAuth Authorize] GET received: {
  client_id: '...',
  client_id_length: XX,
  redirect_uri: '...',
  ...
}
```

---

## Three Values That MUST Match Exactly

### 1. Google Home Developer Console
**Location:** Google Actions Console → Account Linking → Client ID

**Current Value:** `a5x-home-google` (suspected)

**Where to Check:**
1. Go to https://console.actions.google.com/
2. Select your "A5X Smart Home" project
3. Navigate to: Develop → Account Linking
4. Look at "Client information" section
5. Copy the exact "Client ID" value

### 2. Vercel Environment Variable
**Location:** Vercel Dashboard → a5x-home → Settings → Environment Variables

**Variable Name:** `GOOGLE_OAUTH_CLIENT_ID`

**Where to Check:**
1. Go to https://vercel.com/dashboard
2. Select project: a5x-home
3. Settings → Environment Variables
4. Find `GOOGLE_OAUTH_CLIENT_ID`
5. Check the exact value (case-sensitive)

### 3. Google Home OAuth Request
**Source:** Google Home sends this in the authorization request

**Received as:** `req.query.client_id` in `/api/oauth/authorize`

**Where to Check:**
- Check Vercel production logs after next authorization attempt
- Look for: `[OAuth Authorize] GET received: { client_id: '...' }`
- Look for: `[OAuth Validation] Received: ...`

---

## Common Mismatch Scenarios

### Scenario A: Typo or Extra Space
```
Google sends:  "a5x-home-google"
Vercel has:    "a5x-home-google " (trailing space)
Result:        MISMATCH ❌
```

### Scenario B: Different Client ID
```
Google sends:  "a5x-home-google"
Vercel has:    "a5x-home-production"
Result:        MISMATCH ❌
```

### Scenario C: URL Encoding
```
Google sends:  "a5x-home%20google" (URL encoded)
Vercel has:    "a5x-home google" (plain text)
Result:        MISMATCH ❌
```

### Scenario D: Case Sensitivity
```
Google sends:  "A5X-HOME-GOOGLE"
Vercel has:    "a5x-home-google"
Result:        MISMATCH ❌
```

---

## Diagnostic Steps

### Step 1: Check Vercel Logs (Already Done)
✅ Confirmed error: "Invalid client ID"
✅ Confirmed validation is failing

### Step 2: Deploy Enhanced Logging
```bash
npm run build
git add .
git commit -m "Add OAuth client ID diagnostic logging"
git push origin main
```

Wait for Vercel deployment to complete.

### Step 3: Trigger OAuth Flow
1. Open Google Home app
2. Try to link A5X Home account
3. Wait for authorization request

### Step 4: Check Enhanced Logs
Check Vercel logs for:
```
[OAuth Validation] Received: <actual_value_from_google>
[OAuth Validation] Expected: <actual_value_from_vercel>
```

This will show the EXACT mismatch.

### Step 5: Identify the Correct Value

The correct value is the one Google Home sends in the authorization request.

**Why?** Because:
1. Google Home is the OAuth client
2. Google generates the client_id during Account Linking setup
3. We must configure our server to accept Google's client_id
4. We cannot change what Google sends

### Step 6: Fix Vercel Environment Variable

Once you know the exact client_id Google sends:

1. Go to Vercel Dashboard → a5x-home → Settings → Environment Variables
2. Edit `GOOGLE_OAUTH_CLIENT_ID`
3. Set it to the EXACT value Google sends (copy-paste from logs)
4. Ensure no extra spaces, no URL encoding
5. Save and redeploy

---

## Expected Google Home Client ID Format

Based on Google's OAuth redirect URL pattern:
```
https://oauth-redirect.googleusercontent.com/r/a5x-home
```

The project identifier is `a5x-home`.

**Possible client_id formats:**
- `a5x-home`
- `a5x-home-google`
- `a5x-home-production`
- Or a Google-generated value like: `1234567890-abcdefg.apps.googleusercontent.com`

**DO NOT GUESS** - Wait for logs to show the exact value.

---

## What NOT To Do

❌ **DO NOT** change the client_id in Google Home Developer Console  
   (This would break existing integrations)

❌ **DO NOT** hardcode a client_id in the source code  
   (Security issue, not configurable)

❌ **DO NOT** remove or weaken client validation  
   (Security vulnerability)

❌ **DO NOT** accept any client_id  
   (Would allow unauthorized access)

✅ **DO** update Vercel environment variable to match Google's value  
   (This is the correct fix)

---

## After Fix Checklist

Once Vercel `GOOGLE_OAUTH_CLIENT_ID` is updated:

1. ✅ Redeploy to Vercel (automatic or `vercel --prod`)
2. ✅ Wait for deployment to complete
3. ✅ Test OAuth flow in Google Home app
4. ✅ Check logs for: `[OAuth Validation] Client ID validated successfully`
5. ✅ Verify authorization code is generated
6. ✅ Verify redirect to Google succeeds
7. ✅ Verify account linking completes

---

## Security Note

The enhanced logging **temporarily** exposes the full client_id in logs for diagnostic purposes.

**After fixing the mismatch:**
- Consider removing the detailed logging
- Or keep only length comparison and first 10 characters
- Client ID is not secret (it's sent in URLs)
- Client SECRET should never be logged

---

## Current Status

**Diagnostic logging:** ✅ Added  
**Build status:** Pending  
**Ready to deploy:** After successful build  
**Next step:** Deploy and check logs for exact client_id values  

---

## Expected Log Output (After Deployment)

When the OAuth flow is triggered, you should see:

```
[OAuth Authorize] GET received: {
  client_id: 'actual-value-from-google',
  client_id_length: XX,
  redirect_uri: 'https://oauth-redirect.googleusercontent.com/r/a5x-home',
  response_type: 'code',
  state: 'random-state-value',
  scope: 'openid'
}

[OAuth Authorize] Validating client_id against: SET

[OAuth Validation] Checking client_id
[OAuth Validation] Received client_id length: XX
[OAuth Validation] Expected client_id length: YY
[OAuth Validation] Received (first 10 chars): actual-val...
[OAuth Validation] Expected (first 10 chars): configured...
[OAuth Validation] Client ID mismatch!
[OAuth Validation] Received: actual-value-from-google
[OAuth Validation] Expected: value-in-vercel-env-var
```

**Compare these two values** and update Vercel environment variable to match the "Received" value.

---

## Summary

**Problem:** Client ID mismatch causing OAuth validation failure  
**Diagnostic Tool:** Enhanced logging to show exact mismatch  
**Solution:** Update Vercel `GOOGLE_OAUTH_CLIENT_ID` to match Google's value  
**Status:** Diagnostic logging ready, waiting for deployment and test  
**Action Required:** Deploy, test, read logs, update Vercel env var  
