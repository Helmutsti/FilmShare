import type { FastifyInstance } from 'fastify';
import { requireUser, type Ctx } from '../context.js';

/** SSE (aggiornamenti in tempo reale) e iscrizione alle notifiche push. */
export async function liveRoutes(app: FastifyInstance, { ctx }: { ctx: Ctx }) {
  app.get('/api/eventi', async (req, reply) => {
    const u = requireUser(req);
    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // se davanti c'è un reverse proxy (es. nginx): non trattenere i messaggi
    });
    reply.raw.write('retry: 3000\n\n');
    const remove = ctx.bus.add(u.id, u.role === 'admin', reply.raw);
    req.raw.on('close', remove);
  });

  app.post<{ Body: { endpoint: string; keys: { p256dh: string; auth: string } } }>('/api/notifiche/iscrizione', {
    schema: {
      body: {
        type: 'object', required: ['endpoint', 'keys'],
        properties: {
          endpoint: { type: 'string', format: 'uri', maxLength: 2000 },
          keys: { type: 'object', required: ['p256dh', 'auth'], properties: { p256dh: { type: 'string' }, auth: { type: 'string' } } },
        },
      },
    },
  }, async (req) => {
    const u = requireUser(req);
    ctx.push.subscribe(u.id, req.body);
    return { ok: true };
  });

  app.delete<{ Body: { endpoint: string } }>('/api/notifiche/iscrizione', async (req) => {
    const u = requireUser(req);
    if (req.body?.endpoint) ctx.push.unsubscribe(u.id, req.body.endpoint);
    return { ok: true };
  });
}
