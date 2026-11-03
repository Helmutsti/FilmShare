import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './Layout';
import { refreshPush } from './push';
import { SessionProvider, useSession } from './session';
import { Accesso } from './pages/Accesso';
import { CaricaFile } from './pages/CaricaFile';
import { Condivisi } from './pages/Condivisi';
import { Trasferimenti } from './pages/Trasferimenti';
import { Approvazioni } from './pages/Approvazioni';
import { Regole } from './pages/Regole';
import { Utenti } from './pages/Utenti';

function Routing() {
  const { io, loading } = useSession();
  useEffect(() => { if (io) void refreshPush(io.pushKey); }, [io?.utente.id]);
  if (loading) return null;
  if (!io) return <Accesso />;
  const admin = io.utente.role === 'admin';
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/carica" element={<CaricaFile />} />
        <Route path="/condivisi" element={<Condivisi />} />
        <Route path="/trasferimenti" element={<Trasferimenti />} />
        {admin && <Route path="/admin/approvazioni" element={<Approvazioni />} />}
        {admin && <Route path="/admin/regole" element={<Regole />} />}
        {admin && <Route path="/admin/utenti" element={<Utenti />} />}
        <Route path="*" element={<Navigate to="/carica" replace />} />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <SessionProvider>
      <BrowserRouter><Routing /></BrowserRouter>
    </SessionProvider>
  );
}
