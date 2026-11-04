/**
 * Quota unica: upload + download nel periodo della persona (giorno, settimana da lunedì, mese).
 * A inizio trasferimento si "prenota" l'intera dimensione (reserved_bytes) sul periodo corrente;
 * se il trasferimento viene annullato o rifiutato la prenotazione torna a 0.
 * I periodi seguono il fuso orario del server (variabile TZ, es. Europe/Rome).
 */
import type { DB } from './db/index.js';
import type { Period } from './db/settings.js';

export function periodStart(period: Period, now = new Date()): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === 'week') d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // lunedì
  if (period === 'month') d.setDate(1);
  return d;
}

export function periodEnd(period: Period, now = new Date()): Date {
  const s = periodStart(period, now);
  if (period === 'day') s.setDate(s.getDate() + 1);
  if (period === 'week') s.setDate(s.getDate() + 7);
  if (period === 'month') s.setMonth(s.getMonth() + 1);
  return s;
}

export interface Limits {
  quota_bytes: number;
  period: Period;
  can_upload: boolean;
}

export function getLimits(db: DB, userId: number): Limits {
  const l = db
    .prepare('SELECT quota_bytes, period, can_upload FROM user_limits WHERE user_id = ?')
    .get(userId) as (Omit<Limits, 'can_upload'> & { can_upload: number }) | undefined;
  if (!l) throw new Error(`Limiti mancanti per l'utente ${userId}`);
  return { ...l, can_upload: l.can_upload === 1 };
}

export interface Usage {
  quota: number;
  period: Period;
  periodStart: string;
  resetAt: string;
  upload: number;    // upload completati
  download: number;  // download con link emesso
  inProgress: number; // upload approvati o in corso (prenotati, non ancora finiti)
  used: number;
  remaining: number;
}

export function getUsage(db: DB, userId: number, now = new Date()): Usage {
  const l = getLimits(db, userId);
  const start = periodStart(l.period, now).toISOString();
  const rows = db
    .prepare(
      `SELECT kind, status, SUM(reserved_bytes) AS b FROM transfers
       WHERE user_id = ? AND period_start = ? AND reserved_bytes > 0 GROUP BY kind, status`,
    )
    .all(userId, start) as { kind: string; status: string; b: number }[];
  let upload = 0, download = 0, inProgress = 0;
  for (const r of rows) {
    if (r.kind === 'download') download += r.b;
    else if (r.status === 'completed') upload += r.b;
    else inProgress += r.b;
  }
  const used = upload + download + inProgress;
  return {
    quota: l.quota_bytes, period: l.period, periodStart: start, resetAt: periodEnd(l.period, now).toISOString(),
    upload, download, inProgress, used, remaining: Math.max(0, l.quota_bytes - used),
  };
}

export type Decision = { outcome: 'approved' } | { outcome: 'pending'; reason: 'over_quota' };

/** Unica regola: se la richiesta sta nella quota rimasta parte subito, altrimenti va in approvazione. */
export function decide(size: number, usage: Usage): Decision {
  return usage.used + size > usage.quota ? { outcome: 'pending', reason: 'over_quota' } : { outcome: 'approved' };
}
