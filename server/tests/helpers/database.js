import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { readDatabaseConfig, createDatabasePool } from '../../db.js';
import { loadMigrations, applyMigrations } from '../../migrate.js';

export async function createTestDatabase() {
  const local = readDatabaseConfig();
  const database = `plazahub_test_${randomBytes(12).toString('hex')}`;
  const url = new URL(local.connectionString);
  url.pathname = '/postgres';
  const control = new pg.Client({ connectionString:url.href, connectionTimeoutMillis:5000 });
  let pool, created = false, closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    try { await pool?.end(); }
    finally {
      try {
        if (created && /^plazahub_test_[a-f0-9]{24}$/.test(database)) await control.query(`DROP DATABASE "${database}"`);
      } finally { await control.end(); }
    }
  };
  try {
    await control.connect();
    // Identifier is exclusively generated hex. No shared development reset.
    await control.query(`CREATE DATABASE "${database}"`);
    created = true;
    url.pathname = `/${database}`;
    pool = createDatabasePool(readDatabaseConfig({ LOCAL_DATABASE_URL:url.href }));
    const migrations = await loadMigrations();
    await applyMigrations(pool, migrations);
    return { pool, migrations, close };
  } catch (error) { await close(); throw error; }
}
