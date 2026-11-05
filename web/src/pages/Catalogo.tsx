import { useRef, useState } from 'react';
import { FileArchive, Info, Upload } from 'lucide-react';
import { api } from '../api';
import { fa } from '../format';
import { useData } from '../useData';
import { PageHeader } from '../ui';

const dataOra = (iso: string) => new Date(iso).toLocaleString('it-IT', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function Catalogo() {
  const data = useData(api.catalogo);
  const input = useRef<HTMLInputElement>(null);
  const [stato, setStato] = useState<{ testo: string; tono: 'muted' | 'success' | 'danger' } | null>(null);

  async function carica(file: File) {
    setStato({ testo: `Carico ${file.name}…`, tono: 'muted' });
    try {
      const r = await api.caricaCatalogo(file);
      setStato({ testo: `Catalogo caricato: ${r.film} film, ${r.serie} serie, ${r.episodi} episodi`, tono: 'success' });
      data.reload();
    } catch (e) {
      setStato({ testo: (e as Error).message, tono: 'danger' });
    } finally {
      if (input.current) input.current.value = '';
    }
  }

  const c = data.data;
  const info = c?.info;
  return (
    <>
      <PageHeader
        title="Catalogo"
        subtitle="Copertine, titoli e trame dell'Archivio vengono dal catalogo esportato da Jellyfin. Carica lo zip: sostituisce il catalogo precedente."
        actions={<>
          {stato && <span className={`t-caption c-${stato.tono}`} role="status">{stato.testo}</span>}
          <input ref={input} type="file" accept=".zip,application/zip" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void carica(f); }} />
          <button className="btn btn-primary" onClick={() => input.current?.click()} disabled={stato?.tono === 'muted'}><Upload size={16} /> Carica zip</button>
        </>}
      />

      {data.error && <div className="banner banner-danger"><div className="grow t-caption">{data.error}</div></div>}

      <div className="row">
        <section className="card">
          <span className="t-label c-secondary">Catalogo attuale</span>
          {!c ? <span className="t-body c-muted">Carico…</span> : !info ? (
            <span className="t-body c-muted">Nessun catalogo caricato: l'Archivio mostra i file senza copertine.</span>
          ) : (
            <>
              <span className="t-metric">{info.film} film · {info.serie} serie</span>
              <span className="t-body c-secondary">{info.episodi} episodi · {info.copertine} copertine</span>
              <span className="t-caption c-muted">
                {info.origine ?? 'Jellyfin'}{info.generato && <> · esportato il {dataOra(info.generato)}</>} · caricato {fa(info.caricato)}
              </span>
            </>
          )}
        </section>
        <section className="card">
          <span className="t-label c-secondary">File del NAS riconosciuti</span>
          {c && (
            <>
              <span className="t-metric">{c.fileAbbinati} di {c.fileSulNas}</span>
              <span className="t-body c-secondary">
                {c.fileSulNas - c.fileAbbinati === 0 ? 'Tutti i file hanno una scheda.' : `${c.fileSulNas - c.fileAbbinati} file senza scheda: compaiono con un riquadro neutro.`}
              </span>
              {c.titoliSenzaFile > 0 && (
                <span className="t-caption c-muted">
                  {c.titoliSenzaFile === 1 ? '1 titolo del catalogo non ha file' : `${c.titoliSenzaFile} titoli del catalogo non hanno file`} nelle cartelle visibili e {c.titoliSenzaFile === 1 ? 'non compare' : 'non compaiono'} nell'Archivio.
                </span>
              )}
            </>
          )}
        </section>
      </div>

      {c && c.esempiNonAbbinati.length > 0 && info && (
        <section className="card flush">
          <div className="card-head"><span className="t-heading">File senza scheda</span>
            <span className="t-caption c-muted">{c.fileSulNas - c.fileAbbinati > c.esempiNonAbbinati.length ? `i primi ${c.esempiNonAbbinati.length}` : ''}</span>
          </div>
          {c.esempiNonAbbinati.map((p) => (
            <div key={p} className="episodio">
              <FileArchive size={16} color="var(--text-muted)" aria-hidden />
              <span className="grow t-body truncate" title={p}>{p}</span>
            </div>
          ))}
        </section>
      )}

      <section className="card">
        <span className="t-heading">Come si crea lo zip</span>
        <p className="t-body c-secondary" style={{ margin: 0 }}>
          Nella cartella <strong>strumenti</strong> del progetto ci sono due script che leggono il catalogo da Jellyfin (solo lettura) e
          creano <strong>catalogo-jellyfin.zip</strong>. Serve una chiave API di Jellyfin: Dashboard → Chiavi API → "+".
        </p>
        <div className="stack-sm" style={{ gap: 8 }}>
          <span className="t-label">Mac (Terminale)</span>
          <code className="t-caption" style={{ background: 'var(--bg-elevated)', padding: '8px 12px', borderRadius: 8 }}>bash esporta-catalogo-jellyfin.sh http://indirizzo-jellyfin:8096</code>
          <span className="t-label">Windows (PowerShell)</span>
          <code className="t-caption" style={{ background: 'var(--bg-elevated)', padding: '8px 12px', borderRadius: 8 }}>.\esporta-catalogo-jellyfin.ps1 -Server http://indirizzo-jellyfin:8096</code>
        </div>
      </section>
      <p className="inline t-caption c-muted" style={{ margin: 0 }}>
        <Info size={16} /> I file si riconoscono dal nome e dalle cartelle che li contengono, quindi Jellyfin e FilmShare possono vedere il NAS da percorsi diversi.
        I file aggiunti dopo trovano la loro scheda al prossimo catalogo.
      </p>
    </>
  );
}
