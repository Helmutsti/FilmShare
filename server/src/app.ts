import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import type { Config } from './config.js';
import { openDb } from './db/index.js';
import { getOrCreateSecret } from './db/settings.js';
import { SESSION_COOKIE, userFromToken } from './auth/sessions.js';
import { EventBus } from './events.js';
import { Push } from './push.js';
import { expireLinks, HttpError } from './transfers.js';
import type { Ctx } from './context.js';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { transferRoutes } from './routes/transfers.js';
import { uploadRoutes } from './routes/upload.js';
import { adminRoutes } from './routes/admin.js';
import { liveRoutes } from './routes/live.js';

/** Costruisce l'app senza metterla in ascolto: la usano sia l'avvio sia i test. */
export async function buildApp(config: Config, { logger = true } = {}) {
  const db = openDb(config.dbPath);
  const app = Fastify({ logger, trustProxy: true, bodyLimit: 1024 * 1024 });

  const bus = new EventBus();
  const ctx: Ctx = {
    db, bus, config,
    push: new Push(db, config.pushSubject, { publicKey: config.vapidPublicKey, privateKey: config.vapidPrivateKey }),
    linkSecret: config.linkSecret ?? getOrCreateSecret(db, 'link'),
    maxFileBytes: config.maxFileBytes,
  };

  await app.register(cookie);
  await app.register(fastifyStatic, { root: config.sharedPath, serve: false });

  app.decorateRequest('user', null);
  app.addHook('onRequest', async (req) => {
    req.user = userFromToken(db, req.cookies[SESSION_COOKIE]);
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpError) return reply.code(err.statusCode).send({ errore: err.message });
    const e = err as { validation?: unknown; statusCode?: number; message: string };
    if (e.validation) return reply.code(400).send({ errore: 'Dati non validi', dettaglio: e.message });
    if (e.statusCode && e.statusCode < 500) return reply.code(e.statusCode).send({ errore: e.message });
    req.log.error(err);
    return reply.code(500).send({ errore: 'Errore interno' });
  });

  await app.register(healthRoutes, { db });
  await app.register(authRoutes, { ctx });
  await app.register(transferRoutes, { ctx });
  await app.register(uploadRoutes, { ctx });
  await app.register(adminRoutes, { ctx });
  await app.register(liveRoutes, { ctx });

  const timers = [
    setInterval(() => bus.heartbeat(), 25_000),
    setInterval(() => expireLinks(ctx), 60_000),
  ];
  app.addHook('onClose', async () => {
    timers.forEach(clearInterval);
    bus.closeAll();
    db.close();
  });

  return Object.assign(app, { ctx });
}
