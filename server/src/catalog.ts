/**
 * Catalogo esportato da Jellyfin (strumenti/esporta-catalogo-jellyfin.*): titoli, stagioni, episodi e copertine.
 * L'admin carica lo zip dalla pagina "Catalogo"; il nuovo catalogo sostituisce sempre il precedente.
 *
 * Jellyfin vede i file con percorsi suoi (es. \\nas\Multimedia\Films\Amadeus.mkv), FilmShare con percorsi relativi
 * alla cartella principale del NAS (es. Films/Amadeus.mkv). L'abbinamento usa il nome del file e, se più file
 * hanno lo stesso nome, quante cartelle finali coincidono. Si calcola a ogni lettura: vale anche per i file nuovi.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { unzipSync } from 'fflate';
import type { DB } from './db/index.js';
import { HttpError } from './transfers.js';

const MB = 1024 * 1024;
const LIMITE_JSON = 100 * MB;
const LIMITE_COPERTINA = 15 * MB;
const LIMITE_TOTALE = 2048 * MB;
/** Nome di una copertina nello zip e su disco: niente cartelle, solo lettere, cifre, "-" e "_". */
const NOME_COPERTINA = /^[A-Za-z0-9_-]{1,120}\.(jpe?g|png|webp)$/i;

export interface CatalogInfo {
  caricato: string;
  generato: string | null;
  origine: string | null;
  film: number;
  serie: number;
  episodi: number;
  copertine: number;
}

interface VoceZip {
  id?: unknown; tipo?: unknown; titolo?: unknown; titoloOriginale?: unknown; anno?: unknown; generi?: unknown;
  trama?: unknown; percorso?: unknown; copertina?: unknown;
  stagioni?: { numero?: unknown; titolo?: unknown; copertina?: unknown }[];
  episodi?: { stagione?: unknown; episodio?: unknown; titolo?: unknown; percorso?: unknown }[];
}

const testo = (v: unknown, max = 10_000) => (typeof v === 'string' && v.trim() !== '' ? v.slice(0, max) : null);
const intero = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 100_000 ? v : null);

/** Segmenti di un percorso, confrontabili tra Windows, NAS e Mac (maiuscole e accenti scritti in modi diversi). */
export function segmenti(p: string): string[] {
  return p.split(/[\\/]+/).filter(Boolean).map((s) => s.normalize('NFC').toLowerCase());
}

export function catalogInfo(db: DB): CatalogInfo | null {
  const raw = db.prepare(`SELECT value FROM settings WHERE key = 'catalog_info'`).pluck().get() as string | undefined;
  return raw ? (JSON.parse(raw) as CatalogInfo | null) : null;
}

/** Legge lo zip, controlla il catalogo e sostituisce quello attuale (database e copertine). */
export function importCatalog(db: DB, coversPath: string, zip: Uint8Array): CatalogInfo {
  let totale = 0;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(zip, {
      filter: (f) => {
        const nome = f.name.replace(/\\/g, '/');
        const ok = nome === 'catalogo.json'
          ? f.originalSize <= LIMITE_JSON
          : nome.startsWith('copertine/') && NOME_COPERTINA.test(nome.slice('copertine/'.length)) && f.originalSize <= LIMITE_COPERTINA;
        if (ok) totale += f.originalSize;
        return ok && totale <= LIMITE_TOTALE;
      },
    });
  } catch {
    throw new HttpError(400, 'Il file non è uno zip valido');
  }
  const json = files['catalogo.json'];
  if (!json) throw new HttpError(400, 'Nello zip manca catalogo.json: va creato con lo script di esportazione da Jellyfin');
  let cat: { formato?: unknown; versione?: unknown; generato?: unknown; origine?: unknown; titoli?: unknown };
  try {
    cat = JSON.parse(Buffer.from(json).toString('utf8').replace(/^\uFEFF/, ''));
  } catch {
    throw new HttpError(400, 'catalogo.json non è leggibile');
  }
  if (cat.formato !== 'filmshare-catalogo' || cat.versione !== 1 || !Array.isArray(cat.titoli)) {
    throw new HttpError(400, 'catalogo.json non è un catalogo di FilmShare (versione 1)');
  }

  // Le copertine si scrivono in una cartella nuova e prendono il posto delle vecchie solo a importazione riuscita.
  // Il nome contiene un'impronta del contenuto: una copertina cambiata ha un nome nuovo e il browser non usa quella vecchia.
  const nuova = `${coversPath}.nuova-${process.pid}-${Date.now()}`;
  fs.mkdirSync(nuova, { recursive: true });
  const scritte = new Map<string, string>();
  const copertina = (v: unknown): string | null => {
    const rel = testo(v, 300);
    if (!rel) return null;
    const nome = rel.replace(/\\/g, '/').replace(/^copertine\//, '');
    const dati = NOME_COPERTINA.test(nome) ? files[`copertine/${nome}`] : undefined;
    if (!dati) return null;
    if (!scritte.has(nome)) {
      const ext = path.extname(nome).toLowerCase();
      const finale = `${path.basename(nome, path.extname(nome))}-${createHash('sha256').update(dati).digest('hex').slice(0, 10)}${ext}`;
      fs.writeFileSync(path.join(nuova, finale), dati);
      scritte.set(nome, finale);
    }
    return scritte.get(nome)!;
  };

  const conta = { film: 0, serie: 0, episodi: 0 };
  try {
    db.transaction(() => {
      db.exec('DELETE FROM catalog_entries; DELETE FROM catalog_seasons; DELETE FROM catalog_titles;');
      const insTitolo = db.prepare(
        `INSERT INTO catalog_titles (kind, source_id, title, original_title, year, genres, overview, cover)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (source_id) DO NOTHING`,
      );
      const insStagione = db.prepare('INSERT OR IGNORE INTO catalog_seasons (title_id, number, name, cover) VALUES (?, ?, ?, ?)');
      const insVoce = db.prepare(
        'INSERT INTO catalog_entries (title_id, path, file_name, season, episode, episode_title) VALUES (?, ?, ?, ?, ?, ?)',
      );
      const voce = (titleId: number | bigint, percorso: unknown, stagione: number | null, episodio: number | null, titolo: string | null) => {
        const p = testo(percorso, 2000);
        const nome = p ? segmenti(p).at(-1) : undefined;
        if (p && nome) insVoce.run(titleId, p, nome, stagione, episodio, titolo);
      };

      for (const t of cat.titoli as VoceZip[]) {
        const kind = t?.tipo === 'film' ? 'movie' : t?.tipo === 'serie' ? 'series' : null;
        const titolo = testo(t?.titolo, 500);
        const id = testo(t?.id, 200);
        if (!kind || !titolo || !id) continue;
        const generi = Array.isArray(t.generi) ? t.generi.filter((g): g is string => typeof g === 'string').slice(0, 10) : [];
        const r = insTitolo.run(kind, id, titolo, testo(t.titoloOriginale, 500), intero(t.anno), JSON.stringify(generi),
          testo(t.trama), copertina(t.copertina));
        if (r.changes === 0) continue; // stesso elemento ripetuto
        const titleId = r.lastInsertRowid;
        if (kind === 'movie') {
          conta.film++;
          voce(titleId, t.percorso, null, null, null);
          continue;
        }
        conta.serie++;
        for (const s of Array.isArray(t.stagioni) ? t.stagioni : []) {
          const n = intero(s?.numero);
          if (n !== null) insStagione.run(titleId, n, testo(s.titolo, 200), copertina(s.copertina));
        }
        for (const e of Array.isArray(t.episodi) ? t.episodi : []) {
          conta.episodi++;
          voce(titleId, e?.percorso, intero(e?.stagione), intero(e?.episodio), testo(e?.titolo, 500));
        }
      }
      const info: CatalogInfo = {
        caricato: new Date().toISOString(),
        generato: testo(cat.generato, 40),
        origine: testo(cat.origine, 100),
        ...conta,
        copertine: scritte.size,
      };
      db.prepare(`UPDATE settings SET value = ? WHERE key = 'catalog_info'`).run(JSON.stringify(info));
    })();
  } catch (e) {
    fs.rmSync(nuova, { recursive: true, force: true });
    throw e;
  }

  const vecchia = `${coversPath}.vecchia-${process.pid}-${Date.now()}`;
  if (fs.existsSync(coversPath)) fs.renameSync(coversPath, vecchia);
  fs.renameSync(nuova, coversPath);
  fs.rmSync(vecchia, { recursive: true, force: true });
  return catalogInfo(db)!;
}

export interface Abbinamento { titleId: number; season: number | null; episode: number | null; episodeTitle: string | null }

/** Per ogni file del NAS, la voce del catalogo che gli corrisponde (se c'è). */
export function matchFiles(db: DB, files: { id: number; percorso: string }[]): Map<number, Abbinamento> {
  const voci = db.prepare('SELECT title_id, path, file_name, season, episode, episode_title FROM catalog_entries').all() as {
    title_id: number; path: string; file_name: string; season: number | null; episode: number | null; episode_title: string | null;
  }[];
  const perNome = new Map<string, typeof voci>();
  for (const v of voci) {
    const nome = v.file_name.normalize('NFC');
    if (!perNome.has(nome)) perNome.set(nome, []);
    perNome.get(nome)!.push(v);
  }
  const out = new Map<number, Abbinamento>();
  for (const f of files) {
    const seg = segmenti(f.percorso);
    const candidati = perNome.get(seg.at(-1) ?? '');
    if (!candidati) continue;
    let migliore = candidati[0]!;
    if (candidati.length > 1) {
      // Più file con lo stesso nome: vince quello con più cartelle finali uguali.
      let punti = -1;
      for (const c of candidati) {
        const cs = segmenti(c.path);
        let n = 0;
        while (n < seg.length && n < cs.length && seg[seg.length - 1 - n] === cs[cs.length - 1 - n]) n++;
        if (n > punti) { punti = n; migliore = c; }
      }
    }
    out.set(f.id, { titleId: migliore.title_id, season: migliore.season, episode: migliore.episode, episodeTitle: migliore.episode_title });
  }
  return out;
}
