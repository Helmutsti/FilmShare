import { useEffect, useState } from 'react';
import { api, type Period, type Regole as R } from '../api';
import { GB } from '../format';
import { useData } from '../useData';
import { PageHeader, Toggle } from '../ui';

// I campi mostrano GB e Mbps; il server lavora in byte e kbps.
type Form = {
  quotaGb: string; period: Period; speedMbps: string; concurrent: string;
  serverMbps: string; serverConcurrent: string; nightOn: boolean; nightStart: string; nightEnd: string;
  linkHours: string; upGb: string; downGb: string;
  block: boolean; slow: boolean; approval: boolean; suspend: boolean;
};

const toForm = (r: R): Form => ({
  quotaGb: String(Math.round(r.default_quota_bytes / GB)), period: r.default_period,
  speedMbps: String(r.default_max_speed_kbps / 1000), concurrent: String(r.default_max_concurrent),
  serverMbps: String(r.server_max_speed_kbps / 1000), serverConcurrent: String(r.server_max_concurrent),
  nightOn: !!r.night_window, nightStart: r.night_window?.start ?? '00:00', nightEnd: r.night_window?.end ?? '07:00',
  linkHours: String(r.download_link_hours),
  upGb: String(Math.round(r.upload_approval_threshold / GB)), downGb: String(Math.round(r.download_approval_threshold / GB)),
  block: r.block_on_quota_exhausted, slow: r.slowdown_over_80, approval: r.require_approval_over_threshold, suspend: r.suspend_after_3_overruns,
});

const int = (s: string) => Math.max(0, Math.round(Number(s.replace(',', '.')) || 0));

const fromForm = (f: Form): Partial<R> => ({
  default_quota_bytes: int(f.quotaGb) * GB, default_period: f.period,
  default_max_speed_kbps: Math.max(1, Math.round(Number(f.speedMbps.replace(',', '.')) * 1000)),
  default_max_concurrent: Math.max(1, int(f.concurrent)),
  server_max_speed_kbps: Math.max(1, Math.round(Number(f.serverMbps.replace(',', '.')) * 1000)),
  server_max_concurrent: Math.max(1, int(f.serverConcurrent)),
  night_window: f.nightOn ? { start: f.nightStart, end: f.nightEnd } : null,
  download_link_hours: Math.max(1, int(f.linkHours)),
  upload_approval_threshold: int(f.upGb) * GB, download_approval_threshold: int(f.downGb) * GB,
  block_on_quota_exhausted: f.block, slowdown_over_80: f.slow, require_approval_over_threshold: f.approval, suspend_after_3_overruns: f.suspend,
});

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

export function Regole() {
  const regole = useData(api.regole);
  const [form, setForm] = useState<Form | null>(null);
  const [stato, setStato] = useState<string | null>(null);
  useEffect(() => { if (regole.data) setForm(toForm(regole.data)); }, [regole.data]);
  if (!form) return <PageHeader title="Regole di banda" subtitle="Carico…" />;

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm({ ...form, [k]: v });
  const input = (k: keyof Form, suffix?: string) => (
    <div style={{ position: 'relative' }}>
      <input className="input" inputMode="decimal" value={form[k] as string} onChange={(e) => set(k, e.target.value as never)} style={suffix ? { paddingRight: 56 } : undefined} />
      {suffix && <span className="t-body c-muted" style={{ position: 'absolute', right: 12, top: 11 }}>{suffix}</span>}
    </div>
  );

  async function save() {
    setStato('Salvo…');
    try {
      regole.setData(await api.salvaRegole(fromForm(form!)));
      setStato('Salvato');
    } catch (e) {
      setStato((e as Error).message);
    }
  }

  const rules: [keyof Form, string, string][] = [
    ['block', 'Blocca upload e download a quota esaurita', "Riprendono all'inizio del nuovo periodo dell'utente"],
    ['slow', "Rallenta a 10 Mbps oltre l'80% della quota", "L'utente riceve un avviso prima del blocco"],
    ['approval', 'Richiedi approvazione oltre soglia', 'Sotto soglia la pubblicazione è automatica'],
    ['suspend', 'Sospendi dopo 3 sforamenti in 30 giorni', 'Serve una riattivazione manuale'],
  ];

  return (
    <>
      <PageHeader
        title="Regole di banda"
        subtitle="Regole che valgono per tutti. La quota e il periodo di ogni persona si cambiano nella pagina Utenti."
        actions={<>
          {stato && <span className="t-caption c-muted" role="status">{stato}</span>}
          <button className="btn btn-ghost" onClick={() => { setForm(toForm(regole.data!)); setStato(null); }}>Annulla</button>
          <button className="btn btn-primary" onClick={save}>Salva modifiche</button>
        </>}
      />
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <section className="card" style={{ flex: 1.5, gap: 16 }}>
          <div className="stack-sm">
            <h2 className="t-heading">Limiti globali</h2>
            <span className="t-caption c-muted">La quota predefinita si applica ai nuovi utenti; i limiti del server valgono per tutti.</span>
          </div>
          <div className="row" style={{ gap: 12 }}>
            <Field label="Quota predefinita (upload + download)">{input('quotaGb', 'GB')}</Field>
            <Field label="Periodo predefinito">
              <select className="input" value={form.period} onChange={(e) => set('period', e.target.value as Period)}>
                <option value="day">Giorno · dalle 00:00</option>
                <option value="week">Settimana · da lunedì</option>
                <option value="month">Mese · dal giorno 1</option>
              </select>
            </Field>
          </div>
          <div className="row" style={{ gap: 12 }}>
            <Field label="Velocità predefinita per utente">{input('speedMbps', 'Mbps')}</Field>
            <Field label="Trasferimenti simultanei per utente">{input('concurrent')}</Field>
          </div>
          <div className="row" style={{ gap: 12 }}>
            <Field label="Banda massima del server">{input('serverMbps', 'Mbps')}</Field>
            <Field label="Trasferimenti simultanei (totale)">{input('serverConcurrent')}</Field>
          </div>
          <div className="row" style={{ gap: 12 }}>
            <Field label="Fascia notturna senza limiti di velocità">
              <div className="inline">
                <Toggle checked={form.nightOn} onChange={(v) => set('nightOn', v)} label="Fascia notturna attiva" />
                <input className="input" type="time" value={form.nightStart} disabled={!form.nightOn} onChange={(e) => set('nightStart', e.target.value)} />
                <span className="c-muted">–</span>
                <input className="input" type="time" value={form.nightEnd} disabled={!form.nightOn} onChange={(e) => set('nightEnd', e.target.value)} />
              </div>
            </Field>
            <Field label="Scadenza link di download">{input('linkHours', 'ore')}</Field>
          </div>
          <div className="row" style={{ gap: 12 }}>
            <Field label="Soglia approvazione upload">{input('upGb', 'GB')}</Field>
            <Field label="Soglia approvazione download">{input('downGb', 'GB')}</Field>
          </div>
        </section>
        <section className="card" style={{ flex: 1, gap: 4 }}>
          <div className="stack-sm" style={{ paddingBottom: 12 }}>
            <h2 className="t-heading">Blocchi automatici</h2>
            <span className="t-caption c-muted">Cosa succede quando un utente consuma troppa banda.</span>
          </div>
          {rules.map(([k, title, sub]) => (
            <div key={k} className="between" style={{ padding: '10px 0', borderTop: '1px solid var(--border-default)' }}>
              <div className="stack-sm" style={{ gap: 2 }}>
                <span className="t-label">{title}</span>
                <span className="t-caption c-muted">{sub}</span>
              </div>
              <Toggle checked={form[k] as boolean} onChange={(v) => set(k, v as never)} label={title} />
            </div>
          ))}
        </section>
      </div>
    </>
  );
}
