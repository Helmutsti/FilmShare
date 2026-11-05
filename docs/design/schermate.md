# Schermate

Il disegno vive in Figma, pagina **Schermate** (link in `AGENTS.md`). Qui c'è tutto ciò che è una decisione. Le esportazioni stanno in `immagini/`, con il nome del codice.

In Figma i frame hanno ancora i nomi numerati: la colonna "Frame" dice quale. Link: `https://www.figma.com/design/DSXFok6tsIbfbtBWXjt99O?node-id=<id con il trattino>`.

| Codice | Schermata | Frame in Figma | Nodo | Schema | Stato |
|---|---|---|---|---|---|
| SC-01 | Accesso | 01 · Accesso | 2:2 | Centrata | Come l'app |
| SC-02 | Carica file | 02 · Utente – Carica file | 8:125 | Pannelli | Allineata all'app il 5 nov 2026 |
| SC-03 | Archivio | 03 · Utente – Archivio | 42:251 | Griglia | Nuova, 5 nov 2026 |
| SC-03.1 | Archivio, scheda di un film | 03.1 · Utente – Archivio, scheda di un film | 43:623 | Scheda | Nuova |
| SC-03.2 | Archivio, scheda di una serie | 03.2 · Utente – Archivio, scheda di una serie | 43:707 | Scheda | Nuova |
| SC-04 | Approvazioni | 04 · Admin – Approvazioni | 8:470 | Pannelli | Allineata all'app |
| SC-05 | Utenti | 05 · Admin – Utenti | 11:124 | Pannelli | Allineata all'app |
| SC-06 | Cartelle | 06 · Admin – Cartelle | 23:179 | Pannelli | Barra laterale nuova |
| SC-07 | Catalogo | 07 · Admin – Catalogo | 42:599 | Pannelli | Nuova |
| SC-08 | Archivio, telefono | 08 · Telefono – Archivio | 43:1429 | Griglia | Nuova |
| SC-08.1 | Menu aperto, telefono | 08.1 · Telefono – Menu aperto | 43:1545 | — | Nuova |
| SC-09 | Approvazioni, telefono | 09 · Telefono – Approvazioni | 46:1588 | Elenco | Nuova |
| SC-10 | Utenti, telefono | 10 · Telefono – Utenti | 46:1794 | Elenco | Nuova |
| SC-11 | Cartelle, telefono | 11 · Telefono – Cartelle | 46:2024 | Elenco | Nuova |
| SC-12 | Catalogo, telefono | 12 · Telefono – Catalogo | 46:2137 | Pannelli | Nuova |
| SC-13 | I miei trasferimenti | — | — | Pannelli | Non disegnata (registro, Rinviato) |

## Schemi
| Schema | Struttura | Schermate |
|---|---|---|
| Pannelli | Barra laterale + contenuto: intestazione (titolo, testo, azioni), riquadri, tabella o elenco, nota in fondo | SC-02, SC-04…07, SC-12 |
| Griglia | Intestazione con ricerca, schede (Tutti / Film / Serie TV / Altri file), griglia di copertine | SC-03, SC-08 |
| Scheda | Finestra sopra la pagina scurita: testa (copertina, titolo, trama) e corpo (stagioni, righe file) | SC-03.1, SC-03.2 |
| Elenco | Come Pannelli sul telefono, con le tabelle trasformate in elenco che si apre | SC-09…11 |
| Centrata | Riquadro al centro | SC-01 |

## Regole comuni del telefono (fino a 720 px)
- Barra in alto con il pulsante del menu; il menu è la barra laterale come pannello da sinistra (300 px), sopra la pagina scurita.
- Titolo, testo e pulsanti vanno a capo; i riquadri affiancati vanno uno sotto l'altro.
- Le tabelle diventano **elenchi che si aprono** (Riga dell'elenco): Approvazioni, Utenti, Cartelle.
- Griglia dell'Archivio a due colonne.
- Le schermate da telefono in Figma sono disegnate per intero in altezza (tutta la pagina, non solo il primo schermo), tranne SC-08 e SC-08.1.

---

## SC-03 – Archivio
**Schema:** Griglia · **Flussi:** 4, 5, 6 · **Figma:** 42:251 · **Immagine:** `immagini/SC-03.png`

**A cosa serve:** sfogliare film e serie per copertina e aprire la scheda per scaricare.

### Stati
| Stato | Cosa si vede |
|---|---|
| Normale | griglia di titoli (copertina, titolo, anno · episodi · peso); "N stagioni" sulle serie |
| Vuoto | "Nessun file nell'archivio." |
| Ricerca senza risultati | "Nessun titolo trovato." |
| Caricamento | "Carico…" |
| Senza catalogo | tutti i file come riquadri neutri |
| File non nel catalogo | riquadro neutro con nome; scheda "Altri file" |
| Banda oltre il 50% | avviso giallo sopra la griglia |

### Componenti usati
CMP-08, CMP-09, CMP-10, CMP-11, CMP-14

### Testi
Sottotitolo: "Scegli un film o una serie per vedere i file e scaricarli. Se un file supera la banda che ti resta, serve l'approvazione dell'amministratore." · Nota: "I link di download scadono dopo un tempo stabilito dall'amministratore · se la connessione cade il download riprende da dove si era fermato".

## SC-03.1 / SC-03.2 – Scheda di un titolo
**Schema:** Scheda · **Flussi:** 5 · **Figma:** 43:623, 43:707

**A cosa serve:** vedere trama e file di un film o di una serie e scaricarli **uno alla volta** (niente "Scarica la stagione").

| Stato | Cosa si vede |
|---|---|
| Film | testa + un file con il pulsante Scarica |
| Serie | testa con la copertina della stagione scelta, schede delle stagioni, episodi con numero e titolo |
| Download già fatto | "Scarica di nuovo" (secondario) + "Link valido fino al …" |
| Oltre la banda | "Richiedi download" + "Oltre la banda rimasta (…): serve approvazione" |
| In attesa | etichetta "Richiesta inviata" |
| File non nel catalogo | testa con riquadro neutro e "Questo file non è nel catalogo di Jellyfin…" |

Si chiude con la X, con Esc o cliccando fuori. **Componenti:** CMP-01, CMP-02, CMP-08, CMP-10, CMP-12, CMP-13.

## SC-07 – Catalogo
**Schema:** Pannelli · **Flussi:** 11 · **Figma:** 42:599

**A cosa serve:** caricare lo zip esportato da Jellyfin e vedere quanti file del NAS sono riconosciuti.

| Stato | Cosa si vede |
|---|---|
| Nessun catalogo | "Nessun catalogo caricato: l'Archivio mostra i file senza copertine." |
| Catalogo caricato | numeri (film, serie, episodi, copertine), origine e data; file riconosciuti "N di M" |
| File senza scheda | elenco dei primi 20 |
| Caricamento | "Carico nome.zip…" accanto al pulsante |
| Errore | messaggio rosso (zip non valido, manca catalogo.json…) |

## SC-09…11 – Admin sul telefono
**Schema:** Elenco · **Figma:** 46:1588, 46:1794, 46:2024
- **Approvazioni:** riga = avatar, nome, "↑ Upload · file", percentuale (rosso sopra 100, arancione da 80); aperta = file · peso · quando, barra, quota, Rifiuta / Approva a tutta larghezza.
- **Utenti:** riga = avatar, nome, uso della quota, stato; aperta = il riquadro della persona con i limiti.
- **Cartelle:** riga = icona cartella (blu se visibile), nome, stato, interruttore sempre visibile; aperta = "Gli upload vanno in questa cartella".
