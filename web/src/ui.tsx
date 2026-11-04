import { useState, type ReactNode } from 'react';
import { Film } from 'lucide-react';
import type { Banda, Trasferimento } from './api';
import { bytes, dataLunga, iniziali, ora, percent, periodoQuesto } from './format';

export function Badge({ tone, children }: { tone: 'attesa' | 'corso' | 'ok' | 'no' | 'neutro'; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function statoBadge(t: Pick<Trasferimento, 'stato' | 'tipo'>) {
  switch (t.stato) {
    case 'pending': return <Badge tone="attesa">In attesa di approvazione</Badge>;
    case 'approved': return <Badge tone="corso">{t.tipo === 'download' ? 'Pronto' : 'Approvato'}</Badge>;
    case 'in_progress': return <Badge tone="corso">In corso</Badge>;
    case 'completed': return <Badge tone="ok">{t.tipo === 'download' ? 'Già scaricato' : 'Completato'}</Badge>;
    case 'rejected': return <Badge tone="no">Rifiutato</Badge>;
    case 'cancelled': return <Badge tone="neutro">Annullato</Badge>;
    case 'expired': return <Badge tone="neutro">Scaduto</Badge>;
  }
}

export const motivoTesto: Record<string, string> = {
  over_quota: 'oltre la banda rimasta',
};

export function Avatar({ nome, large }: { nome: string; large?: boolean }) {
  return <span className={`avatar${large ? ' lg' : ''}`} aria-hidden>{iniziali(nome)}</span>;
}

export function FileIcon() {
  return <span className="file-icon" aria-hidden><Film size={16} /></span>;
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className="toggle" disabled={disabled}
      style={disabled ? { opacity: 0.5, cursor: 'not-allowed' } : undefined} onClick={() => onChange(!checked)} />
  );
}

/** Barra della banda: upload, download, in corso (a righe), con la legenda. */
export function BandBar({ banda, legenda = true, restano = true }: { banda: Banda; legenda?: boolean; restano?: boolean }) {
  return (
    <div className="stack-sm" style={{ gap: 10 }}>
      <div className="progress" role="img" aria-label={`Usati ${bytes(banda.used)} di ${bytes(banda.quota)}`}>
        <span className="seg-upload" style={{ width: `${percent(banda.upload, banda.quota)}%` }} />
        <span className="seg-download" style={{ width: `${percent(banda.download, banda.quota)}%` }} />
        <span className="seg-corso" style={{ width: `${percent(banda.inProgress, banda.quota)}%` }} />
      </div>
      {legenda && (
        <div className="between t-caption c-muted">
          <div className="inline" style={{ gap: 16 }}>
            <span className="inline" style={{ gap: 6 }}><i className="dot seg-upload" />Upload {bytes(banda.upload)}</span>
            <span className="inline" style={{ gap: 6 }}><i className="dot seg-download" />Download {bytes(banda.download)}</span>
            {banda.inProgress > 0 && (
              <span className="inline" style={{ gap: 6 }}><i className="dot" style={{ background: 'var(--tint-primary-50)' }} />In corso {bytes(banda.inProgress)}</span>
            )}
          </div>
          {restano && <span className="t-label c-secondary">Restano {bytes(banda.remaining)}</span>}
        </div>
      )}
    </div>
  );
}

export function BandCard({ banda }: { banda: Banda }) {
  return (
    <section className="card" aria-label="Banda rimasta">
      <div className="between">
        <span className="t-label c-secondary">Banda {periodoQuesto[banda.period]}</span>
        <span className="t-caption c-muted">
          Upload e download insieme · si azzera {dataLunga(banda.resetAt)} alle {ora(banda.resetAt)}
        </span>
      </div>
      <div className="inline" style={{ alignItems: 'baseline', gap: 6 }}>
        <span className="t-metric">{bytes(banda.used)}</span>
        <span className="t-body c-muted">di {bytes(banda.quota)}</span>
      </div>
      <BandBar banda={banda} />
    </section>
  );
}

export function SimpleBar({ value, max, tone }: { value: number; max: number; tone?: 'ok' | 'warn' | 'danger' | 'info' | 'accent' }) {
  const p = percent(value, max);
  const color = tone ?? (p >= 100 ? 'danger' : p >= 80 ? 'warn' : 'ok');
  const bg = { ok: 'var(--status-success)', warn: 'var(--status-warning)', danger: 'var(--status-danger)', info: 'var(--status-info)', accent: 'var(--accent-primary)' }[color];
  return (
    <div className="progress" style={{ width: '100%' }}>
      <span style={{ width: `${Math.max(p, value > 0 ? 2 : 0)}%`, background: bg }} />
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        <h1 className="t-display">{title}</h1>
        {subtitle && <p className="t-body c-secondary" style={{ margin: 0 }}>{subtitle}</p>}
      </div>
      {actions && <div className="inline" style={{ gap: 12 }}>{actions}</div>}
    </header>
  );
}

/**
 * Pulsante "Svuota storico" con finestra di conferma: nasconde i trasferimenti finiti.
 * Quelli in attesa o in corso restano; la quota del periodo non cambia.
 */
export function SvuotaStorico({ di, onDone, onSvuota }: { di?: string; onDone: () => void; onSvuota: () => Promise<unknown> }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function conferma() {
    setBusy(true);
    setErr(null);
    try {
      await onSvuota();
      setOpen(false);
      onDone();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>Svuota storico</button>
      {open && (
        <div className="modal-back" onClick={() => !busy && setOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true" aria-label="Svuota storico" onClick={(e) => e.stopPropagation()}>
            <h2 className="t-title">Svuotare lo storico{di ? ` di ${di}` : ''}?</h2>
            <p className="t-body c-secondary" style={{ margin: 0 }}>
              Spariscono dall'elenco i trasferimenti finiti (completati, rifiutati, annullati, scaduti).
              Quelli in attesa o in corso restano. La banda già usata non cambia.
            </p>
            {err && <p className="error-text" role="alert" style={{ margin: 0 }}>{err}</p>}
            <div className="inline" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setOpen(false)}>Annulla</button>
              <button type="button" className="btn btn-danger" disabled={busy} onClick={conferma}>Svuota storico</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
