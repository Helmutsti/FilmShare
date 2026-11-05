import { useState } from 'react';
import { ArrowDown, ArrowUp, Info } from 'lucide-react';
import { api, type Richiesta } from '../api';
import { bytes, fa, quotaNome } from '../format';
import { useLive } from '../live';
import { useData } from '../useData';
import { Avatar, PageHeader, SimpleBar, statoBadge } from '../ui';
import { RigaElenco, useTelefono } from '../elenco';

type Tab = 'tutte' | 'upload' | 'download' | 'storico';

export function Approvazioni() {
  const [tab, setTab] = useState<Tab>('tutte');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const telefono = useTelefono();
  const [aperta, setAperta] = useState<number | null>(null);
  const riepilogo = useData(api.riepilogo);
  const attesa = useData(() => api.richieste('attesa'));
  const storico = useData(() => api.richieste('storico'), []);
  const reload = () => { riepilogo.reload(); attesa.reload(); storico.reload(); };
  useLive(['richieste', 'utenti'], reload);

  const pending = attesa.data ?? [];
  const rows: Richiesta[] =
    tab === 'storico' ? storico.data ?? [] : tab === 'tutte' ? pending : pending.filter((r) => r.tipo === tab);
  const withinLimits = pending.filter((r) => (r.impatto.percentuale ?? 0) <= 100).length;

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setMsg(null);
    try { await fn(); } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); reload(); }
  }

  const r = riepilogo.data;
  return (
    <>
      <PageHeader
        title="Approvazioni"
        subtitle="Decidi quali upload e download possono usare la banda del server. Ogni richiesta mostra come cambierebbe la quota dell'utente."
        actions={
          <button className="btn btn-primary" disabled={busy || withinLimits === 0} onClick={() => act(api.approvaEntroLimiti)}>
            Approva entro i limiti ({withinLimits})
          </button>
        }
      />
      <div className="row">
        <section className="card">
          <span className="t-label c-secondary">Richieste in attesa</span>
          <span className="t-metric">{r?.inAttesa ?? '—'}</span>
          <span className="t-caption c-muted">{r ? `${r.upload} upload · ${r.download} download${r.piuVecchia ? ` · la più vecchia: ${fa(r.piuVecchia)}` : ''}` : ''}</span>
        </section>
        <section className="card">
          <span className="t-label c-secondary">Volume richiesto</span>
          <span className="t-metric">{r ? bytes(r.volume) : '—'}</span>
          <span className="t-caption c-muted">in coda</span>
        </section>
        <section className="card">
          <span className="t-label c-secondary">Traffico server oggi</span>
          <span className="t-metric">{r ? bytes(r.trafficoOggi) : '—'}</span>
          <span className="t-caption c-muted">upload e download partiti oggi</span>
        </section>
      </div>

      <div className="tabs" role="tablist">
        {([
          ['tutte', `Tutte (${pending.length})`],
          ['upload', `Upload (${pending.filter((p) => p.tipo === 'upload').length})`],
          ['download', `Download (${pending.filter((p) => p.tipo === 'download').length})`],
          ['storico', 'Storico'],
        ] as [Tab, string][]).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={`tab${tab === k ? ' active' : ''}`} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>

      {msg && <p className="error-text" role="alert">{msg}</p>}

      <section className="card flush">
        {rows.length === 0 ? (
          <div className="empty">{tab === 'storico' ? 'Nessuna decisione ancora.' : 'Nessuna richiesta in attesa.'}</div>
        ) : telefono ? (
          // Telefono: elenco che si apre al posto della tabella
          rows.map((q) => {
            const p = q.impatto.percentuale ?? 0;
            const tone = p > 100 ? 'danger' : p >= 80 ? 'warn' : 'ok';
            const colore = tone === 'danger' ? 'c-danger' : tone === 'warn' ? 'c-warning' : 'c-success';
            const tipo = q.tipo === 'upload' ? '↑ Upload' : '↓ Download';
            return (
              <RigaElenco key={q.id} aperta={aperta === q.id} onToggle={() => setAperta(aperta === q.id ? null : q.id)}
                inizio={<Avatar nome={q.utente.nome} />} titolo={q.utente.nome} sotto={`${tipo} · ${q.nome}`}
                destra={tab === 'storico' ? statoBadge(q) : <span className={`t-label ${colore}`}>{p}%</span>}>
                <span className="t-caption c-secondary">{q.nome} · {bytes(q.dimensione)} · {fa(q.creato)}</span>
                <SimpleBar value={Math.min(p, 100)} max={100} tone={tone} />
                <span className={`t-caption ${colore}`}>{quotaNome[q.impatto.periodo]}: {p}%</span>
                {tab !== 'storico' && (
                  <div className="elenco-azioni">
                    <button className="btn btn-danger" disabled={busy} onClick={() => act(() => api.rifiuta(q.id))}>Rifiuta</button>
                    <button className="btn btn-success" disabled={busy} onClick={() => act(() => api.approva(q.id))}>Approva</button>
                  </div>
                )}
              </RigaElenco>
            );
          })
        ) : (
          <table className="table">
            <thead><tr><th>Richiedente</th><th style={{ width: 120 }}>Tipo</th><th>File</th><th style={{ width: 190 }}>Impatto sulla quota</th><th style={{ width: 100 }}>Richiesto</th><th style={{ width: 190 }}>{tab === 'storico' ? 'Esito' : 'Azioni'}</th></tr></thead>
            <tbody>
              {rows.map((q) => {
                const p = q.impatto.percentuale ?? 0;
                const tone = p > 100 ? 'danger' : p >= 80 ? 'warn' : 'ok';
                return (
                  <tr key={q.id}>
                    <td><span className="inline" style={{ gap: 10 }}><Avatar nome={q.utente.nome} />{q.utente.nome}</span></td>
                    <td>
                      <span className="badge badge-neutro" style={{ gap: 4 }}>
                        {q.tipo === 'upload' ? <ArrowUp size={12} /> : <ArrowDown size={12} />}{q.tipo === 'upload' ? 'Upload' : 'Download'}
                      </span>
                    </td>
                    <td><div className="stack-sm" style={{ gap: 2 }}><span className="t-strong">{q.nome}</span><span className="t-caption c-muted">{bytes(q.dimensione)}</span></div></td>
                    <td>
                      <div className="stack-sm" style={{ gap: 6 }}>
                        <SimpleBar value={Math.min(p, 100)} max={100} tone={tone} />
                        <span className={`t-caption ${tone === 'danger' ? 'c-danger' : tone === 'warn' ? 'c-warning' : 'c-success'}`}>{quotaNome[q.impatto.periodo]}: {p}%</span>
                      </div>
                    </td>
                    <td className="t-caption c-muted">{fa(q.creato)}</td>
                    <td>
                      {tab === 'storico' ? statoBadge(q) : (
                        <div className="inline">
                          <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => act(() => api.rifiuta(q.id))}>Rifiuta</button>
                          <button className="btn btn-success btn-sm" disabled={busy} onClick={() => act(() => api.approva(q.id))}>Approva</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
      <p className="inline t-caption c-muted" style={{ margin: 0 }}>
        <Info size={16} /> Ogni utente ha una quota che somma upload e download nel suo periodo. Finché resta nella quota tutto parte subito; qui arrivano solo le richieste oltre la quota. Approvarle non cambia la quota dell'utente.
      </p>
    </>
  );
}
