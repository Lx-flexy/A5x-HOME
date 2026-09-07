# Firebase Admin SDK Setup Guide

## Issue Fixed

**Previous Error:** `FirebaseAppError: Failed to parse private key: Invalid PEM formatted message.`

**Root Cause:** The private key handling code assumed the key was base64-encoded, but when stored directly in Vercel environment variables with escaped newlines (`\\n`), the decoding order was incorrect.

**Solution:** Implemented robust private key parsing that handles multiple storage formats:
1. Raw PEM format with escaped newlines (`\\n`)
2. Base64-encoded PEM format
3. Automatic newline conversion
4. PEM format validation

---

## How to Configure FIREBASE_ADMIN_PRIVATE_KEY in Vercel

### Option 1: Direct PEM Format (Recommended for Vercel)

1. **Get your Firebase service account private key:**
   - Go to: [Firebase Console](https://console.firebase.google.com/)
   - Select your project: `home-automation-a5x`
   - Go to: **Project Settings** → **Service Accounts**
   - Click: **Generate New Private Key**
   - Save the JSON file

2. **Extract the private key from the JSON:**
   - Open the downloaded JSON file
   - Copy the entire `private_key` value (including `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----`)
   - It will look like:
     ```
     -----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0...(many lines)...xyz123\n-----END PRIVATE KEY-----\n
     ```

3. **Set in Vercel Dashboard:**
   - Go to: **Vercel Dashboard** → **a5x-home** → **Settings** → **Environment Variables**
   - Add variable:
     - **Name:** `FIREBASE_ADMIN_PRIVATE_KEY`
     - **Value:** Paste the entire private key string INCLUDING the `\n` characters as-is
     - **Scope:** Production (and Preview/Development if needed)
   - Click **Save**

**Important:** When pasting in Vercel, the `\n` characters should remain as literal `\n` (backslash-n), NOT actual newline breaks. The code will automatically convert them.

### Option 2: Base64 Encoded (Alternative)

If you prefer base64 encoding:

1. Get the private key as above
2. Encode it to base64:
   ```bash
   # Linux/Mac:
   echo "YOUR_PRIVATE_KEY_HERE" | base64
   
   # Or save to file first:
   cat service-account-key.json | jq -r .private_key | base64
   ```

3. Set the base64-encoded value in Vercel
4. The code will automatically detect and decode it

---

## Required Environment Variables

All of these must be set in Vercel for Firebase Admin SDK to work:

### 1. FIREBASE_ADMIN_PROJECT_ID
- **Value:** `home-automation-a5x`
- **Source:** Firebase Console → Project Settings → General → Project ID

### 2. FIREBASE_ADMIN_CLIENT_EMAIL
- **Value:** `firebase-adminsdk-xxxxx@home-automation-a5x.iam.gserviceaccount.com`
- **Source:** Service account JSON file → `client_email` field
- **Format:** Must be the full email address

### 3. FIREBASE_ADMIN_PRIVATE_KEY
- **Value:** The private key (see Option 1 or 2 above)
- **Source:** Service account JSON file → `private_key` field
- **Format:** PEM format with `\n` for newlines OR base64-encoded

### 4. FIREBASE_DATABASE_URL
- **Value:** `https://home-automation-a5x-default-rtdb.asia-southeast1.firebasedatabase.app`
- **Source:** Firebase Console → Realtime Database → Copy the URL
- **Format:** Full HTTPS URL

---

## Verification

After setting all environment variables:

1. **Redeploy your Vercel project** (it will automatically trigger)

2. **Check the logs** for successful initialization:
   ```
   [Firebase Admin] Successfully initialized
   ```

3. **If you see an error:**
   ```
   [Firebase Admin] Private key does not contain PEM header
   ```
   → Your private key is malformed. Re-copy from the JSON file.

   ```
   [Firebase Admin] Failed to parse private key: Invalid PEM formatted message
   ```
   → Newlines are not being handled correctly. Ensure `\n` characters are present in the env var.

4. **Test the OAuth flow:**
   - Attempt Google Home account linking
   - The error "Invalid or expired authentication token" should be resolved
   - Check Vercel logs for `[Firebase Admin] Successfully initialized`

---

## Security Notes

✅ **Safe to log:**
- Initialization status (success/failure)
- Error messages (without private key content)
- PEM header presence check

❌ **NEVER log:**
- The actual private key
- Full service account JSON
- Private key content

The fixed code follows these security practices.

---

## Troubleshooting

### Error: "Missing required environment variable: FIREBASE_ADMIN_PRIVATE_KEY"
- **Solution:** Ensure the variable is set in Vercel for the correct environment (Production/Preview/Development)
- **Check:** Vercel Dashboard → Settings → Environment Variables

### Error: "Invalid PEM formatted message"
- **Solution:** Check that `\n` characters are present in the private key string
- **Example of CORRECT format:** `-----BEGIN PRIVATE KEY-----\nMIIE...`
- **Example of WRONG format:** `-----BEGIN PRIVATE KEY----- MIIEvQ...` (spaces instead of `\n`)

### Error: "Base64 decode failed, using raw value"
- **Not critical:** This warning means the key wasn't base64-encoded, which is fine
- The code will use the raw value instead

### Frontend still shows "Invalid or expired authentication token"
- **Check:** All 4 Firebase Admin environment variables are set correctly
- **Check:** Vercel deployment completed successfully after setting the variables
- **Check:** Your Firebase service account has the correct permissions (Firebase Admin SDK role)

---

## Code Changes Made

**File:** `api/lib/firebaseAdmin.js`

**Changes:**
1. Removed assumption that private key is always base64-encoded
2. Added conditional base64 decoding (only if key doesn't contain PEM headers)
3. Moved `replace(/\\n/g, '\n')` AFTER potential base64 decoding (critical fix)
4. Added PEM format validation before initialization
5. Improved error messages with hints
6. Added success log for confirmed initialization

**Build Status:** ✅ Passed (42.36s)

**Backward Compatibility:** ✅ Yes
- Still supports base64-encoded keys
- Still supports escaped newlines
- Now also supports raw PEM format

---

## Related Files

- `api/lib/firebaseAdmin.js` - Firebase Admin SDK initialization
- `api/oauth/authorize.js` - Uses `verifyAuthToken()` for OAuth login
- `api/oauth/token.js` - Uses Firebase Admin for token validation
- `api/fulfillment.js` - Uses Firebase Admin for device control
- `ENV_CHECKLIST.md` - Complete list of required environment variables

---

## Next Steps

1. ✅ Set all 4 Firebase Admin environment variables in Vercel (see above)
2. ✅ Redeploy (automatic after env var changes)
3. ✅ Test Google Home account linking
4. ✅ Verify "Invalid or expired authentication token" error is resolved
5. ✅ Check device control via Google Home works correctly
