/**
 * Aggiornamenti in tempo reale (SSE). Ogni pagina aperta tiene una connessione su /api/eventi;
 * il server manda solo "cosa è cambiato" e la pagina ricarica i dati che le servono.
 */
import type { ServerResponse } from 'node:http';

export type EventName = 'banda' | 'trasferimenti' | 'richieste' | 'utenti' | 'file' | 'regole';

interface Client { userId: number; isAdmin: boolean; res: ServerResponse }

export class EventBus {
  private clients = new Set<Client>();

  add(userId: number, isAdmin: boolean, res: ServerResponse) {
    const c = { userId, isAdmin, res };
    this.clients.add(c);
    return () => this.clients.delete(c);
  }

  private send(c: Client, event: EventName, data: unknown) {
    c.res.write(`event: ${event}\ndata: ${JSON.stringify(data ?? {})}\n\n`);
  }

  toUser(userId: number, event: EventName, data?: unknown) {
    for (const c of this.clients) if (c.userId === userId) this.send(c, event, data);
  }

  toAdmins(event: EventName, data?: unknown) {
    for (const c of this.clients) if (c.isAdmin) this.send(c, event, data);
  }

  toAll(event: EventName, data?: unknown) {
    for (const c of this.clients) this.send(c, event, data);
  }

  heartbeat() {
    for (const c of this.clients) c.res.write(': ping\n\n');
  }

  closeAll() {
    for (const c of this.clients) c.res.end();
    this.clients.clear();
  }
}
