import { useEffect } from 'react';
import type { Trasferimento } from '../api';
import { bytes, dataBreve, fa, ora } from '../format';
import { cancelUpload, pause, resume, syncWithServer, useUploads, type LocalUpload } from '../uploads';
import { FileIcon, SimpleBar, motivoTesto, statoBadge } from '../ui';

function avanzamento(t: Trasferimento, local?: LocalUpload): { value: number; text: string; tone?: 'accent' | 'ok' | 'danger' } {
  if (local && local.state !== 'done') {
    const p = Math.floor((local.sent / t.dimensione) * 100);
    if (local.state === 'error') return { value: local.sent, text: `Interrotto: ${local.error}`, tone: 'danger' };
    if (local.state === 'paused') return { value: local.sent, text: `${p}% · in pausa`, tone: 'accent' };
    if (local.state === 'waiting' && t.stato === 'pending') return { value: 0, text: "In coda, partirà dopo l'approvazione" };
    const mbs = local.speed / 1024 ** 2;
    const left = local.speed > 0 ? Math.ceil((t.dimensione - local.sent) / local.speed / 60) : null;
    return { value: local.sent, text: `${p}% · ${mbs.toLocaleString('it-IT', { maximumFractionDigits: 0 })} MB/s${left !== null ? ` · ${left} min rimanenti` : ''}`, tone: 'accent' };
  }
  switch (t.stato) {
    case 'pending': return { value: 0, text: t.tipo === 'upload' ? `In coda: ${motivoTesto[t.motivo ?? ''] ?? 'serve approvazione'}` : 'In attesa dell\'amministratore' };
    case 'approved': return { value: 0, text: t.tipo === 'upload' ? 'Approvato: trascina di nuovo il file per caricarlo' : `Link valido fino al ${dataBreve(t.linkScade!)}` };
    case 'in_progress': return { value: 0, text: 'Interrotto: trascina di nuovo il file per riprendere', tone: 'accent' };
    case 'completed': return { value: t.dimensione, text: t.tipo === 'upload' ? 'Pubblicato nella cartella condivisa' : `Link valido fino al ${dataBreve(t.linkScade!)}`, tone: 'ok' };
    case 'rejected': return { value: 0, text: t.motivo && !motivoTesto[t.motivo] ? t.motivo : 'Rifiutato dall\'amministratore', tone: 'danger' };
    case 'cancelled': return { value: 0, text: 'Annullato' };
    case 'expired': return { value: 0, text: 'Link scaduto' };
  }
}

export function TransferTable({ rows, empty }: { rows: Trasferimento[]; empty: string }) {
  const local = useUploads();
  useEffect(() => syncWithServer(rows), [rows]);

  if (rows.length === 0) return <div className="empty">{empty}</div>;
  return (
    <table className="table">
      <thead>
        <tr><th>File</th><th style={{ width: 110 }}>Dimensione</th><th style={{ width: 240 }}>Avanzamento</th><th style={{ width: 210 }}>Stato</th><th style={{ width: 100 }} /></tr>
      </thead>
      <tbody>
        {rows.map((t) => {
          const l = local.get(t.id);
          const a = avanzamento(t, l);
          const active = ['pending', 'approved', 'in_progress'].includes(t.stato);
          return (
            <tr key={t.id}>
              <td>
                <div className="inline" style={{ gap: 12 }}>
                  <FileIcon />
                  <div className="stack-sm" style={{ gap: 2, minWidth: 0 }}>
                    <span className="t-strong truncate">{t.nome}</span>
                    <span className="t-caption c-muted">{t.tipo === 'upload' ? 'Upload' : 'Download'} · {fa(t.creato) === 'adesso' ? `alle ${ora(t.creato)}` : fa(t.creato)}</span>
                  </div>
                </div>
              </td>
              <td>{bytes(t.dimensione)}</td>
              <td>
                <div className="stack-sm" style={{ gap: 6 }}>
                  <SimpleBar value={a.value} max={t.dimensione || 1} tone={a.tone ?? 'accent'} />
                  <span className={`t-caption ${a.tone === 'danger' ? 'c-danger' : 'c-muted'}`}>{a.text}</span>
                </div>
              </td>
              <td>{l?.state === 'uploading' ? statoBadge({ stato: 'in_progress', tipo: t.tipo }) : statoBadge(t)}</td>
              <td style={{ textAlign: 'right' }}>
                {l?.state === 'uploading' && <button className="btn btn-ghost btn-sm" onClick={() => pause(t.id)}>Pausa</button>}
                {(l?.state === 'paused' || l?.state === 'error') && <button className="btn btn-ghost btn-sm" onClick={() => resume(t.id)}>Riprendi</button>}
                {active && !l?.state.match(/uploading/) && t.tipo === 'upload' && (
                  <button className="btn btn-ghost btn-sm" onClick={() => cancelUpload(t.id)}>Annulla</button>
                )}
                {t.tipo === 'download' && t.link && t.stato !== 'expired' && <a className="btn btn-ghost btn-sm" href={t.link}>Scarica</a>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
