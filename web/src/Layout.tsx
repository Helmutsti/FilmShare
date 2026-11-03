import { NavLink, Outlet } from 'react-router-dom';
import { LogOut, Play } from 'lucide-react';
import { api } from './api';
import { useLive } from './live';
import { LiveBand, useSession } from './session';
import { Avatar } from './ui';
import { useData } from './useData';

function Item({ to, label, count }: { to: string; label: string; count?: number }) {
  return (
    <NavLink to={to} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
      <span>{label}</span>
      {!!count && <span className="nav-count">{count}</span>}
    </NavLink>
  );
}

function AdminNav() {
  const riepilogo = useData(api.riepilogo);
  useLive(['richieste'], riepilogo.reload);
  return (
    <div className="nav-group">
      <span className="t-overline">Amministrazione</span>
      <Item to="/admin/approvazioni" label="Approvazioni" count={riepilogo.data?.inAttesa} />
      <Item to="/admin/regole" label="Regole di banda" />
      <Item to="/admin/utenti" label="Utenti" />
    </div>
  );
}

export function Layout() {
  const { io, esci } = useSession();
  if (!io) return null;
  const admin = io.utente.role === 'admin';
  return (
    <div className="shell">
      <LiveBand />
      <aside className="sidebar">
        <nav aria-label="Menu principale">
          <div className="brand">
            <span className="brand-logo"><Play size={14} fill="#fff" color="#fff" /></span>
            <span className="t-heading">FilmShare</span>
          </div>
          <div className="nav-group">
            <span className="t-overline">Spazio personale</span>
            <Item to="/carica" label="Carica file" />
            <Item to="/condivisi" label="Cartella condivisa" />
            <Item to="/trasferimenti" label="I miei trasferimenti" />
          </div>
          {admin && <AdminNav />}
        </nav>
        <div className="user-card">
          <Avatar nome={io.utente.name} />
          <div className="grow">
            <div className="t-label truncate">{io.utente.name}</div>
            <div className="t-caption c-muted">{admin ? 'Amministratore' : 'Utente'}</div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={esci} aria-label="Esci" title="Esci"><LogOut size={16} /></button>
        </div>
      </aside>
      <main className="main"><Outlet /></main>
    </div>
  );
}
