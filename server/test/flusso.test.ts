import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { creaAdmin } from '../src/admin.js';

const GB = 1024 ** 3;
let app: Awaited<ReturnType<typeof buildApp>>;
let dir: string;
let adminCookie = '';
let userCookie = '';
let userId = 0;

const b64 = (s: string) => Buffer.from(s).toString('base64');

async function login(email: string, password: string) {
  const r = await app.inject({ method: 'POST', url: '/api/accesso', payload: { email, password } });
  assert.equal(r.statusCode, 200, r.body);
  const c = r.cookies.find((c) => c.name === 'fs_sessione')!;
  return `fs_sessione=${c.value}`;
}

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'filmshare-'));
  app = await buildApp(
    { ...loadConfig({}), dbPath: ':memory:', sharedPath: path.join(dir, 'nas'), uploadTmpPath: path.join(dir, 'tmp') },
    { logger: false },
  );
  await creaAdmin(app.ctx.db, { email: 'admin@test.it', nome: 'Admin', password: 'password-admin-1' });
  adminCookie = await login('admin@test.it', 'password-admin-1');
  // Gli upload tus passano da una connessione HTTP vera (il simulatore di Fastify non regge i corpi in streaming di tus).
  await app.listen({ host: '127.0.0.1', port: 0 });
  base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
});

let base = '';
const tusFetch = (url: string, method: string, headers: Record<string, string>, body?: Buffer) =>
  fetch(base + url, { method, headers: { 'tus-resumable': '1.0.0', ...headers }, body, signal: AbortSignal.timeout(10_000) });

after(async () => {
  await app.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('accesso: password sbagliata rifiutata, senza sessione niente dati', async () => {
  const bad = await app.inject({ method: 'POST', url: '/api/accesso', payload: { email: 'admin@test.it', password: 'sbagliata-123' } });
  assert.equal(bad.statusCode, 401);
  const anon = await app.inject({ method: 'GET', url: '/api/io' });
  assert.equal(anon.statusCode, 401);
});

test("l'admin crea un utente con quota e periodo propri", async () => {
  const r = await app.inject({
    method: 'POST', url: '/api/admin/utenti', headers: { cookie: adminCookie },
    payload: { email: 'marco@test.it', nome: 'Marco Rossi', password: 'password-marco-1', limiti: { quota: 20 * GB, periodo: 'week' } },
  });
  assert.equal(r.statusCode, 201, r.body);
  userId = r.json().id;
  userCookie = await login('marco@test.it', 'password-marco-1');
  const io = (await app.inject({ method: 'GET', url: '/api/io', headers: { cookie: userCookie } })).json();
  assert.equal(io.banda.quota, 20 * GB);
  assert.equal(io.banda.period, 'week');
  assert.equal(io.banda.remaining, 20 * GB);
  const forbidden = await app.inject({ method: 'GET', url: '/api/admin/utenti', headers: { cookie: userCookie } });
  assert.equal(forbidden.statusCode, 403);
});

test('upload piccolo: approvato subito, caricato a pezzi con tus, pubblicato sul NAS', async () => {
  const content = Buffer.from('a'.repeat(1000) + 'b'.repeat(500));
  const req = await app.inject({
    method: 'POST', url: '/api/upload/richieste', headers: { cookie: userCookie },
    payload: { nome: 'Film di prova.mkv', dimensione: content.length },
  });
  const t = req.json();
  assert.equal(t.stato, 'approved');

  const create = await tusFetch('/api/upload/tus', 'POST', {
    cookie: userCookie, 'upload-length': String(content.length),
    'upload-metadata': `transferId ${b64(String(t.id))},filename ${b64('Film di prova.mkv')}`,
  });
  assert.equal(create.status, 201, await create.text());
  const loc = create.headers.get('location')!;

  // Un altro utente non può continuare l'upload di Marco.
  const stranger = await tusFetch(loc, 'HEAD', { cookie: adminCookie });
  assert.equal(stranger.status, 404);

  // Primo pezzo, poi "cade la connessione": si chiede l'offset e si riprende.
  const octet = { 'content-type': 'application/offset+octet-stream' };
  const p1 = await tusFetch(loc, 'PATCH', { cookie: userCookie, 'upload-offset': '0', ...octet }, content.subarray(0, 1000));
  assert.equal(p1.status, 204, await p1.text());
  const head = await tusFetch(loc, 'HEAD', { cookie: userCookie });
  assert.equal(head.headers.get('upload-offset'), '1000');
  const p2 = await tusFetch(loc, 'PATCH', { cookie: userCookie, 'upload-offset': '1000', ...octet }, content.subarray(1000));
  assert.equal(p2.status, 204, await p2.text());

  const onNas = fs.readFileSync(path.join(dir, 'nas', 'Film di prova.mkv'));
  assert.deepEqual(onNas, content);
  const io = (await app.inject({ method: 'GET', url: '/api/io', headers: { cookie: userCookie } })).json();
  assert.equal(io.banda.upload, content.length);
  assert.equal(io.banda.inProgress, 0);
});

test('download: link firmato, ripresa con Range, nessuna doppia prenotazione', async () => {
  const list = (await app.inject({ method: 'GET', url: '/api/file', headers: { cookie: adminCookie } })).json();
  const f = list.file.find((x: any) => x.nome === 'Film di prova.mkv');
  assert.equal(f.caricatoDa, 'Marco Rossi');

  const d1 = (await app.inject({ method: 'POST', url: `/api/file/${f.id}/download`, headers: { cookie: adminCookie } })).json();
  assert.equal(d1.stato, 'approved');
  assert.ok(d1.link);
  const d2 = (await app.inject({ method: 'POST', url: `/api/file/${f.id}/download`, headers: { cookie: adminCookie } })).json();
  assert.equal(d2.id, d1.id, 'stesso link, nessuna nuova prenotazione');

  const full = await app.inject({ method: 'GET', url: d1.link });
  assert.equal(full.statusCode, 200);
  assert.equal(full.rawPayload.length, 1500);
  const part = await app.inject({ method: 'GET', url: d1.link, headers: { range: 'bytes=1000-' } });
  assert.equal(part.statusCode, 206);
  assert.equal(part.rawPayload.toString(), 'b'.repeat(500));

  const forged = await app.inject({ method: 'GET', url: d1.link.replace(/\/[^/]+\/([^/]+)$/, '/XXXX/$1') });
  assert.equal(forged.statusCode, 403);

  const io = (await app.inject({ method: 'GET', url: '/api/io', headers: { cookie: adminCookie } })).json();
  assert.equal(io.banda.download, 1500);
});

test('oltre soglia va in approvazione; approvata prenota; annullata restituisce', async () => {
  const big = (await app.inject({
    method: 'POST', url: '/api/upload/richieste', headers: { cookie: userCookie },
    payload: { nome: 'Grande.mkv', dimensione: 15 * GB },
  })).json();
  assert.equal(big.stato, 'pending');
  assert.equal(big.motivo, 'over_threshold');

  // Non si può caricare finché non è approvata.
  const early = await tusFetch('/api/upload/tus', 'POST', {
    cookie: userCookie, 'upload-length': String(15 * GB), 'upload-metadata': `transferId ${b64(String(big.id))}`,
  });
  assert.equal(early.status, 403);

  const pend = (await app.inject({ method: 'GET', url: '/api/admin/richieste', headers: { cookie: adminCookie } })).json();
  assert.equal(pend.length, 1);
  assert.equal(pend[0].impatto.percentuale, 75);

  const ok = await app.inject({ method: 'POST', url: `/api/admin/richieste/${big.id}/approva`, headers: { cookie: adminCookie } });
  assert.equal(ok.json().stato, 'approved');
  let io = (await app.inject({ method: 'GET', url: '/api/io', headers: { cookie: userCookie } })).json();
  assert.equal(io.banda.inProgress, 15 * GB);

  // Oltre la quota residua (5 GB circa): va in approvazione come eccezione.
  const over = (await app.inject({
    method: 'POST', url: '/api/upload/richieste', headers: { cookie: userCookie },
    payload: { nome: 'Troppo.mkv', dimensione: 6 * GB },
  })).json();
  assert.equal(over.stato, 'pending');
  assert.equal(over.motivo, 'over_quota');

  await app.inject({ method: 'DELETE', url: `/api/trasferimenti/${big.id}`, headers: { cookie: userCookie } });
  io = (await app.inject({ method: 'GET', url: '/api/io', headers: { cookie: userCookie } })).json();
  assert.equal(io.banda.inProgress, 0);

  const n = (await app.inject({ method: 'POST', url: '/api/admin/richieste/approva-entro-limiti', headers: { cookie: adminCookie } })).json();
  assert.equal(n.approvate, 1, 'ora la quota basta');
});

test("l'admin cambia quota e periodo; sospensione chiude le sessioni", async () => {
  const r = await app.inject({
    method: 'PATCH', url: `/api/admin/utenti/${userId}`, headers: { cookie: adminCookie },
    payload: { limiti: { quota: 100 * GB, periodo: 'month' } },
  });
  assert.equal(r.json().limiti.periodo, 'month');
  const s = await app.inject({ method: 'PATCH', url: `/api/admin/utenti/${userId}`, headers: { cookie: adminCookie }, payload: { stato: 'suspended' } });
  assert.equal(s.statusCode, 200);
  const io = await app.inject({ method: 'GET', url: '/api/io', headers: { cookie: userCookie } });
  assert.equal(io.statusCode, 401);
});

test('regole di banda: lettura e modifica', async () => {
  const put = await app.inject({
    method: 'PUT', url: '/api/admin/regole', headers: { cookie: adminCookie },
    payload: { default_period: 'month', night_window: { start: '01:00', end: '06:00' } },
  });
  assert.equal(put.statusCode, 200, put.body);
  assert.equal(put.json().default_period, 'month');
  const bad = await app.inject({ method: 'PUT', url: '/api/admin/regole', headers: { cookie: adminCookie }, payload: { night_window: { start: '25:00', end: '06:00' } } });
  assert.equal(bad.statusCode, 400);
});
