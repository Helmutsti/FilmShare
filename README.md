# FilmShare

Scambio di film e file pesanti tra amici. Ogni persona ha una **quota unica** (upload + download insieme)
in un periodo scelto dall'admin (giorno, settimana da lunedì, mese). L'admin crea gli utenti, approva le richieste
oltre soglia o oltre quota e imposta le regole di banda.
Disegni: https://www.figma.com/design/DSXFok6tsIbfbtBWXjt99O

## Pezzi
| Cartella | Cosa c'è |
|---|---|
| `server/` | Fastify (Node, TypeScript): accesso, quote, approvazioni, upload tus, link di download firmati, SSE, notifiche push |
| `server/migrations/` | Struttura del database SQLite, file `NNN_nome.sql` applicati in ordine all'avvio |
| `web/` | Dashboard React + Vite; upload a pezzi con `tus-js-client` |
| `deploy/nginx.conf` | nginx: serve la dashboard, inoltra `/api`, manda i download dal NAS con ripresa e limite di velocità |
| `Dockerfile`, `compose.yaml` | Due immagini dallo stesso Dockerfile: `app` (Node) e `web` (nginx) |

## Installazione con Docker (server di casa)
1. Monta la cartella del NAS sul server, via NFS. Esempio in `/etc/fstab`:
   ```
   nas.local:/volume1/film  /mnt/filmshare  nfs4  rw,hard,_netdev  0 0
   ```
   L'utente del container (uid 1000) deve poter scrivere in quella cartella.
2. Configura e avvia:
   ```
   cp .env.example .env          # imposta SHARED_DIR=/mnt/filmshare e, se c'è HTTPS davanti, COOKIE_SECURE=true
   docker compose up -d --build
   ```
3. Crea il primo amministratore:
   ```
   docker compose exec app npm run crea-admin:prod -- tua@email.it --nome "Nome Cognome"
   ```
4. Apri `http://<server>:8080` (porta `WEB_PORT`), entra e crea gli altri utenti dalla pagina **Utenti**.

Dove stanno i dati:
- **database**: volume Docker `dati` (disco del server). Mai sul NAS: SQLite su NFS si può rovinare. Per il backup basta copiare il volume.
- **film**: `SHARED_DIR`. Gli upload in corso stanno nella sottocartella nascosta `.upload-in-corso`, sullo stesso NAS,
  così a fine upload il file si sposta all'istante invece di essere ricopiato.
- I file copiati a mano sul NAS compaiono da soli nella cartella condivisa.

## Sviluppo
```
npm install
npm run dev              # server su :3000, dashboard su http://localhost:5173
npm run typecheck
npm test
```
In sviluppo i download li manda il server Node (`DOWNLOAD_MODE=direct`); in Docker li manda nginx (`accel`).

## Creare un amministratore: `crea-admin`
L'accesso a FilmShare è solo con un account creato dall'amministratore; il primo si crea da riga di comando.

```
npm run crea-admin -- <email> --nome "Nome Cognome" [--password <password>] [--reimposta]      # sviluppo
docker compose exec app npm run crea-admin:prod -- <email> --nome "Nome Cognome" [...]         # Docker
```

| Opzione | Cosa fa |
|---|---|
| `<email>` | Email dell'amministratore (obbligatoria). Maiuscole e minuscole non contano. |
| `--nome "…"` | Nome mostrato nella dashboard. Obbligatorio quando si crea una persona nuova. |
| `--password …` | Password da usare (almeno 12 caratteri). Se manca, ne genera una casuale di 20 caratteri e la stampa **una sola volta**. |
| `--reimposta` | Se l'email esiste già: la rende amministratore attivo, cambia la password e chiude tutte le sue sessioni. Serve anche a recuperare un admin che ha dimenticato la password. |

Esempi:
```
npm run crea-admin -- mario@example.com --nome "Mario Rossi"     # password generata
npm run crea-admin -- mario@example.com --reimposta              # password dimenticata
```

Note:
- Usa il database di `DB_PATH`: lancialo sul server dove gira FilmShare.
- L'admin creato riceve i limiti predefiniti delle regole globali e non ha bisogno di approvazioni.
- La password è salvata solo come impronta (scrypt): non si può rileggere, solo reimpostare.
- `--password` sulla riga di comando resta nella cronologia della shell: meglio lasciarla generare.

## Come funziona la quota
- Prima di un upload o di un download si **prenota** tutta la dimensione del file nel periodo corrente della persona.
- Riprese e nuovi tentativi non contano due volte; se il trasferimento viene annullato, rifiutato o il link scade senza essere usato, la prenotazione torna disponibile.
- Sopra la soglia (regole di banda) o oltre la quota rimasta la richiesta va in **Approvazioni**; l'admin può approvarla come eccezione senza cambiare i limiti della persona.
- Fascia notturna: download senza limite di velocità. Oltre l'80% della quota (se attivo): 10 Mbps.
