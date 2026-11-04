import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createDatabasePool, inTransaction } from './db.js';

export async function loadMigrations(directory = new URL('./migrations/', import.meta.url)) {
  const names = (await readdir(directory)).filter(name => name.endsWith('.sql')).sort();
  const migrations = [];
  for (const [index, name] of names.entries()) {
    if (!new RegExp(`^${String(index + 1).padStart(3, '0')}_[a-z0-9_]+\\.sql$`).test(name)) {
      throw new Error('SQL migrations must be consecutively numbered from 001.');
    }
    // Git can check out CRLF on Windows; that must not change a migration's
    // identity when the same source later runs on Linux.
    const sql = (await readFile(new URL(name, directory), 'utf8')).replace(/\r\n/g, '\n');
    migrations.push({ name, sql, checksum:createHash('sha256').update(sql).digest('hex') });
  }
  if (!migrations.length) throw new Error('No migrations found.');
  return migrations;
}

export async function applyMigrations(pool, migrations) {
  return inTransaction(pool, async client => {
    // Serialize competing migration processes on this database/connection.
    await client.query('SELECT pg_advisory_xact_lock(74011, 1)');
    await client.query('CREATE SCHEMA IF NOT EXISTS plazahub_meta');
    await client.query('REVOKE ALL ON SCHEMA plazahub_meta FROM PUBLIC');
    await client.query(`CREATE TABLE IF NOT EXISTS plazahub_meta.migrations (
      name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
    const { rows } = await client.query('SELECT name, checksum FROM plazahub_meta.migrations ORDER BY name');
    for (const [index, applied] of rows.entries()) {
      const source = migrations[index];
      if (!source || source.name !== applied.name || source.checksum !== applied.checksum) {
        throw new Error('Applied migration history differs from source. Add a new migration; do not edit applied SQL.');
      }
    }
    const applied = [];
    for (const migration of migrations.slice(rows.length)) {
      await client.query(migration.sql);
      await client.query('INSERT INTO plazahub_meta.migrations (name, checksum) VALUES ($1, $2)', [migration.name, migration.checksum]);
      applied.push(migration.name);
    }
    return applied;
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  let pool;
  try {
    pool = createDatabasePool();
    const names = await applyMigrations(pool, await loadMigrations());
    console.log(names.length ? `Applied: ${names.join(', ')}` : 'Database migrations already current.');
  } catch {
    console.error('Local migration failed. Check local database setup and unchanged migration history. No connection details are logged.');
    process.exitCode = 1;
  } finally { await pool?.end(); }
}
