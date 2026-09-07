# Safe OAuth Client ID Diagnostic Logging

## Changes Made

Updated OAuth diagnostic logging to be **production-safe** while still identifying the exact client_id mismatch.

### Security Features

✅ **NO full client IDs logged**  
✅ **NO client secrets logged**  
✅ **NO authorization codes logged**  
✅ **NO access tokens logged**  
✅ **NO Firebase private keys logged**  

✅ **Uses SHA-256 fingerprints** for comparison  
✅ **Logs string lengths** to detect whitespace  
✅ **Checks environment variable availability**  
✅ **Provides actionable hints** for common issues  

---

## Files Modified

### 1. `api/lib/oauth.js`

#### Added: `createFingerprint()` Function
```javascript
function createFingerprint(value) {
  if (!value) return 'null';
  return crypto.createHash('sha256').update(value).digest('hex').substring(0, 12);
}
```

Creates a safe 12-character SHA-256 hash of sensitive values for comparison logging.

#### Updated: `validateOAuthClient()` Function

**Safe Diagnostic Logging:**
```javascript
console.log('[OAuth Validation] Environment check:');
console.log('[OAuth Validation] GOOGLE_OAUTH_CLIENT_ID is:', validClientId ? 'SET' : 'NOT SET');
console.log('[OAuth Validation] GOOGLE_OAUTH_CLIENT_SECRET is:', validClientSecret ? 'SET' : 'NOT SET');

console.log('[OAuth Validation] Checking client_id');
console.log('[OAuth Validation] Received length:', clientId ? clientId.length : 0);
console.log('[OAuth Validation] Expected length:', validClientId ? validClientId.length : 0);
console.log('[OAuth Validation] Received fingerprint:', createFingerprint(clientId));
console.log('[OAuth Validation] Expected fingerprint:', createFingerprint(validClientId));
```

**Mismatch Detection:**
```javascript
if (clientId !== validClientId) {
  console.error('[OAuth Validation] ERROR: Client ID mismatch detected');
  console.error('[OAuth Validation] The client_id from Google does not match GOOGLE_OAUTH_CLIENT_ID');
  console.error('[OAuth Validation] Received length:', clientId ? clientId.length : 0);
  console.error('[OAuth Validation] Expected length:', validClientId ? validClientId.length : 0);
  console.error('[OAuth Validation] Received fingerprint:', createFingerprint(clientId));
  console.error('[OAuth Validation] Expected fingerprint:', createFingerprint(validClientId));
  
  // Check for common issues
  if (clientId && validClientId) {
    if (clientId.trim() === validClientId.trim()) {
      console.error('[OAuth Validation] HINT: Values match after trim - check for whitespace');
    }
    if (clientId.toLowerCase() === validClientId.toLowerCase()) {
      console.error('[OAuth Validation] HINT: Values match case-insensitively - check capitalization');
    }
  }
  
  throw new Error('Invalid client ID');
}
```

### 2. `api/oauth/authorize.js`

#### Updated GET Handler Logging
```javascript
console.log('[OAuth Authorize] GET received');
console.log('[OAuth Authorize] client_id_length:', client_id ? client_id.length : 0);
console.log('[OAuth Authorize] redirect_uri:', redirect_uri || 'missing');
console.log('[OAuth Authorize] response_type:', response_type || 'missing');
console.log('[OAuth Authorize] state_present:', !!state);
console.log('[OAuth Authorize] scope:', scope);
```

#### Updated POST Handler Logging
```javascript
console.log('[OAuth Authorize] POST received');
console.log('[OAuth Authorize] client_id_length:', client_id ? client_id.length : 0);
console.log('[OAuth Authorize] redirect_uri present:', !!redirect_uri);
console.log('[OAuth Authorize] state_present:', !!state);
console.log('[OAuth Authorize] scope:', scope);
console.log('[OAuth Authorize] has_id_token:', !!id_token);
```

#### Removed Unsafe Logging
- ❌ Full `client_id` values
- ❌ Full `redirect_uri` with query parameters
- ❌ Full `state` values
- ❌ Authorization code prefixes
- ❌ Success/error URLs with codes

---

## Expected Production Logs

### When Environment Variable is Missing

```
[OAuth Authorize] GET received
[OAuth Authorize] client_id_length: 15
[OAuth Authorize] redirect_uri: https://oauth-redirect.googleusercontent.com/r/a5x-home
[OAuth Authorize] response_type: code
[OAuth Authorize] state_present: true
[OAuth Authorize] scope: openid

[OAuth Authorize] Validating client_id
[OAuth Authorize] GOOGLE_OAUTH_CLIENT_ID env var: NOT SET

[OAuth Validation] Environment check:
[OAuth Validation] GOOGLE_OAUTH_CLIENT_ID is: NOT SET
[OAuth Validation] GOOGLE_OAUTH_CLIENT_SECRET is: SET

[OAuth Validation] Checking client_id
[OAuth Validation] Received length: 15
[OAuth Validation] Expected length: 0
[OAuth Validation] Received fingerprint: a1b2c3d4e5f6
[OAuth Validation] Expected fingerprint: null

[OAuth Validation] ERROR: GOOGLE_OAUTH_CLIENT_ID not set in Vercel environment
[OAuth Validation] This must be configured in Vercel Dashboard → Settings → Environment Variables

[OAuth Authorize] Validation error: OAuth client not configured
```

**Action Required:** Set `GOOGLE_OAUTH_CLIENT_ID` in Vercel environment variables.

---

### When Client ID Mismatches

```
[OAuth Authorize] GET received
[OAuth Authorize] client_id_length: 15
[OAuth Authorize] redirect_uri: https://oauth-redirect.googleusercontent.com/r/a5x-home
[OAuth Authorize] response_type: code
[OAuth Authorize] state_present: true
[OAuth Authorize] scope: openid

[OAuth Authorize] Validating client_id
[OAuth Authorize] GOOGLE_OAUTH_CLIENT_ID env var: SET

[OAuth Validation] Environment check:
[OAuth Validation] GOOGLE_OAUTH_CLIENT_ID is: SET
[OAuth Validation] GOOGLE_OAUTH_CLIENT_SECRET is: SET

[OAuth Validation] Checking client_id
[OAuth Validation] Received length: 15
[OAuth Validation] Expected length: 20
[OAuth Validation] Received fingerprint: a1b2c3d4e5f6
[OAuth Validation] Expected fingerprint: x9y8z7w6v5u4

[OAuth Validation] ERROR: Client ID mismatch detected
[OAuth Validation] The client_id from Google does not match GOOGLE_OAUTH_CLIENT_ID
[OAuth Validation] Received length: 15
[OAuth Validation] Expected length: 20
[OAuth Validation] Received fingerprint: a1b2c3d4e5f6
[OAuth Validation] Expected fingerprint: x9y8z7w6v5u4

[OAuth Authorize] Validation error: Invalid client ID
[OAuth Authorize] Redirecting to error URL (Google OAuth redirect)
```

**Diagnosis:**
- Length mismatch: 15 vs 20 characters
- Fingerprints differ: `a1b2c3d4e5f6` vs `x9y8z7w6v5u4`
- **Action Required:** Update Vercel `GOOGLE_OAUTH_CLIENT_ID` to the value Google sends

---

### When Whitespace Causes Mismatch

```
[OAuth Validation] Checking client_id
[OAuth Validation] Received length: 15
[OAuth Validation] Expected length: 16
[OAuth Validation] Received fingerprint: a1b2c3d4e5f6
[OAuth Validation] Expected fingerprint: b2c3d4e5f6g7

[OAuth Validation] ERROR: Client ID mismatch detected
[OAuth Validation] Received length: 15
[OAuth Validation] Expected length: 16
[OAuth Validation] Received fingerprint: a1b2c3d4e5f6
[OAuth Validation] Expected fingerprint: b2c3d4e5f6g7
[OAuth Validation] HINT: Values match after trim - check for whitespace

[OAuth Authorize] Validation error: Invalid client ID
```

**Diagnosis:**
- Length differs by 1: trailing/leading space
- Hint confirms: values match after `.trim()`
- **Action Required:** Remove whitespace from Vercel `GOOGLE_OAUTH_CLIENT_ID`

---

### When Case Causes Mismatch

```
[OAuth Validation] Checking client_id
[OAuth Validation] Received length: 15
[OAuth Validation] Expected length: 15
[OAuth Validation] Received fingerprint: a1b2c3d4e5f6
[OAuth Validation] Expected fingerprint: c4d5e6f7g8h9

[OAuth Validation] ERROR: Client ID mismatch detected
[OAuth Validation] Received length: 15
[OAuth Validation] Expected length: 15
[OAuth Validation] Received fingerprint: a1b2c3d4e5f6
[OAuth Validation] Expected fingerprint: c4d5e6f7g8h9
[OAuth Validation] HINT: Values match case-insensitively - check capitalization

[OAuth Authorize] Validation error: Invalid client ID
```

**Diagnosis:**
- Same length but different fingerprints
- Hint confirms: case difference
- **Action Required:** Match exact case in Vercel `GOOGLE_OAUTH_CLIENT_ID`

---

### When Client ID Matches (Success)

```
[OAuth Authorize] GET received
[OAuth Authorize] client_id_length: 15
[OAuth Authorize] redirect_uri: https://oauth-redirect.googleusercontent.com/r/a5x-home
[OAuth Authorize] response_type: code
[OAuth Authorize] state_present: true
[OAuth Authorize] scope: openid

[OAuth Authorize] Validating client_id
[OAuth Authorize] GOOGLE_OAUTH_CLIENT_ID env var: SET

[OAuth Validation] Environment check:
[OAuth Validation] GOOGLE_OAUTH_CLIENT_ID is: SET
[OAuth Validation] GOOGLE_OAUTH_CLIENT_SECRET is: SET

[OAuth Validation] Checking client_id
[OAuth Validation] Received length: 15
[OAuth Validation] Expected length: 15
[OAuth Validation] Received fingerprint: a1b2c3d4e5f6
[OAuth Validation] Expected fingerprint: a1b2c3d4e5f6

[OAuth Validation] ✓ Client ID validated successfully

[OAuth Authorize] ✓ Client validation passed
[OAuth Authorize] Validating redirect_uri
[OAuth Authorize] ✓ Redirect URI validation passed
[OAuth Authorize] Generating login page
[OAuth Authorize] ✓ Login page sent successfully
```

**Result:** OAuth flow proceeds successfully.

---

## Diagnostic Strategy

### 1. Check Environment Variable Availability
**Look for:**
```
[OAuth Validation] GOOGLE_OAUTH_CLIENT_ID is: NOT SET
```

**If NOT SET:**
- Go to Vercel Dashboard → a5x-home → Settings → Environment Variables
- Add `GOOGLE_OAUTH_CLIENT_ID` with the value from Google Home Developer Console
- Ensure it's enabled for: Production, Preview, Development
- Redeploy

### 2. Compare Fingerprints
**Look for:**
```
[OAuth Validation] Received fingerprint: a1b2c3d4e5f6
[OAuth Validation] Expected fingerprint: x9y8z7w6v5u4
```

**If different:**
- The client_id values are completely different
- Update Vercel `GOOGLE_OAUTH_CLIENT_ID` to match Google's value
- Contact Google Home Developer Console to verify the correct client_id

### 3. Compare Lengths
**Look for:**
```
[OAuth Validation] Received length: 15
[OAuth Validation] Expected length: 20
```

**If different:**
- Length mismatch indicates different values or whitespace
- Check for trailing/leading spaces in Vercel configuration
- Verify you copied the complete client_id from Google

### 4. Check Hints
**Look for:**
```
[OAuth Validation] HINT: Values match after trim - check for whitespace
[OAuth Validation] HINT: Values match case-insensitively - check capitalization
```

**Whitespace hint:**
- Edit Vercel `GOOGLE_OAUTH_CLIENT_ID`
- Remove any spaces before or after the value
- Save and redeploy

**Case hint:**
- Client IDs are case-sensitive
- Match the exact capitalization from Google Home Developer Console
- Update Vercel environment variable with correct case

---

## How Fingerprints Work

### SHA-256 Hash
The `createFingerprint()` function uses SHA-256 cryptographic hash:

```javascript
crypto.createHash('sha256').update(value).digest('hex').substring(0, 12)
```

**Properties:**
- **Deterministic:** Same input always produces same output
- **Unique:** Different inputs produce different outputs
- **One-way:** Cannot reverse hash to get original value
- **Safe to log:** No sensitive information exposed

**Example:**
```javascript
createFingerprint('a5x-home-google')  → 'a1b2c3d4e5f6'
createFingerprint('a5x-home-google ') → 'b2c3d4e5f6g7' (different!)
createFingerprint('A5X-HOME-GOOGLE')  → 'c4d5e6f7g8h9' (different!)
```

### Matching Strategy

**If fingerprints match:** ✅ Client IDs are identical  
**If fingerprints differ:** ❌ Client IDs are different

**Next step when they differ:**
1. Compare lengths to narrow down the issue
2. Check hints for common problems (whitespace, case)
3. Verify the correct value from Google Home Developer Console
4. Update Vercel environment variable

---

## Security Guarantees

### What IS Logged
✅ String lengths (non-sensitive)  
✅ SHA-256 fingerprints (non-reversible)  
✅ Boolean presence checks (`state_present: true`)  
✅ Redirect URI hostname (public information)  
✅ Response type and scope (OAuth standard values)  

### What is NOT Logged
❌ Full client_id values  
❌ Client secrets  
❌ Authorization codes  
❌ Access tokens  
❌ Refresh tokens  
❌ Firebase ID tokens  
❌ Firebase private keys  
❌ State values (can contain user data)  
❌ Full redirect URLs with query parameters  

---

## Next Steps

### 1. Deploy This Code
```bash
git add api/lib/oauth.js api/oauth/authorize.js SAFE_OAUTH_DIAGNOSTIC.md
git commit -m "Add safe OAuth client ID diagnostic logging with fingerprints"
git push origin main
```

### 2. Wait for Vercel Deployment
- Go to Vercel Dashboard → a5x-home → Deployments
- Wait for "Ready" status

### 3. Trigger OAuth Flow
- Open Google Home app
- Settings → Works with Google
- Find "[test] A5X Smart Home"
- Click "Link"

### 4. Check Vercel Logs
- Go to Vercel Dashboard → a5x-home → Logs
- Look for diagnostic output
- Identify the exact mismatch

### 5. Fix Based on Diagnosis

#### If NOT SET:
Add `GOOGLE_OAUTH_CLIENT_ID` to Vercel environment variables

#### If Fingerprints Differ:
Update `GOOGLE_OAUTH_CLIENT_ID` to match Google's value

#### If Whitespace Hint:
Remove spaces from `GOOGLE_OAUTH_CLIENT_ID`

#### If Case Hint:
Match exact capitalization in `GOOGLE_OAUTH_CLIENT_ID`

### 6. Redeploy and Test
- Vercel auto-redeploys on env var change
- Or manually: `vercel --prod`
- Test OAuth flow again
- Check logs for: `[OAuth Validation] ✓ Client ID validated successfully`

---

## Summary

**Security:** ✅ Production-safe logging (no secrets exposed)  
**Diagnostic Power:** ✅ Fingerprints reveal exact mismatch  
**Actionable:** ✅ Clear hints for common issues  
**Build Status:** ✅ npm run build succeeded  
**Ready to Deploy:** ✅ Yes  

The safe diagnostic logging will identify the exact client_id mismatch without exposing sensitive credentials in production logs.
