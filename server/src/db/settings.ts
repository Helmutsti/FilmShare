import { randomBytes } from 'node:crypto';
import type { DB } from './index.js';

export type Period = 'day' | 'week' | 'month';

/** Regole globali (pagina "Regole di banda"). I nomi coincidono con le chiavi della tabella settings. */
export interface Settings {
  default_quota_bytes: number;
  default_period: Period;
  default_max_speed_kbps: number;
  default_max_concurrent: number;
  server_max_speed_kbps: number;
  server_max_concurrent: number;
  night_window: { start: string; end: string } | null;
  download_link_hours: number;
  upload_approval_threshold: number;
  download_approval_threshold: number;
  block_on_quota_exhausted: boolean;
  slowdown_over_80: boolean;
  require_approval_over_threshold: boolean;
  suspend_after_3_overruns: boolean;
  /** "Sospendi trasferimenti": nessun upload o download per nessuno. */
  transfers_paused: boolean;
  /** Sottocartelle della cartella principale del NAS mostrate nei download ("" = tutta). */
  exposed_folders: string[];
  /** Dove finiscono gli upload (relativa alla cartella principale); null = upload non possibili. */
  upload_folder: string | null;
}

export const SETTING_KEYS: (keyof Settings)[] = [
  'default_quota_bytes', 'default_period', 'default_max_speed_kbps', 'default_max_concurrent',
  'server_max_speed_kbps', 'server_max_concurrent', 'night_window', 'download_link_hours',
  'upload_approval_threshold', 'download_approval_threshold', 'block_on_quota_exhausted',
  'slowdown_over_80', 'require_approval_over_threshold', 'suspend_after_3_overruns', 'transfers_paused',
  'exposed_folders', 'upload_folder',
];

export function transfersPaused(db: DB): boolean {
  return db.prepare(`SELECT value FROM settings WHERE key = 'transfers_paused'`).pluck().get() === 'true';
}

export function getSettings(db: DB): Settings {
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  const map = new Map(rows.map((r) => [r.key, JSON.parse(r.value)]));
  const out: Record<string, unknown> = {};
  for (const k of SETTING_KEYS) {
    if (!map.has(k)) throw new Error(`Regola globale mancante: ${k}`);
    out[k] = map.get(k);
  }
  return out as unknown as Settings;
}

export function updateSettings(db: DB, patch: Partial<Settings>) {
  const stmt = db.prepare('UPDATE settings SET value = ? WHERE key = ?');
  db.transaction(() => {
    for (const [k, v] of Object.entries(patch)) {
      if (!SETTING_KEYS.includes(k as keyof Settings)) throw new Error(`Regola sconosciuta: ${k}`);
      stmt.run(JSON.stringify(v), k);
    }
  })();
}

/** Segreti interni (firma dei link, chiavi push): dalla variabile d'ambiente se c'è, altrimenti generati una volta e salvati. */
export function getOrCreateSecret(db: DB, key: string, create: () => unknown = () => randomBytes(32).toString('base64url')) {
  const k = `secret:${key}`;
  const raw = db.prepare('SELECT value FROM settings WHERE key = ?').pluck().get(k) as string | undefined;
  if (raw !== undefined) return JSON.parse(raw);
  const value = create();
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(k, JSON.stringify(value));
  return value;
}
