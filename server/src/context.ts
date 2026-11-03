import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Config } from './config.js';
import type { SessionUser } from './auth/sessions.js';
import { HttpError, type TransferCtx } from './transfers.js';

export interface Ctx extends TransferCtx {
  config: Config;
  /** Cancella un upload tus non finito (impostato dal modulo upload). */
  tusRemove?: (tusId: string) => Promise<void>;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: SessionUser | null;
  }
}

export function requireUser(req: FastifyRequest): SessionUser {
  if (!req.user) throw new HttpError(401, 'Accesso richiesto');
  return req.user;
}

export function requireAdmin(req: FastifyRequest): SessionUser {
  const u = requireUser(req);
  if (u.role !== 'admin') throw new HttpError(403, 'Solo per amministratori');
  return u;
}

export function idParam(req: FastifyRequest): number {
  const id = Number((req.params as { id?: string }).id);
  if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(400, 'Identificativo non valido');
  return id;
}

export type Reply = FastifyReply;
