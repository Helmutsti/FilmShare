#!/bin/bash
# Esporta il catalogo di Jellyfin (film e serie, con stagioni, episodi e copertine) in uno zip da caricare in FilmShare.
# Versione per Mac: usa solo strumenti già presenti in macOS (bash, curl, zip, osascript). Niente da installare.
#
# Va lanciato da un Mac che raggiunge Jellyfin. Legge soltanto: non cambia niente su Jellyfin.
# Esporta solo film e serie: niente collezioni, playlist, musica o foto.
# Dentro lo zip:
#   catalogo.json        titoli, anni, generi, trame e percorsi dei file
#   copertine/*.jpg      copertina di ogni film, serie e stagione
#
# Serve una chiave API di Jellyfin: Dashboard > Chiavi API > "+" (dai un nome tipo "FilmShare").
#
# Uso:
#   bash esporta-catalogo-jellyfin.sh http://192.168.1.20:8096
#   bash esporta-catalogo-jellyfin.sh http://jellyfin.local:8096 -o ~/Desktop/catalogo.zip -w 500
# Opzioni:
#   -k CHIAVE   chiave API (se manca la chiede a video, senza mostrarla)
#   -o FILE     dove salvare lo zip (predefinito: catalogo-jellyfin.zip nella cartella corrente)
#   -w PIXEL    larghezza delle copertine (predefinito: 400)

set -euo pipefail

SERVER="${1:-}"
if [ -z "$SERVER" ] || [ "${SERVER#-}" != "$SERVER" ]; then
  sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
  exit 1
fi
shift
SERVER="${SERVER%/}"
CHIAVE=""
USCITA="$PWD/catalogo-jellyfin.zip"
LARGHEZZA=400
while getopts "k:o:w:" opz; do
  case "$opz" in
    k) CHIAVE="$OPTARG" ;;
    o) USCITA="$OPTARG" ;;
    w) LARGHEZZA="$OPTARG" ;;
    *) exit 1 ;;
  esac
done
case "$USCITA" in /*) ;; *) USCITA="$PWD/$USCITA" ;; esac
if [ -z "$CHIAVE" ]; then
  read -r -s -p "Chiave API di Jellyfin: " CHIAVE
  echo
fi

LAVORO="$(mktemp -d)"
trap 'rm -rf "$LAVORO"' EXIT
ZIP="$LAVORO/zip"
mkdir -p "$ZIP/copertine" "$LAVORO/pagine"

chiedi() { # chiedi <percorso> <file di uscita>
  curl -fsS --max-time 120 -H "X-Emby-Token: $CHIAVE" -H "Authorization: MediaBrowser Token=\"$CHIAVE\"" -o "$2" "$SERVER$1"
}

# Aiutante in JavaScript (integrato in macOS, si lancia con osascript): legge le risposte di Jellyfin e scrive il catalogo.
cat > "$LAVORO/aiutante.js" <<'FINE_JS'
ObjC.import('Foundation');
function leggi(p) { return JSON.parse($.NSString.stringWithContentsOfFileEncodingError(p, $.NSUTF8StringEncoding, null).js); }
function scrivi(p, testo) { $(testo).writeToFileAtomicallyEncodingError(p, true, $.NSUTF8StringEncoding, null); }
function esiste(p) { return $.NSFileManager.defaultManager.fileExistsAtPath(p); }
function testo(v) { return v ? String(v) : null; }

function elementi(dir, pagine) {
  const visti = {}, out = [];
  for (let i = 0; i < pagine; i++) {
    for (const e of leggi(dir + '/pagine/' + i + '.json').Items || []) {
      if (visti[e.Id]) continue; // un film dentro una collezione non deve comparire due volte
      visti[e.Id] = true;
      out.push(e);
    }
  }
  return out;
}
const conCopertina = (e) => e.ImageTags && e.ImageTags.Primary;

function run(argv) {
  const cmd = argv[0], dir = argv[1];
  if (cmd === 'versione') { const i = leggi(dir + '/info.json'); return 'Jellyfin ' + i.Version + ' (' + i.ServerName + ')'; }
  if (cmd === 'admin') { const u = leggi(dir + '/utenti.json').find((x) => x.Policy && x.Policy.IsAdministrator); return u ? u.Id : ''; }
  if (cmd === 'totale') return String(leggi(dir + '/pagine/' + argv[2] + '.json').TotalRecordCount || 0);

  const tutti = elementi(dir, Number(argv[2]));
  const di = (tipo) => tutti.filter((e) => e.Type === tipo);
  const film = di('Movie'), serie = di('Series'), stagioni = di('Season'), episodi = di('Episode');

  if (cmd === 'copertine') { // elenco "id<TAB>nome" delle copertine da scaricare
    return film.concat(serie, stagioni).filter(conCopertina).map((e) => e.Id + '\t' + (e.SeriesName ? e.SeriesName + ' - ' : '') + e.Name).join('\n');
  }

  if (cmd === 'catalogo') {
    const copertina = (e) => (conCopertina(e) && esiste(dir + '/zip/copertine/' + e.Id + '.jpg') ? 'copertine/' + e.Id + '.jpg' : null);
    const base = (e, tipo) => ({
      id: e.Id, tipo: tipo, titolo: e.Name, titoloOriginale: testo(e.OriginalTitle),
      anno: e.ProductionYear || null, generi: e.Genres || [], trama: testo(e.Overview),
      percorso: e.Path || null, copertina: copertina(e), idEsterni: e.ProviderIds || null,
    });
    const perNumero = (a, b) => (a || 0) - (b || 0);
    const titoli = film.map((f) => base(f, 'film')).concat(serie.map((s) => {
      const t = base(s, 'serie');
      t.stagioni = stagioni.filter((x) => x.SeriesId === s.Id).sort((a, b) => perNumero(a.IndexNumber, b.IndexNumber))
        .map((x) => ({ numero: x.IndexNumber, titolo: x.Name, percorso: x.Path || null, copertina: copertina(x) }));
      t.episodi = episodi.filter((x) => x.SeriesId === s.Id)
        .sort((a, b) => perNumero(a.ParentIndexNumber, b.ParentIndexNumber) || perNumero(a.IndexNumber, b.IndexNumber))
        .map((x) => ({ stagione: x.ParentIndexNumber, episodio: x.IndexNumber, titolo: x.Name, trama: testo(x.Overview), percorso: x.Path || null }));
      return t;
    }));
    const info = leggi(dir + '/info.json');
    const catalogo = {
      formato: 'filmshare-catalogo', versione: 1,
      generato: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
      origine: 'Jellyfin ' + info.Version,
      titoli: titoli,
    };
    scrivi(dir + '/zip/catalogo.json', JSON.stringify(catalogo, null, 2));
    return film.length + ' film, ' + serie.length + ' serie, ' + stagioni.length + ' stagioni, ' + episodi.length + ' episodi';
  }
  throw new Error('comando sconosciuto: ' + cmd);
}
FINE_JS
aiuta() { osascript -l JavaScript "$LAVORO/aiutante.js" "$1" "$LAVORO" "${2:-}"; }

# --- 1. Collegamento ---
if ! chiedi "/System/Info" "$LAVORO/info.json"; then
  echo "Non riesco a collegarmi a $SERVER con questa chiave API." >&2
  exit 1
fi
echo "Collegato a $(aiuta versione)"

# Solo film e serie (con stagioni ed episodi). Collezioni, playlist e cartelle escluse.
TIPI="Movie,Series,Season,Episode"
ESCLUSI="BoxSet,Playlist,Folder,CollectionFolder"
CAMPI="Path,Overview,Genres,ProductionYear,OriginalTitle,ProviderIds"
FILTRO="Recursive=true&IncludeItemTypes=$TIPI&ExcludeItemTypes=$ESCLUSI&Fields=$CAMPI&EnableImageTypes=Primary&EnableUserData=false"
# Le versioni recenti accettano /Items con la sola chiave; quelle vecchie vogliono un utente: si usa il primo amministratore.
BASE="/Items?$FILTRO"
if ! chiedi "$BASE&Limit=1" "$LAVORO/prova.json" 2>/dev/null; then
  chiedi "/Users" "$LAVORO/utenti.json"
  ADMIN="$(aiuta admin)"
  if [ -z "$ADMIN" ]; then echo "Nessun amministratore trovato su Jellyfin." >&2; exit 1; fi
  BASE="/Users/$ADMIN/Items?$FILTRO"
fi

# --- 2. Elenco di tutti gli elementi, a pagine ---
PAGINE=0
INIZIO=0
while : ; do
  chiedi "$BASE&StartIndex=$INIZIO&Limit=500" "$LAVORO/pagine/$PAGINE.json"
  TOTALE="$(aiuta totale "$PAGINE")"
  PAGINE=$((PAGINE + 1))
  INIZIO=$((INIZIO + 500))
  echo "  letti $(( INIZIO < TOTALE ? INIZIO : TOTALE )) di $TOTALE elementi"
  [ "$INIZIO" -lt "$TOTALE" ] || break
done

# --- 3. Copertine ---
aiuta copertine "$PAGINE" > "$LAVORO/copertine.txt"
N_COP="$(grep -c . "$LAVORO/copertine.txt" || true)"
FATTE=0
MANCANTI=0
while IFS="$(printf '\t')" read -r ID NOME; do
  [ -n "$ID" ] || continue
  FATTE=$((FATTE + 1))
  echo "  [$FATTE/$N_COP] $NOME"
  if ! chiedi "/Items/$ID/Images/Primary?maxWidth=$LARGHEZZA&quality=85&format=Jpg" "$ZIP/copertine/$ID.jpg" 2>/dev/null; then
    rm -f "$ZIP/copertine/$ID.jpg"
    MANCANTI=$((MANCANTI + 1))
  fi
done < "$LAVORO/copertine.txt"

# --- 4. Catalogo e zip ---
RIEPILOGO="$(aiuta catalogo "$PAGINE")"
rm -f "$USCITA"
(cd "$ZIP" && zip -qr "$USCITA" catalogo.json copertine)

echo
echo "Fatto: $USCITA ($(du -h "$USCITA" | cut -f1))"
echo "  $RIEPILOGO"
if [ "$MANCANTI" -gt 0 ]; then echo "  $MANCANTI copertine non scaricate (Jellyfin ha risposto con un errore)"; fi
