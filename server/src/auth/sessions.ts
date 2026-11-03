import { createHash, randomBytes } from 'node:crypto';
import type { DB } from '../db/index.js';
import type { Role } from '../db/users.js';

export const SESSION_COOKIE = 'fs_sessione';
export const SESSION_DAYS = 30;

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export interface SessionUser { id: number; email: string; name: string; role: Role; status: string }

export function createSession(db: DB, userId: number): { token: string; expiresAt: Date } {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  db.prepare('INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)').run(
    userId, sha256(token), expiresAt.toISOString(),
  );
  return { token, expiresAt };
}

export function userFromToken(db: DB, token: string | undefined): SessionUser | null {
  if (!token) return null;
  const u = db
    .prepare(
      `SELECT u.id, u.email, u.name, u.role, u.status FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ? AND u.status = 'active'`,
    )
    .get(sha256(token), new Date().toISOString()) as SessionUser | undefined;
  return u ?? null;
}

export function deleteSession(db: DB, token: string | undefined) {
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
}

export function deleteUserSessions(db: DB, userId: number) {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

/** Legge il cookie di sessione da un header Cookie grezzo (serve negli hook di tus, fuori da Fastify). */
export function tokenFromCookieHeader(header: string | null | undefined): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === SESSION_COOKIE) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

/** Limite ai tentativi di accesso sbagliati: 5 ogni 15 minuti per indirizzo + email. */
export class LoginLimiter {
  private fails = new Map<string, { count: number; until: number }>();
  constructor(private max = 5, private windowMs = 15 * 60_000) {}
  blocked(key: string) {
    const f = this.fails.get(key);
    return !!f && f.count >= this.max && f.until > Date.now();
  }
  fail(key: string) {
    const f = this.fails.get(key);
    if (!f || f.until <= Date.now()) this.fails.set(key, { count: 1, until: Date.now() + this.windowMs });
    else f.count++;
  }
  ok(key: string) {
    this.fails.delete(key);
  }
}
