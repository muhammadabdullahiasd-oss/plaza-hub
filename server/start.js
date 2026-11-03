import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createApp } from './app.js';
import { readConfig } from './config.js';

export async function startServer(config = readConfig()) {
  const server = createServer({ maxHeaderSize:16 * 1024 }, createApp());
  server.headersTimeout = 10_000;
  server.requestTimeout = 30_000;
  server.keepAliveTimeout = 5_000;
  server.maxHeadersCount = 50;
  await new Promise((resolveStarted, reject) => {
    server.once('error', reject);
    server.listen(config.port, config.host, () => {
      server.off('error', reject);
      resolveStarted();
    });
  });
  return server;
}

export function stopServer(server, timeoutMs = 5_000) {
  return new Promise((resolveStopped, reject) => {
    let forced = false;
    const deadline = setTimeout(() => {
      forced = true;
      server.closeAllConnections();
    }, timeoutMs);
    deadline.unref();
    server.close(error => {
      clearTimeout(deadline);
      if (error && error.code !== 'ERR_SERVER_NOT_RUNNING') { reject(error); return; }
      resolveStopped({ forced });
    });
  });
}

async function main() {
  let config;
  try { config = readConfig(); }
  catch (error) { console.error(`API configuration error: ${error.message}`); process.exitCode = 1; return; }
  let server;
  try { server = await startServer(config); }
  catch (error) {
    console.error(error.code === 'EADDRINUSE' ? 'API startup failed: the port is already in use.' : 'API startup failed. Check local permissions and configuration.');
    process.exitCode = 1;
    return;
  }
  console.log(`PlazaHub API: http://${config.host}:${server.address().port}/api/health`);
  console.log('Stage 10 local foundation. Database and authentication are not configured.');
  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    try { await stopServer(server); console.log('PlazaHub API stopped.'); }
    catch { console.error('API shutdown failed.'); process.exitCode = 1; }
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await main();
