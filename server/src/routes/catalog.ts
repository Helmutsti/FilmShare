import fs from 'node:fs';
import path from 'node:path';
import send from '@fastify/send';
import type { FastifyInstance } from 'fastify';
import { catalogInfo, importCatalog, matchFiles, type Abbinamento } from '../catalog.js';
import { getUsage } from '../quota.js';
import { HttpError } from '../transfers.js';
import { idParam, requireAdmin, requireUser, type Ctx } from '../context.js';
import { sharedFiles, type SharedFile } from './transfers.js';

const LIMITE_ZIP = 1024 * 1024 * 1024; // 1 GB

interface TitleRow {
  id: number; kind: 'movie' | 'series'; title: string; original_title: string | null; year: number | null;
  genres: string; overview: string | null; cover: string | null;
}

const coverUrl = (c: string | null) => (c ? `/api/copertine/${encodeURIComponent(c)}` : null);

/** I file del NAS divisi per titolo del catalogo; quelli che il catalogo non conosce restano "altri". */
async function archivio(ctx: Ctx, userId: number) {
  const files = await sharedFiles(ctx, userId);
  const abbinati = matchFiles(ctx.db, files);
  const perTitolo = new Map<number, { file: SharedFile; a: Abbinamento }[]>();
  const altri: SharedFile[] = [];
  for (const f of files) {
    const a = abbinati.get(f.id);
    if (!a) { altri.push(f); continue; }
    if (!perTitolo.has(a.titleId)) perTitolo.set(a.titleId, []);
    perTitolo.get(a.titleId)!.push({ file: f, a });
  }
  return { files, perTitolo, altri };
}

function titoloView(t: TitleRow, voci: { file: SharedFile; a: Abbinamento }[]) {
  return {
    id: t.id,
    tipo: t.kind === 'movie' ? ('film' as const) : ('serie' as const),
    titolo: t.title,
    anno: t.year,
    generi: JSON.parse(t.genres) as string[],
    copertina: coverUrl(t.cover),
    stagioni: new Set(voci.map((v) => v.a.season).filter((s) => s !== null)).size,
    file: voci.length,
    dimensione: voci.reduce((s, v) => s + v.file.dimensione, 0),
    aggiunto: voci.reduce((m, v) => (v.file.aggiunto > m ? v.file.aggiunto : m), ''),
  };
}

export async function catalogRoutes(app: FastifyInstance, { ctx }: { ctx: Ctx }) {
  const { db, config } = ctx;

  /** Archivio a copertine: i titoli che hanno almeno un file sul NAS, più i file che il catalogo non conosce. */
  app.get('/api/archivio', async (req) => {
    const u = requireUser(req);
    const { perTitolo, altri } = await archivio(ctx, u.id);
    const righe = db.prepare('SELECT * FROM catalog_titles').all() as TitleRow[];
    const titoli = righe
      .filter((t) => perTitolo.has(t.id))
      .map((t) => titoloView(t, perTitolo.get(t.id)!))
      .sort((a, b) => a.titolo.localeCompare(b.titolo, 'it', { sensitivity: 'base' }));
    altri.sort((a, b) => a.nome.localeCompare(b.nome, 'it', { sensitivity: 'base' }));
    return { titoli, altri, banda: getUsage(db, u.id), catalogo: catalogInfo(db) !== null };
  });

  /** Scheda di un titolo: trama, stagioni con le copertine e i file (episodi) con lo stato del download. */
  app.get('/api/archivio/:id', async (req) => {
    const u = requireUser(req);
    const id = idParam(req);
    const t = db.prepare('SELECT * FROM catalog_titles WHERE id = ?').get(id) as TitleRow | undefined;
    const voci = t ? (await archivio(ctx, u.id)).perTitolo.get(id) : undefined;
    if (!t || !voci) throw new HttpError(404, 'Titolo non trovato');
    const copertineStagioni = new Map(
      (db.prepare('SELECT number, cover FROM catalog_seasons WHERE title_id = ?').all(id) as { number: number; cover: string | null }[])
        .map((s) => [s.number, s.cover]),
    );
    const numeri = [...new Set(voci.map((v) => v.a.season).filter((s): s is number => s !== null))].sort((a, b) => a - b);
    const ordine = (n: number | null) => (n === null ? Number.MAX_SAFE_INTEGER : n);
    return {
      ...titoloView(t, voci),
      titoloOriginale: t.original_title,
      trama: t.overview,
      elencoStagioni: numeri.map((n) => ({ numero: n, copertina: coverUrl(copertineStagioni.get(n) ?? null) })),
      elencoFile: voci
        .sort((a, b) => ordine(a.a.season) - ordine(b.a.season) || ordine(a.a.episode) - ordine(b.a.episode)
          || a.file.nome.localeCompare(b.file.nome, 'it'))
        .map((v) => ({ ...v.file, stagione: v.a.season, episodio: v.a.episode, titoloEpisodio: v.a.episodeTitle })),
    };
  });

  /** Copertine: il nome contiene un'impronta del contenuto, quindi non cambiano mai e il browser le tiene a lungo. */
  app.get<{ Params: { nome: string } }>('/api/copertine/:nome', async (req, reply) => {
    requireUser(req);
    const nome = req.params.nome;
    if (!/^[A-Za-z0-9_-]{1,140}\.(jpe?g|png|webp)$/i.test(nome)) throw new HttpError(404, 'Copertina non trovata');
    const r = await send(req.raw, '/' + nome, { root: config.coversPath, cacheControl: false });
    if (r.type !== 'file') throw new HttpError(404, 'Copertina non trovata');
    reply.code(r.statusCode).headers(r.headers).header('Cache-Control', 'private, max-age=31536000, immutable');
    return reply.send(r.stream);
  });

  // --- Amministrazione: pagina "Catalogo" ---

  /** Il catalogo attuale e quanti file del NAS riesce ad abbinare. */
  app.get('/api/admin/catalogo', async (req) => {
    const u = requireAdmin(req);
    const info = catalogInfo(db);
    const { files, perTitolo, altri } = await archivio(ctx, u.id);
    const titoli = db.prepare('SELECT COUNT(*) FROM catalog_titles').pluck().get() as number;
    return {
      info,
      fileSulNas: files.length,
      fileAbbinati: files.length - altri.length,
      titoliConFile: perTitolo.size,
      titoliSenzaFile: titoli - perTitolo.size,
      esempiNonAbbinati: altri.slice(0, 20).map((f) => f.percorso),
    };
  });

  /** Carica lo zip esportato da Jellyfin: sostituisce il catalogo attuale. */
  app.register(async (zipApp) => {
    zipApp.addContentTypeParser(['application/zip', 'application/x-zip-compressed', 'application/octet-stream'],
      { parseAs: 'buffer', bodyLimit: LIMITE_ZIP }, (_req, body, done) => done(null, body));
    zipApp.put('/api/admin/catalogo', { bodyLimit: LIMITE_ZIP }, async (req) => {
      requireAdmin(req);
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw new HttpError(400, 'Manca lo zip del catalogo');
      fs.mkdirSync(path.dirname(config.coversPath), { recursive: true });
      const info = importCatalog(db, config.coversPath, req.body);
      ctx.bus.toAll('file');
      return info;
    });
  });
}
