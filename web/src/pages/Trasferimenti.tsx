import { api } from '../api';
import { useLive } from '../live';
import { useData } from '../useData';
import { BandCard, PageHeader, SvuotaStorico } from '../ui';
import { useSession } from '../session';
import { TransferTable } from './TransferTable';

export function Trasferimenti() {
  const { io } = useSession();
  const mine = useData(api.mieiTrasferimenti);
  useLive(['trasferimenti'], mine.reload);
  if (!io) return null;
  return (
    <>
      <PageHeader title="I miei trasferimenti" subtitle="Tutti i tuoi upload e download, con lo stato di ognuno."
        actions={<SvuotaStorico onSvuota={api.svuotaStorico} onDone={mine.reload} />} />
      <BandCard banda={io.banda} />
      <section className="card flush">
        <TransferTable rows={mine.data ?? []} empty={mine.data ? 'Nessun trasferimento.' : 'Carico…'} />
      </section>
    </>
  );
}
