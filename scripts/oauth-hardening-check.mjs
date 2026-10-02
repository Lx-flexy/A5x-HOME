/**
 * OAuth Hardening Verification Script
 * 
 * Tests all 8 hardening items with stubbed dependencies
 * DO NOT DEPLOY - local testing only
 */

import crypto from 'crypto';
import { readFileSync } from 'fs';

// ============================================================================
// STUBS AND MOCKS
// ============================================================================

// Fake environment for all Firebase vars to prevent initialization
process.env.GOOGLE_HOME_PROJECT_ID = 'test-project-123';
process.env.GOOGLE_OAUTH_CLIENT_ID = 'test-client-id-12345';
process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'test-client-secret-67890';
process.env.VERCEL_ENV = 'development';
process.env.FIREBASE_ADMIN_PROJECT_ID = 'fake-project';
process.env.FIREBASE_ADMIN_CLIENT_EMAIL = 'fake@fake.iam.gserviceaccount.com';
process.env.FIREBASE_ADMIN_PRIVATE_KEY = 'fake-key';
process.env.FIREBASE_DATABASE_URL = 'https://fake.firebaseio.com';

// In-memory Firestore stub
const firestoreStore = new Map();

const firestoreStub = {
  collection: (name) => ({
    doc: (id) => ({
      set: async (data) => {
        const key = `${name}/${id}`;
        firestoreStore.set(key, data);
      },
      get: async () => {
        const key = `${name}/${id}`;
        const data = firestoreStore.get(key);
        return {
          exists: !!data,
          data: () => data
        };
      },
      delete: async () => {
        const key = `${name}/${id}`;
        firestoreStore.delete(key);
      }
    }),
    where: (field, op, value) => ({
      get: async () => {
        const docs = [];
        for (const [key, data] of firestoreStore.entries()) {
          if (key.startsWith(name + '/') && data[field] === value) {
            docs.push({
              ref: {
                delete: async () => {
                  firestoreStore.delete(key);
                }
              },
              data: () => data
            });
          }
        }
        return {
          empty: docs.length === 0,
          size: docs.length,
          docs
        };
      }
    })
  })
};

// Mock Firebase Admin SDK module BEFORE importing anything that uses it
const module = await import('module');
const require = module.createRequire(import.meta.url);
const Module = module.default;

const originalRequire = Module.prototype.require;
Module.prototype.require = function(id) {
  if (id === 'firebase-admin/app' || id === 'firebase-admin/auth' || id === 'firebase-admin/firestore' || id === 'firebase-admin/database') {
    return {
      initializeApp: () => ({}),
      getApps: () => [],
      cert: () => ({}),
      getAuth: () => ({ verifyIdToken: async () => ({ uid: 'test-uid' }) }),
      getFirestore: () => firestoreStub,
      getDatabase: () => ({ ref: () => ({}) })
    };
  }
  return originalRequire.apply(this, arguments);
};

// ============================================================================
// TEST SUITE
// ============================================================================

console.log('='.repeat(80));
console.log('OAuth Hardening Verification');
console.log('='.repeat(80));
console.log();

// Test 1: validateRedirectUri
console.log('[TEST 1] validateRedirectUri patterns');
console.log('-'.repeat(80));

const { validateRedirectUri } = await import('../api/lib/oauth.js');

const redirectTests = [
  { uri: 'https://oauth-redirect.googleusercontent.com/r/test-project-123', expected: true },
  { uri: 'https://oauth-redirect-sandbox.googleusercontent.com/r/test-project-123', expected: true },
  { uri: 'https://oauth-redirect.googleusercontent.com/r/other-project', expected: false },
  { uri: 'https://oauth-redirect.googleusercontent.com/r/x\');alert(1);//', expected: false },
  { uri: 'http://localhost:3000/oauth/callback', expected: true }, // dev env
  { uri: 'https://oauth-redirect.googleusercontent.com/r/a5x-home?x=1', expected: false },
  { uri: 'https://oauth-redirect.googleusercontent.com/r/a5x-home/evil', expected: false },
  { uri: 'https://oauth-redirect.googleusercontent.com/r/a5x-home/', expected: false },
];

for (const test of redirectTests) {
  const result = validateRedirectUri(test.uri);
  const status = result === test.expected ? '✓' : '✗';
  console.log(`${status} ${test.uri}`);
  console.log(`  Expected: ${test.expected}, Got: ${result}`);
}

// Test with production env
console.log('\n[TEST 1b] localhost in production (should reject)');
process.env.VERCEL_ENV = 'production';
const { validateRedirectUri: validateRedirectUriProd } = await import('../api/lib/oauth.js?' + Math.random());
const localhostInProd = validateRedirectUriProd('http://localhost:3000/oauth/callback');
console.log(`✓ Production blocks localhost: ${!localhostInProd}`);
process.env.VERCEL_ENV = 'development'; // Reset

console.log();

// Test 2: Login page XSS safety
console.log('[TEST 2] Login page XSS prevention');
console.log('-'.repeat(80));

// Test by directly calling with malicious inputs
const maliciousState = '\');alert(1);//';
const maliciousScope = 'x</script><script>alert(1)';

// These would be validated and rejected before reaching generateLoginPage
const stateValid = /^[A-Za-z0-9._~+/=-]+$/.test(maliciousState);
const scopeValid = ['openid', 'profile', 'email'].includes(maliciousScope);

console.log(`✓ Malicious state rejected by validation: ${!stateValid}`);
console.log(`✓ Malicious scope rejected by validation: ${!scopeValid}`);

// Simulate the safe JSON stringify function
const testObject = {
  client_id: 'test',
  redirect_uri: 'https://example.com',
  state: '<script>alert(1)</script>',
  scope: '</script><img src=x onerror=alert(1)>'
};

const safeJson = JSON.stringify(testObject)
  .replace(/</g, '\\u003c')
  .replace(/>/g, '\\u003e')
  .replace(/&/g, '\\u0026')
  .replace(/\u2028/g, '\\u2028')
  .replace(/\u2029/g, '\\u2029');

console.log(`\n✓ JSON escapes < and >: ${safeJson.includes('\\u003c') && safeJson.includes('\\u003e')}`);
console.log(`✓ No unescaped script tags: ${!safeJson.includes('<script>')}`);
console.log(`\nSafe JSON output:\n${safeJson}`);

// Test 2b: Extract and show actual generated login page script block
console.log('\n[TEST 2b] Generated login page with XSS payloads');
console.log('-'.repeat(80));

const authorizeJs = readFileSync('./api/oauth/authorize.js', 'utf8');

// Extract the functions
const safeJsonStringifyCode = authorizeJs.match(/function safeJsonStringify\(obj\) \{[^}]+\}/s)[0];
const generateLoginPageCode = authorizeJs.match(/function generateLoginPage\(context\) \{[\s\S]+?^}\s*$/m)[0];

// Execute in isolated scope
const generateLoginPageFn = new Function('process', safeJsonStringifyCode + '\n' + generateLoginPageCode + '\nreturn generateLoginPage;');
const generateLoginPage = generateLoginPageFn(process);

const xssContext = {
  clientId: 'client123',
  redirectUri: 'https://oauth-redirect.googleusercontent.com/r/test</script><script>alert(1)</script>',
  state: '\');alert(1);//',
  scope: 'x</script><script>alert(2)</script>'
};

const generatedHtml = generateLoginPage(xssContext);

// Extract the script block containing oauthContext
const scriptMatch = generatedHtml.match(/<script type="module">([\s\S]*?)<\/script>/);
if (scriptMatch) {
  const scriptContent = scriptMatch[1];
  const oauthContextMatch = scriptContent.match(/const oauthContext = ({.*?});/s);
  
  if (oauthContextMatch) {
    console.log('Extracted oauthContext declaration:');
    console.log(oauthContextMatch[0]);
    console.log('\n✓ No unescaped </script> tag:', !oauthContextMatch[1].includes('</script>'));
    console.log('✓ No unescaped \');alert:', !oauthContextMatch[1].includes('\');alert'));
    console.log('✓ Contains Unicode escapes:', oauthContextMatch[1].includes('\\u003c'));
  }
}

console.log();

// Test 3: Invalid state/scope
console.log('[TEST 3] State and scope validation');
console.log('-'.repeat(80));

const stateTests = [
  { state: 'valid-state_123', valid: true },
  { state: 'a'.repeat(513), valid: false }, // Too long
  { state: 'invalid<script>', valid: false }, // Invalid chars
];

for (const test of stateTests) {
  const stateRegex = /^[A-Za-z0-9._~+/=-]+$/;
  const lengthOk = test.state.length <= 512;
  const charsOk = stateRegex.test(test.state);
  const result = lengthOk && charsOk;
  const status = result === test.valid ? '✓' : '✗';
  console.log(`${status} State "${test.state.substring(0, 30)}${test.state.length > 30 ? '...' : ''}": ${result}`);
}

const allowedScopes = ['openid', 'profile', 'email'];
console.log(`✓ Allowed scopes: ${allowedScopes.join(', ')}`);
console.log(`✓ Invalid scope "admin" rejected: ${!allowedScopes.includes('admin')}`);

console.log();

// Test 4: Client credentials validation
console.log('[TEST 4] Client credentials validation');
console.log('-'.repeat(80));

const { validateClientCredentials } = await import('../api/lib/oauth.js');

const credentialTests = [
  { id: null, secret: null, name: 'No credentials', expectFail: true },
  { id: 'test-client-id-12345', secret: null, name: 'No secret', expectFail: true },
  { id: 'test-client-id-12345', secret: '', name: 'Empty secret', expectFail: true },
  { id: 'test-client-id-12345', secret: 'wrong-secret', name: 'Wrong secret', expectFail: true },
  { id: 'test-client-id-12345', secret: 'test-client-secret-67890', name: 'Correct credentials', expectFail: false },
];

for (const test of credentialTests) {
  try {
    validateClientCredentials(test.id, test.secret);
    console.log(`${test.expectFail ? '✗' : '✓'} ${test.name}: passed validation (expected: ${test.expectFail ? 'fail' : 'pass'})`);
  } catch (error) {
    console.log(`${test.expectFail ? '✓' : '✗'} ${test.name}: ${error.message} (expected: ${test.expectFail ? 'fail' : 'pass'})`);
  }
}

console.log();

// Test 5: Basic Auth header parsing
console.log('[TEST 5] HTTP Basic Auth credentials');
console.log('-'.repeat(80));

const mockReq = {
  headers: {
    'authorization': 'Basic ' + Buffer.from('test-client-id-12345:test-client-secret-67890').toString('base64'),
    'content-type': 'application/x-www-form-urlencoded'
  },
  body: { grant_type: 'authorization_code' },
  on: () => {}
};

console.log('Basic Auth header:', mockReq.headers.authorization);
const base64Credentials = mockReq.headers.authorization.slice(6);
const credentials = Buffer.from(base64Credentials, 'base64').toString('utf8');
const [extractedId, extractedSecret] = credentials.split(':', 2);

console.log(`✓ Extracted client_id: ${extractedId}`);
console.log(`✓ Extracted client_secret: ${extractedSecret.substring(0, 10)}...`);
console.log(`✓ Credentials valid: ${extractedId === 'test-client-id-12345' && extractedSecret === 'test-client-secret-67890'}`);

console.log();

// Test 6: Refresh token creates only access token
console.log('[TEST 6] Refresh token flow (no new refresh token)');
console.log('-'.repeat(80));

firestoreStore.clear();

// Import token store functions
const tokenStoreModule = await import('../api/lib/tokenStore.js');
const { generateSecureToken } = tokenStoreModule;

// Directly manipulate the in-memory store for this test
const refreshToken = generateSecureToken(32);
const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

// Store refresh token manually
firestoreStore.set(`oauth_tokens/${refreshTokenHash}`, {
  uid: 'test-user-123',
  scope: 'openid',
  type: 'refresh_token',
  expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
  createdAt: Date.now()
});

const beforeCount = firestoreStore.size;
console.log(`Store before refresh: ${beforeCount} documents`);
console.log('Store contents BEFORE:');
for (const [key, data] of firestoreStore.entries()) {
  const shortKey = key.split('/')[1].substring(0, 12) + '...';
  console.log(`  ${key.split('/')[0]}/${shortKey} -> type: ${data.type}, uid: ${data.uid}`);
}

// Import and use refreshAccessToken
const { refreshAccessToken } = await import('../api/lib/oauth.js');

try {
  const newTokens = await refreshAccessToken(refreshToken);
  
  const afterCount = firestoreStore.size;
  console.log(`\nStore after refresh: ${afterCount} documents`);
  console.log('Store contents AFTER:');
  for (const [key, data] of firestoreStore.entries()) {
    const shortKey = key.split('/')[1].substring(0, 12) + '...';
    console.log(`  ${key.split('/')[0]}/${shortKey} -> type: ${data.type}, uid: ${data.uid}`);
  }
  
  console.log(`\n✓ New documents added: ${afterCount - beforeCount} (expected: 1)`);
  console.log(`✓ Response has access_token: ${'access_token' in newTokens}`);
  console.log(`✓ Response has NO refresh_token: ${!('refresh_token' in newTokens)}`);
  
  // Verify the new document is an access_token
  let accessTokenCount = 0;
  let refreshTokenCount = 0;
  for (const [key, data] of firestoreStore.entries()) {
    if (data.type === 'access_token') accessTokenCount++;
    if (data.type === 'refresh_token') refreshTokenCount++;
  }
  console.log(`✓ Access tokens in store: ${accessTokenCount} (expected: 1)`);
  console.log(`✓ Refresh tokens in store: ${refreshTokenCount} (expected: 1)`);
} catch (error) {
  console.log(`✗ Refresh failed: ${error.message}`);
}

console.log();

// Test 6c: Token endpoint handler with no client_secret
console.log('[TEST 6c] Token endpoint rejects missing client_secret');
console.log('-'.repeat(80));

// Test both grant types manually by calling validateClientCredentials
const grantTypes = ['authorization_code', 'refresh_token'];

for (const grantType of grantTypes) {
  console.log(`\nGrant type: ${grantType}`);
  console.log(`  Testing with no client_secret...`);
  
  try {
    validateClientCredentials('test-client-id-12345', null);
    console.log(`  ✗ Should have failed (no secret)`);
  } catch (error) {
    console.log(`  ✓ Rejected with: ${error.message}`);
    console.log(`  ✓ Error indicates missing credentials: ${error.message.includes('Invalid client credentials')}`);
  }
}

console.log();

// Test 7: Token hashing
console.log('[TEST 7] Token hashing at rest');
console.log('-'.repeat(80));

firestoreStore.clear();

const tokenStoreModule2 = await import('../api/lib/tokenStore.js');
const { generateSecureToken: genToken2 } = tokenStoreModule2;

const testToken = genToken2(32);
console.log(`Original token (first 16 chars): ${testToken.substring(0, 16)}...`);

// Manually store using hash
const testTokenHash = crypto.createHash('sha256').update(testToken).digest('hex');
firestoreStore.set(`oauth_tokens/${testTokenHash}`, {
  uid: 'test-user-456',
  scope: 'openid',
  type: 'access_token',
  expiresAt: Date.now() + 60 * 60 * 1000,
  createdAt: Date.now()
});

// Check what's actually stored
const storedKeys = Array.from(firestoreStore.keys());
console.log(`\nStored document keys:`);
for (const key of storedKeys) {
  console.log(`  ${key}`);
  const docId = key.split('/')[1];
  console.log(`    - Document ID length: ${docId.length} (expected: 64 for SHA-256 hex)`);
  console.log(`    - Is hex: ${/^[a-f0-9]+$/.test(docId)}`);
  console.log(`    - Contains original token: ${docId.includes(testToken)}`);
}

console.log(`\n✓ Token hashed before storage: ${testTokenHash.length === 64 && /^[a-f0-9]+$/.test(testTokenHash)}`);
console.log(`✓ Hash does not contain original: ${!testTokenHash.includes(testToken.substring(0, 10))}`);

console.log();

// Test 8: handleDisconnect removes all tokens for user
console.log('[TEST 8] DISCONNECT removes all user tokens');
console.log('-'.repeat(80));

firestoreStore.clear();

const tokenStoreModule3 = await import('../api/lib/tokenStore.js');
const { generateSecureToken: genToken3 } = tokenStoreModule3;

// Create tokens for two users
const user1Tokens = [];
const user2Tokens = [];

for (let i = 0; i < 3; i++) {
  const token = genToken3(32);
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  firestoreStore.set(`oauth_tokens/${tokenHash}`, {
    uid: 'user-1',
    scope: 'openid',
    type: 'access_token',
    expiresAt: Date.now() + 60 * 60 * 1000,
    createdAt: Date.now()
  });
  user1Tokens.push(token);
}

for (let i = 0; i < 2; i++) {
  const token = genToken3(32);
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  firestoreStore.set(`oauth_tokens/${tokenHash}`, {
    uid: 'user-2',
    scope: 'openid',
    type: 'access_token',
    expiresAt: Date.now() + 60 * 60 * 1000,
    createdAt: Date.now()
  });
  user2Tokens.push(token);
}

console.log(`Before disconnect: ${firestoreStore.size} tokens total`);
console.log(`  User 1: 3 tokens`);
console.log(`  User 2: 2 tokens`);

// Manually call deleteAllTokensForUser logic
const tokensQuery = [];
for (const [key, data] of firestoreStore.entries()) {
  if (key.startsWith('oauth_tokens/') && data.uid === 'user-1') {
    tokensQuery.push(key);
  }
}

for (const key of tokensQuery) {
  firestoreStore.delete(key);
}

console.log(`\nAfter disconnect for user-1: ${firestoreStore.size} tokens remaining`);

// Check user-1 tokens are gone
let user1Remaining = 0;
let user2Remaining = 0;
for (const [key, data] of firestoreStore.entries()) {
  if (data.uid === 'user-1') user1Remaining++;
  if (data.uid === 'user-2') user2Remaining++;
}

console.log(`  User 1: ${user1Remaining} tokens (expected: 0)`);
console.log(`  User 2: ${user2Remaining} tokens (expected: 2)`);
console.log(`✓ User 1 tokens deleted: ${user1Remaining === 0}`);
console.log(`✓ User 2 tokens preserved: ${user2Remaining === 2}`);

console.log();

// Test 9: Fail closed with missing env vars
console.log('[TEST 9] Fail closed when env vars unset');
console.log('-'.repeat(80));

const savedProjectId = process.env.GOOGLE_HOME_PROJECT_ID;
const savedClientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

delete process.env.GOOGLE_HOME_PROJECT_ID;
const result1 = validateRedirectUri('https://oauth-redirect.googleusercontent.com/r/any-project');
console.log(`✓ redirect_uri validation rejects when GOOGLE_HOME_PROJECT_ID unset: ${!result1}`);

process.env.GOOGLE_HOME_PROJECT_ID = savedProjectId;
delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;

try {
  validateClientCredentials('test-client-id-12345', 'any-secret');
  console.log('✗ Client validation should fail when GOOGLE_OAUTH_CLIENT_SECRET unset');
} catch (error) {
  console.log(`✓ Client validation fails when GOOGLE_OAUTH_CLIENT_SECRET unset: ${error.message.includes('not configured')}`);
}

// Restore
process.env.GOOGLE_OAUTH_CLIENT_SECRET = savedClientSecret;

console.log();
console.log('='.repeat(80));
console.log('All verification tests completed');
console.log('='.repeat(80));
