# Componenti

I componenti vivono nel file Figma di FilmShare, pagina **Componenti** (link in `AGENTS.md`). I primi quattro sono in alto; quelli nati con l'Archivio a copertine sono nella sezione **Archivio e Catalogo**, insieme alle icone. Ogni componente usa le variabili colore e gli stili di testo del file. La sezione ha lo sfondo `bg/app`, quindi l'anteprima è già in scuro (l'app non ha il tema chiaro).

Link ai nodi: `https://www.figma.com/design/DSXFok6tsIbfbtBWXjt99O?node-id=<id con il trattino>`.

| Codice | Componente | Tipo | Nodo | Stato |
|---|---|---|---|---|
| CMP-01 | Pulsante (Button) | base | 1:38 | Esistente |
| CMP-02 | Etichetta di stato (Badge) | base | 1:63 | Esistente |
| CMP-03 | Voce del menu (NavItem) | base | 1:74 | Esistente |
| CMP-04 | Interruttore (Toggle) | base | 1:79 | Esistente |
| CMP-05 | Icone (Icona/…) | base | sezione 38:2 | Nuovo, 5 nov 2026 |
| CMP-06 | Avatar | base | 54:121 | Nuovo, 5 nov 2026 |
| CMP-07 | Marchio | base | 41:28 | Nuovo, 5 nov 2026 |
| CMP-08 | Scheda (tab) | base | 38:128 | Nuovo, 5 nov 2026 |
| CMP-09 | Campo di ricerca | base | 38:129 | Nuovo, 5 nov 2026 |
| CMP-10 | Copertina | base | 38:89 | Nuovo, 5 nov 2026 |
| CMP-11 | Titolo in griglia | composto | 38:105 | Nuovo, 5 nov 2026 |
| CMP-12 | Riga file | composto | 41:95 | Nuovo, 5 nov 2026 |
| CMP-13 | Testa della scheda | composto | 41:150 | Nuovo, 5 nov 2026 |
| CMP-14 | Barra laterale | composto | 41:151 | Nuovo, 5 nov 2026 |
| CMP-15 | Barra in alto (telefono) | composto | 41:217 | Nuovo, 5 nov 2026 |
| CMP-16 | Riga dell'elenco | composto | 54:222 | Nuovo, 5 nov 2026 |

### Parti interne
Nessuna per ora: i composti usano direttamente i componenti base.

### Spazi dei contenitori
Valori presi dal codice (`web/src/styles.css`). In Figma sono scritti a mano: le variabili di spazio non esistono ancora (registro, Da confermare).

| Ruolo | Esempio | Margine | Distanze dentro |
|---|---|---|---|
| Pagina, computer | contenuto accanto alla barra laterale | 32 sopra e sotto, 40 ai lati | 24 tra i blocchi |
| Pagina, telefono | contenuto sotto la barra in alto | 20 sopra, 16 ai lati, 32 sotto | 20 tra i blocchi |
| Riquadro (card) | riepiloghi, Catalogo | 20 | 10 |
| Riquadro con tabella o elenco | Approvazioni, Utenti, Cartelle | 0 (le righe hanno il loro) | righe separate da una linea |
| Riga di tabella o di elenco | Riga file, Riga dell'elenco | 12 sopra e sotto, 16 ai lati | 10–14 tra i pezzi |
| Finestra (scheda di un titolo) | scheda film o serie | 24 (16 sul telefono) | 16 nel corpo |
| Elenco (menu) | barra laterale | 24 sopra, 16 ai lati e sotto | 4 tra le voci, 20 tra i gruppi |

### Superfici su cui compare ogni componente
| Componente | Fondo pagina (`bg/app`) | Riquadro (`bg/surface`) | Riga aperta (`bg/elevated`) | Finestra |
|---|---|---|---|---|
| Pulsante | sì | sì | sì | sì |
| Etichetta di stato | — | sì | sì | sì |
| Copertina, Titolo in griglia | sì | — | — | sì (testa della scheda) |
| Riga file | — | — | — | sì |
| Riga dell'elenco | — | sì | sì (aperta) | — |
| Campo di ricerca | sì | — | — | — |

---

## CMP-05 – Icone
**Tipo:** base · **Usato in:** tutte le schermate · **Figma:** sezione 38:2

**Scopo:** le icone dell'app, dal set Lucide, come nel codice (`lucide-react`).
**Elenco:** Film 16/20/28, Cerca 16/20, Chiudi 16/20, Menu 16/20, Carica 16/20, Info 16/20, Esci 16/20, Freccia giù 16, Cartella 18, Pausa 16, Campanella 20.
**Regola:** il colore si cambia sul disegno interno (contorno collegato a una variabile); la misura si sceglie con il componente giusto, non ridimensionando.

## CMP-06 – Avatar
**Tipo:** base · **Usato in:** Riga dell'elenco, Approvazioni, Utenti · **Figma:** 54:121
**Scopo:** cerchio da 32 px con le iniziali della persona. **Proprietà:** Iniziali.
**Nota:** la barra laterale e le tabelle vecchie da computer hanno ancora l'avatar disegnato a mano (registro, Da confermare).

## CMP-07 – Marchio
**Tipo:** base · **Usato in:** Barra laterale, Barra in alto · **Figma:** 41:28
**Scopo:** logo (quadrato blu con il triangolo) e nome "FilmShare".

## CMP-08 – Scheda (tab)
**Tipo:** base · **Usato in:** Archivio (Tutti / Film / Serie TV / Altri file), scheda serie (stagioni) · **Figma:** 38:128
**Varianti:** Stato = Default | Active. **Proprietà:** Etichetta.

| Stato | Descrizione |
|---|---|
| Default | testo secondario |
| Active | testo pieno, linea blu sotto |
| Hover, Focus | come nel codice: anello blu sul fuoco da tastiera; non disegnati |

**Accessibilità:** nel codice sono `role="tab"` con `aria-selected`.

## CMP-09 – Campo di ricerca
**Tipo:** base · **Usato in:** Archivio · **Figma:** 38:129
Largo 280 su computer, a tutta larghezza sul telefono. **Proprietà:** Testo.

## CMP-10 – Copertina
**Tipo:** base · **Usato in:** Titolo in griglia, Testa della scheda · **Figma:** 38:89
**Scopo:** copertina 2:3 di un film o una serie. Senza immagine (file non riconosciuto, o nelle schermate Figma) mostra icona, titolo e anno su fondo neutro.
**Proprietà:** Titolo, Anno, Mostra anno, Etichetta, Mostra etichetta (es. "5 stagioni").
**Note:** l'etichetta in alto a sinistra copre l'icona sulle copertine neutre (registro, Da confermare). Nel codice il fondo neutro è una sfumatura e l'etichetta è semitrasparente; in Figma sono a tinta unita perché i colori collegati a variabile perdono la trasparenza del riempimento.

## CMP-11 – Titolo in griglia
**Tipo:** composto · **Usato in:** Archivio (computer e telefono) · **Figma:** 38:105
Copertina + titolo su una riga + dettagli (anno, episodi, peso). Cliccandolo si apre la scheda. **Proprietà:** Titolo, Dettagli (e quelle della copertina interna).

## CMP-12 – Riga file
**Tipo:** composto · **Usato in:** scheda film e serie · **Figma:** 41:95
**Varianti:** Tipo = Episodio | File; Layout = Computer | Telefono. **Proprietà:** Numero, Titolo, Dettagli, Nota, Linea sopra.
A destra il pulsante di download con la nota sotto (stato, banda). Sul telefono le azioni vanno sotto il testo.
**Nota:** il pulsante in Figma è alto 36; nell'app nelle righe è quello piccolo (30). Manca la misura piccola del pulsante (registro, Da confermare).

## CMP-13 – Testa della scheda
**Tipo:** composto · **Usato in:** scheda film e serie · **Figma:** 41:150
**Varianti:** Layout = Computer | Telefono. **Proprietà:** Titolo, Titolo originale, Mostra titolo originale, Dettagli, Trama.
Copertina (per le serie, quella della stagione scelta), titoli, dettagli, trama e pulsante per chiudere.

## CMP-14 – Barra laterale
**Tipo:** composto · **Usato in:** tutte le schermate da computer, menu aperto sul telefono · **Figma:** 41:151
**Proprietà:** Amministrazione (mostra il gruppo admin), Pulsante chiudi (sul telefono), Nome, Ruolo, Iniziali. La voce attiva e il numero accanto ad "Approvazioni" si cambiano sulle voci interne.

## CMP-15 – Barra in alto (telefono)
**Tipo:** composto · **Usato in:** tutte le schermate da telefono · **Figma:** 41:217
Pulsante del menu e marchio. **Proprietà:** Avviso (pallino blu se ci sono approvazioni in attesa).
**Accessibilità:** nel codice il pulsante ha `aria-expanded` e `aria-controls`; il menu si chiude con Esc, con la X o toccando fuori.

## CMP-16 – Riga dell'elenco
**Tipo:** composto · **Usato in:** Approvazioni, Utenti e Cartelle sul telefono · **Figma:** 54:222
**Scopo:** la riga dell'elenco che si apre, al posto delle tabelle sul telefono.
**Varianti:** Stato = Chiusa | Aperta (gira la freccia); Livello = 0 | 1 | 2 (rientro delle cartelle annidate); Inizio = Avatar | Cartella.
**Proprietà:** Titolo, Sotto, Mostra sotto, Valore, Mostra valore, Mostra etichetta, Mostra interruttore.
**Regola:** il contenuto che si apre e lo sfondo della riga aperta (`bg/elevated`) stanno nel contenitore della riga, nella schermata, perché cambiano da pagina a pagina. Nel codice: `web/src/elenco.tsx`.

| Stato | Descrizione |
|---|---|
| Chiusa | una riga: inizio, titolo, riga sotto, valore o etichetta, freccia, interruttore |
| Aperta | sfondo `bg/elevated`, freccia in su, contenuto sotto con rientro di 58 (16 se il contenuto è un riquadro intero, come in Utenti) |
| Focus | nel codice: anello blu dentro la riga |

**Accessibilità:** nel codice la parte toccabile è un pulsante con `aria-expanded`; l'interruttore delle cartelle sta fuori dal pulsante, così si usa senza aprire la riga.
