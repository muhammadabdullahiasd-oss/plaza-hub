import { createDatabasePool, readDatabaseConfig, inTransaction } from './db.js';
import { applyMigrations, loadMigrations } from './migrate.js';
import { seedFoundation } from './fixtures/foundation.js';

let pool;
try {
  const config = readDatabaseConfig();
  if (config.database !== 'plazahub_dev') throw new Error('Seed requires the local development database.');
  pool = createDatabasePool(config);
  await applyMigrations(pool, await loadMigrations());
  await inTransaction(pool, async client => {
    await client.query('SELECT pg_advisory_xact_lock(74011, 1)');
    await seedFoundation(client);
  });
  console.log('Synthetic fixtures created: 2 plazas, 3 users, 3 shops, 2 tenants, 1 tenancy. No real accounts exist.');
} catch {
  console.error('Local seed failed. Fixtures require the local empty foundation schema. Existing data was not replaced.');
  process.exitCode = 1;
} finally { await pool?.end(); }
