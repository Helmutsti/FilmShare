import type { FastifyInstance } from 'fastify';
import { hashPassword, MIN_PASSWORD_LENGTH } from '../auth/password.js';
import { deleteUserSessions } from '../auth/sessions.js';
import { getSettings, updateSettings, SETTING_KEYS, type Settings } from '../db/settings.js';
import { createActiveUser, findUserByEmail, type Role } from '../db/users.js';
import { getUsage } from '../quota.js';
import {
  approve, approveWithinLimits, HttpError, reject, type Transfer,
} from '../transfers.js';
import { transferView } from './transfers.js';
import { idParam, requireAdmin, type Ctx } from '../context.js';

const limitsSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    quota: { type: 'integer', minimum: 0 },
    periodo: { enum: ['day', 'week', 'month'] },
    velocitaKbps: { type: 'integer', minimum: 1 },
    simultanei: { type: 'integer', minimum: 1, maximum: 20 },
    approvazione: { enum: ['never', 'over_threshold', 'always'] },
  },
} as const;

type LimitsBody = { quota?: number; periodo?: string; velocitaKbps?: number; simultanei?: number; approvazione?: string };

export async function adminRoutes(app: FastifyInstance, { ctx }: { ctx: Ctx }) {
  const { db } = ctx;

  // --- Utenti ---

  function userView(id: number) {
    const r = db
      .prepare(
        `SELECT u.id, u.email, u.name, u.role, u.status, u.created_at, u.last_seen_at,
                l.quota_bytes, l.period, l.max_speed_kbps, l.max_concurrent, l.approval
         FROM users u JOIN user_limits l ON l.user_id = u.id WHERE u.id = ?`,
      )
      .get(id) as any;
    if (!r) return null;
    const banda = getUsage(db, id);
    return {
      id: r.id, email: r.email, nome: r.name, ruolo: r.role,
      stato: r.status === 'active' && banda.remaining === 0 && banda.quota > 0 ? 'blocked' : r.status,
      creato: r.created_at, ultimoAccesso: r.last_seen_at,
      limiti: { quota: r.quota_bytes, periodo: r.period, velocitaKbps: r.max_speed_kbps, simultanei: r.max_concurrent, approvazione: r.approval },
      banda,
    };
  }

  app.get('/api/admin/utenti', async (req) => {
    requireAdmin(req);
    const ids = db.prepare('SELECT id FROM users ORDER BY name COLLATE NOCASE').pluck().all() as number[];
    return ids.map(userView);
  });

  app.get('/api/admin/utenti/:id', async (req) => {
    requireAdmin(req);
    const id = idParam(req);
    const u = userView(id);
    if (!u) throw new HttpError(404, 'Utente non trovato');
    const recent = db.prepare('SELECT * FROM transfers WHERE user_id = ? ORDER BY created_at DESC LIMIT 5').all(id) as Transfer[];
    return { ...u, ultimiTrasferimenti: recent.map((t) => transferView(ctx, t)) };
  });

  app.post<{ Body: { email: string; nome: string; password: string; ruolo?: Role; limiti?: LimitsBody } }>('/api/admin/utenti', {
    schema: {
      body: {
        type: 'object', required: ['email', 'nome', 'password'], additionalProperties: false,
        properties: {
          email: { type: 'string', format: 'email', maxLength: 254 },
          nome: { type: 'string', minLength: 1, maxLength: 100 },
          password: { type: 'string', minLength: MIN_PASSWORD_LENGTH, maxLength: 200 },
          ruolo: { enum: ['user', 'admin'] },
          limiti: limitsSchema,
        },
      },
    },
  }, async (req, reply) => {
    requireAdmin(req);
    const b = req.body;
    if (findUserByEmail(db, b.email)) throw new HttpError(409, 'Esiste già una persona con questa email');
    const id = createActiveUser(db, {
      email: b.email.toLowerCase(), name: b.nome, passwordHash: await hashPassword(b.password), role: b.ruolo ?? 'user',
    });
    if (b.limiti) applyLimits(id, b.limiti);
    ctx.bus.toAdmins('utenti');
    reply.code(201);
    return userView(id);
  });

  function applyLimits(id: number, l: LimitsBody) {
    const map: Record<keyof LimitsBody, string> = {
      quota: 'quota_bytes', periodo: 'period', velocitaKbps: 'max_speed_kbps', simultanei: 'max_concurrent', approvazione: 'approval',
    };
    for (const [k, col] of Object.entries(map)) {
      const v = l[k as keyof LimitsBody];
      if (v !== undefined) db.prepare(`UPDATE user_limits SET ${col} = ? WHERE user_id = ?`).run(v, id);
    }
  }

  app.patch<{ Body: { nome?: string; ruolo?: Role; stato?: 'active' | 'suspended'; password?: string; limiti?: LimitsBody } }>(
    '/api/admin/utenti/:id',
    {
      schema: {
        body: {
          type: 'object', additionalProperties: false,
          properties: {
            nome: { type: 'string', minLength: 1, maxLength: 100 },
            ruolo: { enum: ['user', 'admin'] },
            stato: { enum: ['active', 'suspended'] },
            password: { type: 'string', minLength: MIN_PASSWORD_LENGTH, maxLength: 200 },
            limiti: limitsSchema,
          },
        },
      },
    },
    async (req) => {
      const admin = requireAdmin(req);
      const id = idParam(req);
      if (!userView(id)) throw new HttpError(404, 'Utente non trovato');
      const b = req.body;
      if (id === admin.id && (b.ruolo === 'user' || b.stato === 'suspended')) {
        throw new HttpError(400, 'Non puoi togliere a te stesso il ruolo di amministratore o sospenderti');
      }
      const hash = b.password ? await hashPassword(b.password) : undefined;
      db.transaction(() => {
        if (b.nome) db.prepare('UPDATE users SET name = ? WHERE id = ?').run(b.nome.trim(), id);
        if (b.ruolo) db.prepare('UPDATE users SET role = ? WHERE id = ?').run(b.ruolo, id);
        if (b.stato) db.prepare('UPDATE users SET status = ? WHERE id = ?').run(b.stato, id);
        if (hash) db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, id);
        if (b.limiti) applyLimits(id, b.limiti);
      })();
      if (b.stato === 'suspended' || hash) deleteUserSessions(db, id);
      ctx.bus.toAdmins('utenti');
      ctx.bus.toUser(id, 'banda');
      return userView(id);
    },
  );

  // --- Approvazioni ---

  function requestView(t: Transfer & { user_name: string; user_email: string }) {
    const banda = getUsage(db, t.user_id);
    const after = t.status === 'pending' ? banda.used + t.size_bytes : banda.used;
    return {
      ...transferView(ctx, t),
      utente: { id: t.user_id, nome: t.user_name, email: t.user_email },
      impatto: { periodo: banda.period, percentuale: banda.quota > 0 ? Math.round((after / banda.quota) * 100) : null },
    };
  }

  app.get<{ Querystring: { vista?: 'attesa' | 'storico'; tipo?: 'upload' | 'download' } }>('/api/admin/richieste', async (req) => {
    requireAdmin(req);
    const storico = req.query.vista === 'storico';
    const tipo = req.query.tipo === 'upload' || req.query.tipo === 'download' ? req.query.tipo : null;
    const rows = db
      .prepare(
        `SELECT t.*, u.name AS user_name, u.email AS user_email FROM transfers t JOIN users u ON u.id = t.user_id
         WHERE ${storico ? `t.decided_at IS NOT NULL` : `t.status = 'pending'`} AND (? IS NULL OR t.kind = ?)
         ORDER BY ${storico ? 't.decided_at DESC' : 't.created_at'} LIMIT 200`,
      )
      .all(tipo, tipo) as (Transfer & { user_name: string; user_email: string })[];
    return rows.map(requestView);
  });

  app.get('/api/admin/riepilogo', async (req) => {
    requireAdmin(req);
    const p = db
      .prepare(
        `SELECT COUNT(*) AS n, COALESCE(SUM(size_bytes),0) AS volume,
                SUM(kind='upload') AS upload, SUM(kind='download') AS download, MIN(created_at) AS oldest
         FROM transfers WHERE status = 'pending'`,
      )
      .get() as { n: number; volume: number; upload: number | null; download: number | null; oldest: string | null };
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const traffic = db
      .prepare(`SELECT COALESCE(SUM(reserved_bytes),0) FROM transfers WHERE updated_at >= ? AND status IN ('in_progress','completed')`)
      .pluck()
      .get(today.toISOString()) as number;
    return {
      inAttesa: p.n, upload: p.upload ?? 0, download: p.download ?? 0, piuVecchia: p.oldest,
      volume: p.volume, trafficoOggi: traffic,
    };
  });

  app.post('/api/admin/richieste/:id/approva', async (req) => {
    const a = requireAdmin(req);
    return transferView(ctx, approve(ctx, idParam(req), a.id));
  });

  app.post<{ Body: { nota?: string } | null }>('/api/admin/richieste/:id/rifiuta', async (req) => {
    const a = requireAdmin(req);
    return transferView(ctx, reject(ctx, idParam(req), a.id, req.body?.nota));
  });

  app.post('/api/admin/richieste/approva-entro-limiti', async (req) => {
    const a = requireAdmin(req);
    return { approvate: approveWithinLimits(ctx, a.id) };
  });

  // --- Regole di banda ---

  app.get('/api/admin/regole', async (req) => {
    requireAdmin(req);
    return getSettings(db);
  });

  app.put<{ Body: Partial<Settings> }>('/api/admin/regole', {
    schema: {
      body: {
        type: 'object', additionalProperties: false,
        properties: {
          default_quota_bytes: { type: 'integer', minimum: 0 },
          default_period: { enum: ['day', 'week', 'month'] },
          default_max_speed_kbps: { type: 'integer', minimum: 1 },
          default_max_concurrent: { type: 'integer', minimum: 1 },
          server_max_speed_kbps: { type: 'integer', minimum: 1 },
          server_max_concurrent: { type: 'integer', minimum: 1 },
          night_window: {
            anyOf: [
              { type: 'null' },
              {
                type: 'object', required: ['start', 'end'], additionalProperties: false,
                properties: { start: { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' }, end: { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' } },
              },
            ],
          },
          download_link_hours: { type: 'integer', minimum: 1, maximum: 720 },
          upload_approval_threshold: { type: 'integer', minimum: 0 },
          download_approval_threshold: { type: 'integer', minimum: 0 },
          block_on_quota_exhausted: { type: 'boolean' },
          slowdown_over_80: { type: 'boolean' },
          require_approval_over_threshold: { type: 'boolean' },
          suspend_after_3_overruns: { type: 'boolean' },
        },
      },
    },
  }, async (req) => {
    requireAdmin(req);
    updateSettings(db, req.body);
    ctx.bus.toAll('regole');
    return getSettings(db);
  });

  void SETTING_KEYS;
}
