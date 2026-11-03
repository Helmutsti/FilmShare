import { useEffect, useState, type FormEvent } from 'react';
import { api, type Approval, type Period, type UtenteAdmin } from '../api';
import { bytes, fa, GB, periodoQuesto } from '../format';
import { useLive } from '../live';
import { useSession } from '../session';
import { useData } from '../useData';
import { Avatar, Badge, BandBar, PageHeader, SimpleBar, statoBadge } from '../ui';

type Tab = 'tutti' | 'attivi' | 'bloccati' | 'sospesi';

function statoUtente(s: string) {
  if (s === 'active') return <Badge tone="ok">Attivo</Badge>;
  if (s === 'blocked') return <Badge tone="no">Bloccato · quota</Badge>;
  if (s === 'suspended') return <Badge tone="neutro">Sospeso</Badge>;
  return <Badge tone="neutro">{s}</Badge>;
}

interface LimitForm { quotaGb: string; periodo: Period; velocitaMbps: string; simultanei: string; approvazione: Approval; ruolo: 'user' | 'admin' }
const toLimitForm = (u: UtenteAdmin): LimitForm => ({
  quotaGb: String(Math.round(u.limiti.quota / GB)), periodo: u.limiti.periodo, velocitaMbps: String(u.limiti.velocitaKbps / 1000),
  simultanei: String(u.limiti.simultanei), approvazione: u.limiti.approvazione, ruolo: u.ruolo,
});
const limitiDa = (f: LimitForm) => ({
  quota: Math.max(0, Math.round(Number(f.quotaGb.replace(',', '.')) * GB)),
  periodo: f.periodo,
  velocitaKbps: Math.max(1, Math.round(Number(f.velocitaMbps.replace(',', '.')) * 1000)),
  simultanei: Math.max(1, Math.round(Number(f.simultanei) || 1)),
  approvazione: f.approvazione,
});

function LimitFields({ f, set }: { f: LimitForm; set: (f: LimitForm) => void }) {
  return (
    <>
      <div className="row" style={{ gap: 12 }}>
        <label className="field"><span>Quota (upload + download)</span>
          <div style={{ position: 'relative' }}>
            <input className="input" inputMode="decimal" value={f.quotaGb} onChange={(e) => set({ ...f, quotaGb: e.target.value })} style={{ paddingRight: 44 }} />
            <span className="t-body c-muted" style={{ position: 'absolute', right: 12, top: 11 }}>GB</span>
          </div>
        </label>
        <label className="field"><span>Periodo</span>
          <select className="input" value={f.periodo} onChange={(e) => set({ ...f, periodo: e.target.value as Period })}>
            <option value="day">Giorno</option><option value="week">Settimana</option><option value="month">Mese</option>
          </select>
        </label>
      </div>
      <div className="row" style={{ gap: 12 }}>
        <label className="field"><span>Velocità massima</span>
          <div style={{ position: 'relative' }}>
            <input className="input" inputMode="decimal" value={f.velocitaMbps} onChange={(e) => set({ ...f, velocitaMbps: e.target.value })} style={{ paddingRight: 56 }} />
            <span className="t-body c-muted" style={{ position: 'absolute', right: 12, top: 11 }}>Mbps</span>
          </div>
        </label>
        <label className="field"><span>Trasferimenti simultanei</span>
          <input className="input" inputMode="numeric" value={f.simultanei} onChange={(e) => set({ ...f, simultanei: e.target.value })} />
        </label>
      </div>
      <div className="row" style={{ gap: 12 }}>
        <label className="field"><span>Approvazione</span>
          <select className="input" value={f.approvazione} onChange={(e) => set({ ...f, approvazione: e.target.value as Approval })}>
            <option value="never">Mai</option><option value="over_threshold">Oltre soglia</option><option value="always">Sempre</option>
          </select>
        </label>
        <label className="field"><span>Ruolo</span>
          <select className="input" value={f.ruolo} onChange={(e) => set({ ...f, ruolo: e.target.value as 'user' | 'admin' })}>
            <option value="user">Utente</option><option value="admin">Amministratore</option>
          </select>
        </label>
      </div>
    </>
  );
}

function Dettaglio({ id, onSaved }: { id: number; onSaved: () => void }) {
  const { io } = useSession();
  const u = useData(() => api.utente(id), [id]);
  useLive(['utenti', 'trasferimenti'], u.reload);
  const [f, setF] = useState<LimitForm | null>(null);
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { if (u.data) setF(toLimitForm(u.data)); }, [u.data?.id, u.data?.limiti, u.data?.ruolo]);
  if (!u.data || !f) return <section className="card" style={{ width: 420, flex: 'none' }}>Carico…</section>;
  const d = u.data;
  const self = d.id === io?.utente.id;

  async function save(extra: Parameters<typeof api.modificaUtente>[1] = {}) {
    setMsg(null);
    try {
      await api.modificaUtente(id, { limiti: limitiDa(f!), ruolo: f!.ruolo, ...(pw ? { password: pw } : {}), ...extra });
      setPw('');
      setMsg('Salvato');
      u.reload();
      onSaved();
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  return (
    <section className="card" style={{ width: 420, flex: 'none', gap: 16 }} aria-label={`Dettaglio di ${d.nome}`}>
      <div className="inline" style={{ gap: 12 }}>
        <Avatar nome={d.nome} large />
        <div className="stack-sm" style={{ gap: 2, minWidth: 0 }}>
          <span className="t-heading">{d.nome}</span>
          <span className="t-caption c-muted truncate">{d.email} · utente dal {new Date(d.creato).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
        </div>
      </div>
      <h3 className="t-heading">Limiti</h3>
      <LimitFields f={f} set={setF} />
      <label className="field"><span>Nuova password (lascia vuoto per non cambiarla)</span>
        <input className="input" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} minLength={12} />
      </label>
      <div className="stack-sm" style={{ gap: 10 }}>
        <div className="between">
          <span className="t-label c-secondary">Uso {periodoQuesto[d.banda.period]}</span>
          <span className="t-label">{bytes(d.banda.used)} / {bytes(d.banda.quota)} · restano {bytes(d.banda.remaining)}</span>
        </div>
        <BandBar banda={d.banda} restano={false} />
      </div>
      <h3 className="t-heading">Ultimi trasferimenti</h3>
      <div className="stack-sm" style={{ gap: 10 }}>
        {(d.ultimiTrasferimenti ?? []).length === 0 && <span className="t-caption c-muted">Nessun trasferimento.</span>}
        {(d.ultimiTrasferimenti ?? []).map((t) => (
          <div key={t.id} className="between">
            <div className="stack-sm" style={{ gap: 2, minWidth: 0 }}>
              <span className="t-label truncate">{t.nome}</span>
              <span className="t-caption c-muted">{t.tipo === 'upload' ? 'Upload' : 'Download'} · {fa(t.creato)}</span>
            </div>
            <div className="inline">{statoBadge(t)}<span className="t-label">{bytes(t.dimensione)}</span></div>
          </div>
        ))}
      </div>
      {msg && <span className={`t-caption ${msg === 'Salvato' ? 'c-success' : 'c-danger'}`} role="status">{msg}</span>}
      <div className="between">
        {d.stato === 'suspended'
          ? <button className="btn btn-success" onClick={() => save({ stato: 'active' })}>Riattiva utente</button>
          : <button className="btn btn-danger" disabled={self} onClick={() => save({ stato: 'suspended' })}>Sospendi utente</button>}
        <button className="btn btn-primary" onClick={() => save()}>Salva modifiche</button>
      </div>
    </section>
  );
}

function NuovoUtente({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const regole = useData(api.regole);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [f, setF] = useState<LimitForm | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (regole.data) setF({
      quotaGb: String(Math.round(regole.data.default_quota_bytes / GB)), periodo: regole.data.default_period,
      velocitaMbps: String(regole.data.default_max_speed_kbps / 1000), simultanei: String(regole.data.default_max_concurrent),
      approvazione: 'over_threshold', ruolo: 'user',
    });
  }, [regole.data]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      const u = await api.creaUtente({ nome, email, password, ruolo: f!.ruolo, limiti: limitiDa(f!) });
      onCreated(u.id);
    } catch (e2) {
      setErr((e2 as Error).message);
    }
  }

  return (
    <div className="modal-back" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit} aria-label="Nuovo utente">
        <h2 className="t-title">Nuovo utente</h2>
        <p className="t-caption c-muted" style={{ margin: 0 }}>Comunica tu email e password alla persona: potrà entrare subito.</p>
        <label className="field"><span>Nome</span><input className="input" required value={nome} onChange={(e) => setNome(e.target.value)} /></label>
        <label className="field"><span>Email</span><input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="field"><span>Password (almeno 12 caratteri)</span>
          <input className="input" type="text" autoComplete="off" required minLength={12} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {f && <LimitFields f={f} set={setF} />}
        {err && <p className="error-text" role="alert" style={{ margin: 0 }}>{err}</p>}
        <div className="inline" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Annulla</button>
          <button className="btn btn-primary" disabled={!f}>Crea utente</button>
        </div>
      </form>
    </div>
  );
}

export function Utenti() {
  const utenti = useData(api.utenti);
  useLive(['utenti'], utenti.reload);
  const [tab, setTab] = useState<Tab>('tutti');
  const [sel, setSel] = useState<number | null>(null);
  const [nuovo, setNuovo] = useState(false);
  const all = utenti.data ?? [];
  useEffect(() => { if (sel === null && all.length) setSel(all[0]!.id); }, [all, sel]);
  const count = (s: string) => all.filter((u) => u.stato === s).length;
  const rows = all.filter((u) =>
    tab === 'tutti' ? true : tab === 'attivi' ? u.stato === 'active' : tab === 'bloccati' ? u.stato === 'blocked' : u.stato === 'suspended');

  return (
    <>
      <PageHeader
        title="Utenti"
        subtitle="Chi può accedere a FilmShare e quanta banda può usare. Quota e periodo valgono per upload e download insieme."
        actions={<button className="btn btn-primary" onClick={() => setNuovo(true)}>Nuovo utente</button>}
      />
      <div className="tabs" role="tablist">
        {([['tutti', `Tutti (${all.length})`], ['attivi', `Attivi (${count('active')})`], ['bloccati', `Bloccati (${count('blocked')})`], ['sospesi', `Sospesi (${count('suspended')})`]] as [Tab, string][])
          .map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={`tab${tab === k ? ' active' : ''}`} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <section className="card flush">
          <div className="card-head">
            <h2 className="t-heading">Persone</h2>
            <span className="t-caption c-muted">{all.length === 1 ? '1 utente' : `${all.length} utenti`}</span>
          </div>
          <table className="table">
            <thead><tr><th>Utente</th><th style={{ width: 150 }}>Uso nel periodo</th><th style={{ width: 120 }}>Ultimo accesso</th><th style={{ width: 150 }}>Stato</th></tr></thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id} className={`clickable${sel === u.id ? ' selected' : ''}`} onClick={() => setSel(u.id)}>
                  <td>
                    <div className="inline" style={{ gap: 10 }}>
                      <Avatar nome={u.nome} />
                      <div className="stack-sm" style={{ gap: 2, minWidth: 0 }}>
                        <span className="t-strong truncate">{u.nome}</span>
                        <span className="t-caption c-muted truncate">{u.email}</span>
                      </div>
                    </div>
                  </td>
                  <td><div className="stack-sm" style={{ gap: 6 }}><SimpleBar value={u.banda.used} max={u.banda.quota} /><span className="t-caption c-muted">{bytes(u.banda.used)} / {bytes(u.banda.quota)}</span></div></td>
                  <td className="t-caption c-muted">{fa(u.ultimoAccesso)}</td>
                  <td>{statoUtente(u.stato)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <div className="empty">Nessun utente in questa vista.</div>}
        </section>
        {sel !== null && <Dettaglio id={sel} onSaved={utenti.reload} />}
      </div>
      {nuovo && <NuovoUtente onClose={() => setNuovo(false)} onCreated={(id) => { setNuovo(false); setSel(id); utenti.reload(); }} />}
    </>
  );
}
