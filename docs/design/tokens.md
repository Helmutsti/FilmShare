# Tokens

I componenti usano le variabili colore del file Figma (collezione **FilmShare**, un solo modo: "Dark"). Nel codice il nome resta lo stesso con il trattino: `bg/app` → `var(--bg-app)` (`web/src/styles.css`).

**Debito noto:** non ci sono ancora primitivi separati dai semantici, né variabili di spazi, raggi e misure (vedi `registro.md`, Da confermare).

## Primitivi
Non esistono come collezione separata: i valori sono scritti direttamente nei semantici.

## Semantici · colore
| Token | Scuro | Uso |
|---|---|---|
| `bg/app` | #0b0f17 | fondo della pagina |
| `bg/surface` | #121826 | riquadri, barra laterale, finestre |
| `bg/elevated` | #1b2335 | controlli, intestazioni di tabella, riga aperta |
| `bg/hover` | #2a3550 | passaggio del mouse, binario delle barre |
| `border/default` | #232c40 | bordi e separatori |
| `border/strong` | #36425e | bordi dei controlli |
| `text/primary` | #f3f5f9 | testo principale |
| `text/secondary` | #a3acbf | testo secondario |
| `text/muted` | #6b7489 | note, didascalie, icone spente |
| `text/on-accent` | #ffffff | testo sul blu |
| `accent/primary` | #0d76de | azione principale, voce attiva (era #7c6cff fino al 4 nov 2026) |
| `status/success` | #22c55e | completato, attivo, dentro la quota |
| `status/warning` | #f5a524 | in attesa, quota dall'80% |
| `status/danger` | #ef4444 | rifiutato, bloccato, oltre la quota |
| `status/info` | #38bdf8 | in corso, download |
| `tint/primary-5`, `-16`, `-20`, `-50` | #0d76de al 5, 16, 20, 50% | fondi tenui del blu (avatar, icone dei file, voce attiva) |
| `tint/info-14`, `-20` | #38bdf8 al 14, 20% | etichetta "in corso" |
| `tint/success-14`, `-16` | #22c55e al 14, 16% | etichette verdi, pulsante Approva |
| `tint/warning-10`, `-14`, `-35` | #f5a524 al 10, 14, 35% | avviso giallo, etichetta in attesa |
| `tint/danger-14` | #ef4444 al 14% | etichette rosse, pulsante Rifiuta |

## Spazi
Nel codice ci sono come variabili CSS; in Figma sono scritti a mano.

| Token (codice) | Valore | Ruolo |
|---|---|---|
| `--space-page-y` | 32 | margine sopra e sotto della pagina (computer) |
| `--space-page-x` | 40 | margine ai lati della pagina (computer) |
| `--space-section` | 24 | distanza tra i blocchi della pagina |
| `--space-card` | 20 | margine dentro un riquadro |
| (telefono) | 20 / 16 / 32 | margine della pagina sopra / ai lati / sotto |

## Semantici · dimensioni e movimento
| Token (codice) | Valore | Uso |
|---|---|---|
| `--radius-card` | 12 | riquadri, finestre, elenchi |
| `--radius-control` | 8 | pulsanti, campi, icone dei file |
| (copertina) | 10 | copertine |
| durata | 0,15–0,2 s | freccia dell'elenco, menu del telefono, copertina al passaggio; spente se il sistema chiede meno movimento |

## Tipografia
Carattere: Inter.

| Stile | Carattere · grandezza · peso | Uso |
|---|---|---|
| Display | Inter 28 Bold | titolo della pagina (24 sul telefono nel codice) |
| Title | Inter 20 Semi Bold | titoli delle finestre e della scheda |
| Heading | Inter 16 Semi Bold | titoli dei riquadri, titolo sulla copertina neutra |
| Metric | Inter 26 Bold | numeri dei riepiloghi |
| Body | Inter 14 Regular | testo |
| BodyStrong | Inter 14 Medium | nomi, titoli nelle righe |
| Label | Inter 13 Medium | etichette dei campi, valori |
| Caption | Inter 12 Regular | dettagli, note |
| Overline | Inter 11 Semi Bold, maiuscolo | intestazioni di tabella, gruppi del menu |

## Ombre ed elevazione
Nessuna ombra: i livelli si distinguono con i fondi (`bg/app` → `bg/surface` → `bg/elevated`) e con il velo scuro dietro finestre e menu.

## Scala z-index
| Livello | Valore (codice) | Uso |
|---|---|---|
| 0 | — | contenuto |
| 1 | 30 | barra in alto del telefono |
| 2 | 45 | velo dietro il menu del telefono |
| 3 | 50 | menu del telefono, finestre |
| 4 | 60 | avvisi brevi |

## Fondi dei controlli sulle superfici
I controlli usano `bg/elevated` (campi, pulsante secondario), che è diverso sia da `bg/app` sia da `bg/surface`. Nella riga aperta dell'elenco (fondo `bg/elevated`) i pulsanti usano i fondi tenui di stato, non `bg/elevated`.

## Verifica contrasti
Non ancora calcolata (registro, Rinviato).

| Coppia | Scuro |
|---|---|
| `text/primary` su `bg/surface` | [da calcolare] |
| `text/muted` su `bg/surface` | [da calcolare] |
| `text/on-accent` su `accent/primary` | [da calcolare] |
