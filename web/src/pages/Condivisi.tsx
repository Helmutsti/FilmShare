import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Film, Info, Search, X } from 'lucide-react';
import { api, type DettaglioTitolo, type FileCondiviso, type Titolo } from '../api';
import { bytes, dataBreve, periodoQuesto } from '../format';
import { useLive } from '../live';
import { useSession } from '../session';
import { useData } from '../useData';
import { Badge, PageHeader } from '../ui';

const unisci = (...parti: (string | number | null | undefined | false)[]) => parti.filter((p) => p !== null && p !== undefined && p !== false && p !== '').join(' · ');

function DownloadCell({ f, onChange, remaining }: { f: FileCondiviso; onChange: () => void; remaining: number }) {
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
  return (
    <>
      <button className={`btn btn-sm ${overQuota ? 'btn-secondary' : 'btn-primary'}`} disabled={busy} onClick={ask}>
        {overQuota ? 'Richiedi download' : 'Scarica'}
      </button>
      <div className={`t-caption ${err ? 'c-danger' : 'c-muted'}`}>
        {err ?? (overQuota ? `Oltre la banda rimasta (${bytes(remaining)}): serve approvazione` : 'Parte subito')}
      </div>
    </>
  );
}

/** Copertina; se manca, un riquadro neutro con il nome. */
function Poster({ src, nome, anno, tag }: { src: string | null; nome: string; anno?: number | null; tag?: string }) {
  const [rotta, setRotta] = useState(false);
  return (
    <div className="poster">
      {src && !rotta ? <img src={src} alt="" loading="lazy" onError={() => setRotta(true)} /> : (
        <div className="poster-vuoto">
          <Film size={28} strokeWidth={1.6} aria-hidden />
          <strong>{nome}</strong>
          {anno ? <span className="t-caption c-muted">{anno}</span> : null}
        </div>
      )}
      {tag && <span className="poster-tag">{tag}</span>}
    </div>
  );
}

const nomeFile = (p: string) => p.split('/').pop() ?? p;
const stagioniTesto = (n: number) => (n === 1 ? '1 stagione' : `${n} stagioni`);

function FileRiga({ f, num, titolo, sotto, remaining, onChange }: {
  f: FileCondiviso; num?: number | null; titolo: string; sotto: string; remaining: number; onChange: () => void;
}) {
  return (
    <div className="episodio">
      {num !== undefined ? <span className="episodio-num">{num ?? '–'}</span> : <span className="file-icon" aria-hidden><Film size={16} /></span>}
      <div className="grow">
        <div className="t-strong">{titolo}</div>
        <div className="t-caption c-muted truncate" title={f.percorso}>{sotto}</div>
      </div>
      <div className="episodio-azioni"><DownloadCell f={f} onChange={onChange} remaining={remaining} /></div>
    </div>
  );
}

/** Scheda di un titolo (film o serie) o di un file che il catalogo non conosce. */
function Scheda({ voce, remaining, onClose, onChange }: {
  voce: { titoloId: number } | { file: FileCondiviso }; remaining: number; onClose: () => void; onChange: () => void;
}) {
  const titoloId = 'titoloId' in voce ? voce.titoloId : null;
  const [t, setT] = useState<DettaglioTitolo | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [stagione, setStagione] = useState<number | null>(null);
  const chiudi = useRef<HTMLButtonElement>(null);

  const carica = () => {
    if (titoloId === null) return;
    api.titolo(titoloId).then((d) => { setT(d); setErr(null); }).catch((e: Error) => setErr(e.message));
  };
  useEffect(carica, [titoloId]);
  useLive(['file', 'trasferimenti', 'banda'], carica);
  useEffect(() => { if (t && stagione === null) setStagione(t.elencoStagioni[0]?.numero ?? null); }, [t, stagione]);
  useEffect(() => {
    chiudi.current?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);
  const aggiorna = () => { carica(); onChange(); };

  let contenuto;
  if ('file' in voce) {
    const f = voce.file;
    contenuto = (
      <>
        <div className="scheda-testa">
          <Poster src={null} nome={f.nome} />
          <div className="stack">
            <div className="stack-sm">
              <h2 className="t-title" style={{ overflowWrap: 'anywhere' }}>{f.nome}</h2>
              <span className="t-label c-secondary">{unisci('File', bytes(f.dimensione))}</span>
            </div>
            <p className="scheda-trama">Questo file non è nel catalogo di Jellyfin: niente copertina né trama, ma si scarica come gli altri.</p>
          </div>
        </div>
        <div className="scheda-corpo">
          <div className="episodi">
            <FileRiga f={f} titolo={f.nome} sotto={unisci(f.percorso, bytes(f.dimensione))} remaining={remaining} onChange={onChange} />
          </div>
        </div>
      </>
    );
  } else if (!t) {
    contenuto = <div className="empty">{err ?? 'Carico…'}</div>;
  } else {
    const serie = t.tipo === 'serie';
    const st = t.elencoStagioni.find((s) => s.numero === stagione);
    // Gli episodi della stagione scelta; se la serie non ha stagioni (stagione null), quelli senza stagione.
    const elenco = serie ? t.elencoFile.filter((f) => f.stagione === stagione) : t.elencoFile;
    const senzaStagione = serie && stagione !== null ? t.elencoFile.filter((f) => f.stagione === null) : [];
    const sub = serie
      ? unisci('Serie TV', t.generi.slice(0, 2).join(', '), t.anno && `dal ${t.anno}`, t.stagioni > 0 && stagioniTesto(t.stagioni), `${t.file} episodi`, bytes(t.dimensione))
      : unisci('Film', t.generi.slice(0, 2).join(', '), t.anno, bytes(t.dimensione));
    contenuto = (
      <>
        <div className="scheda-testa">
          <Poster src={(serie && st?.copertina) || t.copertina} nome={t.titolo} anno={t.anno} />
          <div className="stack">
            <div className="stack-sm">
              <h2 className="t-title">{t.titolo}</h2>
              {t.titoloOriginale && t.titoloOriginale !== t.titolo && <span className="t-caption c-muted">{t.titoloOriginale}</span>}
              <span className="t-label c-secondary">{sub}</span>
            </div>
            <p className="scheda-trama">{t.trama ?? 'Nessuna trama nel catalogo.'}</p>
          </div>
        </div>
        <div className="scheda-corpo">
          {serie && t.elencoStagioni.length > 1 && (
            <div className="tabs" role="tablist" aria-label="Stagioni">
              {t.elencoStagioni.map((s) => (
                <button key={s.numero} role="tab" aria-selected={s.numero === stagione} className={`tab${s.numero === stagione ? ' active' : ''}`}
                  onClick={() => setStagione(s.numero)}>Stagione {s.numero}</button>
              ))}
            </div>
          )}
          {serie && t.elencoStagioni.length === 1 && <span className="t-heading">Stagione {t.elencoStagioni[0]!.numero}</span>}
          <div className="episodi">
            {elenco.map((f) => serie ? (
              <FileRiga key={f.id} f={f} num={f.episodio} remaining={remaining} onChange={aggiorna}
                titolo={unisci(f.episodio !== null && `Episodio ${f.episodio}`, f.titoloEpisodio) || nomeFile(f.percorso)}
                sotto={unisci(nomeFile(f.percorso), bytes(f.dimensione))} />
            ) : (
              <FileRiga key={f.id} f={f} remaining={remaining} onChange={aggiorna} titolo={nomeFile(f.percorso)} sotto={unisci(f.percorso, bytes(f.dimensione))} />
            ))}
          </div>
          {senzaStagione.length > 0 && (
            <>
              <span className="t-heading">Altri file della serie</span>
              <div className="episodi">
                {senzaStagione.map((f) => (
                  <FileRiga key={f.id} f={f} num={null} remaining={remaining} onChange={aggiorna}
                    titolo={f.titoloEpisodio ?? nomeFile(f.percorso)} sotto={unisci(nomeFile(f.percorso), bytes(f.dimensione))} />
                ))}
              </div>
            </>
          )}
        </div>
      </>
    );
  }

  const etichetta = 'file' in voce ? voce.file.nome : t?.titolo ?? 'Scheda';
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal scheda" role="dialog" aria-modal="true" aria-label={etichetta} onClick={(e) => e.stopPropagation()}>
        <button ref={chiudi} className="btn btn-ghost btn-sm btn-icon scheda-chiudi" onClick={onClose} aria-label="Chiudi" title="Chiudi"><X size={16} /></button>
        {contenuto}
      </div>
    </div>
  );
}

type Filtro = 'tutti' | 'film' | 'serie' | 'altri';

export function Condivisi() {
  const { io } = useSession();
  const arch = useData(api.archivio);
  useLive(['file', 'trasferimenti', 'banda'], arch.reload);
  const [q, setQ] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('tutti');
  const [aperta, setAperta] = useState<{ titoloId: number } | { file: FileCondiviso } | null>(null);

  const cerca = q.trim().toLowerCase();
  const titoli = useMemo(
    () => (arch.data?.titoli ?? []).filter((t) => (filtro === 'tutti' || t.tipo === filtro) && t.titolo.toLowerCase().includes(cerca)),
    [arch.data, filtro, cerca],
  );
  const altri = useMemo(
    () => (filtro === 'tutti' || filtro === 'altri' ? (arch.data?.altri ?? []).filter((f) => f.nome.toLowerCase().includes(cerca)) : []),
    [arch.data, filtro, cerca],
  );
  const chiudiScheda = useMemo(() => () => setAperta(null), []);
  if (!io) return null;
  const banda = arch.data?.banda ?? io.banda;
  const usedPct = banda.quota > 0 ? Math.round((banda.used / banda.quota) * 100) : 0;
  const totale = titoli.reduce((s, t) => s + t.dimensione, 0) + altri.reduce((s, f) => s + f.dimensione, 0);
  const nAltri = arch.data?.altri.length ?? 0;
  const schede: { id: Filtro; nome: string }[] = [
    { id: 'tutti', nome: 'Tutti' }, { id: 'film', nome: 'Film' }, { id: 'serie', nome: 'Serie TV' },
    ...(nAltri > 0 && (arch.data?.titoli.length ?? 0) > 0 ? [{ id: 'altri' as const, nome: 'Altri file' }] : []),
  ];

  return (
    <>
      <PageHeader
        title="Archivio"
        subtitle="Scegli un film o una serie per vedere i file e scaricarli. Se un file supera la banda che ti resta, serve l'approvazione dell'amministratore."
        actions={
          <label className="inline cerca" style={{ position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: 12, color: 'var(--text-muted)' }} aria-hidden />
            <input className="input" style={{ paddingLeft: 36 }} placeholder="Cerca un titolo…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cerca un titolo" />
          </label>
        }
      />

      {usedPct >= 50 && (
        <div className="banner banner-warning">
          <AlertCircle size={20} color="var(--status-warning)" />
          <div className="grow">
            <div className="t-strong">Hai usato il {usedPct}% della tua banda {periodoQuesto[banda.period].replace('di ', '')} ({bytes(banda.used)} di {bytes(banda.quota)})</div>
            <div className="t-caption c-secondary">
              Upload e download contano insieme. Si azzera {new Date(banda.resetAt).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}.
              {' '}Oltre la banda rimasta serve l'approvazione dell'amministratore.
            </div>
          </div>
        </div>
      )}

      <div className="archivio-filtri">
        <div className="tabs" role="tablist" aria-label="Tipo">
          {schede.map((s) => (
            <button key={s.id} role="tab" aria-selected={filtro === s.id} className={`tab${filtro === s.id ? ' active' : ''}`} onClick={() => setFiltro(s.id)}>{s.nome}</button>
          ))}
        </div>
        <span className="t-caption c-muted">{unisci(`${titoli.length + altri.length} ${titoli.length + altri.length === 1 ? 'elemento' : 'elementi'}`, totale > 0 && bytes(totale))}</span>
      </div>

      {arch.error && <div className="empty c-danger">{arch.error}</div>}
      {!arch.error && titoli.length + altri.length === 0 && (
        <div className="empty">{!arch.data ? 'Carico…' : cerca ? 'Nessun titolo trovato.' : "Nessun file nell'archivio."}</div>
      )}
      {titoli.length + altri.length > 0 && (
        <section className="griglia" aria-label="Titoli">
          {titoli.map((t: Titolo) => (
            <button key={`t${t.id}`} className="titolo-card" onClick={() => setAperta({ titoloId: t.id })}>
              <Poster src={t.copertina} nome={t.titolo} anno={t.anno} tag={t.tipo === 'serie' && t.stagioni > 0 ? stagioniTesto(t.stagioni) : undefined} />
              <div className="titolo-meta">
                <span className="t-strong truncate" title={t.titolo}>{t.titolo}</span>
                <span className="t-caption c-muted">{unisci(t.anno, t.tipo === 'serie' && `${t.file} episodi`, bytes(t.dimensione))}</span>
              </div>
            </button>
          ))}
          {altri.map((f) => (
            <button key={`f${f.id}`} className="titolo-card" onClick={() => setAperta({ file: f })}>
              <Poster src={null} nome={f.nome} />
              <div className="titolo-meta">
                <span className="t-strong truncate" title={f.nome}>{f.nome}</span>
                <span className="t-caption c-muted">{unisci('File', bytes(f.dimensione))}</span>
              </div>
            </button>
          ))}
        </section>
      )}

      <p className="inline t-caption c-muted" style={{ margin: 0 }}>
        <Info size={16} /> I link di download scadono dopo un tempo stabilito dall'amministratore · se la connessione cade il download riprende da dove si era fermato
      </p>

      {aperta && (
        <Scheda
          voce={'file' in aperta ? { file: arch.data?.altri.find((f) => f.id === aperta.file.id) ?? aperta.file } : aperta}
          remaining={banda.remaining}
          onClose={chiudiScheda}
          onChange={arch.reload}
        />
      )}
    </>
  );
}
