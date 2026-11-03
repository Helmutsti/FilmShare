import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError, type Io } from './api';
import { closeLive, useLive } from './live';

interface Session { io: Io | null; loading: boolean; refresh: () => void; esci: () => Promise<void> }
const Ctx = createContext<Session>({ io: null, loading: true, refresh: () => {}, esci: async () => {} });

export function SessionProvider({ children }: { children: ReactNode }) {
  const [io, setIo] = useState<Io | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    api.io()
      .then(setIo)
      .catch((e) => { if (e instanceof ApiError && e.status === 401) setIo(null); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(refresh, [refresh]);
  useEffect(() => {
    const out = () => { closeLive(); setIo(null); };
    window.addEventListener('fs:uscito', out);
    return () => window.removeEventListener('fs:uscito', out);
  }, []);

  const esci = async () => {
    await api.uscita().catch(() => {});
    closeLive();
    setIo(null);
  };

  return <Ctx.Provider value={{ io, loading, refresh, esci }}>{children}</Ctx.Provider>;
}

export const useSession = () => useContext(Ctx);

/** Tiene aggiornata la banda della persona (barra, avvisi) quando il server segnala un cambiamento. */
export function LiveBand() {
  const { refresh } = useSession();
  useLive(['banda', 'regole'], refresh);
  return null;
}
