import { useEffect, useId, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

/** Larghezza sotto cui l'app usa la vista da telefono (stessa soglia di styles.css). */
const TELEFONO = '(max-width: 720px)';

/** true quando lo schermo è largo come un telefono; si aggiorna se la finestra cambia. */
export function useTelefono() {
  const [m, setM] = useState(() => window.matchMedia(TELEFONO).matches);
  useEffect(() => {
    const q = window.matchMedia(TELEFONO);
    const on = () => setM(q.matches);
    q.addEventListener('change', on);
    return () => q.removeEventListener('change', on);
  }, []);
  return m;
}

/**
 * Riga di un elenco che si apre (al posto delle tabelle sul telefono): una riga corta sempre visibile
 * e, toccandola, il contenuto sotto. `fisso` sta a destra fuori dal pulsante (es. un interruttore).
 */
export function RigaElenco({ aperta, onToggle, inizio, titolo, sotto, destra, fisso, children, rientro = true }: {
  aperta: boolean; onToggle: () => void; inizio?: ReactNode; titolo: ReactNode; sotto?: ReactNode; destra?: ReactNode;
  fisso?: ReactNode; children?: ReactNode; rientro?: boolean;
}) {
  const id = useId();
  return (
    <div className={`elenco-riga${aperta ? ' aperta' : ''}`}>
      <div className="elenco-testa">
        <button type="button" className="elenco-pulsante" aria-expanded={aperta} aria-controls={id} onClick={onToggle}>
          {inizio}
          <span className="elenco-testi">
            <span className="t-strong truncate">{titolo}</span>
            {sotto && <span className="t-caption c-muted truncate">{sotto}</span>}
          </span>
          {destra}
          <ChevronDown size={16} className="elenco-freccia" aria-hidden />
        </button>
        {fisso && <span className="elenco-fisso">{fisso}</span>}
      </div>
      {aperta && <div id={id} className={`elenco-aperta${rientro ? ' rientro' : ''}`}>{children}</div>}
    </div>
  );
}
