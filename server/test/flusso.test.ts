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

test("l'admin cambia quota, periodo e velocità (0 = nessun limite); sospensione chiude le sessioni", async () => {
  const r = await app.inject({
    method: 'PATCH', url: `/api/admin/utenti/${userId}`, headers: { cookie: adminCookie },
    payload: { limiti: { quota: 100 * GB, periodo: 'month', velocitaKbps: 0 } },
  });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().limiti.periodo, 'month');
  assert.equal(r.json().limiti.velocitaKbps, 0);
  const neg = await app.inject({
    method: 'PATCH', url: `/api/admin/utenti/${userId}`, headers: { cookie: adminCookie }, payload: { limiti: { velocitaKbps: -5 } },
  });
  assert.equal(neg.statusCode, 400);

  // "Permetti upload" spento: niente upload, i download restano.
  const off = await app.inject({
    method: 'PATCH', url: `/api/admin/utenti/${userId}`, headers: { cookie: adminCookie }, payload: { limiti: { permettiUpload: false } },
  });
  assert.equal(off.json().limiti.permettiUpload, false);
  const up = await app.inject({
    method: 'POST', url: '/api/upload/richieste', headers: { cookie: userCookie }, payload: { nome: 'No.mkv', dimensione: 10 },
  });
  assert.equal(up.statusCode, 403);
  const io0 = (await app.inject({ method: 'GET', url: '/api/io', headers: { cookie: userCookie } })).json();
  assert.equal(io0.limiti.can_upload, false);
  const files = (await app.inject({ method: 'GET', url: '/api/file', headers: { cookie: userCookie } })).json();
  const dl = await app.inject({ method: 'POST', url: `/api/file/${files.file[0].id}/download`, headers: { cookie: userCookie } });
  assert.equal(dl.statusCode, 200, dl.body);
  const s = await app.inject({ method: 'PATCH', url: `/api/admin/utenti/${userId}`, headers: { cookie: adminCookie }, payload: { stato: 'suspended' } });
  assert.equal(s.statusCode, 200);
  const io = await app.inject({ method: 'GET', url: '/api/io', headers: { cookie: userCookie } });
  assert.equal(io.statusCode, 401);
});

test('"Sospendi trasferimenti" blocca upload, download e link già dati; poi tutto riprende', async () => {
  const files = (await app.inject({ method: 'GET', url: '/api/file', headers: { cookie: adminCookie } })).json();
  const link = (await app.inject({ method: 'POST', url: `/api/file/${files.file[0].id}/download`, headers: { cookie: adminCookie } })).json().link;
  assert.equal((await app.inject({ method: 'GET', url: link })).statusCode, 200);

  const on = await app.inject({ method: 'PUT', url: '/api/admin/sospensione', headers: { cookie: adminCookie }, payload: { sospesi: true } });
  assert.equal(on.statusCode, 200);
  assert.equal((await app.inject({ method: 'GET', url: '/api/io', headers: { cookie: adminCookie } })).json().sospesi, true);
  const up = await app.inject({ method: 'POST', url: '/api/upload/richieste', headers: { cookie: adminCookie }, payload: { nome: 'x.mkv', dimensione: 10 } });
  assert.equal(up.statusCode, 503);
  assert.equal((await app.inject({ method: 'GET', url: link })).statusCode, 503);

  await app.inject({ method: 'PUT', url: '/api/admin/sospensione', headers: { cookie: adminCookie }, payload: { sospesi: false } });
  assert.equal((await app.inject({ method: 'GET', url: link })).statusCode, 200);
});

test('cartelle: si vedono solo quelle esposte, gli upload vanno nella cartella scelta', async () => {
  const nas = path.join(dir, 'nas');
  for (const d of ['Film', 'Serie/Stagione 1', 'Privata', 'Caricati']) fs.mkdirSync(path.join(nas, d), { recursive: true });
  fs.writeFileSync(path.join(nas, 'Film', 'a.mkv'), 'aaa');
  fs.writeFileSync(path.join(nas, 'Serie/Stagione 1', 'b.mkv'), 'bbb');
  fs.writeFileSync(path.join(nas, 'Privata', 'c.mkv'), 'ccc');

  const all = (await app.inject({ method: 'GET', url: '/api/admin/cartelle', headers: { cookie: adminCookie } })).json();
  assert.ok(all.cartelle.some((c: any) => c.percorso === 'Serie/Stagione 1' && c.livello === 2));
  assert.ok(!all.cartelle.some((c: any) => c.nome.startsWith('.')), 'la cartella degli upload in corso resta nascosta');

  const bad = await app.inject({ method: 'PUT', url: '/api/admin/cartelle', headers: { cookie: adminCookie }, payload: { esposte: ['../fuori'], upload: null } });
  assert.equal(bad.statusCode, 400);

  // Prima del cambio: tutto esposto (salvare le cartelle fa rileggere subito il NAS), prendo l'id del file privato.
  await app.inject({ method: 'PUT', url: '/api/admin/cartelle', headers: { cookie: adminCookie }, payload: { esposte: [''], upload: '' } });
  const before = (await app.inject({ method: 'GET', url: '/api/file', headers: { cookie: adminCookie } })).json();
  const privata = before.file.find((f: any) => f.percorso === 'Privata/c.mkv');
  assert.ok(privata);

  const put = await app.inject({
    method: 'PUT', url: '/api/admin/cartelle', headers: { cookie: adminCookie }, payload: { esposte: ['Film', 'Serie'], upload: 'Caricati' },
  });
  assert.equal(put.statusCode, 200, put.body);
  assert.deepEqual(put.json().esposte.sort(), ['Caricati', 'Film', 'Serie'], 'la cartella di upload diventa anche di download');

  const list = (await app.inject({ method: 'GET', url: '/api/file', headers: { cookie: adminCookie } })).json();
  const paths = list.file.map((f: any) => f.percorso).sort();
  assert.deepEqual(paths, ['Film/a.mkv', 'Serie/Stagione 1/b.mkv']);
  const hiddenDl = await app.inject({ method: 'POST', url: `/api/file/${privata.id}/download`, headers: { cookie: adminCookie } });
  assert.equal(hiddenDl.statusCode, 404);

  // Upload: finisce in Caricati ed è subito scaricabile.
  const content = Buffer.from('nuovo film');
  const t = (await app.inject({ method: 'POST', url: '/api/upload/richieste', headers: { cookie: adminCookie }, payload: { nome: 'Nuovo.mkv', dimensione: content.length } })).json();
  const c = await tusFetch('/api/upload/tus', 'POST', { cookie: adminCookie, 'upload-length': String(content.length), 'upload-metadata': `transferId ${b64(String(t.id))}` });
  const p = await tusFetch(c.headers.get('location')!, 'PATCH', { cookie: adminCookie, 'upload-offset': '0', 'content-type': 'application/offset+octet-stream' }, content);
  assert.equal(p.status, 204, await p.text());
  assert.equal(fs.readFileSync(path.join(nas, 'Caricati', 'Nuovo.mkv'), 'utf8'), 'nuovo film');
  const after = (await app.inject({ method: 'GET', url: '/api/file', headers: { cookie: adminCookie } })).json();
  assert.ok(after.file.some((f: any) => f.percorso === 'Caricati/Nuovo.mkv'));

  // Nessuna cartella di upload: niente upload.
  await app.inject({ method: 'PUT', url: '/api/admin/cartelle', headers: { cookie: adminCookie }, payload: { esposte: ['Film'], upload: null } });
  const noUp = await app.inject({ method: 'POST', url: '/api/upload/richieste', headers: { cookie: adminCookie }, payload: { nome: 'x', dimensione: 1 } });
  assert.equal(noUp.statusCode, 409);
});

test('niente regole globali modificabili: solo i valori proposti per un nuovo utente', async () => {
  const put = await app.inject({ method: 'PUT', url: '/api/admin/regole', headers: { cookie: adminCookie }, payload: {} });
  assert.equal(put.statusCode, 404);
  const d = await app.inject({ method: 'GET', url: '/api/admin/predefiniti', headers: { cookie: adminCookie } });
  assert.deepEqual(d.json(), { quota: 400 * GB, periodo: 'week', velocitaKbps: 50_000, simultanei: 2 });
  const u = await app.inject({ method: 'GET', url: '/api/admin/predefiniti', headers: { cookie: userCookie } });
  assert.notEqual(u.statusCode, 200);
});
