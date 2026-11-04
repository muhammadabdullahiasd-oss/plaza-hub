import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { createApp } from '../app.js';
import { stopServer } from '../start.js';
import { inTransaction } from '../db.js';
import { fixtureIds as id, seedFoundation } from '../fixtures/foundation.js';
import { createTestDatabase } from './helpers/database.js';
import { createTokenBox, hashSessionToken, csrfForSession, newSessionToken } from '../auth/crypto.js';
import { AuthenticationError } from '../auth/provider.js';
import { createSessionService, sessionLifetime } from '../auth/sessions.js';
import { createSessionRouter } from '../auth/routes.js';

describe('persistent session foundation with a synthetic provider', () => {
  const subject = 'a0000000-0000-4000-8000-000000000001';
  let database, pool;
  before(async () => {
    database = await createTestDatabase(); pool = database.pool;
    await inTransaction(pool, seedFoundation);
    await pool.query('UPDATE plazahub.users SET provider_subject = $1 WHERE id = $2', [subject, id.ownerA]);
  });
  after(async () => { await database?.close(); });

  function setup() {
    let now = Date.UTC(2026, 10, 4, 12);
    const state = { refreshes:0, checks:0, logouts:0, denied:false, outage:false, logoutOutage:false, subject };
    const issued = () => ({ subject:state.subject, accessToken:`SYNTHETIC_ACCESS_${randomBytes(8).toString('hex')}`,
      refreshToken:`SYNTHETIC_REFRESH_${randomBytes(8).toString('hex')}`, expiresAt:now + 3600_000 });
    const provider = {
      async password() { if (state.denied) throw new AuthenticationError(); return issued(); },
      async getUser() {
        state.checks++;
        if (state.outage) throw new AuthenticationError('AUTH_UNAVAILABLE');
        if (state.denied) throw new AuthenticationError();
        return { subject:state.subject };
      },
      async refresh() {
        state.refreshes++;
        await new Promise(resolve => setTimeout(resolve, 25));
        if (state.denied) throw new AuthenticationError();
        if (state.outage) throw new AuthenticationError('AUTH_UNAVAILABLE');
        return issued();
      },
      async logout() { state.logouts++; if (state.logoutOutage) throw new AuthenticationError('AUTH_UNAVAILABLE'); },
    };
    const tokenBox = createTokenBox(randomBytes(32));
    const create = () => createSessionService({ pool, provider, tokenBox, clock:() => now });
    return { service:create(), create, provider, state, tokenBox, clock:() => now, advance:ms => { now += ms; } };
  }
  const credentials = { email:'synthetic@example.test', password:'SYNTHETIC_PASSWORD_ONLY' };
  const record = async token => (await pool.query('SELECT * FROM plazahub.sessions WHERE token_hash = $1', [hashSessionToken(token)])).rows[0];

  async function withHttp(setupValue, work, extra = {}) {
    let app;
    const server = createServer((request, response) => app(request, response));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const origin = extra.protocol === 'https:' ? base.replace('http:', 'https:') : base;
    app = createApp({ reportError:() => {}, sessionRouter:createSessionRouter({ service:setupValue.service, origin, clock:setupValue.clock, ...extra }) });
    const login = (body = credentials, headers = {}) => fetch(`${base}/api/session/login`, { method:'POST',
      headers:{ Origin:origin, 'Content-Type':'application/json', ...headers }, body:JSON.stringify(body) });
    try { await work({ base, login }); } finally { await stopServer(server); }
  }

  test('cookie secrets and provider tokens never appear as plaintext in persistent rows or DTOs', async () => {
    const ctx = setup(), result = await ctx.service.login(credentials);
    const row = await record(result.token);
    assert.equal(row.user_id, id.ownerA);
    assert.equal(row.token_hash.length, 64);
    assert.notEqual(row.token_hash, result.token);
    assert.doesNotMatch(JSON.stringify(row), /SYNTHETIC_PASSWORD|SYNTHETIC_ACCESS|SYNTHETIC_REFRESH/);
    assert.doesNotMatch(JSON.stringify(result.data), /SYNTHETIC_PASSWORD|SYNTHETIC_ACCESS|SYNTHETIC_REFRESH/);
    assert.equal(JSON.stringify(result.data).includes(result.token), false);
    assert.deepEqual(result.data.user, { id:id.ownerA, displayName:'DEMO Owner A' });
    assert.deepEqual(await ctx.create().current(result.token), result.data, 'a fresh service instance must read the persisted session');
  });

  test('unlinked provider identities do not create accounts or sessions', async () => {
    const ctx = setup(); ctx.state.subject = 'b0000000-0000-4000-8000-000000000001';
    const count = (await pool.query('SELECT count(*) AS n FROM plazahub.sessions')).rows[0].n;
    await assert.rejects(ctx.service.login(credentials), { code:'AUTHENTICATION_FAILED' });
    assert.equal((await pool.query('SELECT count(*) AS n FROM plazahub.sessions')).rows[0].n, count);
    assert.equal(ctx.state.logouts, 1, 'discard a grant that cannot be linked');
  });

  test('successful login rotates an existing cookie; failed login preserves its session', async () => {
    const ctx = setup(), first = await ctx.service.login(credentials);
    ctx.state.denied = true;
    await assert.rejects(ctx.service.login(credentials, first.token));
    assert.equal((await record(first.token)).revoked_at, null);
    ctx.state.denied = false;
    const second = await ctx.service.login(credentials, first.token);
    assert.notEqual(first.token, second.token);
    assert.equal(await ctx.service.current(first.token), null);
    assert.equal((await record(first.token)).revocation_reason, 'replaced');
    assert.ok(await ctx.service.current(second.token));
  });

  test('idle expiry and absolute expiry cannot be extended by a provider refresh', async () => {
    const idle = setup(), first = await idle.service.login(credentials);
    idle.advance(sessionLifetime.idleMs);
    assert.equal(await idle.service.current(first.token), null);
    assert.equal((await record(first.token)).revocation_reason, 'expired');
    const absolute = setup(), second = await absolute.service.login(credentials);
    for (let n = 0; n < 23; n++) { absolute.advance(20 * 60_000); assert.ok(await absolute.service.current(second.token)); }
    absolute.advance(20 * 60_000);
    assert.equal(await absolute.service.current(second.token), null);
    assert.equal((await record(second.token)).encrypted_provider_tokens, null);
  });

  test('account suspension and provider revocation deny subsequent session access', async () => {
    const ctx = setup(), first = await ctx.service.login(credentials);
    try {
      await pool.query("UPDATE plazahub.users SET status = 'suspended' WHERE id = $1", [id.ownerA]);
      assert.equal(await ctx.service.current(first.token), null);
      await assert.rejects(ctx.service.login(credentials), { code:'AUTHENTICATION_FAILED' });
    } finally { await pool.query("UPDATE plazahub.users SET status = 'active' WHERE id = $1", [id.ownerA]); }
    const second = await ctx.service.login(credentials);
    ctx.state.denied = true;
    assert.equal(await ctx.service.current(second.token), null);
    assert.equal((await record(second.token)).revocation_reason, 'provider');
  });

  test('a provider outage grants nothing, preserves prior state and permits later recovery', async () => {
    const ctx = setup(), first = await ctx.service.login(credentials), before = await record(first.token);
    ctx.advance(60_000); ctx.state.outage = true;
    await assert.rejects(ctx.service.current(first.token), { code:'AUTH_UNAVAILABLE' });
    const after = await record(first.token);
    assert.equal(after.revoked_at, null);
    assert.equal(after.last_seen_at.toISOString(), before.last_seen_at.toISOString());
    assert.equal(after.encrypted_provider_tokens, before.encrypted_provider_tokens);
    ctx.state.outage = false;
    assert.ok(await ctx.service.current(first.token));
  });

  test('concurrent requests across service instances refresh the stored token only once', async () => {
    const ctx = setup(), first = await ctx.service.login(credentials), hash = hashSessionToken(first.token);
    const row = await record(first.token), tokens = ctx.tokenBox.open(row.encrypted_provider_tokens, hash);
    tokens.expiresAt = ctx.clock() + 1000;
    await pool.query('UPDATE plazahub.sessions SET encrypted_provider_tokens = $2 WHERE token_hash = $1', [hash, ctx.tokenBox.seal(tokens, hash)]);
    const results = await Promise.all([ctx.service.current(first.token), ctx.create().current(first.token)]);
    assert.ok(results.every(Boolean));
    assert.equal(ctx.state.refreshes, 1);
    assert.equal(ctx.state.checks, 1);
    const refreshed = ctx.tokenBox.open((await record(first.token)).encrypted_provider_tokens, hash);
    assert.notEqual(refreshed.refreshToken, tokens.refreshToken);
  });

  test('copied encrypted tokens cannot be moved into another session row', async () => {
    const ctx = setup(), first = await ctx.service.login(credentials), second = await ctx.service.login(credentials);
    await pool.query('UPDATE plazahub.sessions SET encrypted_provider_tokens = $2 WHERE token_hash = $1', [hashSessionToken(second.token), (await record(first.token)).encrypted_provider_tokens]);
    assert.equal(await ctx.service.current(second.token), null);
    assert.equal((await record(second.token)).revocation_reason, 'unreadable');
    assert.ok(await ctx.service.current(first.token));
  });

  test('logout racing a refresh cannot restore the revoked session', async () => {
    const ctx = setup(), first = await ctx.service.login(credentials), hash = hashSessionToken(first.token);
    const tokens = ctx.tokenBox.open((await record(first.token)).encrypted_provider_tokens, hash);
    tokens.expiresAt = ctx.clock();
    await pool.query('UPDATE plazahub.sessions SET encrypted_provider_tokens = $2 WHERE token_hash = $1', [hash, ctx.tokenBox.seal(tokens, hash)]);
    let releaseRefresh, startedRefresh;
    const started = new Promise(resolve => { startedRefresh = resolve; });
    const released = new Promise(resolve => { releaseRefresh = resolve; });
    const refresh = ctx.provider.refresh;
    ctx.provider.refresh = async token => { startedRefresh(); await released; return refresh(token); };
    const refreshing = ctx.service.current(first.token);
    try {
      await started;
      const signingOut = ctx.create().logout(first.token, csrfForSession(first.token));
      releaseRefresh();
      await Promise.all([refreshing, signingOut]);
      assert.equal(await ctx.service.current(first.token), null);
      assert.equal((await record(first.token)).revocation_reason, 'logout');
    } finally { releaseRefresh(); await refreshing; }
  });

  test('a changed provider subject cannot inherit the original application session', async () => {
    const ctx = setup(), first = await ctx.service.login(credentials);
    ctx.state.subject = 'b0000000-0000-4000-8000-000000000001';
    assert.equal(await ctx.service.current(first.token), null);
    assert.equal((await record(first.token)).revocation_reason, 'provider');
  });

  test('logout requires a bound CSRF proof and stays revoked during provider outages', async () => {
    const ctx = setup(), first = await ctx.service.login(credentials);
    await assert.rejects(ctx.service.logout(first.token, csrfForSession(newSessionToken())), { code:'CSRF_FAILED' });
    assert.ok(await ctx.service.current(first.token));
    ctx.state.logoutOutage = true;
    await ctx.service.logout(first.token, csrfForSession(first.token));
    await ctx.service.logout(first.token, csrfForSession(first.token));
    assert.equal(await ctx.service.current(first.token), null);
    assert.equal((await record(first.token)).encrypted_provider_tokens, null);
  });

  test('HTTP login sets an HttpOnly cookie, returns safe identity and rejects CSRF logout', async () => withHttp(setup(), async ({ base, login }) => {
    const response = await login(); assert.equal(response.status, 200);
    const setCookie = response.headers.get('set-cookie'), data = (await response.json()).data;
    assert.match(setCookie, /HttpOnly/); assert.match(setCookie, /SameSite=Strict/); assert.match(setCookie, /Path=\/api/);
    assert.doesNotMatch(setCookie, /Domain=/);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const cookie = setCookie.split(';')[0];
    const read = await fetch(`${base}/api/session`, { headers:{ Cookie:cookie } });
    assert.equal(read.status, 200); assert.deepEqual((await read.json()).data.user, data.user);
    const bad = await fetch(`${base}/api/session`, { method:'DELETE', headers:{ Cookie:cookie, Origin:base } });
    assert.equal(bad.status, 403);
    const out = await fetch(`${base}/api/session`, { method:'DELETE', headers:{ Cookie:cookie, Origin:base, 'X-CSRF-Token':data.csrfToken } });
    assert.equal(out.status, 204); assert.match(out.headers.get('set-cookie'), /Expires=Thu, 01 Jan 1970/);
    assert.equal((await fetch(`${base}/api/session`, { headers:{ Cookie:cookie } })).status, 401);
  }));

  test('HTTP guards reject foreign origins, role assignment, malformed bodies and forged identity', async () => withHttp(setup(), async ({ base, login }) => {
    assert.equal((await login(credentials, { Origin:'https://untrusted.example' })).status, 403);
    assert.equal((await login({ ...credentials, role:'super', tenantId:id.tenantA })).status, 400);
    const malformed = await fetch(`${base}/api/session/login`, { method:'POST', headers:{ Origin:base, 'Content-Type':'application/json' }, body:'{"password":"SENSITIVE_TEST",broken' });
    assert.equal(malformed.status, 400); assert.doesNotMatch(await malformed.text(), /SENSITIVE_TEST|SyntaxError|stack/);
    const huge = await fetch(`${base}/api/session/login`, { method:'POST', headers:{ Origin:base, 'Content-Type':'application/json' }, body:JSON.stringify({ password:'x'.repeat(5000) }) });
    assert.equal(huge.status, 413);
    assert.equal((await fetch(`${base}/api/session`, { headers:{ Cookie:`plazahub_local_session=${newSessionToken()}`, Authorization:'Bearer fake' } })).status, 401);
    assert.equal((await fetch(`${base}/api/session`, { method:'DELETE' })).status, 403, 'mutations require Origin even without a cookie');
    assert.equal((await fetch(`${base}/api/plazas/1/units`)).status, 503, 'a composed session router cannot open resource routes');
  }));

  test('login attempt limits cannot be bypassed with a forwarded client address', async () => {
    const ctx = setup(); ctx.state.denied = true;
    await withHttp(ctx, async ({ login }) => {
      assert.equal((await login()).status, 401);
      assert.equal((await login()).status, 401);
      assert.equal((await login(credentials, { 'X-Forwarded-For':'203.0.113.99' })).status, 429);
      ctx.advance(10 * 60_000);
      assert.equal((await login()).status, 401);
    }, { loginLimit:2 });
  });

  test('an HTTPS origin cannot accept login over HTTP or a spoofed proxy header', async () => {
    await withHttp(setup(), async ({ login }) => {
      assert.equal((await login(credentials, { 'X-Forwarded-Proto':'https' })).status, 403);
    }, { protocol:'https:' });
  });
});
