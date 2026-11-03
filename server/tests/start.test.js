import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readConfig } from '../config.js';
import { startServer, stopServer } from '../start.js';

test('configuration defaults to loopback and ignores attempts to widen its host', () => {
  assert.equal(readConfig({}).host, '127.0.0.1');
  assert.equal(readConfig({ HOST:'0.0.0.0', PORT:'4175' }).host, '127.0.0.1');
  assert.equal(readConfig({ PORT:'4175' }).port, 4175);
  assert.equal(readConfig({ NODE_ENV:'test' }).environment, 'test');
  assert.equal(Object.isFrozen(readConfig({})), true);
});

test('invalid port/environment values fail instead of silently choosing another configuration', () => {
  for (const PORT of ['', '0', '-1', '1.5', '65536', '1e3', ' 4174', '4174\n', [], {}]) {
    assert.throws(() => readConfig({ PORT }), /PORT/);
  }
  for (const NODE_ENV of ['production', 'unknown', '']) assert.throws(() => readConfig({ NODE_ENV }), /development\/test/);
});

test('starting on an occupied port fails and the original listener remains available', async () => {
  const server = await startServer({ port:0, host:'127.0.0.1' });
  try {
    const port = server.address().port;
    await assert.rejects(startServer({ port, host:'127.0.0.1' }), { code:'EADDRINUSE' });
    const response = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.equal(response.status, 200);
  } finally { await stopServer(server); }
});

test('normal shutdown releases its port and repeated shutdown is harmless', async () => {
  const server = await startServer({ port:0, host:'127.0.0.1' });
  const port = server.address().port;
  const result = await stopServer(server);
  assert.equal(result.forced, false);
  assert.equal(server.listening, false);
  await stopServer(server);
  const replacement = await startServer({ port, host:'127.0.0.1' });
  await stopServer(replacement);
});

test('shutdown has a deadline for an HTTP response that never finishes', async () => {
  const server = createServer((request, response) => {
    response.writeHead(200, { 'Content-Type':'text/plain' });
    response.write('Incomplete response');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const response = await fetch(`http://127.0.0.1:${server.address().port}`);
  const body = response.text();
  const bodyEnded = assert.rejects(body);
  try {
    const result = await stopServer(server, 30);
    assert.equal(result.forced, true);
    await bodyEnded;
    assert.equal(server.listening, false);
  } finally { server.closeAllConnections(); server.close(); }
});
