import { useEffect, useState } from 'react';
import { Folder, FolderOpen, Info, Upload } from 'lucide-react';
import { api } from '../api';
import { useData } from '../useData';
import { PageHeader, Toggle } from '../ui';

/** "" è la cartella principale del NAS (quella montata da Docker). */
const ROOT = '';

/** Una cartella è inclusa se lei o una cartella che la contiene è esposta. */
function coveredBy(folder: string, exposed: Set<string>): string | null {
  for (const e of exposed) if (e !== folder && (e === ROOT || folder.startsWith(e + '/'))) return e;
  return null;
}

export function Cartelle() {
  const data = useData(api.cartelle);
  const [esposte, setEsposte] = useState<Set<string>>(new Set());
  const [upload, setUpload] = useState<string | null>(null);
  const [stato, setStato] = useState<string | null>(null);

  useEffect(() => {
    if (data.data) { setEsposte(new Set(data.data.esposte)); setUpload(data.data.upload); }
  }, [data.data]);

  if (!data.data) return <PageHeader title="Cartelle" subtitle={data.error ?? 'Carico…'} />;

  const rows = [{ percorso: ROOT, nome: 'Tutta la cartella principale del NAS', livello: 0 }, ...data.data.cartelle];

  function toggle(p: string, on: boolean) {
    const next = new Set(esposte);
    if (on) next.add(p); else next.delete(p);
    setEsposte(next);
    // La cartella di upload deve restare tra quelle scaricabili.
    if (!on && upload === p && !coveredBy(p, next)) setUpload(null);
    setStato(null);
  }

  function chooseUpload(p: string) {
    setUpload(p);
    if (!esposte.has(p) && !coveredBy(p, esposte)) setEsposte(new Set(esposte).add(p));
    setStato(null);
  }

  async function save() {
    setStato('Salvo…');
    try {
      const r = await api.salvaCartelle({ esposte: [...esposte], upload });
      setEsposte(new Set(r.esposte));
      setUpload(r.upload);
      setStato('Salvato');
    } catch (e) {
      setStato((e as Error).message);
    }
  }

  return (
    <>
      <PageHeader
        title="Cartelle"
        subtitle="Scegli quali cartelle del NAS vedono gli utenti e dove finiscono i file caricati. Gli utenti vedono i file di tutte le cartelle esposte in un unico elenco."
        actions={<>
          {stato && <span className={`t-caption ${stato === 'Salvato' ? 'c-success' : stato === 'Salvo…' ? 'c-muted' : 'c-danger'}`} role="status">{stato}</span>}
          <button className="btn btn-ghost" onClick={() => { setEsposte(new Set(data.data!.esposte)); setUpload(data.data!.upload); setStato(null); }}>Annulla</button>
          <button className="btn btn-primary" onClick={save}>Salva modifiche</button>
        </>}
      />

      {upload === null && (
        <div className="banner banner-warning">
          <Info size={20} color="var(--status-warning)" />
          <div className="grow t-caption">Nessuna cartella di upload scelta: finché non ne scegli una nessuno può caricare file.</div>
        </div>
      )}

      <section className="card flush">
        <table className="table">
          <thead>
            <tr><th>Cartella</th><th style={{ width: 200 }}>Visibile nei download</th><th style={{ width: 170 }}>Destinazione upload</th></tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const parent = coveredBy(c.percorso, esposte);
              const on = esposte.has(c.percorso) || parent !== null;
              const isUpload = upload === c.percorso;
              return (
                <tr key={c.percorso || '(root)'}>
                  <td>
                    <div className="inline" style={{ gap: 10, paddingLeft: c.livello * 24 }}>
                      {on ? <FolderOpen size={18} color="var(--accent-primary)" /> : <Folder size={18} color="var(--text-muted)" />}
                      <div className="stack-sm" style={{ gap: 2, minWidth: 0 }}>
                        <span className={c.livello === 0 ? 't-strong' : 't-body'}>{c.nome}</span>
                        {c.livello > 1 && <span className="t-caption c-muted truncate">{c.percorso}</span>}
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="inline" style={{ gap: 10 }}>
                      <Toggle checked={on} disabled={parent !== null} onChange={(v) => toggle(c.percorso, v)} label={`Mostra ${c.nome}`} />
                      <span className="t-caption c-muted">{parent !== null ? 'inclusa' : on ? 'visibile' : 'nascosta'}</span>
                    </div>
                  </td>
                  <td>
                    <label className="inline" style={{ gap: 8, cursor: 'pointer' }}>
                      <input type="radio" name="upload" checked={isUpload} onChange={() => chooseUpload(c.percorso)} />
                      {isUpload && <span className="inline t-caption" style={{ color: 'var(--accent-primary)' }}><Upload size={14} /> qui</span>}
                    </label>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {data.data.cartelle.length === 0 && <div className="empty">Nella cartella principale non ci sono sottocartelle.</div>}
      </section>
      <p className="inline t-caption c-muted" style={{ margin: 0 }}>
        <Info size={16} /> Una cartella visibile include tutte le sue sottocartelle. La cartella di upload è sempre anche visibile nei download.
        Per cambiare la cartella principale del NAS si modifica SHARED_DIR nella configurazione di Docker.
      </p>
    </>
  );
}
