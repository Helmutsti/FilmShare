import type { DB } from './db/index.js';
import { createActiveUser, findUserByEmail, resetAdmin } from './db/users.js';
import { generatePassword, hashPassword } from './auth/password.js';

export interface CreaAdminInput {
  email: string;
  nome?: string;
  password?: string;
  reimposta?: boolean;
}

/**
 * Crea un amministratore attivo, oppure (con reimposta) rende admin una persona esistente e le cambia la password.
 * Senza password ne genera una casuale, restituita al chiamante.
 */
export async function creaAdmin(db: DB, input: CreaAdminInput) {
  const email = input.email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(`Email non valida: "${input.email}"`);
  const generated = input.password === undefined;
  const password = input.password ?? generatePassword();
  const passwordHash = await hashPassword(password);
  const existing = findUserByEmail(db, email);

  if (existing) {
    if (!input.reimposta) {
      throw new Error(
        `Esiste già una persona con email ${email}. Usa --reimposta per renderla admin e cambiarle la password.`,
      );
    }
    resetAdmin(db, existing.id, passwordHash);
    return { id: existing.id, email, password, generated, created: false };
  }

  if (!input.nome?.trim()) throw new Error('Serve il nome: --nome "Nome Cognome"');
  const id = createActiveUser(db, { email, name: input.nome, passwordHash, role: 'admin' });
  return { id, email, password, generated, created: true };
}
