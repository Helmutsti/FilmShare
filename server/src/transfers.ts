import { createHmac, timingSafeEqual } from 'node:crypto';
import type { DB } from './db/index.js';
import { getSettings } from './db/settings.js';
import type { EventBus } from './events.js';
import type { Push } from './push.js';
import { decide, getLimits, getUsage, periodStart } from './quota.js';

export type Kind = 'upload' | 'download';
export type Status = 'pending' | 'approved' | 'in_progress' | 'completed' | 'rejected' | 'cancelled' | 'expired';

export interface Transfer {
  id: number;
  user_id: number;
  kind: Kind;
  file_id: number | null;
  name: string;
  size_bytes: number;
  status: Status;
  reserved_bytes: number;
  period_start: string | null;
  tus_id: string | null;
  decided_by: number | null;
  decided_at: string | null;
  decision_note: string | null;
  link_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export class HttpError extends Error {
  constructor(public statusCode: number, message: string) { super(message); }
}

const now = () => new Date().toISOString();
const GB = 1024 ** 3;

export interface TransferCtx { db: DB; bus: EventBus; push: Push; linkSecret: string; maxFileBytes: number }

export function getTransfer(db: DB, id: number): Transfer | undefined {
  return db.prepare('SELECT * FROM transfers WHERE id = ?').get(id) as Transfer | undefined;
}

/** Prenota l'intera dimensione sul periodo corrente della persona. */
function reserve(db: DB, t: Transfer) {
  const start = periodStart(getLimits(db, t.user_id).period).toISOString();
  db.prepare('UPDATE transfers SET reserved_bytes = size_bytes, period_start = ?, updated_at = ? WHERE id = ?').run(start, now(), t.id);
}

function release(db: DB, id: number) {
  db.prepare('UPDATE transfers SET reserved_bytes = 0, updated_at = ? WHERE id = ?').run(now(), id);
}

function notifyChange(ctx: TransferCtx, userId: number) {
  ctx.bus.toUser(userId, 'trasferimenti');
  ctx.bus.toUser(userId, 'banda');
  ctx.bus.toAdmins('richieste');
  ctx.bus.toAdmins('utenti');
}

function activeCount(db: DB, userId: number, kind: Kind): number {
  return db
    .prepare(`SELECT COUNT(*) FROM transfers WHERE user_id = ? AND kind = ? AND status IN ('approved', 'in_progress')`)
    .pluck()
    .get(userId, kind) as number;
}

/** Nuova richiesta di upload o download: parte subito o va in approvazione. */
export function requestTransfer(
  ctx: TransferCtx,
  userId: number,
  r: { kind: Kind; name: string; size: number; fileId?: number },
): Transfer {
  const { db } = ctx;
  if (!Number.isSafeInteger(r.size) || r.size < 0) throw new HttpError(400, 'Dimensione non valida');
  if (r.kind === 'upload' && r.size > ctx.maxFileBytes) {
    throw new HttpError(413, `Il file supera il massimo di ${Math.round(ctx.maxFileBytes / GB)} GB`);
  }
  const limits = getLimits(db, userId);
  if (r.kind === 'upload' && activeCount(db, userId, 'upload') >= limits.max_concurrent) {
    throw new HttpError(429, `Puoi caricare al massimo ${limits.max_concurrent} file alla volta`);
  }
  const decision = decide(r.kind, r.size, limits, getUsage(db, userId), getSettings(db));

  const t = db.transaction(() => {
    const { lastInsertRowid } = db
      .prepare(`INSERT INTO transfers (user_id, kind, file_id, name, size_bytes, status, decision_note) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(userId, r.kind, r.fileId ?? null, r.name, r.size, decision.outcome, decision.outcome === 'pending' ? decision.reason : null);
    const created = getTransfer(db, Number(lastInsertRowid))!;
    if (decision.outcome === 'approved') {
      reserve(db, created);
      if (r.kind === 'download') setLink(ctx, created.id);
    }
    return getTransfer(db, created.id)!;
  })();

  notifyChange(ctx, userId);
  if (t.status === 'pending') {
    const u = db.prepare('SELECT name FROM users WHERE id = ?').pluck().get(userId) as string;
    void ctx.push.toAdmins({
      title: 'Nuova richiesta da approvare',
      body: `${u}: ${r.kind === 'upload' ? 'upload' : 'download'} di ${r.name}`,
      url: '/admin/approvazioni',
    });
  }
  return t;
}

function setLink(ctx: TransferCtx, id: number) {
  const hours = getSettings(ctx.db).download_link_hours;
  const exp = new Date(Date.now() + hours * 3_600_000).toISOString();
  ctx.db.prepare('UPDATE transfers SET link_expires_at = ? WHERE id = ?').run(exp, id);
}

export function approve(ctx: TransferCtx, id: number, adminId: number): Transfer {
  const { db } = ctx;
  const t = getTransfer(db, id);
  if (!t) throw new HttpError(404, 'Richiesta non trovata');
  if (t.status !== 'pending') throw new HttpError(409, 'La richiesta non è più in attesa');
  db.transaction(() => {
    db.prepare(`UPDATE transfers SET status = 'approved', decided_by = ?, decided_at = ?, updated_at = ? WHERE id = ?`).run(adminId, now(), now(), id);
    reserve(db, t); // l'admin può approvare oltre quota come eccezione: i limiti della persona non cambiano
    if (t.kind === 'download') setLink(ctx, id);
  })();
  notifyChange(ctx, t.user_id);
  void ctx.push.toUser(t.user_id, {
    title: 'Richiesta approvata',
    body: t.kind === 'upload' ? `Puoi caricare ${t.name}` : `${t.name} è pronto da scaricare`,
    url: t.kind === 'upload' ? '/carica' : '/condivisi',
  });
  return getTransfer(db, id)!;
}

export function reject(ctx: TransferCtx, id: number, adminId: number, note?: string): Transfer {
  const { db } = ctx;
  const t = getTransfer(db, id);
  if (!t) throw new HttpError(404, 'Richiesta non trovata');
  if (t.status !== 'pending') throw new HttpError(409, 'La richiesta non è più in attesa');
  db.prepare(`UPDATE transfers SET status = 'rejected', reserved_bytes = 0, decided_by = ?, decided_at = ?, decision_note = ?, updated_at = ? WHERE id = ?`)
    .run(adminId, now(), note?.trim() || t.decision_note, now(), id);
  notifyChange(ctx, t.user_id);
  void ctx.push.toUser(t.user_id, { title: 'Richiesta rifiutata', body: t.name, url: '/trasferimenti' });
  return getTransfer(db, id)!;
}

/** Annulla (dalla persona): restituisce la prenotazione. Ritorna il tus_id da cancellare, se c'è. */
export function cancel(ctx: TransferCtx, id: number, userId: number): Transfer {
  const { db } = ctx;
  const t = getTransfer(db, id);
  if (!t || t.user_id !== userId) throw new HttpError(404, 'Trasferimento non trovato');
  if (!['pending', 'approved', 'in_progress'].includes(t.status)) throw new HttpError(409, 'Non si può più annullare');
  db.prepare(`UPDATE transfers SET status = 'cancelled', reserved_bytes = 0, updated_at = ? WHERE id = ?`).run(now(), id);
  notifyChange(ctx, userId);
  return t;
}

/** "Approva entro i limiti": approva le richieste in attesa che non superano la quota residua. */
export function approveWithinLimits(ctx: TransferCtx, adminId: number): number {
  const pending = ctx.db.prepare(`SELECT * FROM transfers WHERE status = 'pending' ORDER BY created_at`).all() as Transfer[];
  let n = 0;
  for (const t of pending) {
    if (getUsage(ctx.db, t.user_id).remaining >= t.size_bytes) {
      approve(ctx, t.id, adminId);
      n++;
    }
  }
  return n;
}

// --- Upload (tus) ---

export function startUpload(ctx: TransferCtx, transferId: number, userId: number, size: number | undefined, tusId: string) {
  const t = getTransfer(ctx.db, transferId);
  if (!t || t.user_id !== userId || t.kind !== 'upload') throw new HttpError(404, 'Richiesta di upload non trovata');
  if (t.status !== 'approved') throw new HttpError(403, t.status === 'pending' ? 'In attesa di approvazione' : 'Upload non consentito');
  if (size !== undefined && size !== t.size_bytes) throw new HttpError(400, 'La dimensione non corrisponde alla richiesta');
  ctx.db.prepare(`UPDATE transfers SET status = 'in_progress', tus_id = ?, updated_at = ? WHERE id = ?`).run(tusId, now(), transferId);
  ctx.bus.toUser(userId, 'trasferimenti');
}

export function uploadOwner(db: DB, tusId: string): { id: number; user_id: number; status: Status } | undefined {
  return db.prepare('SELECT id, user_id, status FROM transfers WHERE tus_id = ?').get(tusId) as any;
}

export function finishUpload(ctx: TransferCtx, tusId: string, file: { relPath: string; name: string; size: number }) {
  const { db } = ctx;
  const t = db.prepare('SELECT * FROM transfers WHERE tus_id = ?').get(tusId) as Transfer | undefined;
  if (!t) throw new HttpError(404, 'Upload sconosciuto');
  db.transaction(() => {
    const { lastInsertRowid } = db
      .prepare('INSERT INTO files (name, rel_path, size_bytes, uploaded_by) VALUES (?, ?, ?, ?)')
      .run(file.name, file.relPath, file.size, t.user_id);
    db.prepare(`UPDATE transfers SET status = 'completed', file_id = ?, updated_at = ? WHERE id = ?`).run(Number(lastInsertRowid), now(), t.id);
  })();
  notifyChange(ctx, t.user_id);
  ctx.bus.toAll('file');
}

// --- Download: link firmati ---

function sign(secret: string, id: number, exp: string) {
  return createHmac('sha256', secret).update(`${id}.${exp}`).digest('base64url');
}

export function downloadPath(ctx: TransferCtx, t: Transfer): string | null {
  if (t.kind !== 'download' || !t.link_expires_at || !['approved', 'completed'].includes(t.status)) return null;
  const exp = String(Date.parse(t.link_expires_at));
  return `/api/download/${t.id}/${exp}/${sign(ctx.linkSecret, t.id, exp)}/${encodeURIComponent(t.name)}`;
}

/** Controlla un link di download. Al primo uso il trasferimento passa a "completato" (resta valido fino alla scadenza). */
export function checkDownload(ctx: TransferCtx, id: number, exp: string, sig: string): { transfer: Transfer; relPath: string } {
  const expected = Buffer.from(sign(ctx.linkSecret, id, exp));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) throw new HttpError(403, 'Link non valido');
  if (Number(exp) < Date.now()) throw new HttpError(410, 'Link scaduto');
  const t = getTransfer(ctx.db, id);
  if (!t || !['approved', 'completed'].includes(t.status) || t.file_id === null) throw new HttpError(403, 'Download non consentito');
  const f = ctx.db.prepare('SELECT rel_path FROM files WHERE id = ?').get(t.file_id) as { rel_path: string } | undefined;
  if (!f) throw new HttpError(404, 'Il file non è più nella cartella condivisa');
  if (t.status === 'approved') {
    ctx.db.prepare(`UPDATE transfers SET status = 'completed', updated_at = ? WHERE id = ?`).run(now(), id);
    ctx.bus.toUser(t.user_id, 'trasferimenti');
  }
  return { transfer: t, relPath: f.rel_path };
}

/** Link scaduti: i download mai iniziati restituiscono la prenotazione. */
export function expireLinks(ctx: TransferCtx) {
  const rows = ctx.db
    .prepare(`SELECT id, user_id, status FROM transfers WHERE kind = 'download' AND status IN ('approved','completed') AND link_expires_at < ?`)
    .all(now()) as { id: number; user_id: number; status: Status }[];
  for (const r of rows) {
    if (r.status === 'approved') release(ctx.db, r.id);
    ctx.db.prepare(`UPDATE transfers SET status = 'expired', updated_at = ? WHERE id = ?`).run(now(), r.id);
    notifyChange(ctx, r.user_id);
  }
}
