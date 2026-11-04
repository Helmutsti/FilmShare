import type { DB } from './index.js';

export type Role = 'user' | 'admin';

function setting<T>(db: DB, key: string): T {
  const raw = db.prepare('SELECT value FROM settings WHERE key = ?').pluck().get(key) as string | undefined;
  if (raw === undefined) throw new Error(`Impostazione mancante: ${key}`);
  return JSON.parse(raw) as T;
}

export function findUserByEmail(db: DB, email: string) {
  return db
    .prepare('SELECT id, email, name, role, status FROM users WHERE email = ?')
    .get(email.trim()) as { id: number; email: string; name: string; role: Role; status: string } | undefined;
}

/** Crea una persona già attiva, con la quota e il periodo proposti per le persone nuove. */
export function createActiveUser(
  db: DB,
  u: { email: string; name: string; passwordHash: string; role: Role },
): number {
  return db.transaction(() => {
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO users (email, name, password_hash, role, status) VALUES (?, ?, ?, ?, 'active')`,
      )
      .run(u.email.trim(), u.name.trim(), u.passwordHash, u.role);
    const id = Number(lastInsertRowid);
    db.prepare(
      `INSERT INTO user_limits (user_id, quota_bytes, period) VALUES (?, ?, ?)`,
    ).run(id, setting<number>(db, 'default_quota_bytes'), setting<string>(db, 'default_period'));
    return id;
  })();
}

/** Promuove ad admin, riattiva e imposta una nuova password; chiude le sessioni aperte. */
export function resetAdmin(db: DB, id: number, passwordHash: string) {
  db.transaction(() => {
    db.prepare(`UPDATE users SET password_hash = ?, role = 'admin', status = 'active' WHERE id = ?`).run(
      passwordHash,
      id,
    );
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
  })();
}
