import send from '@fastify/send';
import type { FastifyInstance } from 'fastify';
import { getUsage } from '../quota.js';
import { syncShared, safeJoin } from '../files.js';
import {
  cancel, checkDownload, hideHistory, downloadPath, getTransfer, HttpError, requestTransfer, type Transfer,
} from '../transfers.js';
import { idParam, requireUser, type Ctx } from '../context.js';

export function transferView(ctx: Ctx, t: Transfer) {
  return {
    id: t.id, tipo: t.kind, nome: t.name, dimensione: t.size_bytes, stato: t.status,
    motivo: t.decision_note, prenotato: t.reserved_bytes, fileId: t.file_id,
    linkScade: t.link_expires_at, link: downloadPath(ctx, t), creato: t.created_at, aggiornato: t.updated_at,
  };
}

/** I file delle cartelle esposte, ognuno con l'ultimo download valido di questa persona (se c'è). */
export async function sharedFiles(ctx: Ctx, userId: number) {
  const { db, config } = ctx;
  await syncShared(db, config.sharedPath);
  const files = db
    .prepare(
      `SELECT f.id, f.name, f.rel_path, f.size_bytes, f.created_at, u.name AS uploader
       FROM files f LEFT JOIN users u ON u.id = f.uploaded_by ORDER BY f.created_at DESC`,
    )
    .all() as { id: number; name: string; rel_path: string; size_bytes: number; created_at: string; uploader: string | null }[];
  const mine = db
    .prepare(
      `SELECT * FROM transfers WHERE user_id = ? AND kind = 'download' AND status IN ('pending','approved','completed')
       ORDER BY created_at DESC`,
    )
    .all(userId) as Transfer[];
  const byFile = new Map<number, Transfer>();
  for (const t of mine) if (t.file_id !== null && !byFile.has(t.file_id)) byFile.set(t.file_id, t);
  return files.map((f) => ({
    id: f.id, nome: f.name, percorso: f.rel_path, dimensione: f.size_bytes, aggiunto: f.created_at,
    caricatoDa: f.uploader, download: byFile.has(f.id) ? transferView(ctx, byFile.get(f.id)!) : null,
  }));
}
export type SharedFile = Awaited<ReturnType<typeof sharedFiles>>[number];

export async function transferRoutes(app: FastifyInstance, { ctx }: { ctx: Ctx }) {
  const { db, config } = ctx;

  app.get('/api/io/trasferimenti', async (req) => {
    const u = requireUser(req);
    const rows = db.prepare('SELECT * FROM transfers WHERE user_id = ? AND hidden_at IS NULL ORDER BY created_at DESC LIMIT 200').all(u.id) as Transfer[];
    return rows.map((t) => transferView(ctx, t));
  });

  app.delete('/api/io/trasferimenti', async (req) => {
    const u = requireUser(req);
    return { nascosti: hideHistory(ctx, u.id) };
  });

  app.delete('/api/trasferimenti/:id', async (req) => {
    const u = requireUser(req);
    const t = cancel(ctx, idParam(req), u.id);
    if (t.tus_id) await ctx.tusRemove?.(t.tus_id);
    return { ok: true };
  });

  /** Prima di un upload: la dashboard chiede il permesso con nome e dimensione. */
  app.post<{ Body: { nome: string; dimensione: number } }>('/api/upload/richieste', {
    schema: {
      body: {
        type: 'object', required: ['nome', 'dimensione'], additionalProperties: false,
        properties: { nome: { type: 'string', minLength: 1, maxLength: 255 }, dimensione: { type: 'integer', minimum: 0 } },
      },
    },
  }, async (req) => {
    const u = requireUser(req);
    return transferView(ctx, requestTransfer(ctx, u.id, { kind: 'upload', name: req.body.nome, size: req.body.dimensione }));
  });

  /** Cartella condivisa, con lo stato del download per chi guarda. */
  app.get('/api/file', async (req) => {
    const u = requireUser(req);
    return { file: await sharedFiles(ctx, u.id), banda: getUsage(db, u.id) };
  });

  /** "Scarica" o "Richiedi download": se c'è già un link valido lo riusa, senza prenotare di nuovo. */
  app.post('/api/file/:id/download', async (req) => {
    const u = requireUser(req);
    const fileId = idParam(req);
    await syncShared(db, config.sharedPath); // toglie i file di cartelle non più esposte
    const f = db.prepare('SELECT id, name, size_bytes FROM files WHERE id = ?').get(fileId) as
      | { id: number; name: string; size_bytes: number } | undefined;
    if (!f) throw new HttpError(404, 'File non trovato');
    const existing = db
      .prepare(
        `SELECT * FROM transfers WHERE user_id = ? AND kind = 'download' AND file_id = ?
         AND status IN ('pending','approved','completed') ORDER BY created_at DESC LIMIT 1`,
      )
      .get(u.id, fileId) as Transfer | undefined;
    if (existing) return transferView(ctx, existing);
    return transferView(ctx, requestTransfer(ctx, u.id, { kind: 'download', name: f.name, size: f.size_bytes, fileId }));
  });

  /**
   * Il link firmato. Non serve la sessione: lo usano anche i programmi per i download.
   * Ripresa dei download interrotti con Range (la gestisce @fastify/send).
   */
  app.get<{ Params: { id: string; exp: string; sig: string; name: string } }>(
    '/api/download/:id/:exp/:sig/:name',
    async (req, reply) => {
      const { transfer, relPath } = checkDownload(ctx, Number(req.params.id), req.params.exp, req.params.sig);
      const disposition = `attachment; filename*=UTF-8''${encodeURIComponent(transfer.name)}`;
      safeJoin(config.sharedPath, relPath);
      const r = await send(req.raw, '/' + relPath.split('/').map(encodeURIComponent).join('/'), { root: config.sharedPath });
      if (r.type === 'directory') throw new HttpError(404, 'File non trovato');
      reply.code(r.statusCode).headers(r.headers);
      if (r.type === 'error') return reply.send(r.stream); // es. 416: intervallo richiesto fuori dal file
      reply.header('Content-Disposition', disposition).header('Content-Type', 'application/octet-stream');
      return reply.send(r.stream);
    },
  );

  app.get('/api/trasferimenti/:id', async (req) => {
    const u = requireUser(req);
    const t = getTransfer(db, idParam(req));
    if (!t || (t.user_id !== u.id && u.role !== 'admin')) throw new HttpError(404, 'Trasferimento non trovato');
    return transferView(ctx, t);
  });
}
