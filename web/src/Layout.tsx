import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { LogOut, Menu, PauseCircle, Play, X } from 'lucide-react';
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

function AdminNav({ inAttesa }: { inAttesa?: number }) {
  return (
    <div className="nav-group">
      <span className="t-overline">Amministrazione</span>
      <Item to="/admin/approvazioni" label="Approvazioni" count={inAttesa} />
      <Item to="/admin/utenti" label="Utenti" />
      <Item to="/admin/cartelle" label="Cartelle" />
      <Item to="/admin/catalogo" label="Catalogo" />
    </div>
  );
}

function Brand() {
  return (
    <div className="brand">
      <span className="brand-logo"><Play size={14} fill="var(--text-on-accent)" color="var(--text-on-accent)" /></span>
      <span className="t-heading">FilmShare</span>
    </div>
  );
}

export function Layout() {
  const { io, esci } = useSession();
  const admin = io?.utente.role === 'admin';
  // Sul telefono il menu è un pannello che si apre dal pulsante in alto e si chiude cambiando pagina.
  const [menu, setMenu] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setMenu(false), [pathname]);
  useEffect(() => {
    if (!menu) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [menu]);
  // Richieste in attesa: numero accanto ad "Approvazioni" e pallino sul pulsante del menu (solo admin).
  const riepilogo = useData(() => (admin ? api.riepilogo() : Promise.resolve(null)), [admin]);
  useLive(['richieste'], riepilogo.reload);
  if (!io) return null;
  const inAttesa = riepilogo.data?.inAttesa ?? 0;
  return (
    <div className="shell">
      <LiveBand />
      <header className="topbar">
        <button className="btn btn-ghost btn-icon topbar-menu" onClick={() => setMenu(true)} aria-label="Apri il menu" aria-expanded={menu} aria-controls="menu-principale">
          <Menu size={20} />
          {inAttesa > 0 && <span className="topbar-punto" aria-hidden />}
        </button>
        <Brand />
      </header>
      {menu && <div className="menu-back" onClick={() => setMenu(false)} aria-hidden />}
      <aside className={`sidebar${menu ? ' aperta' : ''}`} id="menu-principale">
        <nav aria-label="Menu principale">
          <div className="between sidebar-testa">
            <Brand />
            <button className="btn btn-ghost btn-icon sidebar-chiudi" onClick={() => setMenu(false)} aria-label="Chiudi il menu"><X size={18} /></button>
          </div>
          <div className="nav-group">
            <span className="t-overline">Spazio personale</span>
            <Item to="/carica" label="Carica file" />
            <Item to="/condivisi" label="Archivio" />
            <Item to="/trasferimenti" label="I miei trasferimenti" />
          </div>
          {admin && <AdminNav inAttesa={inAttesa} />}
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
      <main className="main">
        {io.sospesi && (
          <div className="banner banner-danger" role="alert">
            <PauseCircle size={20} color="var(--status-danger)" />
            <div className="grow">
              <div className="t-strong">Trasferimenti sospesi</div>
              <div className="t-caption c-secondary">
                L'amministratore ha fermato tutti gli upload e i download. Quando li riattiva puoi riprendere da dove eri rimasto.
              </div>
            </div>
          </div>
        )}
        <Outlet />
      </main>
    </div>
  );
}
