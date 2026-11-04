import type { Period } from './api';

export const GB = 1024 ** 3;
const TB = 1024 ** 4;

const num = (n: number, digits: number) =>
  n.toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: digits });

/** 68,2 GB · 1,5 TB · 640 MB */
export function bytes(b: number): string {
  if (b >= TB) return `${num(b / TB, 1)} TB`;
  if (b >= GB) return `${num(b / GB, b >= 100 * GB ? 0 : 1)} GB`;
  if (b >= 1024 ** 2) return `${num(b / 1024 ** 2, 0)} MB`;
  if (b >= 1024) return `${num(b / 1024, 0)} KB`;
  return `${b} B`;
}

export const periodoNome: Record<Period, string> = { day: 'Giorno', week: 'Settimana', month: 'Mese' };
export const periodoQuesto: Record<Period, string> = { day: 'di oggi', week: 'di questa settimana', month: 'di questo mese' };
export const quotaNome: Record<Period, string> = { day: 'Quota giornaliera', week: 'Quota settimanale', month: 'Quota mensile' };

export function dataLunga(iso: string) {
  return new Date(iso).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
}
export function dataBreve(iso: string) {
  return new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
}
export function ora(iso: string) {
  return new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

/** "5 min fa", "2 ore fa", "ieri", "3 giorni fa" */
export function fa(iso: string | null): string {
  if (!iso) return '—';
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return 'adesso';
  if (s < 3600) return `${Math.floor(s / 60)} min fa`;
  if (s < 86400) return `${Math.floor(s / 3600)} ${Math.floor(s / 3600) === 1 ? 'ora' : 'ore'} fa`;
  const d = Math.floor(s / 86400);
  return d === 1 ? 'ieri' : `${d} giorni fa`;
}

export function iniziali(nome: string) {
  return nome.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('') || '?';
}

/** Velocità nei campi: Mbps per chi legge, kbps per il server. Vuoto o 0 = nessun limite (0 sul server). */
export const speedToField = (kbps: number) => (kbps > 0 ? String(kbps / 1000).replace('.', ',') : '');
export function fieldToKbps(s: string): number {
  const n = Number(s.trim().replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 1000) : 0;
}
export const speedText = (kbps: number) => (kbps > 0 ? `${(kbps / 1000).toLocaleString('it-IT')} Mbps` : 'Nessun limite');

export const percent =(part: number, whole: number) => (whole > 0 ? Math.min(100, (part / whole) * 100) : 0);
