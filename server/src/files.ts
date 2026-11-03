/**
 * Cartella condivisa sul NAS. I file caricati da FilmShare sono già nel database;
 * quelli copiati a mano sul NAS vengono aggiunti alla prima lettura (e tolti se spariscono).
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import type { DB } from './db/index.js';

const SCAN_TTL_MS = 15_000;
let lastScan = 0;

async function walk(root: string, rel = ''): Promise<{ rel: string; size: number; mtime: Date }[]> {
  const out: { rel: string; size: number; mtime: Date }[] = [];
  let entries;
  try {
    entries = await fs.readdir(path.join(root, rel), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue; // file nascosti, cartelle di sistema del NAS (@eaDir, #recycle li escludiamo sotto)
    if (e.name.startsWith('@') || e.name.startsWith('#')) continue;
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...(await walk(root, r)));
    else if (e.isFile()) {
      const st = await fs.stat(path.join(root, r));
      out.push({ rel: r, size: st.size, mtime: st.mtime });
    }
  }
  return out;
}

export async function syncShared(db: DB, root: string, force = false) {
  if (!force && Date.now() - lastScan < SCAN_TTL_MS) return;
  lastScan = Date.now();
  const found = await walk(root);
  const known = new Map(
    (db.prepare('SELECT id, rel_path FROM files').all() as { id: number; rel_path: string }[]).map((f) => [f.rel_path, f.id]),
  );
  const seen = new Set<string>();
  db.transaction(() => {
    const ins = db.prepare('INSERT INTO files (name, rel_path, size_bytes, created_at) VALUES (?, ?, ?, ?)');
    for (const f of found) {
      seen.add(f.rel);
      if (!known.has(f.rel)) ins.run(path.posix.basename(f.rel), f.rel, f.size, f.mtime.toISOString());
    }
    const del = db.prepare('DELETE FROM files WHERE id = ?');
    for (const [rel, id] of known) if (!seen.has(rel)) del.run(id);
  })();
}

/** Nome sicuro dentro la cartella condivisa: niente percorsi, niente sovrascritture. */
export async function freeName(root: string, wanted: string): Promise<string> {
  const base = path.basename(wanted).replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').trim() || 'file';
  const ext = path.extname(base);
  const stem = base.slice(0, base.length - ext.length);
  for (let i = 0; ; i++) {
    const name = i === 0 ? base : `${stem} (${i})${ext}`;
    try {
      await fs.access(path.join(root, name));
    } catch {
      return name;
    }
  }
}

/** Sposta dal disco del server al NAS. rename non funziona tra dischi diversi: in quel caso copia e cancella. */
export async function moveFile(from: string, to: string) {
  try {
    await fs.rename(from, to);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EXDEV') throw e;
    await fs.copyFile(from, to);
    await fs.unlink(from);
  }
}

/** Percorso assoluto controllato: impedisce di uscire dalla cartella condivisa. */
export function safeJoin(root: string, rel: string): string {
  const p = path.resolve(root, rel);
  if (p !== root && !p.startsWith(root + path.sep)) throw new Error('Percorso non valido');
  return p;
}
