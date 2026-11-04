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
  /** Dashboard compilata (web/dist): la serve il server stesso. Se la cartella non c'è (sviluppo) la serve Vite. */
  webPath: string;
  maxFileBytes: number;
  cookieSecure: boolean;
  pushSubject: string;
  vapidPublicKey?: string;
  vapidPrivateKey?: string;
  linkSecret?: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    host: env.HOST?.trim() || '127.0.0.1',
    port: numero(env.PORT, 3000, 'PORT'),
    dbPath: env.DB_PATH?.trim() === ':memory:' ? ':memory:' : percorso(env.DB_PATH, './data/filmshare.db'),
    sharedPath: percorso(env.SHARED_PATH, './data/condivisi'),
    uploadTmpPath: percorso(env.UPLOAD_TMP_PATH, './data/condivisi/.upload-in-corso'),
    webPath: percorso(env.WEB_PATH, './web/dist'),
    maxFileBytes: numero(env.MAX_FILE_GB, 200, 'MAX_FILE_GB') * 1024 ** 3,
    cookieSecure: booleano(env.COOKIE_SECURE, false),
    pushSubject: env.PUSH_SUBJECT?.trim() || 'mailto:admin@filmshare.local',
    vapidPublicKey: env.VAPID_PUBLIC_KEY?.trim() || undefined,
    vapidPrivateKey: env.VAPID_PRIVATE_KEY?.trim() || undefined,
    linkSecret: env.LINK_SECRET?.trim() || undefined,
  };
}
