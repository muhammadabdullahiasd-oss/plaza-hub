import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createTokenBox, newSessionToken, hashSessionToken, csrfForSession, matchesCsrf } from '../auth/crypto.js';
import { createAuthProvider, readAuthConfig } from '../auth/provider.js';
import { readSessionCookie } from '../auth/routes.js';

const config = { url:'https://plazahubtest.supabase.co', publishableKey:'sb_publishable_synthetic_example_only' };
const subject = 'a0000000-0000-4000-8000-000000000001';
const user = { id:subject, email:'demo@example.test', email_confirmed_at:'2026-01-01T00:00:00Z', is_anonymous:false, user_metadata:{ role:'super' } };
const grant = { access_token:'synthetic-access', refresh_token:'synthetic-refresh', token_type:'bearer', expires_in:3600 };
const json = value => Response.json(value);

test('provider credentials are encrypted with row binding, random nonces and tamper detection', () => {
  const key = randomBytes(32), box = createTokenBox(key), token = newSessionToken(), hash = hashSessionToken(token);
  const original = { ...grant, label:'Naira ₦' };
  const sealed = box.seal(original, hash);
  assert.doesNotMatch(sealed, /synthetic-access|synthetic-refresh|Naira/);
  assert.notEqual(sealed, box.seal(original, hash));
  assert.deepEqual(box.open(sealed, hash), original);
  assert.throws(() => box.open(sealed, hashSessionToken(newSessionToken())), /cannot be read/);
  assert.throws(() => createTokenBox(randomBytes(32)).open(sealed, hash), /cannot be read/);
  const parts = sealed.split('.'); parts[3] = `${parts[3][0] === 'A' ? 'B' : 'A'}${parts[3].slice(1)}`;
  assert.throws(() => box.open(parts.join('.'), hash), /cannot be read/);
  assert.throws(() => createTokenBox(Buffer.alloc(10)), /32-byte/);
});

test('CSRF proofs are bound to their opaque cookie and ambiguous cookies are rejected', () => {
  const token = newSessionToken(), other = newSessionToken();
  assert.equal(matchesCsrf(token, csrfForSession(token)), true);
  assert.equal(matchesCsrf(other, csrfForSession(token)), false);
  assert.equal(matchesCsrf(token, 'wrong'), false);
  assert.equal(matchesCsrf(token, `${csrfForSession(token)}\n`), false);
  assert.equal(readSessionCookie(`other=ok; plazahub_local_session=${token}`), token);
  assert.equal(readSessionCookie(`plazahub_local_session=${token}; plazahub_local_session=${other}`), null);
  for (const cookie of ['plazahub_local_session=role:super', `plazahub_local_session=${token}=extra`, 'plazahub_local_session=%00']) assert.equal(readSessionCookie(cookie), null);
});

test('provider configuration is optional but partial, unsafe and service-role values fail without disclosure', () => {
  assert.equal(readAuthConfig({}), null);
  const valid = { SUPABASE_URL:config.url, SUPABASE_PUBLISHABLE_KEY:config.publishableKey, SESSION_ENCRYPTION_KEY:randomBytes(32).toString('hex') };
  assert.equal(readAuthConfig(valid).encryptionKey.length, 32);
  for (const change of [{ SUPABASE_URL:undefined }, { SUPABASE_URL:'http://127.0.0.1/' },
    { SUPABASE_URL:'https://other.example/' }, { SUPABASE_URL:`${config.url}/untrusted` },
    { SUPABASE_URL:`${config.url}?secret=example` }, { SUPABASE_PUBLISHABLE_KEY:'sb_secret_SENSITIVE_EXAMPLE' },
    { SESSION_ENCRYPTION_KEY:'SENSITIVE_EXAMPLE' }]) {
    assert.throws(() => readAuthConfig({ ...valid, ...change }), error => /configuration/.test(error.message) && !error.message.includes('SENSITIVE'));
  }
});

test('password grant verifies the provider user and projects trusted subject/email without roles', async () => {
  const calls = [];
  const provider = createAuthProvider(config, { clock:() => 1000, fetchRequest:async (url, options) => {
    calls.push({ url, options });
    return json(url.includes('/token?') ? grant : user);
  } });
  const result = await provider.password('demo@example.test', 'SYNTHETIC_PASSWORD');
  assert.deepEqual(result, { accessToken:'synthetic-access', refreshToken:'synthetic-refresh', expiresAt:3601000, subject, email:'demo@example.test' });
  assert.equal(calls[0].url, `${config.url}/auth/v1/token?grant_type=password`);
  assert.deepEqual(JSON.parse(calls[0].options.body), { email:'demo@example.test', password:'SYNTHETIC_PASSWORD' });
  assert.equal(calls[0].options.headers.apikey, config.publishableKey);
  assert.equal(calls[0].options.redirect, 'error');
  assert.ok(calls[0].options.signal instanceof AbortSignal);
  assert.equal(calls[1].options.headers.Authorization, 'Bearer synthetic-access');
  assert.equal(calls[1].url, `${config.url}/auth/v1/user`);
  assert.equal(result.role, undefined);
});

test('refresh is stateless and logout requests only the current provider session', async () => {
  const calls = [];
  const provider = createAuthProvider(config, { fetchRequest:async (url, options) => {
    calls.push({ url, options });
    return url.includes('/logout?') ? new Response(null, { status:204 }) : json(url.includes('/token?') ? grant : user);
  } });
  await provider.refresh('SYNTHETIC_OLD_REFRESH');
  await provider.logout('synthetic-access');
  assert.equal(calls[0].url, `${config.url}/auth/v1/token?grant_type=refresh_token`);
  assert.deepEqual(JSON.parse(calls[0].options.body), { refresh_token:'SYNTHETIC_OLD_REFRESH' });
  assert.equal(calls[2].url, `${config.url}/auth/v1/logout?scope=local`);
  assert.equal(calls[2].options.headers.Authorization, 'Bearer synthetic-access');
});

test('unconfirmed, anonymous and malformed identities cannot establish an authenticated subject', async () => {
  for (const change of [{ email_confirmed_at:null }, { email_confirmed_at:1 }, { email:null }, { email:'bad\0@example.test' }, { is_anonymous:true }, { id:'not-a-uuid' }]) {
    const provider = createAuthProvider(config, { fetchRequest:async () => json({ ...user, ...change }) });
    await assert.rejects(provider.getUser('synthetic-access'), { code:'AUTHENTICATION_FAILED' });
  }
});

test('provider rejects bad credentials without echoing upstream errors or secrets', async () => {
  const provider = createAuthProvider(config, { fetchRequest:async () => json({ error:'SENSITIVE_PROVIDER_DETAILS' }) });
  await assert.rejects(provider.password('demo@example.test', 'SENSITIVE_PASSWORD'), { code:'AUTH_UNAVAILABLE' });
  const denied = createAuthProvider(config, { fetchRequest:async () => new Response('SENSITIVE_PROVIDER_DETAILS', { status:401 }) });
  await assert.rejects(denied.getUser('SENSITIVE_TOKEN'), error => error.code === 'AUTHENTICATION_FAILED' && !error.message.includes('SENSITIVE'));
});

test('provider network errors, throttling, malformed or oversized responses fail closed', async () => {
  const responses = [async () => { throw new Error('SENSITIVE_NETWORK_DETAILS'); },
    async () => new Response('throttled', { status:429 }), async () => new Response('{bad-json'),
    async () => new Response('x'.repeat(65537)), async () => new Response(null, { status:204 })];
  for (const fetchRequest of responses) {
    const provider = createAuthProvider(config, { fetchRequest });
    await assert.rejects(provider.getUser('SENSITIVE_TOKEN'), error => error.code === 'AUTH_UNAVAILABLE' || error.code === 'AUTHENTICATION_FAILED');
  }
});
