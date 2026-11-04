// Run explicitly with test:db; missing PostgreSQL is a failure, never a skipped
// "pass". Each run creates its own database and drops only that owned database.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { readDatabaseConfig, createDatabasePool, inTransaction } from '../db.js';
import { applyMigrations, loadMigrations } from '../migrate.js';
import { fixtureIds as id, seedFoundation } from '../fixtures/foundation.js';

let control, pool, migrations, database, created = false;
before(async () => {
  const local = readDatabaseConfig();
  database = `plazahub_test_${randomBytes(12).toString('hex')}`;
  const url = new URL(local.connectionString);
  url.pathname = '/postgres';
  control = new pg.Client({ connectionString:url.href, connectionTimeoutMillis:5000 });
  await control.connect();
  // Identifier is exclusively generated hex, never user input.
  await control.query(`CREATE DATABASE "${database}"`);
  created = true;
  url.pathname = `/${database}`;
  pool = createDatabasePool(readDatabaseConfig({ LOCAL_DATABASE_URL:url.href }));
  migrations = await loadMigrations();
  await applyMigrations(pool, migrations);
  await inTransaction(pool, seedFoundation);
});

after(async () => {
  try { await pool?.end(); }
  finally {
    try {
      if (created && /^plazahub_test_[a-f0-9]{24}$/.test(database)) await control.query(`DROP DATABASE "${database}"`);
    } finally { await control?.end(); }
  }
});

async function rollback(work) {
  const client = await pool.connect();
  try { await client.query('BEGIN'); await work(client); }
  finally { await client.query('ROLLBACK'); client.release(); }
}

async function rejectsSql(client, sql, values, code) {
  await client.query('SAVEPOINT invalid_write');
  try { await assert.rejects(client.query(sql, values), { code }); }
  finally { await client.query('ROLLBACK TO SAVEPOINT invalid_write'); await client.query('RELEASE SAVEPOINT invalid_write'); }
}

const assignment = `INSERT INTO plazahub.tenancies (plaza_id, unit_id, tenant_id, lease_start, lease_end)
  VALUES ($1, $2, $3, '2026-01-01', '2026-12-31') RETURNING id`;

test('synthetic setup separates identities, plazas and business profiles', async () => {
  const { rows } = await pool.query(`SELECT
    (SELECT count(*) FROM plazahub.plazas) AS plazas,
    (SELECT count(*) FROM plazahub.users WHERE provider_subject IS NULL) AS synthetic_users,
    (SELECT count(*) FROM plazahub.tenant_profiles) AS tenants,
    (SELECT count(*) FROM plazahub.units WHERE number = 'A-01') AS same_number_shops`);
  assert.deepEqual(rows[0], { plazas:'2', synthetic_users:'3', tenants:'2', same_number_shops:'2' });
});

test('rerunning/concurrently running migrations applies nothing twice', async () => {
  assert.deepEqual(await Promise.all([applyMigrations(pool, migrations), applyMigrations(pool, migrations)]), [[], []]);
  assert.equal((await pool.query('SELECT count(*) AS n FROM plazahub_meta.migrations')).rows[0].n, '1');
});

test('changed or missing applied migration source is rejected', async () => {
  await assert.rejects(applyMigrations(pool, [{ ...migrations[0], checksum:'changed' }]), /history differs/);
  await assert.rejects(applyMigrations(pool, []), /history differs/);
});

test('failed migration rolls back schema and history together', async () => {
  await assert.rejects(applyMigrations(pool, [...migrations, { name:'002_probe.sql', checksum:'probe',
    sql:'CREATE TABLE plazahub.failed_probe (id integer); SELECT missing_column;' }]), { code:'42703' });
  assert.equal((await pool.query("SELECT to_regclass('plazahub.failed_probe') AS table_name")).rows[0].table_name, null);
  assert.equal((await pool.query('SELECT count(*) AS n FROM plazahub_meta.migrations')).rows[0].n, '1');
});

test('fixtures refuse an existing dataset and preserve all records', async () => {
  await assert.rejects(inTransaction(pool, seedFoundation), /empty foundation/);
  assert.equal((await pool.query('SELECT count(*) AS n FROM plazahub.users')).rows[0].n, '3');
});

test('same-plaza foreign keys reject foreign shops, profiles and access links', async () => rollback(async client => {
  await rejectsSql(client, assignment, [id.plazaA, id.unitB, id.tenantA], '23503');
  await rejectsSql(client, assignment, [id.plazaA, id.vacantA, id.tenantB], '23503');
  await rejectsSql(client, 'INSERT INTO plazahub.tenant_access (plaza_id, tenant_id, user_id) VALUES ($1, $2, $3)', [id.plazaA, id.tenantB, id.ownerA], '23503');
  await rejectsSql(client, `INSERT INTO plazahub.tenancy_terms (plaza_id, tenancy_id, version, effective_on, annual_rent_kobo, recorded_by, reason)
    VALUES ($1, $2, 1, '2026-01-01', 1, $3, 'Invalid cross-plaza terms')`, [id.plazaB, id.tenancyA, id.ownerB], '23503');
}));

test('shop numbers are unique within a plaza regardless of case', async () => rollback(async client => {
  await rejectsSql(client, 'INSERT INTO plazahub.units (plaza_id, number) VALUES ($1, $2)', [id.plazaA, 'a-01'], '23505');
  await rejectsSql(client, 'INSERT INTO plazahub.units (plaza_id, number) VALUES ($1, $2)', [id.plazaA, ' A-03 '], '23514');
}));

test('expired dates do not free an active shop; a tenant can occupy several shops', async () => rollback(async client => {
  await rejectsSql(client, assignment, [id.plazaA, id.unitA, id.tenantA], '23505');
  await client.query(`INSERT INTO plazahub.tenancies (plaza_id, unit_id, tenant_id, lease_start, lease_end)
    VALUES ($1, $2, $3, '2020-01-01', '2020-12-31')`, [id.plazaA, id.vacantA, id.tenantA]);
  await rejectsSql(client, assignment, [id.plazaA, id.vacantA, id.tenantA], '23505');
  assert.equal((await client.query("SELECT count(*) AS n FROM plazahub.tenancies WHERE tenant_id = $1 AND status = 'active'", [id.tenantA])).rows[0].n, '2');
}));

test('closing then reassigning keeps the original agreement and term history', async () => rollback(async client => {
  await client.query("UPDATE plazahub.tenancies SET status = 'ended', ended_on = '2026-06-01', end_reason = 'Synthetic move' WHERE id = $1", [id.tenancyA]);
  const { rows } = await client.query(assignment, [id.plazaA, id.unitA, id.tenantA]);
  assert.notEqual(rows[0].id, id.tenancyA);
  assert.equal((await client.query('SELECT count(*) AS n FROM plazahub.tenancy_terms WHERE tenancy_id = $1', [id.tenancyA])).rows[0].n, '1');
  await rejectsSql(client, "UPDATE plazahub.tenancies SET status = 'active', ended_on = NULL, end_reason = NULL WHERE id = $1", [id.tenancyA], '23514');
}));

test('history cannot be deleted or reassigned to another identity', async () => rollback(async client => {
  await rejectsSql(client, 'DELETE FROM plazahub.tenancies WHERE id = $1', [id.tenancyA], '23514');
  await rejectsSql(client, 'UPDATE plazahub.tenancies SET unit_id = $1 WHERE id = $2', [id.vacantA, id.tenancyA], '23514');
  await rejectsSql(client, 'UPDATE plazahub.tenancy_terms SET annual_rent_kobo = 1 WHERE tenancy_id = $1', [id.tenancyA], '23514');
  await rejectsSql(client, 'DELETE FROM plazahub.tenancy_terms WHERE tenancy_id = $1', [id.tenancyA], '23514');
  await rejectsSql(client, 'DELETE FROM plazahub.tenant_profiles WHERE id = $1', [id.tenantA], '23001');
}));

test('invalid lease ranges, closure states and zero rent are rejected', async () => rollback(async client => {
  await rejectsSql(client, `INSERT INTO plazahub.tenancies (plaza_id, unit_id, tenant_id, lease_start, lease_end)
    VALUES ($1, $2, $3, '2026-12-31', '2026-01-01')`, [id.plazaA, id.vacantA, id.tenantA], '23514');
  await rejectsSql(client, "UPDATE plazahub.tenancies SET status = 'ended' WHERE id = $1", [id.tenancyA], '23514');
  await rejectsSql(client, `INSERT INTO plazahub.tenancy_terms (plaza_id, tenancy_id, version, effective_on, annual_rent_kobo, recorded_by, reason)
    VALUES ($1, $2, 2, '2027-01-01', 0, $3, 'Invalid rent')`, [id.plazaA, id.tenancyA, id.ownerA], '23514');
}));

test('kobo stays an exact bigint string and term versions are unique', async () => rollback(async client => {
  const values = [id.plazaA, id.tenancyA, '9007199254740993', id.ownerA];
  const sql = `INSERT INTO plazahub.tenancy_terms (plaza_id, tenancy_id, version, effective_on, annual_rent_kobo, recorded_by, reason)
    VALUES ($1, $2, 2, '2027-01-01', $3, $4, 'Synthetic future version') RETURNING annual_rent_kobo`;
  assert.equal((await client.query(sql, values)).rows[0].annual_rent_kobo, '9007199254740993');
  await rejectsSql(client, sql, values, '23505');
}));

test('transaction failure rolls back earlier writes and releases a usable connection', async () => {
  const name = `rollback-${randomBytes(10).toString('hex')}`;
  await assert.rejects(inTransaction(pool, async client => {
    await client.query('INSERT INTO plazahub.units (plaza_id, number) VALUES ($1, $2)', [id.plazaA, name]);
    throw new Error('Synthetic service failure');
  }), /Synthetic service failure/);
  assert.equal((await pool.query('SELECT count(*) AS n FROM plazahub.units WHERE number = $1', [name])).rows[0].n, '0');
});

test('simultaneous assignments on separate connections allow exactly one occupant', async () => {
  const unitId = randomUUID();
  await pool.query('INSERT INTO plazahub.units (id, plaza_id, number) VALUES ($1, $2, $3)', [unitId, id.plazaA, `R-${randomBytes(5).toString('hex')}`]);
  const a = await pool.connect(), b = await pool.connect();
  try {
    assert.notEqual(a.processID, b.processID);
    await a.query('BEGIN'); await b.query('BEGIN');
    await a.query(assignment, [id.plazaA, unitId, id.tenantA]);
    // Start the competing write while A still owns the unique-index entry.
    const rejected = assert.rejects(b.query(assignment, [id.plazaA, unitId, id.tenantA]), { code:'23505' });
    let waiting = false;
    for (let attempt = 0; attempt < 50; attempt++) {
      const { rows } = await pool.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid = $1', [b.processID]);
      if (rows[0]?.wait_event_type === 'Lock') { waiting = true; break; }
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.equal(waiting, true, 'second writer must actually wait on the uncommitted first assignment');
    await a.query('COMMIT');
    await rejected;
    await b.query('ROLLBACK');
    assert.equal((await pool.query("SELECT count(*) AS n FROM plazahub.tenancies WHERE unit_id = $1 AND status = 'active'", [unitId])).rows[0].n, '1');
  } finally {
    await a.query('ROLLBACK'); await b.query('ROLLBACK'); a.release(); b.release();
  }
});

test('domain tables enable RLS without policies or public privileges; this is not runtime authorization', async () => {
  const { rows } = await pool.query(`SELECT c.relname, c.relrowsecurity, c.relacl::text[] AS relacl
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'plazahub' AND c.relkind = 'r'`);
  assert.equal(rows.length, 8);
  assert.ok(rows.every(row => row.relrowsecurity));
  assert.equal((await pool.query("SELECT count(*) AS n FROM pg_policies WHERE schemaname = 'plazahub'")).rows[0].n, '0');
  assert.ok(rows.every(row => !row.relacl?.some(grant => grant.startsWith('='))));
});
