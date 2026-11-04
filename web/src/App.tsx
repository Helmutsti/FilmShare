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
import { Utenti } from './pages/Utenti';
import { Cartelle } from './pages/Cartelle';

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
        {admin && <Route path="/admin/utenti" element={<Utenti />} />}
        {admin && <Route path="/admin/cartelle" element={<Cartelle />} />}
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
