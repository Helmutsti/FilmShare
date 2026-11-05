import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { openDb, migrate } from '../src/db/index.js';

test('il server risponde e il database è alla versione più recente', async () => {
  const app = await buildApp({ ...loadConfig({}), dbPath: ':memory:' }, { logger: false });
  const res = await app.inject({ method: 'GET', url: '/api/salute' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { stato: 'ok', database: '010_catalogo' });
  await app.close();
});

test('le migrazioni non si applicano due volte e le regole predefinite ci sono', () => {
  const db = openDb(':memory:');
  assert.deepEqual(migrate(db), []);
  const period = db.prepare("SELECT value FROM settings WHERE key = 'default_period'").pluck().get();
  assert.equal(JSON.parse(period as string), 'week');
  db.close();
});
