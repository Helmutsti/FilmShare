/**
 * Crea (o reimposta) un amministratore.
 *
 *   npm run crea-admin -- <email> --nome "Nome Cognome" [--password <pw>] [--reimposta]
 *
 * Senza --password ne genera una casuale e la stampa una sola volta.
 * Con --reimposta, se l'email esiste già: la rende admin attivo, cambia la password e chiude le sessioni.
 */
import { parseArgs } from 'node:util';
import { loadConfig } from '../config.js';
import { openDb } from '../db/index.js';
import { creaAdmin } from '../admin.js';

const USO = 'Uso: npm run crea-admin -- <email> --nome "Nome Cognome" [--password <pw>] [--reimposta]';

let args;
try {
  args = parseArgs({
    allowPositionals: true,
    options: {
      nome: { type: 'string' },
      password: { type: 'string' },
      reimposta: { type: 'boolean', default: false },
    },
  });
} catch (e) {
  console.error(`Errore: ${(e as Error).message}\n${USO}`);
  process.exit(2);
}
if (args.positionals.length !== 1) {
  console.error(USO);
  process.exit(2);
}

const config = loadConfig();
const db = openDb(config.dbPath);
try {
  const r = await creaAdmin(db, { email: args.positionals[0], ...args.values });
  console.log(r.created ? 'Amministratore creato.' : 'Amministratore reimpostato.');
  console.log(`  Database: ${config.dbPath}`);
  console.log(`  Email:    ${r.email}`);
  if (r.generated) console.log(`  Password: ${r.password}   (generata: salvala ora, non verrà mostrata di nuovo)`);
} catch (e) {
  console.error(`Errore: ${(e as Error).message}`);
  process.exitCode = 1;
} finally {
  db.close();
}
