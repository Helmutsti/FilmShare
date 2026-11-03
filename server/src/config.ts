import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Cartella principale del progetto (quella con .env): i percorsi relativi partono da qui.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function percorso(valore: string | undefined, predefinito: string): string {
  return path.resolve(ROOT, valore && valore.trim() !== '' ? valore : predefinito);
}

function numero(valore: string | undefined, predefinito: number, nome: string): number {
  if (valore === undefined || valore.trim() === '') return predefinito;
  const n = Number(valore);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${nome} deve essere un intero positivo, trovato "${valore}"`);
  return n;
}

function booleano(valore: string | undefined, predefinito: boolean): boolean {
  if (valore === undefined || valore.trim() === '') return predefinito;
  return ['1', 'true', 'si', 'sì', 'yes'].includes(valore.trim().toLowerCase());
}

export interface Config {
  host: string;
  port: number;
  dbPath: string;
  sharedPath: string;
  uploadTmpPath: string;
  /** "direct": il server Node manda i file (sviluppo). "accel": li manda nginx con X-Accel-Redirect (produzione). */
  downloadMode: 'direct' | 'accel';
  /** Prefisso interno di nginx per i file protetti (solo in modalità accel). */
  accelPrefix: string;
  maxFileBytes: number;
  cookieSecure: boolean;
  pushSubject: string;
  vapidPublicKey?: string;
  vapidPrivateKey?: string;
  linkSecret?: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const mode = (env.DOWNLOAD_MODE?.trim() || 'direct') as Config['downloadMode'];
  if (mode !== 'direct' && mode !== 'accel') throw new Error(`DOWNLOAD_MODE deve essere "direct" o "accel", trovato "${mode}"`);
  return {
    host: env.HOST?.trim() || '127.0.0.1',
    port: numero(env.PORT, 3000, 'PORT'),
    dbPath: env.DB_PATH?.trim() === ':memory:' ? ':memory:' : percorso(env.DB_PATH, './data/filmshare.db'),
    sharedPath: percorso(env.SHARED_PATH, './data/condivisi'),
    uploadTmpPath: percorso(env.UPLOAD_TMP_PATH, './data/condivisi/.upload-in-corso'),
    downloadMode: mode,
    accelPrefix: env.ACCEL_PREFIX?.trim() || '/_condivisi/',
    maxFileBytes: numero(env.MAX_FILE_GB, 200, 'MAX_FILE_GB') * 1024 ** 3,
    cookieSecure: booleano(env.COOKIE_SECURE, false),
    pushSubject: env.PUSH_SUBJECT?.trim() || 'mailto:admin@filmshare.local',
    vapidPublicKey: env.VAPID_PUBLIC_KEY?.trim() || undefined,
    vapidPrivateKey: env.VAPID_PRIVATE_KEY?.trim() || undefined,
    linkSecret: env.LINK_SECRET?.trim() || undefined,
  };
}
