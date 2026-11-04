import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readDatabaseConfig } from '../db.js';
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadMigrations } from '../migrate.js';

test('database tooling only accepts an explicit local development/disposable database', () => {
  const url = 'postgresql://local:example@127.0.0.1:55432/plazahub_dev';
  const config = readDatabaseConfig({ LOCAL_DATABASE_URL:url });
  assert.equal(config.database, 'plazahub_dev');
  assert.equal(config.connectionString, url);
  assert.equal(config.max, 4);
  assert.equal(config.statement_timeout, 10000);
  assert.equal(readDatabaseConfig({ LOCAL_DATABASE_URL:url.replace('dev', 'test_ab12') }).database, 'plazahub_test_ab12');
});

test('missing, remote, ambiguous and non-development database URLs are rejected without leaking input', () => {
  for (const value of [undefined, '', 'not-a-url', 'postgresql://user:secret@remote.example/plazahub_dev',
    'postgresql://user:secret@localhost/plazahub_dev', 'postgresql://user:secret@127.0.0.1/production',
    'postgresql://user@127.0.0.1/plazahub_dev', 'https://user:secret@127.0.0.1/plazahub_dev',
    'postgresql://user:secret@127.0.0.1/plazahub_dev?host=remote.example',
    'postgresql://user:secret@127.0.0.1/plazahub_test_delete_everything']) {
    assert.throws(() => readDatabaseConfig({ LOCAL_DATABASE_URL:value }), error => !error.message.includes('secret'));
  }
});

test('migration checksums survive Windows line endings and numbering gaps are rejected', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'plazahub-migrations-'));
  const url = pathToFileURL(`${directory}/`);
  try {
    await writeFile(join(directory, '001_sample.sql'), 'SELECT 1;\nSELECT 2;\n');
    const [lf] = await loadMigrations(url);
    await writeFile(join(directory, '001_sample.sql'), 'SELECT 1;\r\nSELECT 2;\r\n');
    const [crlf] = await loadMigrations(url);
    assert.equal(lf.checksum, crlf.checksum);
    await writeFile(join(directory, '003_gap.sql'), 'SELECT 3;');
    await assert.rejects(loadMigrations(url), /consecutively numbered/);
  } finally {
    for (const name of ['001_sample.sql', '003_gap.sql']) {
      await unlink(join(directory, name)).catch(error => { if (error.code !== 'ENOENT') throw error; });
    }
    await rmdir(directory);
  }
});
