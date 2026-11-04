/**
 * File sul NAS. Docker monta una sola cartella principale (SHARED_PATH); l'admin sceglie quali sottocartelle
 * sono esposte ai download e quale riceve gli upload (pagina "Cartelle").
 * I file copiati a mano nelle cartelle esposte compaiono alla prima lettura (e spariscono se tolti o se la cartella
 * non è più esposta). Cartelle e file nascosti (".", "@", "#": cestini e indici dei NAS) sono sempre esclusi.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import type { DB } from './db/index.js';
import { getSettings } from './db/settings.js';

const SCAN_TTL_MS = 15_000;
let lastScan = 0;

const hidden = (name: string) => name.startsWith('.') || name.startsWith('@') || name.startsWith('#');
const join = (a: string, b: string) => (a ? `${a}/${b}` : b);

async function walk(root: string, rel: string): Promise<{ rel: string; size: number; mtime: Date }[]> {
  const out: { rel: string; size: number; mtime: Date }[] = [];
  let entries;
  try {
    entries = await fs.readdir(path.join(root, rel), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (hidden(e.name)) continue;
    const r = join(rel, e.name);
    if (e.isDirectory()) out.push(...(await walk(root, r)));
    else if (e.isFile()) {
      const st = await fs.stat(path.join(root, r));
      out.push({ rel: r, size: st.size, mtime: st.mtime });
    }
  }
  return out;
}

/** Il percorso sta dentro una delle cartelle esposte? ("" = tutta la cartella principale) */
export function isExposed(rel: string, exposed: string[]): boolean {
  return exposed.some((f) => f === '' || rel === f || rel.startsWith(f + '/'));
}

export async function syncShared(db: DB, root: string, force = false) {
  if (!force && Date.now() - lastScan < SCAN_TTL_MS) return;
  lastScan = Date.now();
  const exposed = getSettings(db).exposed_folders;
  // Le cartelle annidate (es. "" e "Film") si leggono una volta sola.
  const tops = exposed.filter((f) => !exposed.some((o) => o !== f && (o === '' || f.startsWith(o + '/'))));
  const found = new Map<string, { size: number; mtime: Date }>();
  for (const f of tops) for (const x of await walk(root, f)) found.set(x.rel, x);

  const known = new Map(
    (db.prepare('SELECT id, rel_path FROM files').all() as { id: number; rel_path: string }[]).map((f) => [f.rel_path, f.id]),
  );
  db.transaction(() => {
    const ins = db.prepare('INSERT INTO files (name, rel_path, size_bytes, created_at) VALUES (?, ?, ?, ?)');
    for (const [rel, f] of found) {
      if (!known.has(rel)) ins.run(path.posix.basename(rel), rel, f.size, f.mtime.toISOString());
    }
    const del = db.prepare('DELETE FROM files WHERE id = ?');
    for (const [rel, id] of known) if (!found.has(rel)) del.run(id);
  })();
}

export function invalidateScan() {
  lastScan = 0;
}

/** Cartelle del NAS, per la pagina "Cartelle" (fino a `depth` livelli). */
export async function listFolders(root: string, depth = 3): Promise<{ percorso: string; nome: string; livello: number }[]> {
  const out: { percorso: string; nome: string; livello: number }[] = [];
  async function go(rel: string, level: number) {
    if (level > depth) return;
    let entries;
    try {
      entries = await fs.readdir(path.join(root, rel), { withFileTypes: true });
    } catch {
      return;
    }
    const dirs = entries.filter((e) => e.isDirectory() && !hidden(e.name)).sort((a, b) => a.name.localeCompare(b.name, 'it'));
    for (const d of dirs) {
      const r = join(rel, d.name);
      out.push({ percorso: r, nome: d.name, livello: level });
      await go(r, level + 1);
    }
  }
  await go('', 1);
  return out;
}

/** Controlla un percorso di cartella scelto dall'admin: relativo, esistente, non nascosto, dentro la cartella principale. */
export async function checkFolder(root: string, rel: string): Promise<string> {
  const clean = rel.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (clean === '') return '';
  if (clean.split('/').some((p) => p === '..' || p === '.' || p === '' || hidden(p))) throw new Error(`Cartella non valida: ${rel}`);
  const abs = safeJoin(root, clean);
  const st = await fs.stat(abs).catch(() => null);
  if (!st?.isDirectory()) throw new Error(`La cartella non esiste sul NAS: ${rel}`);
  return clean;
}

/** Nome sicuro dentro una cartella: niente percorsi, niente sovrascritture. */
export async function freeName(dir: string, wanted: string): Promise<string> {
  const base = path.basename(wanted).replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').trim() || 'file';
  const ext = path.extname(base);
  const stem = base.slice(0, base.length - ext.length);
  for (let i = 0; ; i++) {
    const name = i === 0 ? base : `${stem} (${i})${ext}`;
    try {
      await fs.access(path.join(dir, name));
    } catch {
      return name;
    }
  }
}

/** Sposta un file. rename non funziona tra dischi diversi: in quel caso copia e cancella. */
export async function moveFile(from: string, to: string) {
  try {
    await fs.rename(from, to);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EXDEV') throw e;
    await fs.copyFile(from, to);
    await fs.unlink(from);
  }
}

/** Percorso assoluto controllato: impedisce di uscire dalla cartella principale. */
export function safeJoin(root: string, rel: string): string {
  const p = path.resolve(root, rel);
  if (p !== root && !p.startsWith(root + path.sep)) throw new Error('Percorso non valido');
  return p;
}
