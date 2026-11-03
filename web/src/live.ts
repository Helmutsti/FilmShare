import { useEffect, useRef } from 'react';

type EventName = 'banda' | 'trasferimenti' | 'richieste' | 'utenti' | 'file' | 'regole';

// Una sola connessione SSE per tutta la pagina; i componenti si iscrivono agli eventi che li riguardano.
let source: EventSource | null = null;
const listeners = new Map<EventName, Set<(data: unknown) => void>>();

function ensureSource() {
  if (source) return;
  source = new EventSource('/api/eventi', { withCredentials: true });
  const names: EventName[] = ['banda', 'trasferimenti', 'richieste', 'utenti', 'file', 'regole'];
  for (const n of names) {
    source.addEventListener(n, (e) => {
      const data = (() => { try { return JSON.parse((e as MessageEvent).data); } catch { return {}; } })();
      listeners.get(n)?.forEach((fn) => fn(data));
    });
  }
}

export function closeLive() {
  source?.close();
  source = null;
}

/** Richiama `fn` ogni volta che arriva uno degli eventi indicati (il browser si riconnette da solo). */
export function useLive(events: EventName[], fn: (data: unknown) => void) {
  const ref = useRef(fn);
  ref.current = fn;
  const key = events.join(',');
  useEffect(() => {
    ensureSource();
    const cb = (d: unknown) => ref.current(d);
    for (const e of key.split(',') as EventName[]) {
      if (!listeners.has(e)) listeners.set(e, new Set());
      listeners.get(e)!.add(cb);
    }
    return () => {
      for (const e of key.split(',') as EventName[]) listeners.get(e)?.delete(cb);
    };
  }, [key]);
}
