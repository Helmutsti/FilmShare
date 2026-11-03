import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

export type DB = Database.Database;

const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations');

/** Apre il database (":memory:" per i test), imposta le opzioni e applica le migrazioni mancanti. */
export function openDb(dbPath: string): DB {
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  migrate(db);
  return db;
}

/**
 * Le migrazioni sono file `NNN_nome.sql` in server/migrations, applicati in ordine.
 * Ogni file gira in una transazione: o passa tutto o niente.
 */
export function migrate(db: DB, dir = MIGRATIONS_DIR): string[] {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version    TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`);
  const applied = new Set(
    db.prepare('SELECT version FROM schema_migrations').pluck().all() as string[],
  );
  const files = fs
    .readdirSync(dir)
    .filter((f) => /^\d{3}_.+\.sql$/.test(f))
    .sort();

  const done: string[] = [];
  for (const file of files) {
    const version = file.replace(/\.sql$/, '');
    if (applied.has(version)) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(version);
    })();
    done.push(version);
  }
  return done;
}

export function schemaVersion(db: DB): string | null {
  return (
    (db.prepare('SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1').pluck().get() as
      | string
      | undefined) ?? null
  );
}
