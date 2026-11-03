/**
 * Upload in corso in questa pagina. Per ogni file:
 *   1. si chiede il permesso al server (nome + dimensione) → approvato subito o in attesa;
 *   2. se approvato parte l'upload tus a pezzi; se in attesa il file resta in memoria e parte all'approvazione;
 *   3. se la connessione cade tus riprova da solo; se la pagina si chiude, ritrascinando lo stesso file
 *      si riprende dal punto in cui era (tus-js-client ricorda l'upload nel browser).
 */
import { useSyncExternalStore } from 'react';
import { Upload } from 'tus-js-client';
import { api, type Trasferimento } from './api';

export interface LocalUpload {
  transferId: number;
  file: File;
  state: 'waiting' | 'uploading' | 'paused' | 'error' | 'done';
  sent: number;
  speed: number; // byte/s
  error?: string;
  tus?: Upload;
}

const CHUNK = 64 * 1024 * 1024; // deve stare sotto client_max_body_size di nginx

let items = new Map<number, LocalUpload>();
const subs = new Set<() => void>();
const emit = () => { items = new Map(items); subs.forEach((f) => f()); };
const set = (id: number, patch: Partial<LocalUpload>) => {
  const cur = items.get(id);
  if (cur) { items.set(id, { ...cur, ...patch }); emit(); }
};

export function useUploads() {
  return useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb); }, () => items);
}

function start(id: number) {
  const it = items.get(id);
  if (!it || it.state === 'uploading' || it.state === 'done') return;
  let last = { t: Date.now(), b: it.sent };
  const up = new Upload(it.file, {
    endpoint: '/api/upload/tus',
    chunkSize: CHUNK,
    retryDelays: [0, 3000, 10000, 30000, 60000, 120000],
    metadata: { transferId: String(id), filename: it.file.name },
    // L'impronta lega il file al suo upload: ritrascinandolo dopo una chiusura si riprende da lì.
    fingerprint: async (file) => `fs-${id}-${file.name}-${file.size}-${file.lastModified}`,
    storeFingerprintForResuming: true,
    removeFingerprintOnSuccess: true,
    onProgress(sent) {
      const now = Date.now();
      const dt = (now - last.t) / 1000;
      const speed = dt >= 1 ? (sent - last.b) / dt : (items.get(id)?.speed ?? 0);
      if (dt >= 1) last = { t: now, b: sent };
      set(id, { sent, speed });
    },
    onSuccess() { set(id, { state: 'done', sent: it.file.size, speed: 0 }); },
    onError(err) {
      const body = (err as { originalResponse?: { getBody(): string } }).originalResponse?.getBody();
      let msg = err.message;
      try { msg = JSON.parse(body ?? '').errore ?? msg; } catch { /* non JSON */ }
      set(id, { state: 'error', error: msg, speed: 0 });
    },
  });
  set(id, { state: 'uploading', tus: up, error: undefined });
  up.findPreviousUploads().then((prev) => {
    if (prev.length) up.resumeFromPreviousUpload(prev[0]!);
    up.start();
  });
}

/** Aggiunge file trascinati o scelti. Se un file coincide con un upload interrotto, lo riprende invece di chiederne uno nuovo. */
export async function addFiles(files: File[], mine: Trasferimento[]): Promise<string[]> {
  const errors: string[] = [];
  for (const file of files) {
    const resumable = mine.find(
      (t) => t.tipo === 'upload' && ['approved', 'in_progress', 'pending'].includes(t.stato) &&
        t.nome === file.name && t.dimensione === file.size && !items.has(t.id),
    );
    try {
      const t = resumable ?? (await api.richiestaUpload(file.name, file.size));
      items.set(t.id, { transferId: t.id, file, state: 'waiting', sent: 0, speed: 0 });
      emit();
      if (t.stato === 'approved' || t.stato === 'in_progress') start(t.id);
    } catch (e) {
      errors.push(`${file.name}: ${(e as Error).message}`);
    }
  }
  return errors;
}

/** Quando l'admin approva, parte da solo l'upload del file ancora in memoria. */
export function syncWithServer(mine: Trasferimento[]) {
  for (const t of mine) {
    const it = items.get(t.id);
    if (!it) continue;
    if (t.stato === 'approved' && it.state === 'waiting') start(t.id);
    if (['rejected', 'cancelled'].includes(t.stato)) {
      it.tus?.abort();
      items.delete(t.id);
      emit();
    }
  }
}

export function pause(id: number) {
  items.get(id)?.tus?.abort();
  set(id, { state: 'paused', speed: 0 });
}

export function resume(id: number) {
  const it = items.get(id);
  if (it) { items.set(id, { ...it, state: 'waiting' }); start(id); }
}

export async function cancelUpload(id: number) {
  items.get(id)?.tus?.abort();
  items.delete(id);
  emit();
  await api.annulla(id);
}
