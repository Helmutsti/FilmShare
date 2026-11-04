// Tipi e chiamate verso il server. Le chiamate usano il cookie di sessione (stessa origine).

export type Period = 'day' | 'week' | 'month';
export type Approval = 'never' | 'over_threshold' | 'always';
export type TransferStatus = 'pending' | 'approved' | 'in_progress' | 'completed' | 'rejected' | 'cancelled' | 'expired';

export interface Banda {
  quota: number; period: Period; periodStart: string; resetAt: string;
  upload: number; download: number; inProgress: number; used: number; remaining: number;
}
export interface Utente { id: number; email: string; name: string; role: 'user' | 'admin'; status: string }
export interface Limiti { quota_bytes: number; period: Period; max_speed_kbps: number; max_concurrent: number; approval: Approval; can_upload: boolean }
export interface Io {
  utente: Utente; limiti: Limiti; banda: Banda; pushKey: string;
  soglie: { upload: number; download: number; maxFile: number };
  /** "Sospendi trasferimenti" attivo: nessun upload o download per nessuno. */
  sospesi: boolean;
  /** Cartella di destinazione degli upload; null = non ancora scelta (upload non possibili). */
  cartellaUpload: string | null;
}
export interface Cartelle {
  cartelle: { percorso: string; nome: string; livello: number }[];
  esposte: string[];
  upload: string | null;
}

export interface Trasferimento {
  id: number; tipo: 'upload' | 'download'; nome: string; dimensione: number; stato: TransferStatus;
  motivo: string | null; prenotato: number; fileId: number | null; linkScade: string | null; link: string | null;
  creato: string; aggiornato: string;
}
export interface FileCondiviso {
  id: number; nome: string; percorso: string; dimensione: number; aggiunto: string; caricatoDa: string | null;
  download: Trasferimento | null;
}
export interface Richiesta extends Trasferimento {
  utente: { id: number; nome: string; email: string };
  impatto: { periodo: Period; percentuale: number | null };
}
export interface UtenteAdmin {
  id: number; email: string; nome: string; ruolo: 'user' | 'admin'; stato: string; creato: string; ultimoAccesso: string | null;
  limiti: { quota: number; periodo: Period; velocitaKbps: number; simultanei: number; approvazione: Approval; permettiUpload: boolean };
  banda: Banda;
  ultimiTrasferimenti?: Trasferimento[];
}
/** Valori proposti nel modulo "Nuovo utente". */
export interface Predefiniti { quota: number; periodo: Period; velocitaKbps: number; simultanei: number }
export interface Riepilogo { inAttesa: number; upload: number; download: number; piuVecchia: string | null; volume: number; trafficoOggi: number }

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (!res.ok) {
    if (res.status === 401 && url !== '/api/accesso') window.dispatchEvent(new Event('fs:uscito'));
    throw new ApiError(res.status, data?.errore ?? `Errore ${res.status}`);
  }
  return data as T;
}

export const api = {
  accesso: (email: string, password: string) => call<{ ok: true }>('POST', '/api/accesso', { email, password }),
  uscita: () => call<{ ok: true }>('POST', '/api/uscita'),
  io: () => call<Io>('GET', '/api/io'),
  mieiTrasferimenti: () => call<Trasferimento[]>('GET', '/api/io/trasferimenti'),
  annulla: (id: number) => call<{ ok: true }>('DELETE', `/api/trasferimenti/${id}`),
  richiestaUpload: (nome: string, dimensione: number) => call<Trasferimento>('POST', '/api/upload/richieste', { nome, dimensione }),
  file: () => call<{ file: FileCondiviso[]; sogliaApprovazione: number; banda: Banda }>('GET', '/api/file'),
  scarica: (fileId: number) => call<Trasferimento>('POST', `/api/file/${fileId}/download`),

  utenti: () => call<UtenteAdmin[]>('GET', '/api/admin/utenti'),
  utente: (id: number) => call<UtenteAdmin>('GET', `/api/admin/utenti/${id}`),
  creaUtente: (b: { email: string; nome: string; password: string; ruolo?: 'user' | 'admin'; limiti?: Partial<UtenteAdmin['limiti']> }) =>
    call<UtenteAdmin>('POST', '/api/admin/utenti', b),
  modificaUtente: (id: number, b: { nome?: string; ruolo?: 'user' | 'admin'; stato?: 'active' | 'suspended'; password?: string; limiti?: Partial<UtenteAdmin['limiti']> }) =>
    call<UtenteAdmin>('PATCH', `/api/admin/utenti/${id}`, b),
  richieste: (vista: 'attesa' | 'storico', tipo?: 'upload' | 'download') =>
    call<Richiesta[]>('GET', `/api/admin/richieste?vista=${vista}${tipo ? `&tipo=${tipo}` : ''}`),
  riepilogo: () => call<Riepilogo>('GET', '/api/admin/riepilogo'),
  approva: (id: number) => call<Trasferimento>('POST', `/api/admin/richieste/${id}/approva`),
  rifiuta: (id: number, nota?: string) => call<Trasferimento>('POST', `/api/admin/richieste/${id}/rifiuta`, { nota }),
  approvaEntroLimiti: () => call<{ approvate: number }>('POST', '/api/admin/richieste/approva-entro-limiti'),
  sospendiTrasferimenti: (sospesi: boolean) => call<{ sospesi: boolean }>('PUT', '/api/admin/sospensione', { sospesi }),
  cartelle: () => call<Cartelle>('GET', '/api/admin/cartelle'),
  salvaCartelle: (b: { esposte: string[]; upload: string | null }) => call<{ esposte: string[]; upload: string | null }>('PUT', '/api/admin/cartelle', b),
  predefiniti: () => call<Predefiniti>('GET', '/api/admin/predefiniti'),
  iscriviNotifiche: (sub: PushSubscriptionJSON) => call<{ ok: true }>('POST', '/api/notifiche/iscrizione', sub),
};
