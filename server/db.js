import pg from 'pg';

// Stage 11 tooling is deliberately local-only. It is not the API's runtime
// credential. No URL or driver exception text is printed by CLI callers.
export function readDatabaseConfig(environment = process.env) {
  const value = environment.LOCAL_DATABASE_URL;
  let url;
  try { url = new URL(value); } catch { throw new Error('LOCAL_DATABASE_URL must name a local PlazaHub development database.'); }
  const database = url.pathname.slice(1);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
    || url.hostname !== '127.0.0.1' || url.search || url.hash
    || !url.username || !url.password
    || !/^plazahub_(dev|test_[a-f0-9]+)$/.test(database)) {
    throw new Error('Use a password-authenticated 127.0.0.1 plazahub_dev or disposable plazahub_test_<hex> URL without options.');
  }
  return Object.freeze({ connectionString:value, database, max:4,
    connectionTimeoutMillis:5000, idleTimeoutMillis:10000,
    statement_timeout:10000, lock_timeout:5000,
    options:'-c timezone=UTC -c search_path=pg_catalog' });
}

export function createDatabasePool(config = readDatabaseConfig()) {
  const { database: _database, ...options } = config;
  const pool = new pg.Pool(options);
  // An idle connection error must not crash the process or disclose credentials.
  pool.on('error', () => console.error('Database connection unavailable.'));
  return pool;
}

export async function inTransaction(pool, work) {
  const client = await pool.connect();
  let discard;
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (rollbackError) { discard = rollbackError; }
    throw error;
  } finally { client.release(discard); }
}
