# Registro del design

Chi riprende il lavoro, persona o agente, parte da qui.

## Decisioni
Una decisione non si riscrive: se cambia, se ne aggiunge una nuova che dice quale supera.

| Data | Decisione | Perché | Tocca |
|---|---|---|---|
| 2026-11-04 | Colore principale blu `#0d76de` (dopo viola e verde acqua) | Scelta di Manuel | `accent/primary`, tutte le schermate |
| 2026-11-04 | "I miei trasferimenti" accanto al riquadro di upload, tabella ridotta a tre colonne con pulsanti a icona (proposta C) | Più leggibile accanto al riquadro di upload | SC-02 |
| 2026-11-05 | L'Archivio mostra film e serie a copertine con titolo, non un elenco di file | Un elenco infinito di episodi non serve a chi vuole scaricare | SC-03, CMP-10, CMP-11 |
| 2026-11-05 | Copertine e trame vengono da un catalogo esportato da Jellyfin in uno zip, caricato a mano dall'amministratore; FilmShare non chiama mai Jellyfin | Jellyfin non è raggiungibile per il firewall; nessuna porta da aprire | SC-07, `strumenti/` |
| 2026-11-05 | Il catalogo contiene solo film e serie, niente collezioni | Scelta di Manuel | script di esportazione |
| 2026-11-05 | Script di esportazione per Windows (PowerShell) e Mac (bash + JavaScript di macOS) | Manuel usa il Mac | `strumenti/` |
| 2026-11-05 | I file si abbinano al catalogo per nome del file e cartelle finali | Jellyfin e FilmShare vedono il NAS da percorsi diversi; nessuna impostazione da fare | abbinamento, SC-07 |
| 2026-11-05 | Niente "Scarica la stagione": si scarica un episodio alla volta | Ogni file è un download con la sua quota; il browser non regge molti download insieme | SC-03.2 |
| 2026-11-05 | L'app ha la vista da telefono (fino a 720 px): menu a pannello dalla barra in alto, griglia a due colonne, blocchi uno sotto l'altro | Richiesta di Manuel | tutte le schermate, CMP-15 |
| 2026-11-05 | Sul telefono le tabelle diventano un elenco che si apre (proposta B) | Le tabelle venivano tagliate; B è la più compatta | SC-09…11, CMP-16 |
| 2026-11-05 | La riga dell'elenco è un componente (Riga dell'elenco) | Una modifica vale ovunque | CMP-16 |
| 2026-11-05 | Nuovi componenti in libreria: icone, Avatar, Marchio, Scheda, Campo di ricerca, Copertina, Titolo in griglia, Riga file, Testa della scheda, Barra laterale, Barra in alto | Servono alle schermate nuove | CMP-05…15 |
| 2026-11-05 | Nelle schermate Figma le copertine sono riquadri neutri con il titolo | Scelta di Manuel | SC-03, SC-08 |
| 2026-11-05 | Cancellata la vecchia schermata "Cartella condivisa" a tabella | Sostituita dall'Archivio a copertine | — |
| 2026-11-05 | Le schermate Figma seguono l'app: Approvazioni (senza "Rifiuta selezionati", riepiloghi senza barre), Utenti (solo quota, periodo, ruolo, upload, password), Carica file, barra laterale nuova ovunque | Figma era rimasto indietro rispetto all'app | SC-02, SC-04, SC-05, SC-06 |
| 2026-11-05 | Colore delle percentuali di quota: rosso sopra 100%, arancione dall'80%, verde sotto | Stessa regola dell'app | SC-04, SC-09 |

## Da confermare
Proposte dell'agente in attesa dell'ok. Confermata, una proposta passa tra le decisioni.

| Data | Proposta | Dove |
|---|---|---|
| 2026-11-05 | Spostare l'etichetta "N stagioni" in alto a destra sulle copertine (oggi copre l'icona sulle copertine neutre), in Figma e nell'app | CMP-10 |
| 2026-11-05 | Rinominare i frame delle schermate con i codici `SC-` | pagina Schermate |
| 2026-11-05 | Creare le variabili di spazi, raggi e misure (collezione Dimensioni) e collegarle | tutto il file |
| 2026-11-05 | Separare i primitivi dai semantici nei colori | variabili |
| 2026-11-05 | Aggiungere la misura piccola (30 px) al Pulsante, come nell'app nelle righe | CMP-01, CMP-12 |
| 2026-11-05 | Usare il componente Avatar anche nella barra laterale e nelle tabelle da computer | CMP-06, CMP-14 |
| 2026-11-05 | Dividere il file Figma in libreria e schermate, se il file cresce | file |
| 2026-11-05 | Funzioni e flussi in `flussi.md`, ricostruiti dall'app | flussi.md |

## Rinviato
| Data | Cosa | Perché | Quando riprenderlo |
|---|---|---|---|
| 2026-11-05 | Schermata "I miei trasferimenti" (SC-13) in Figma | Non chiesta in questo giro | Alla prossima revisione delle schermate |
| 2026-11-05 | Calcolo dei contrasti (WCAG AA) | Non chiesto in questo giro | Con le variabili di dimensione |
| 2026-11-05 | Copertine vere nelle schermate Figma | Scelta di usare riquadri neutri | Se servono per presentare il progetto |
