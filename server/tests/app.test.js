import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import express from 'express';
import { createApp, createErrorHandler } from '../app.js';
import { stopServer } from '../start.js';

async function withServer(check, app = createApp()) {
  const server = createServer(app);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try { await check(`http://127.0.0.1:${server.address().port}`, server); }
  finally { await stopServer(server, 100); }
}

test('health confirms liveness while explicitly declaring missing database/authentication', async () => {
  await withServer(async base => {
    const response = await fetch(`${base}/api/health`);
    assert.equal(response.status, 200);
    const { data } = await response.json();
    assert.equal(data.status, 'ok');
    assert.equal(data.service, 'plazahub-api');
    assert.equal(data.database, 'not_configured');
    assert.equal(data.authentication, 'not_configured');
    assert.equal(data.readyForBusiness, false);
    assert.match(response.headers.get('content-type'), /application\/json/);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.match(response.headers.get('content-security-policy'), /default-src 'none'/);
    assert.equal(response.headers.get('x-powered-by'), null);
    assert.equal(response.headers.get('etag'), null);
    assert.equal(response.headers.get('set-cookie'), null);
  });
});

test('readiness fails with a safe error and a matching server-generated request ID', async () => {
  await withServer(async base => {
    const response = await fetch(`${base}/api/ready`, { headers:{ 'X-Request-Id':'caller-controlled' } });
    assert.equal(response.status, 503);
    const { error } = await response.json();
    assert.equal(error.code, 'NOT_READY');
    assert.equal(error.requestId, response.headers.get('x-request-id'));
    assert.match(error.requestId, /^[0-9a-f-]{36}$/);
    assert.notEqual(error.requestId, 'caller-controlled');
    const next = await fetch(`${base}/api/ready`);
    assert.notEqual(next.headers.get('x-request-id'), error.requestId);
  });
});

test('all business methods stay closed even with forged session, role and plaza information', async () => {
  await withServer(async base => {
    for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']) {
      const response = await fetch(`${base}/api/plazas/1/units?tenantId=6&role=super`, {
        method, headers:{ Authorization:'Bearer fake-token', Cookie:'session=fake-manager', 'X-Role':'super', 'X-Plaza-Id':'1' },
      });
      assert.equal(response.status, 503, method);
      if (method !== 'HEAD') assert.equal((await response.json()).error.code, 'AUTH_NOT_CONFIGURED');
      else assert.equal(await response.text(), '');
    }
  });
});

test('malformed bodies do not open a business route or leak submitted content', async () => {
  await withServer(async base => {
    const response = await fetch(`${base}/api/session/login`, {
      method:'POST', headers:{ 'Content-Type':'application/json' }, body:'{"password":"SENSITIVE-TEST-VALUE",bad-json',
    });
    assert.equal(response.status, 503);
    const text = await response.text();
    assert.doesNotMatch(text, /SENSITIVE-TEST-VALUE|SyntaxError|stack/);
    assert.equal(JSON.parse(text).error.code, 'AUTH_NOT_CONFIGURED');
  });
});

test('health/readiness allow read methods only and HEAD never contains a body', async () => {
  await withServer(async base => {
    for (const path of ['/api/health', '/api/ready']) {
      const response = await fetch(base + path, { method:'POST', body:'should not be reflected' });
      assert.equal(response.status, 405);
      assert.equal(response.headers.get('allow'), 'GET, HEAD');
      assert.equal((await response.json()).error.code, 'METHOD_NOT_ALLOWED');
      const head = await fetch(base + path, { method:'HEAD' });
      assert.equal(head.status, path.endsWith('health') ? 200 : 503);
      assert.equal(await head.text(), '');
    }
  });
});

test('API never serves repository files, credentials or frontend demo data', async () => {
  await withServer(async base => {
    for (const path of ['/', '/.env', '/.git/config', '/package.json', '/server/.env.example', '/js/data/demo-data.js', '/docs/BACKEND_PLAN.md', '/.local-postgres/connection.env', '/.local-postgres/data/pg_hba.conf', '/server/db.js']) {
      const response = await fetch(base + path);
      assert.equal(response.status, 404, path);
      assert.equal((await response.json()).error.code, 'NOT_FOUND');
    }
    const response = await fetch(`${base}/%3Cimg%20src=x%3E`);
    assert.doesNotMatch(await response.text(), /<img|%3Cimg/);
  });
});

test('cross-origin requests receive no permissive CORS headers', async () => {
  await withServer(async base => {
    const response = await fetch(`${base}/api/health`, { headers:{ Origin:'https://unrelated.example' } });
    assert.equal(response.headers.get('access-control-allow-origin'), null);
    assert.equal(response.headers.get('access-control-allow-credentials'), null);
    const preflight = await fetch(`${base}/api/plazas/1/units`, {
      method:'OPTIONS', headers:{ Origin:'https://unrelated.example', 'Access-Control-Request-Method':'POST' },
    });
    assert.equal(preflight.status, 503);
    assert.equal(preflight.headers.get('access-control-allow-origin'), null);
  });
});

test('unexpected synchronous and asynchronous errors redact both client output and default log events', async () => {
  const app = express();
  const events = [];
  app.get('/sync', () => { throw new Error('DATABASE-PASSWORD-TEST'); });
  app.get('/async', async () => { throw new Error('REFRESH-TOKEN-TEST'); });
  app.use(createErrorHandler(event => events.push(event)));
  await withServer(async base => {
    for (const path of ['/sync', '/async']) {
      const response = await fetch(base + path);
      assert.equal(response.status, 500);
      const text = await response.text();
      assert.doesNotMatch(text, /DATABASE-PASSWORD|REFRESH-TOKEN|Error:|stack/);
      assert.equal(JSON.parse(text).error.code, 'INTERNAL_ERROR');
    }
  }, app);
  assert.equal(events.length, 2);
  assert.deepEqual(Object.keys(events[0]).sort(), ['code', 'requestId']);
  assert.doesNotMatch(JSON.stringify(events), /DATABASE-PASSWORD|REFRESH-TOKEN/);
});

test('a failing logger cannot replace the safe error response with sensitive details', async () => {
  const app = express();
  app.get('/error', () => { throw new Error('PRIVATE-TEST'); });
  app.use(createErrorHandler(() => { throw new Error('LOGGER-SECRET-TEST'); }));
  await withServer(async base => {
    const response = await fetch(`${base}/error`);
    assert.equal(response.status, 500);
    assert.doesNotMatch(await response.text(), /PRIVATE-TEST|LOGGER-SECRET-TEST/);
  }, app);
});
