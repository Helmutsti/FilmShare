# FilmShare

Scambio di film e file pesanti tra amici. Ogni persona ha una **quota unica** (upload + download insieme)
in un periodo scelto dall'admin (giorno, settimana da lunedì, mese). L'admin crea gli utenti, imposta per ognuno
quota, periodo e "Permetti upload", e approva le richieste oltre la quota. Non ci sono regole globali da impostare; c'è solo l'interruttore
**Sospendi trasferimenti** (pagina Utenti), che ferma ogni upload e download per tutti.
Disegni: https://www.figma.com/design/DSXFok6tsIbfbtBWXjt99O

## Pezzi
| Cartella | Cosa c'è |
|---|---|
| `server/` | Fastify (Node, TypeScript): accesso, quote, approvazioni, upload tus, link di download firmati, SSE, notifiche push |
| `server/migrations/` | Struttura del database SQLite, file `NNN_nome.sql` applicati in ordine all'avvio |
| `web/` | Dashboard React + Vite; upload a pezzi con `tus-js-client` |
| `strumenti/` | Script che esportano il catalogo di Jellyfin in uno zip (Windows: `.ps1`, Mac: `.sh`) |
| `Dockerfile`, `compose.yaml` | Una sola immagine: il server Node risponde alle API, serve la dashboard compilata e manda i download |

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
- **copertine** del catalogo: nello stesso volume, cartella `copertine` accanto al database (`COVERS_PATH` per cambiarla).
- **film**: `SHARED_DIR`, la cartella principale del NAS (una sola). Dalla pagina **Cartelle** l'admin sceglie quali
  sottocartelle vedono gli utenti (tutti i file insieme, in un unico elenco) e in quale finiscono gli upload; la cartella
  di upload è sempre anche scaricabile. Una cartella visibile include le sue sottocartelle.
- Gli upload in corso stanno nella sottocartella nascosta `.upload-in-corso`, sullo stesso NAS,
  così a fine upload il file si sposta all'istante invece di essere ricopiato.
- I file copiati a mano in una cartella visibile compaiono da soli entro 15 secondi.
- Per cambiare la cartella principale: modifica `SHARED_DIR` in `.env` e `docker compose up -d`.

## Archivio a copertine: il catalogo da Jellyfin
La pagina **Archivio** mostra film e serie come copertine; aprendo un titolo si vedono trama, stagioni ed episodi, ognuno
con il suo pulsante Scarica (stesse regole di quota e approvazione di sempre). Copertine, titoli e trame vengono da un
**catalogo esportato da Jellyfin**: FilmShare non parla mai con Jellyfin, quindi non serve aprire niente nel firewall.

1. In Jellyfin crea una chiave API: Dashboard → Chiavi API → "+".
2. Da un computer che raggiunge Jellyfin lancia lo script (legge soltanto) e ottieni `catalogo-jellyfin.zip`:
   ```
   bash strumenti/esporta-catalogo-jellyfin.sh http://jellyfin:8096                    # Mac
   .\strumenti\esporta-catalogo-jellyfin.ps1 -Server http://jellyfin:8096                # Windows (PowerShell)
   ```
   Esporta solo film e serie (con stagioni, episodi e copertine): niente collezioni, playlist, musica o foto.
3. In FilmShare, pagina **Catalogo** (amministrazione) → **Carica zip**. Il nuovo catalogo sostituisce il precedente.

Come si abbinano i file: Jellyfin e FilmShare vedono il NAS da percorsi diversi (es. `\\nas\Multimedia\Films\Amadeus.mkv`
e `Films/Amadeus.mkv`), quindi si confronta il **nome del file**; se più file hanno lo stesso nome vince quello con più
cartelle finali uguali. L'abbinamento si rifà a ogni apertura dell'Archivio: i file aggiunti dopo trovano la scheda
appena sono nel catalogo caricato. I file che il catalogo non conosce compaiono con un riquadro neutro (scheda "Altri file");
la pagina **Catalogo** li elenca. Un titolo del catalogo senza file nelle cartelle visibili non compare.

Formato dello zip (versione 1): `catalogo.json` (`formato: "filmshare-catalogo"`, `titoli` con `tipo` film/serie, `titolo`,
`anno`, `generi`, `trama`, `percorso`, `copertina`, e per le serie `stagioni` ed `episodi`) più la cartella `copertine/`.

## Sviluppo
```
npm install
npm run dev              # server su :3000, dashboard su http://localhost:5173
npm run typecheck
npm test
```
In sviluppo la dashboard la serve Vite (:5173); in Docker la serve il server stesso, dalla cartella `web/dist`.

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
- L'admin creato riceve la quota proposta per le persone nuove (400 GB a settimana).
- La password è salvata solo come impronta (scrypt): non si può rileggere, solo reimpostare.
- `--password` sulla riga di comando resta nella cronologia della shell: meglio lasciarla generare.

## Come funziona la quota
- Prima di un upload o di un download si **prenota** tutta la dimensione del file nel periodo corrente della persona.
- Riprese e nuovi tentativi non contano due volte; se il trasferimento viene annullato, rifiutato o il link scade senza essere usato, la prenotazione torna disponibile.
- È l'unico limite: finché la richiesta sta nella quota rimasta parte subito, qualunque sia la dimensione del file.
- Oltre la quota rimasta la richiesta va in **Approvazioni**: l'admin può approvarla come eccezione senza cambiare la quota della persona. Vale anche per gli admin.
- Nessun limite di velocità né di trasferimenti contemporanei. "Permetti upload" spento = la persona può solo scaricare.
- La scadenza dei link (48 ore) e la quota proposta per una persona nuova (400 GB a settimana) sono fisse, nella tabella `settings` del database.
