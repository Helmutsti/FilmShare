import { useMemo, useState } from 'react';
import { AlertCircle, Folder, Info, Search } from 'lucide-react';
import { api, type Approval, type FileCondiviso } from '../api';
import { bytes, dataBreve, fa, periodoQuesto } from '../format';
import { useLive } from '../live';
import { useSession } from '../session';
import { useData } from '../useData';
import { Avatar, Badge, FileIcon, PageHeader } from '../ui';

function DownloadCell({ f, onChange, remaining, soglia, approval }: {
  f: FileCondiviso; onChange: () => void; remaining: number; soglia: number; approval: Approval;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const d = f.download;

  async function ask() {
    setBusy(true);
    setErr(null);
    try {
      const t = await api.scarica(f.id);
      if (t.link) window.location.href = t.link; // il browser scarica; la pagina resta
      onChange();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (d?.stato === 'pending') return <><Badge tone="attesa">Richiesta inviata</Badge><div className="t-caption c-muted">In attesa dell'amministratore</div></>;
  if (d?.stato === 'completed' && d.link) {
    return <><a className="btn btn-secondary btn-sm" href={d.link}>Scarica di nuovo</a><div className="t-caption c-muted">Link valido fino al {dataBreve(d.linkScade!)}</div></>;
  }
  if (d?.stato === 'approved' && d.link) {
    return <><a className="btn btn-primary btn-sm" href={d.link}>Scarica</a><div className="t-caption c-muted">Approvato · link valido fino al {dataBreve(d.linkScade!)}</div></>;
  }
  const overQuota = f.dimensione > remaining;
  const overThreshold = approval === 'always' || (approval === 'over_threshold' && f.dimensione > soglia);
  const needsApproval = overQuota || overThreshold;
  return (
    <>
      <button className={`btn btn-sm ${needsApproval ? 'btn-secondary' : 'btn-primary'}`} disabled={busy} onClick={ask}>
        {needsApproval ? 'Richiedi download' : 'Scarica'}
      </button>
      <div className={`t-caption ${err ? 'c-danger' : 'c-muted'}`}>
        {err ?? (overQuota ? `Oltre la banda rimasta (${bytes(remaining)})`
          : approval === 'always' ? 'Serve approvazione'
          : needsApproval ? `Oltre ${bytes(soglia)} serve approvazione` : 'Parte subito')}
      </div>
    </>
  );
}

export function Condivisi() {
  const { io } = useSession();
  const files = useData(api.file);
  useLive(['file', 'trasferimenti', 'banda'], files.reload);
  const [q, setQ] = useState('');
  const list = useMemo(
    () => (files.data?.file ?? []).filter((f) => f.nome.toLowerCase().includes(q.trim().toLowerCase())),
    [files.data, q],
  );
  if (!io) return null;
  const banda = files.data?.banda ?? io.banda;
  const usedPct = banda.quota > 0 ? Math.round((banda.used / banda.quota) * 100) : 0;
  const total = (files.data?.file ?? []).reduce((s, f) => s + f.dimensione, 0);

  return (
    <>
      <PageHeader
        title="Cartella condivisa"
        subtitle="È l'unica cartella del server da cui puoi scaricare. I file molto pesanti possono richiedere l'approvazione dell'amministratore."
        actions={
          <label className="inline" style={{ position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: 12, color: 'var(--text-muted)' }} aria-hidden />
            <input className="input" style={{ width: 280, paddingLeft: 36 }} placeholder="Cerca nella cartella…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cerca nella cartella" />
          </label>
        }
      />
      <div className="between">
        <span className="inline t-label c-secondary"><Folder size={16} /> server / <strong style={{ color: 'var(--text-primary)' }}>condivisi</strong></span>
        <span className="t-caption c-muted">{files.data?.file.length ?? 0} file · {bytes(total)}</span>
      </div>

      {usedPct >= 50 && (
        <div className="banner banner-warning">
          <AlertCircle size={20} color="var(--status-warning)" />
          <div className="grow">
            <div className="t-strong">Hai usato il {usedPct}% della tua banda {periodoQuesto[banda.period].replace('di ', '')} ({bytes(banda.used)} di {bytes(banda.quota)})</div>
            <div className="t-caption c-secondary">
              Upload e download contano insieme. Si azzera {new Date(banda.resetAt).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}.
              {' '}I file sopra {bytes(files.data?.sogliaApprovazione ?? 0)} richiedono approvazione.
            </div>
          </div>
        </div>
      )}

      <section className="card flush">
        {files.error && <div className="empty c-danger">{files.error}</div>}
        {!files.error && list.length === 0 && <div className="empty">{files.data ? 'Nessun file nella cartella condivisa.' : 'Carico…'}</div>}
        {list.length > 0 && (
          <table className="table">
            <thead><tr><th>Nome</th><th style={{ width: 110 }}>Dimensione</th><th style={{ width: 170 }}>Caricato da</th><th style={{ width: 110 }}>Aggiunto</th><th style={{ width: 230 }}>Download</th></tr></thead>
            <tbody>
              {list.map((f) => (
                <tr key={f.id}>
                  <td>
                    <div className="inline" style={{ gap: 12 }}>
                      <FileIcon />
                      <div className="stack-sm" style={{ gap: 2, minWidth: 0 }}>
                        <span className="t-strong truncate">{f.nome}</span>
                        {f.percorso !== f.nome && <span className="t-caption c-muted truncate">{f.percorso}</span>}
                      </div>
                    </div>
                  </td>
                  <td>{bytes(f.dimensione)}</td>
                  <td>{f.caricatoDa ? <span className="inline"><Avatar nome={f.caricatoDa} />{f.caricatoDa}</span> : <span className="c-muted">Sul NAS</span>}</td>
                  <td title={fa(f.aggiunto)}>{dataBreve(f.aggiunto)}</td>
                  <td><div className="stack-sm" style={{ gap: 6, alignItems: 'flex-start' }}><DownloadCell f={f} onChange={files.reload} remaining={banda.remaining} soglia={files.data!.sogliaApprovazione} approval={io.limiti.approval} /></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <p className="inline t-caption c-muted" style={{ margin: 0 }}>
        <Info size={16} /> I link di download scadono dopo un tempo stabilito dall'amministratore · se la connessione cade il download riprende da dove si era fermato
      </p>
    </>
  );
}
