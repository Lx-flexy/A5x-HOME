# A5X Home - Google Home Integration Deployment Instructions

## Quick Start Guide

This document provides step-by-step instructions to deploy the Google Home Cloud-to-Cloud integration.

---

## Prerequisites

- Vercel account with access to `a5x-home` project
- Firebase project service account credentials
- Google Home Developer Console access

---

## Step 1: Generate Firebase Admin Credentials

### 1.1 Download Service Account Key
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select project: `home-automation-a5x`
3. Click Settings (gear icon) → Project Settings
4. Navigate to "Service Accounts" tab
5. Click "Generate New Private Key"
6. Download the JSON file (keep it secret!)

### 1.2 Extract and Encode Private Key
```bash
# Open the downloaded JSON file
# Find the "private_key" field
# Copy the entire key including "-----BEGIN PRIVATE KEY-----" and "-----END PRIVATE KEY-----"

# On macOS/Linux, encode it:
echo -n "YOUR_PRIVATE_KEY_HERE" | base64

# On Windows PowerShell:
[Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes("YOUR_PRIVATE_KEY_HERE"))
```

### 1.3 Note Down Credentials
From the downloaded JSON file, extract:
- `project_id` → For `FIREBASE_ADMIN_PROJECT_ID`
- `client_email` → For `FIREBASE_ADMIN_CLIENT_EMAIL`
- Encoded `private_key` → For `FIREBASE_ADMIN_PRIVATE_KEY`

---

## Step 2: Configure Vercel Environment Variables

### 2.1 Access Vercel Dashboard
1. Go to https://vercel.com/dashboard
2. Select project: `a5x-home`
3. Click "Settings" → "Environment Variables"

### 2.2 Add Firebase Admin Variables
Click "Add New" for each variable:

| Name | Value | Environments |
|------|-------|--------------|
| `FIREBASE_ADMIN_PROJECT_ID` | `home-automation-a5x` | Production, Preview, Development |
| `FIREBASE_ADMIN_CLIENT_EMAIL` | `firebase-adminsdk-xxxxx@home-automation-a5x.iam.gserviceaccount.com` | Production, Preview, Development |
| `FIREBASE_ADMIN_PRIVATE_KEY` | `<base64_encoded_private_key>` | Production, Preview, Development |
| `FIREBASE_DATABASE_URL` | `https://home-automation-a5x-default-rtdb.asia-southeast1.firebasedatabase.app` | Production, Preview, Development |

### 2.3 Add Placeholder Google OAuth Variables
(These will be updated after Google Home console setup)

| Name | Value | Environments |
|------|-------|--------------|
| `GOOGLE_OAUTH_CLIENT_ID` | `placeholder` | Production, Preview, Development |
| `GOOGLE_OAUTH_CLIENT_SECRET` | `placeholder` | Production, Preview, Development |

### 2.4 Verify Existing Firebase Client Variables
Ensure these exist (they should already be configured):
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_DATABASE_URL`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

---

## Step 3: Deploy to Vercel

### 3.1 Deploy via Git (Recommended)
```bash
# Commit all changes
git add .
git commit -m "Add Google Home Cloud-to-Cloud integration"
git push origin main
```

Vercel will automatically deploy.

### 3.2 Deploy via Vercel CLI (Alternative)
```bash
# Install Vercel CLI if not installed
npm install -g vercel

# Deploy to production
vercel --prod
```

### 3.3 Note Your Deployment URL
After deployment completes, note the production URL:
```
https://a5x-home.vercel.app
```

Or check your custom domain if configured.

---

## Step 4: Configure Google Home Developer Console

### 4.1 Create Smart Home Project
1. Go to https://console.actions.google.com/
2. Click "New Project"
3. Enter Project Name: `A5X Home`
4. Select "Smart Home" action type

### 4.2 Configure Account Linking
Navigate to "Develop" → "Account Linking"

**Linking Type:**
- Select "OAuth" → "Authorization Code"

**Client Information:**

Generate secure credentials:
```bash
# Generate Client ID (use any unique identifier)
Client ID: a5x-home-production-oauth-client

# Generate Client Secret (use a secure random string)
# On macOS/Linux:
openssl rand -hex 32

# On Windows PowerShell:
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | % {[char]$_})
```

Fill in the form:
- **Client ID**: `a5x-home-production-oauth-client` (or your generated ID)
- **Client Secret**: `<your_generated_secret>` (keep this secret!)
- **Authorization URL**: `https://a5x-home.vercel.app/api/oauth/authorize`
- **Token URL**: `https://a5x-home.vercel.app/api/oauth/token`
- **Scopes**: Leave empty or enter `openid`

Click "Save"

### 4.3 Update Vercel Environment Variables
Go back to Vercel Dashboard → Environment Variables

Update the placeholders:
- `GOOGLE_OAUTH_CLIENT_ID` → `a5x-home-production-oauth-client`
- `GOOGLE_OAUTH_CLIENT_SECRET` → `<your_generated_secret>`

**IMPORTANT**: Redeploy after updating:
```bash
vercel --prod
```

### 4.4 Configure Smart Home Action
Navigate to "Develop" → "Actions"

**Fulfillment:**
- **Fulfillment URL**: `https://a5x-home.vercel.app/api/fulfillment`
- Leave other fields as default

Click "Save"

---

## Step 5: Test the Integration

### 5.1 Enable Testing Mode
1. In Google Actions Console, click "Test" tab
2. Click "Start Testing"
3. You should see "Testing enabled for this project"

### 5.2 Link Account in Google Home App
1. Open Google Home app on your phone
2. Tap "+" (Add) → "Set up device"
3. Tap "Works with Google"
4. Search for "A5X Home" in the test section
5. Tap on it
6. You'll be redirected to your OAuth login page
7. Sign in with your A5X Google account
8. Grant permissions
9. You should be redirected back to Google Home

### 5.3 Verify Devices Appear
1. Check if your A5X devices appear in Google Home
2. They should be grouped by room
3. Try controlling a device: "Hey Google, turn on Living Room Light"

---

## Step 6: Monitor and Debug

### 6.1 View Vercel Logs
```bash
# View real-time logs
vercel logs --follow

# View last 100 log entries
vercel logs
```

Or visit: Vercel Dashboard → Your Project → Logs

### 6.2 Common Issues and Solutions

#### Issue: "OAuth client not configured"
**Solution**: Ensure `GOOGLE_OAUTH_CLIENT_ID` is set in Vercel and redeployed

#### Issue: "Firebase configuration missing"
**Solution**: Ensure all `VITE_FIREBASE_*` variables are set

#### Issue: "Invalid or expired authentication token"
**Solution**: Re-authenticate in Google Home app

#### Issue: Devices not appearing
**Solution**: 
1. Check device visibility in A5X app (Settings → Device → Edit Output)
2. Ensure outputs are marked as visible
3. Try unlinking and relinking account

#### Issue: "Failed to retrieve user devices"
**Solution**: Check Firebase Admin credentials and Firestore permissions

---

## Step 7: Production Checklist

Before announcing to users:

- [ ] All environment variables configured
- [ ] OAuth flow tested end-to-end
- [ ] Devices appear in Google Home
- [ ] ON/OFF commands work correctly
- [ ] Multiple users tested (if applicable)
- [ ] Vercel logs monitored for errors
- [ ] Firebase RTDB updates verified
- [ ] Unlink/relink flow tested

---

## Step 8: Submit for Google Review (Optional)

To make your integration publicly available:

### 8.1 Complete Project Information
In Google Actions Console:
- Add app logo (512x512 PNG)
- Fill in description
- Add privacy policy URL
- Add terms of service URL

### 8.2 Submit for Review
1. Click "Deploy" tab in Actions Console
2. Click "Submit for Production"
3. Wait for Google review (typically 1-2 weeks)

**Note**: You can use in test mode indefinitely without public release.

---

## Maintenance

### Updating Environment Variables
```bash
# After updating variables in Vercel Dashboard:
vercel --prod  # Redeploy to apply changes
```

### Monitoring Token Storage
⚠️ **Current Limitation**: Tokens stored in memory (lost on cold starts)

**Symptoms**: Users need to re-authenticate frequently  
**Solution**: Implement Redis (see GOOGLE_HOME_VERIFICATION_REPORT.md)

---

## Support and Troubleshooting

### Check Logs
```bash
# Vercel logs
vercel logs --follow

# Filter for specific endpoint
vercel logs --follow | grep "OAuth"
vercel logs --follow | grep "Fulfillment"
```

### Test Individual Endpoints
```bash
# Test authorization endpoint
curl "https://a5x-home.vercel.app/api/oauth/authorize?client_id=test&redirect_uri=https://oauth-redirect.googleusercontent.com/r/test&response_type=code&state=test"

# Should return HTML page
```

### Firebase Console Monitoring
- Check Firestore reads/writes
- Check RTDB usage
- Monitor Auth usage

---

## Rollback Procedure

If something goes wrong:

```bash
# View previous deployments
vercel ls

# Rollback to previous deployment
vercel rollback <deployment-url>
```

---

## Contact

For issues or questions:
- Check GOOGLE_HOME_VERIFICATION_REPORT.md for detailed technical information
- Check GOOGLE_HOME_API_DOCUMENTATION.md for API reference
- Review Vercel logs for error messages

---

## Summary

**You are now ready to deploy!**

The integration is functional and ready for testing. Follow steps 1-6 to get it running, then proceed to step 7 for production use.

Remember: Token storage uses in-memory (requires Redis for production stability).
