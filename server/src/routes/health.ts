import type { FastifyInstance } from 'fastify';
import { schemaVersion, type DB } from '../db/index.js';

export async function healthRoutes(app: FastifyInstance, opts: { db: DB }) {
  app.get('/api/salute', async () => ({
    stato: 'ok',
    database: schemaVersion(opts.db),
  }));
}
