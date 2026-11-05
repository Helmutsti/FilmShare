# Funzioni e flussi

Cosa deve permettere di fare l'interfaccia (funzioni) e il percorso per farlo (flussi). Superfici: computer (da 721 px) e telefono (fino a 720 px), nel browser · Comandi: mouse, tocco, tastiera.

*Ricostruite il 5 novembre 2026 dall'app esistente. Proposta dell'agente, da confermare.*

## Funzioni
| # | Funzione | Gruppo |
|---|---|---|
| F1 | Accedere con email e password | Accesso |
| F2 | Caricare file e cartelle, anche molto grandi, con ripresa | Spazio personale |
| F3 | Vedere la propria banda (quota) e quando si azzera | Spazio personale |
| F4 | Sfogliare l'archivio per copertine (film, serie, altri file) | Archivio |
| F5 | Aprire la scheda di un titolo e scaricare un film o un episodio | Archivio |
| F6 | Cercare un titolo | Archivio |
| F7 | Seguire i propri trasferimenti (pausa, riprendi, annulla) | Spazio personale |
| F8 | Approvare o rifiutare le richieste oltre la quota | Amministrazione |
| F9 | Gestire le persone: quota, periodo, ruolo, upload, password, sospensione | Amministrazione |
| F10 | Sospendere tutti i trasferimenti | Amministrazione |
| F11 | Scegliere le cartelle visibili e quella degli upload | Amministrazione |
| F12 | Caricare il catalogo esportato da Jellyfin | Amministrazione |

## Regole di navigazione
- **Computer:** barra laterale sempre visibile; la voce attiva è evidenziata.
- **Telefono:** barra in alto con il pulsante del menu; il menu si apre da sinistra e si chiude con la X, con Esc, toccando fuori o cambiando pagina.
- **Scheda di un titolo:** finestra sopra l'Archivio; si chiude con la X, Esc o clic fuori; il fuoco va sul pulsante per chiudere.
- **Elenchi che si aprono (telefono):** una riga aperta per volta; toccare di nuovo la chiude.
- Gli aggiornamenti arrivano da soli (eventi dal server): non c'è un pulsante "aggiorna".

## Flussi
| # | Flusso | Funzioni | Percorso |
|---|---|---|---|
| 1 | Accesso | F1 | Accesso → email e password → Carica file. Password sbagliata: messaggio sotto il modulo |
| 2 | Caricare un file | F2, F3 | Carica file → trascina o "Scegli file" → riga in "I miei trasferimenti" con avanzamento. Oltre la banda: "In attesa di approvazione", parte dopo l'ok. Upload non permesso: riquadro "Il caricamento non è abilitato" |
| 3 | Seguire i trasferimenti | F7 | Carica file (ultimi 6) o I miei trasferimenti → pausa / riprendi / annulla con i pulsanti a icona; "Svuota storico" toglie quelli finiti |
| 4 | Sfogliare l'archivio | F4, F6 | Archivio → schede Tutti / Film / Serie TV / Altri file → ricerca per titolo |
| 5 | Scaricare | F5 | Archivio → copertina → scheda → (serie: stagione) → Scarica. Oltre la banda: "Richiedi download" → richiesta all'amministratore. Già scaricato: "Scarica di nuovo" finché il link vale |
| 6 | File non riconosciuto | F4, F5 | Archivio → riquadro neutro (anche nella scheda "Altri file") → scheda con il solo file → Scarica |
| 7 | Approvare | F8 | Approvazioni → Rifiuta / Approva sulla riga, oppure "Approva entro i limiti". Telefono: tocca la riga → si apre con i pulsanti |
| 8 | Gestire una persona | F9 | Utenti → persona → riquadro dei limiti → Salva modifiche. Telefono: tocca la riga → il riquadro si apre lì sotto. "Nuovo utente" apre la finestra di creazione |
| 9 | Sospendere tutto | F10 | Utenti → interruttore "Sospendi trasferimenti" → avviso rosso in tutte le pagine |
| 10 | Cartelle | F11 | Cartelle → interruttori "visibile" e scelta della cartella degli upload → Salva modifiche. Telefono: interruttore sulla riga, scelta degli upload aprendo la riga |
| 11 | Catalogo | F12 | (fuori dall'app) script di esportazione da Jellyfin → Catalogo → Carica zip → numeri aggiornati, Archivio con le copertine |

## Schermate che ne derivano
SC-01 Accesso · SC-02 Carica file · SC-03 Archivio (con SC-03.1 e SC-03.2) · SC-04 Approvazioni · SC-05 Utenti · SC-06 Cartelle · SC-07 Catalogo · SC-13 I miei trasferimenti · versioni telefono SC-08…SC-12. Dettagli in `schermate.md`.
