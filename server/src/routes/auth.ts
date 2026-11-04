import type { FastifyInstance } from 'fastify';
import { verifyPassword } from '../auth/password.js';
import { createSession, deleteSession, LoginLimiter, SESSION_COOKIE, SESSION_DAYS } from '../auth/sessions.js';
import { getLimits, getUsage } from '../quota.js';
import { getSettings } from '../db/settings.js';
import { HttpError } from '../transfers.js';
import { requireUser, type Ctx } from '../context.js';

export async function authRoutes(app: FastifyInstance, { ctx }: { ctx: Ctx }) {
  const { db } = ctx;
  const limiter = new LoginLimiter();
  // Impronta fittizia: se l'email non esiste si fa comunque un controllo, così i tempi di risposta non la rivelano.
  const dummyHash = 'scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$' + 'A'.repeat(86) + '==';

  app.post<{ Body: { email: string; password: string } }>('/api/accesso', {
    schema: {
      body: {
        type: 'object', required: ['email', 'password'], additionalProperties: false,
        properties: { email: { type: 'string', maxLength: 254 }, password: { type: 'string', maxLength: 200 } },
      },
    },
  }, async (req, reply) => {
    const email = req.body.email.trim().toLowerCase();
    const key = `${req.ip}|${email}`;
    if (limiter.blocked(key)) throw new HttpError(429, 'Troppi tentativi: riprova tra qualche minuto');
    const u = db.prepare('SELECT id, password_hash, status FROM users WHERE email = ?').get(email) as
      | { id: number; password_hash: string | null; status: string } | undefined;
    const ok = await verifyPassword(req.body.password, u?.password_hash ?? dummyHash);
    if (!u || !ok) {
      limiter.fail(key);
      throw new HttpError(401, 'Email o password non corretti');
    }
    if (u.status !== 'active') throw new HttpError(403, 'Account sospeso: contatta l\'amministratore');
    limiter.ok(key);
    const { token } = createSession(db, u.id);
    db.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').run(new Date().toISOString(), u.id);
    reply.setCookie(SESSION_COOKIE, token, {
      path: '/', httpOnly: true, sameSite: 'lax', secure: ctx.config.cookieSecure, maxAge: SESSION_DAYS * 86_400,
    });
    return { ok: true };
  });

  app.post('/api/uscita', async (req, reply) => {
    deleteSession(db, req.cookies[SESSION_COOKIE]);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  /** Chi sono, i miei limiti e la mia banda: alimenta la barra "Banda di questa settimana". */
  app.get('/api/io', async (req) => {
    const u = requireUser(req);
    db.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').run(new Date().toISOString(), u.id);
    const s = getSettings(db);
    return {
      utente: u, limiti: getLimits(db, u.id), banda: getUsage(db, u.id), pushKey: ctx.push.publicKey,
      maxFile: ctx.maxFileBytes,
      sospesi: s.transfers_paused,
      cartellaUpload: s.upload_folder,
    };
  });
}
