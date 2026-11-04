/**
 * Upload ripristinabili con tus (https://tus.io). I pezzi arrivano su UPLOAD_TMP_PATH (disco del server);
 * a upload finito il file passa nella cartella condivisa sul NAS.
 * Ogni upload deve avere nei metadati "transferId": la richiesta già approvata da /api/upload/richieste.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { Server, EVENTS } from '@tus/server';
import { FileStore } from '@tus/file-store';
import { tokenFromCookieHeader, userFromToken } from '../auth/sessions.js';
import { freeName, moveFile, safeJoin } from '../files.js';
import { getSettings } from '../db/settings.js';
import { assertNotPaused, finishUpload, getTransfer, HttpError, startUpload, uploadOwner } from '../transfers.js';
import type { Ctx } from '../context.js';

const TUS_PATH = '/api/upload/tus';

export async function uploadRoutes(app: FastifyInstance, { ctx }: { ctx: Ctx }) {
  const { db, config } = ctx;
  await fs.mkdir(config.uploadTmpPath, { recursive: true });
  await fs.mkdir(config.sharedPath, { recursive: true });
  const datastore = new FileStore({ directory: config.uploadTmpPath });

  const fail = (e: unknown) => {
    const err = e instanceof HttpError ? e : new HttpError(500, 'Errore interno');
    return { status_code: err.statusCode, body: JSON.stringify({ errore: err.message }) };
  };
  const userOf = (req: { headers: Headers }) => {
    const u = userFromToken(db, tokenFromCookieHeader(req.headers.get('cookie')));
    if (!u) throw new HttpError(401, 'Accesso richiesto');
    return u;
  };

  const tus = new Server({
    path: TUS_PATH,
    datastore,
    relativeLocation: true,
    respectForwardedHeaders: true,
    maxSize: config.maxFileBytes,
    async onUploadCreate(req, upload) {
      try {
        assertNotPaused(db);
        const u = userOf(req);
        const transferId = Number(upload.metadata?.transferId);
        startUpload(ctx, transferId, u.id, upload.size, upload.id);
        return {};
      } catch (e) {
        throw fail(e);
      }
    },
    // Riprese e pezzi successivi: solo chi ha creato l'upload può continuarlo.
    async onIncomingRequest(req, uploadId) {
      if (req.method === 'POST' || req.method === 'OPTIONS') return;
      try {
        const u = userOf(req);
        const owner = uploadOwner(db, uploadId);
        if (!owner || owner.user_id !== u.id) throw new HttpError(404, 'Upload non trovato');
        if (owner.status !== 'in_progress' && req.method === 'PATCH') throw new HttpError(409, 'Upload non più attivo');
        // Sospensione: il pezzo successivo viene rifiutato; il punto raggiunto resta e si riprende da lì.
        if (req.method === 'PATCH') assertNotPaused(db);
      } catch (e) {
        throw fail(e);
      }
    },
    async onUploadFinish(_req, upload) {
      try {
        const owner = uploadOwner(db, upload.id)!;
        const t = getTransfer(db, owner.id)!;
        // Destinazione scelta dall'admin nella pagina "Cartelle" (letta ora: se è cambiata durante l'upload vale la nuova).
        const folder = getSettings(db).upload_folder ?? '';
        const destDir = safeJoin(config.sharedPath, folder);
        await fs.mkdir(destDir, { recursive: true });
        const name = await freeName(destDir, t.name);
        await moveFile(path.join(config.uploadTmpPath, upload.id), path.join(destDir, name));
        await fs.rm(path.join(config.uploadTmpPath, `${upload.id}.json`), { force: true });
        const relPath = folder ? `${folder}/${name}` : name;
        finishUpload(ctx, upload.id, { relPath, name, size: upload.size ?? t.size_bytes });
        return {};
      } catch (e) {
        app.log.error(e, 'upload: spostamento sul NAS non riuscito');
        throw fail(e);
      }
    },
  });

  // Avanzamento per l'admin (la persona lo vede già dal browser).
  tus.on(EVENTS.POST_RECEIVE, (_req, upload) => {
    const owner = uploadOwner(db, upload.id);
    if (owner) ctx.bus.toAdmins('trasferimenti', { id: owner.id, offset: upload.offset, size: upload.size });
  });

  ctx.tusRemove = async (tusId) => {
    try {
      await datastore.remove(tusId);
    } catch {
      /* già rimosso */
    }
  };

  // tus legge il corpo da solo: Fastify non deve toccarlo.
  app.register(async (scope) => {
    scope.removeAllContentTypeParsers();
    scope.addContentTypeParser('*', (_req, _payload, done) => done(null));
    const handler = async (req: any, reply: any) => {
      reply.hijack();
      await tus.handle(req.raw, reply.raw);
    };
    scope.all(TUS_PATH, handler);
    scope.all(`${TUS_PATH}/*`, handler);
  });

  // Pulizia periodica dei pezzi abbandonati (FileStore non ha scadenza: la gestiamo noi via stato del trasferimento).
}
