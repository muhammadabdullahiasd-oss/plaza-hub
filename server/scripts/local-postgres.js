// Optional Windows portable PostgreSQL helper. Does not install a service,
// download executables, change PATH or touch an existing PostgreSQL instance.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { readDatabaseConfig } from '../db.js';

const localRoot = fileURLToPath(new URL('../../.local-postgres/', import.meta.url));
const dataDirectory = join(localRoot, 'data');
const connectionFile = join(localRoot, 'connection.env');
const binDirectory = resolve(process.env.PLAZAHUB_PG_BIN || join(localRoot, 'pgsql', 'bin'));
const action = process.argv[2];

function run(program, args) {
  const result = spawnSync(join(binDirectory, `${program}.exe`), args, {
    windowsHide:true, stdio:'ignore', timeout:60000,
  });
  // Never echo arbitrary subprocess output or command arguments (password file).
  if (result.error || result.status !== 0) throw new Error(`${program} failed; check the local binary path, port and database log.`);
}

try {
  if (process.platform !== 'win32' || !['init', 'start', 'stop', 'status'].includes(action)) {
    throw new Error('Windows usage: npm.cmd --prefix server run db:local -- init|start|stop|status');
  }
  if (!existsSync(join(binDirectory, 'pg_ctl.exe'))) throw new Error('Set PLAZAHUB_PG_BIN to the PostgreSQL bin directory, or extract official binaries into .local-postgres/pgsql.');
  if (action === 'init') {
    if (existsSync(dataDirectory) || existsSync(connectionFile)) throw new Error('Local data/config already exists. Nothing was overwritten.');
    await mkdir(localRoot, { recursive:true });
    const password = randomBytes(32).toString('hex');
    const passwordFile = join(localRoot, 'init-password');
    await writeFile(passwordFile, password, { flag:'wx' });
    try {
      run('initdb', ['-D', dataDirectory, '-U', 'plazahub_local', '--auth=scram-sha-256', `--pwfile=${passwordFile}`, '--encoding=UTF8', '--locale=C']);
      // Loopback even if started later without this helper.
      await writeFile(join(dataDirectory, 'postgresql.conf'), "\nlisten_addresses = '127.0.0.1'\nport = 55432\ntimezone = 'UTC'\n", { flag:'a' });
      await writeFile(connectionFile, `LOCAL_DATABASE_URL=postgresql://plazahub_local:${password}@127.0.0.1:55432/plazahub_dev\n`, { flag:'wx' });
    } finally { await unlink(passwordFile); }
    console.log('Created local SCRAM-authenticated cluster. Credentials are in the ignored connection.env; do not share it.');
  } else {
    if (!existsSync(dataDirectory) || !existsSync(connectionFile)) throw new Error('Initialize the workspace-local database first.');
    if (action === 'start') {
      // Repeated starts of this cluster are harmless; an occupied unrelated
      // port still fails. Only our data directory is ever controlled here.
      const status = spawnSync(join(binDirectory, 'pg_ctl.exe'), ['-D', dataDirectory, 'status'], { windowsHide:true, stdio:'ignore', timeout:5000 });
      if (status.status !== 0) run('pg_ctl', ['-D', dataDirectory, '-l', join(localRoot, 'postgres.log'), '-w', '-t', '30', 'start']);
      const line = (await readFile(connectionFile, 'utf8')).trim();
      const config = readDatabaseConfig({ LOCAL_DATABASE_URL:line.slice('LOCAL_DATABASE_URL='.length) });
      const url = new URL(config.connectionString);
      url.pathname = '/postgres';
      const client = new pg.Client({ connectionString:url.href, connectionTimeoutMillis:5000 });
      try {
        await client.connect();
        const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', ['plazahub_dev']);
        if (!rowCount) await client.query('CREATE DATABASE plazahub_dev');
      } finally { await client.end(); }
      console.log('Local PostgreSQL available at 127.0.0.1:55432; development database exists.');
    } else if (action === 'stop') {
      run('pg_ctl', ['-D', dataDirectory, '-w', '-t', '30', '-m', 'fast', 'stop']);
      console.log('Stopped workspace-local PostgreSQL. Data is retained.');
    } else {
      run('pg_ctl', ['-D', dataDirectory, 'status']);
      console.log('Workspace-local PostgreSQL is running.');
    }
  }
} catch (error) {
  // Only messages constructed in this file are printed. Driver/OS errors can
  // contain sensitive connection data, so those are reduced to a safe message.
  const safe = error.message.startsWith('Local data/') || error.message.startsWith('Windows usage:')
    || error.message.startsWith('Set PLAZAHUB') || error.message.startsWith('Initialize the')
    || /^(initdb|pg_ctl) failed;/.test(error.message);
  console.error(safe ? error.message : 'Local PostgreSQL operation failed. Check local setup and the ignored database log.');
  process.exitCode = 1;
}
