import { useRef, useState, type DragEvent } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Upload } from 'lucide-react';
import { api } from '../api';
import { bytes } from '../format';
import { useLive } from '../live';
import { dismissPush, enablePush, shouldAskPush } from '../push';
import { useSession } from '../session';
import { addFiles } from '../uploads';
import { useData } from '../useData';
import { BandCard, PageHeader } from '../ui';
import { TransferTable } from './TransferTable';

export function CaricaFile() {
  const { io } = useSession();
  const mine = useData(api.mieiTrasferimenti);
  useLive(['trasferimenti'], mine.reload);
  const [over, setOver] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [askPush, setAskPush] = useState(shouldAskPush());
  const fileInput = useRef<HTMLInputElement>(null);
  const dirInput = useRef<HTMLInputElement>(null);

  if (!io) return null;

  async function take(list: FileList | null) {
    if (!list?.length) return;
    setErrors(await addFiles(Array.from(list), mine.data ?? []));
    mine.reload();
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setOver(false);
    void take(e.dataTransfer.files);
  }


  return (
    <>
      <PageHeader
        title="Carica file"
        subtitle="Finché resti nella tua banda i file vengono pubblicati subito nell'archivio; oltre la banda serve l'approvazione dell'amministratore."
      />

      {askPush && (
        <div className="banner banner-primary" role="region" aria-label="Notifiche">
          <Bell size={20} color="var(--accent-primary)" />
          <div className="grow">
            <div className="t-strong">Vuoi sapere quando i tuoi file vengono approvati?</div>
            <div className="t-caption c-secondary">Attiva le notifiche: ti avvisiamo anche con FilmShare chiuso, finché il browser è aperto.</div>
          </div>
          <button className="btn btn-ghost" onClick={() => { dismissPush(); setAskPush(false); }}>Non ora</button>
          <button className="btn btn-primary" onClick={async () => { await enablePush(io.pushKey).catch(() => false); setAskPush(false); }}>Attiva notifiche</button>
        </div>
      )}

      <BandCard banda={io.banda} />

      {errors.length > 0 && (
        <div className="banner banner-danger" role="alert">
          <div className="grow t-caption">{errors.map((e) => <div key={e}>{e}</div>)}</div>
          <button className="btn btn-ghost btn-sm" onClick={() => setErrors([])}>Chiudi</button>
        </div>
      )}

      <div className="upload-row">
        {!io.limiti.can_upload || io.cartellaUpload === null ? (
          <section className="dropzone" aria-label="Caricamento non abilitato" style={{ borderColor: 'var(--border-strong)' }}>
            <span className="drop-icon" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}><Upload size={22} /></span>
            <h2 className="t-title">Il caricamento non è abilitato</h2>
            <p className="t-body c-secondary" style={{ margin: 0 }}>
              {!io.limiti.can_upload
                ? "Per il tuo account l'amministratore ha permesso solo i download. Puoi scaricare dall'archivio."
                : "L'amministratore non ha ancora scelto la cartella in cui salvare i file caricati. Puoi scaricare dall'archivio."}
            </p>
            <Link className="btn btn-secondary" to="/condivisi">Vai all'archivio</Link>
          </section>
        ) : (
        <section
          className={`dropzone${over ? ' over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={onDrop}
          aria-label="Area di caricamento"
        >
          <span className="drop-icon"><Upload size={22} /></span>
          <h2 className="t-title">Trascina qui film o cartelle</h2>
          <p className="t-body c-secondary" style={{ margin: 0 }}>Fino a {bytes(io.maxFile)} per file · upload a blocchi, riprende da dove si era interrotto</p>
          <div className="inline" style={{ gap: 8 }}>
            <button className="btn btn-primary" onClick={() => fileInput.current?.click()}>Scegli file</button>
            <button className="btn btn-secondary" onClick={() => dirInput.current?.click()}>Scegli cartella</button>
          </div>
          <input ref={fileInput} type="file" multiple hidden onChange={(e) => { void take(e.target.files); e.target.value = ''; }} />
          <input ref={dirInput} type="file" multiple hidden {...{ webkitdirectory: '' }} onChange={(e) => { void take(e.target.files); e.target.value = ''; }} />
        </section>
        )}

        <section className="card flush">
          <div className="card-head">
            <h2 className="t-heading">I miei trasferimenti</h2>
            <Link className="btn btn-ghost" to="/trasferimenti">Vedi tutti</Link>
          </div>
          <TransferTable rows={(mine.data ?? []).slice(0, 6)} empty="Nessun trasferimento: trascina un file nel riquadro per cominciare." ridotta />
        </section>
      </div>
    </>
  );
}
