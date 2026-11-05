# AGENTS.md – FilmShare

Istruzioni per gli agenti IA che lavorano su questo progetto.

## Il progetto
Scambio di film e file pesanti tra amici, da un server di casa con il NAS. Ogni persona ha una quota (upload + download insieme) in un periodo; oltre la quota serve l'approvazione dell'amministratore. L'Archivio mostra film e serie a copertine, dal catalogo esportato da Jellyfin.

## Design

Il lavoro grafico segue la skill **design-figma** (il metodo è nel file `guida.md` della skill). Questa sezione contiene solo i dati di questo progetto. Dove una regola qui sotto è diversa dalla guida, vale questa.

### File Figma
| File | Link | Note |
|---|---|---|
| FilmShare (libreria e schermate insieme) | https://www.figma.com/design/DSXFok6tsIbfbtBWXjt99O | Un solo file: vedi "Eccezioni del progetto" |

ID delle pagine (per i controlli automatici):
| Pagina | Contenuto | ID |
|---|---|---|
| Componenti | Componenti base e composti; sezione "Archivio e Catalogo" con i componenti nuovi e le icone | 0:1 |
| Schermate | Tutte le schermate, computer (1440) e telefono (390) | 1:27 |
| Proposte · Carica file | Prove: alternative per "I miei trasferimenti" | 26:2 – esclusa dai controlli |
| Proposte · Tabelle sul telefono | Prove: alternative per le tabelle sul telefono | 49:121 – esclusa dai controlli |

### Documenti del design
Cartella: `docs/design/` (flussi, moodboard, tokens, componenti, schermate, registro, immagini).

### Codici
`SC-` schermate · `CMP-` componenti. I codici sono nei documenti; in Figma i frame hanno ancora i nomi numerati (`03 · Utente – Archivio`): la corrispondenza è in `docs/design/schermate.md`.

### Verifica
Comando: `/verifica-design` (`.claude/commands/verifica-design.md`). Da lanciare dopo ogni giro di modifiche e prima di chiudere una fase di disegno. In questo progetto: "libreria" = pagina Componenti, "mockup" = pagina Schermate (i frame si riconoscono dai nomi in `schermate.md`, non dal prefisso `SC-`).

### Come si lavora
- **Livello di controllo di base:** passo per passo
- **Chi decide:** Manuel Cucca
- **Lingua dei nomi** in Figma e nel codice: italiano per componenti, pagine e testi; i token colore hanno nomi inglesi brevi (`bg/app`, `text/primary`) come nel codice
- **Nomi dei token nel codice:** stesso nome con il trattino: `bg/app` → `var(--bg-app)`, `accent/primary` → `var(--accent-primary)` (`web/src/styles.css`)

### Eccezioni del progetto
- **Un solo file Figma** per libreria e schermate (la guida §7 ne vuole due). Il progetto è piccolo e la libreria non si pubblica: i componenti si usano dallo stesso file. Da rivedere se il file cresce (vedi `registro.md`, Da confermare).
- **Solo tema scuro:** l'app non ha il tema chiaro, quindi la collezione colori ha un solo modo ("Dark").
- **Spazi, raggi e misure senza variabili** in Figma: oggi sono valori scritti a mano, presi dal codice. È un debito noto (registro, Da confermare), non una regola.

## Codice
- **Stack:** server Fastify (Node, TypeScript, SQLite) in `server/`, dashboard React + Vite in `web/`; una sola immagine Docker.
- **Comandi:** `npm install`, `npm run dev`, `npm run typecheck`, `npm test`, `npm run build`. Docker: `docker compose up -d --build`.
- **Strumenti:** `strumenti/esporta-catalogo-jellyfin.ps1` (Windows) e `.sh` (Mac) creano lo zip del catalogo da caricare nella pagina Catalogo.
- Dettagli in `README.md`.
