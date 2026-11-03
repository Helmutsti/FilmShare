import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db/index.js';
import { creaAdmin } from '../src/admin.js';
import { hashPassword, verifyPassword, generatePassword } from '../src/auth/password.js';

test('password: si verifica quella giusta, si rifiuta quella sbagliata', async () => {
  const h = await hashPassword('una-password-lunga');
  assert.match(h, /^scrypt\$/);
  assert.equal(await verifyPassword('una-password-lunga', h), true);
  assert.equal(await verifyPassword('un-altra-password', h), false);
  await assert.rejects(hashPassword('corta'));
  assert.equal(generatePassword().length, 20);
});

test('crea-admin: crea un admin attivo con i limiti predefiniti', async () => {
  const db = openDb(':memory:');
  const r = await creaAdmin(db, { email: 'Admin@Example.com', nome: 'Admin Prova' });
  assert.equal(r.created, true);
  assert.equal(r.generated, true);
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(r.id) as any;
  assert.equal(u.role, 'admin');
  assert.equal(u.status, 'active');
  assert.equal(await verifyPassword(r.password, u.password_hash), true);
  const l = db.prepare('SELECT * FROM user_limits WHERE user_id = ?').get(r.id) as any;
  assert.equal(l.period, 'week');
  assert.equal(l.quota_bytes, 400 * 1024 ** 3);
  db.close();
});

test('crea-admin: email già presente → errore, salvo --reimposta', async () => {
  const db = openDb(':memory:');
  const first = await creaAdmin(db, { email: 'a@b.it', nome: 'A' });
  await assert.rejects(creaAdmin(db, { email: 'A@B.IT', nome: 'A' }), /Esiste già/);
  db.prepare(`INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (?, 'x', '2099-01-01')`).run(first.id);
  const again = await creaAdmin(db, { email: 'a@b.it', password: 'nuova-password-sicura', reimposta: true });
  assert.equal(again.created, false);
  const u = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(first.id) as any;
  assert.equal(await verifyPassword('nuova-password-sicura', u.password_hash), true);
  assert.equal(db.prepare('SELECT COUNT(*) FROM sessions').pluck().get(), 0);
  db.close();
});
