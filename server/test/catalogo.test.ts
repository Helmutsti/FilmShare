import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { zipSync, strToU8 } from 'fflate';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { creaAdmin } from '../src/admin.js';

let app: Awaited<ReturnType<typeof buildApp>>;
let dir: string;
let nas: string;
let covers: string;
let adminCookie = '';
let userCookie = '';

const JPG = Buffer.from('ffd8ffe000104a46494600010100000100010000ffd9', 'hex');
const JPG2 = Buffer.from('ffd8ffe000104a46494600010100000100020000ffd9', 'hex');

async function login(email: string, password: string) {
  const r = await app.inject({ method: 'POST', url: '/api/accesso', payload: { email, password } });
  assert.equal(r.statusCode, 200, r.body);
  return `fs_sessione=${r.cookies.find((c) => c.name === 'fs_sessione')!.value}`;
}

function scriviNas(rel: string, bytes = 10) {
  fs.mkdirSync(path.dirname(path.join(nas, rel)), { recursive: true });
  fs.writeFileSync(path.join(nas, rel), Buffer.alloc(bytes));
}

/** Uno zip come quello degli script di esportazione: percorsi di Jellyfin in stile Windows, diversi da quelli del NAS. */
function zipCatalogo(titoli: unknown[], copertine: Record<string, Buffer> = { 'm1.jpg': JPG, 's1.jpg': JPG, 'se1.jpg': JPG2 }) {
  const cat = { formato: 'filmshare-catalogo', versione: 1, generato: '2026-11-05T11:46:00Z', origine: 'Jellyfin 12.1.0', titoli };
  const files: Record<string, Uint8Array> = { 'catalogo.json': strToU8('﻿' + JSON.stringify(cat)) };
  for (const [n, b] of Object.entries(copertine)) files[`copertine/${n}`] = b;
  return Buffer.from(zipSync(files));
}

const J = '\\\\manas\\Multimedia';
const TITOLI = [
  { id: 'm1', tipo: 'film', titolo: 'Amadeus', anno: 1984, generi: ['Drama'], trama: 'Mozart e Salieri.', percorso: `${J}\\Films\\Amadeus.mkv`, copertina: 'copertine/m1.jpg' },
  { id: 'm2', tipo: 'film', titolo: 'Non sul NAS', anno: 2000, percorso: `${J}\\Films\\Assente.mkv`, copertina: null },
  { id: 'm3', tipo: 'film', titolo: 'Primo omonimo', percorso: `${J}\\Films\\A\\Film.mkv` },
  { id: 'm4', tipo: 'film', titolo: 'Secondo omonimo', percorso: `${J}\\Films\\B\\Film.mkv` },
  {
    id: 's1', tipo: 'serie', titolo: 'Breaking Bad', anno: 2008, generi: ['Drama', 'Crime'], trama: 'Chimica.', percorso: `${J}\\Serie TV\\Breaking Bad`,
    copertina: 'copertine/s1.jpg',
    stagioni: [{ numero: 1, titolo: 'Stagione 1', copertina: 'copertine/se1.jpg' }, { numero: 2, titolo: 'Stagione 2', copertina: null }],
    episodi: [
      { stagione: 1, episodio: 2, titolo: 'Senza ritorno', percorso: `${J}\\Serie TV\\Breaking Bad\\S01\\BB.S01E02.mkv` },
      { stagione: 1, episodio: 1, titolo: 'Questione di chimica', percorso: `${J}\\Serie TV\\Breaking Bad\\S01\\BB.S01E01.mkv` },
      { stagione: 2, episodio: 1, titolo: 'Non scaricato', percorso: `${J}\\Serie TV\\Breaking Bad\\S02\\BB.S02E01.mkv` },
    ],
  },
  { id: 'b1', tipo: 'collezione', titolo: 'Da ignorare' },
];

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'filmshare-catalogo-'));
  nas = path.join(dir, 'nas');
  covers = path.join(dir, 'db', 'copertine');
  scriviNas('Films/Amadeus.mkv', 1000);
  scriviNas('Films/A/Film.mkv');
  scriviNas('Films/B/Film.mkv');
  scriviNas('Serie TV/Breaking Bad/S01/BB.S01E01.mkv', 300);
  scriviNas('Serie TV/Breaking Bad/S01/BB.S01E02.mkv', 200);
  scriviNas('Video di casa/compleanno.mp4');
  app = await buildApp(
    { ...loadConfig({}), dbPath: ':memory:', sharedPath: nas, uploadTmpPath: path.join(dir, 'tmp'), coversPath: covers },
    { logger: false },
  );
  await creaAdmin(app.ctx.db, { email: 'admin@test.it', nome: 'Admin', password: 'password-admin-1' });
  adminCookie = await login('admin@test.it', 'password-admin-1');
  const r = await app.inject({
    method: 'POST', url: '/api/admin/utenti', headers: { cookie: adminCookie },
    payload: { email: 'luca@test.it', nome: 'Luca', password: 'password-luca-01' },
  });
  assert.equal(r.statusCode, 201, r.body);
  userCookie = await login('luca@test.it', 'password-luca-01');
});

after(async () => {
  await app.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const carica = (body: Buffer, cookie = adminCookie) =>
  app.inject({ method: 'PUT', url: '/api/admin/catalogo', headers: { cookie, 'content-type': 'application/zip' }, payload: body });

test('senza catalogo tutti i file sono "altri"', async () => {
  const r = (await app.inject({ method: 'GET', url: '/api/archivio', headers: { cookie: userCookie } })).json();
  assert.equal(r.catalogo, false);
  assert.equal(r.titoli.length, 0);
  assert.equal(r.altri.length, 6);
});

test('solo un amministratore carica il catalogo, e solo uno zip valido', async () => {
  assert.equal((await carica(zipCatalogo(TITOLI), userCookie)).statusCode, 403);
  const nonZip = await carica(Buffer.from('ciao'));
  assert.equal(nonZip.statusCode, 400);
  assert.match(nonZip.json().errore, /zip/);
  const senzaJson = await carica(Buffer.from(zipSync({ 'altro.txt': strToU8('x') })));
  assert.equal(senzaJson.statusCode, 400);
  assert.match(senzaJson.json().errore, /catalogo\.json/);
});

test("l'admin carica lo zip: film, serie e copertine", async () => {
  const r = await carica(zipCatalogo(TITOLI));
  assert.equal(r.statusCode, 200, r.body);
  const info = r.json();
  assert.equal(info.film, 4);
  assert.equal(info.serie, 1);
  assert.equal(info.episodi, 3);
  assert.equal(info.copertine, 3);
  assert.equal(info.origine, 'Jellyfin 12.1.0');
  assert.equal(fs.readdirSync(covers).length, 3);
});

test("l'archivio raggruppa i file del NAS per titolo e lascia a parte quelli sconosciuti", async () => {
  const r = (await app.inject({ method: 'GET', url: '/api/archivio', headers: { cookie: userCookie } })).json();
  assert.equal(r.catalogo, true);
  const nomi = r.titoli.map((t: { titolo: string }) => t.titolo);
  assert.deepEqual(nomi, ['Amadeus', 'Breaking Bad', 'Primo omonimo', 'Secondo omonimo']); // "Non sul NAS" non compare
  const amadeus = r.titoli.find((t: { titolo: string }) => t.titolo === 'Amadeus');
  assert.equal(amadeus.tipo, 'film');
  assert.equal(amadeus.dimensione, 1000);
  assert.match(amadeus.copertina, /^\/api\/copertine\/m1-[0-9a-f]{10}\.jpg$/);
  const bb = r.titoli.find((t: { titolo: string }) => t.titolo === 'Breaking Bad');
  assert.deepEqual([bb.tipo, bb.stagioni, bb.file, bb.dimensione, bb.generi], ['serie', 1, 2, 500, ['Drama', 'Crime']]);
  assert.deepEqual(r.altri.map((f: { percorso: string }) => f.percorso), ['Video di casa/compleanno.mp4']);
});

test('due file con lo stesso nome vanno ognuno al suo titolo, per cartella', async () => {
  const r = (await app.inject({ method: 'GET', url: '/api/archivio', headers: { cookie: userCookie } })).json();
  for (const [titolo, cartella] of [['Primo omonimo', 'A'], ['Secondo omonimo', 'B']]) {
    const t = r.titoli.find((x: { titolo: string }) => x.titolo === titolo);
    const d = (await app.inject({ method: 'GET', url: `/api/archivio/${t.id}`, headers: { cookie: userCookie } })).json();
    assert.deepEqual(d.elencoFile.map((f: { percorso: string }) => f.percorso), [`Films/${cartella}/Film.mkv`]);
  }
});

test('la scheda di una serie ha stagioni, episodi in ordine e copertina della stagione', async () => {
  const lista = (await app.inject({ method: 'GET', url: '/api/archivio', headers: { cookie: userCookie } })).json();
  const id = lista.titoli.find((t: { titolo: string }) => t.titolo === 'Breaking Bad').id;
  const d = (await app.inject({ method: 'GET', url: `/api/archivio/${id}`, headers: { cookie: userCookie } })).json();
  assert.equal(d.trama, 'Chimica.');
  assert.equal(d.elencoStagioni.length, 1); // la stagione 2 non ha file sul NAS
  assert.match(d.elencoStagioni[0].copertina, /se1-/);
  assert.deepEqual(d.elencoFile.map((f: { episodio: number; titoloEpisodio: string }) => `${f.episodio} ${f.titoloEpisodio}`),
    ['1 Questione di chimica', '2 Senza ritorno']);
  assert.equal(d.elencoFile[0].download, null);
  // Il download di un episodio passa dal flusso di sempre (quota, link firmato).
  const dl = await app.inject({ method: 'POST', url: `/api/file/${d.elencoFile[0].id}/download`, headers: { cookie: userCookie } });
  assert.equal(dl.statusCode, 200, dl.body);
  assert.equal(dl.json().stato, 'approved');
  const dopo = (await app.inject({ method: 'GET', url: `/api/archivio/${id}`, headers: { cookie: userCookie } })).json();
  assert.equal(dopo.elencoFile[0].download.stato, 'approved');
});

test('le copertine si vedono solo dopo l\'accesso', async () => {
  const r = (await app.inject({ method: 'GET', url: '/api/archivio', headers: { cookie: userCookie } })).json();
  const url = r.titoli.find((t: { titolo: string }) => t.titolo === 'Amadeus').copertina;
  assert.equal((await app.inject({ method: 'GET', url })).statusCode, 401);
  const img = await app.inject({ method: 'GET', url, headers: { cookie: userCookie } });
  assert.equal(img.statusCode, 200);
  assert.match(String(img.headers['cache-control']), /immutable/);
  assert.deepEqual(img.rawPayload, JPG);
  assert.equal((await app.inject({ method: 'GET', url: '/api/copertine/..%2F..%2Fsegreto.jpg', headers: { cookie: userCookie } })).statusCode, 404);
});

test("la pagina Catalogo dice quanti file sono abbinati", async () => {
  const r = await app.inject({ method: 'GET', url: '/api/admin/catalogo', headers: { cookie: adminCookie } });
  assert.equal(r.statusCode, 200, r.body);
  const c = r.json();
  assert.deepEqual([c.fileSulNas, c.fileAbbinati, c.titoliConFile, c.titoliSenzaFile], [6, 5, 4, 1]);
  assert.deepEqual(c.esempiNonAbbinati, ['Video di casa/compleanno.mp4']);
  assert.equal((await app.inject({ method: 'GET', url: '/api/admin/catalogo', headers: { cookie: userCookie } })).statusCode, 403);
});

test('un nuovo zip sostituisce il catalogo e le copertine vecchie', async () => {
  const r = await carica(zipCatalogo([TITOLI[0]], { 'm1.jpg': JPG2 }));
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().film, 1);
  const files = fs.readdirSync(covers);
  assert.equal(files.length, 1);
  const lista = (await app.inject({ method: 'GET', url: '/api/archivio', headers: { cookie: userCookie } })).json();
  assert.deepEqual(lista.titoli.map((t: { titolo: string }) => t.titolo), ['Amadeus']);
  assert.equal(lista.titoli[0].copertina, `/api/copertine/${files[0]}`); // copertina cambiata: nome nuovo
  assert.equal(lista.altri.length, 5);
});
