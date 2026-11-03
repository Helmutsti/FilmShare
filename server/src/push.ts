/** Notifiche push del browser (Web Push con chiavi VAPID). */
import webpush from 'web-push';
import type { DB } from './db/index.js';
import { getOrCreateSecret } from './db/settings.js';

export interface PushPayload { title: string; body: string; url?: string }

export class Push {
  readonly publicKey: string;

  constructor(private db: DB, subject: string, env: { publicKey?: string; privateKey?: string } = {}) {
    const keys: { publicKey: string; privateKey: string } =
      env.publicKey && env.privateKey
        ? { publicKey: env.publicKey, privateKey: env.privateKey }
        : getOrCreateSecret(db, 'vapid', () => webpush.generateVAPIDKeys());
    this.publicKey = keys.publicKey;
    webpush.setVapidDetails(subject, keys.publicKey, keys.privateKey);
  }

  subscribe(userId: number, sub: { endpoint: string; keys: { p256dh: string; auth: string } }) {
    this.db
      .prepare(
        `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)
         ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`,
      )
      .run(userId, sub.endpoint, sub.keys.p256dh, sub.keys.auth);
  }

  unsubscribe(userId: number, endpoint: string) {
    this.db.prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?').run(userId, endpoint);
  }

  async toUser(userId: number, payload: PushPayload) {
    const subs = this.db
      .prepare('SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?')
      .all(userId) as { endpoint: string; p256dh: string; auth: string }[];
    await Promise.all(subs.map((s) => this.sendOne(s, payload)));
  }

  async toAdmins(payload: PushPayload) {
    const ids = this.db.prepare(`SELECT id FROM users WHERE role = 'admin' AND status = 'active'`).pluck().all() as number[];
    await Promise.all(ids.map((id) => this.toUser(id, payload)));
  }

  private async sendOne(s: { endpoint: string; p256dh: string; auth: string }, payload: PushPayload) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload));
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      // 404/410: l'iscrizione non esiste più (permesso revocato, browser reinstallato).
      if (code === 404 || code === 410) this.db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(s.endpoint);
    }
  }
}
