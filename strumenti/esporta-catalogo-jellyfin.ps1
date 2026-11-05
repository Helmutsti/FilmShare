<#
.SYNOPSIS
  Esporta il catalogo di Jellyfin (film e serie, con stagioni, episodi e copertine) in uno zip da caricare in FilmShare.

.DESCRIPTION
  Va lanciato da un PC che raggiunge Jellyfin. Legge soltanto: non cambia niente su Jellyfin.
  Esporta solo film e serie: niente collezioni, playlist, musica o foto.
  Dentro lo zip:
    catalogo.json         titoli, anni, generi, trame e percorsi dei file
    copertine\*.jpg       copertina di ogni film, serie e stagione

  Serve una chiave API di Jellyfin: Dashboard > Chiavi API > "+" (dai un nome tipo "FilmShare").

.EXAMPLE
  .\esporta-catalogo-jellyfin.ps1 -Server http://192.168.1.20:8096
  (la chiave API la chiede a video, senza mostrarla)

.EXAMPLE
  .\esporta-catalogo-jellyfin.ps1 -Server http://jellyfin.local:8096 -Uscita D:\catalogo.zip -Larghezza 500
#>
param(
  [Parameter(Mandatory = $true)] [string] $Server,
  [string] $ChiaveApi,
  [string] $Uscita = (Join-Path (Get-Location) 'catalogo-jellyfin.zip'),
  [int] $Larghezza = 400
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'   # in PowerShell 5.1 la barra di Invoke-WebRequest rallenta molto i download
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$Server = $Server.TrimEnd('/')
if (-not $ChiaveApi) {
  $sicura = Read-Host 'Chiave API di Jellyfin' -AsSecureString
  $ChiaveApi = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sicura))
}
$intestazioni = @{ 'X-Emby-Token' = $ChiaveApi; 'Authorization' = "MediaBrowser Token=`"$ChiaveApi`"" }

function Chiedi([string] $percorso) {
  Invoke-RestMethod -Uri "$Server$percorso" -Headers $intestazioni -UseBasicParsing
}

# --- 1. Collegamento ---
try { $info = Chiedi '/System/Info' }
catch { throw "Non riesco a collegarmi a $Server con questa chiave API: $($_.Exception.Message)" }
Write-Host "Collegato a Jellyfin $($info.Version) ($($info.ServerName))"

# Solo film e serie (con stagioni ed episodi). Collezioni, playlist e cartelle escluse.
$tipi = 'Movie,Series,Season,Episode'
$esclusi = 'BoxSet,Playlist,Folder,CollectionFolder'
$campi = 'Path,Overview,Genres,ProductionYear,OriginalTitle,ProviderIds'
$filtro = "Recursive=true&IncludeItemTypes=$tipi&ExcludeItemTypes=$esclusi&Fields=$campi&EnableImageTypes=Primary&EnableUserData=false"
# Le versioni recenti accettano /Items con la sola chiave; quelle vecchie vogliono un utente: si usa il primo amministratore.
$base = "/Items?$filtro"
try { $null = Chiedi "$base&Limit=1" }
catch {
  $admin = (Chiedi '/Users') | Where-Object { $_.Policy.IsAdministrator } | Select-Object -First 1
  if (-not $admin) { throw 'Nessun amministratore trovato su Jellyfin.' }
  $base = "/Users/$($admin.Id)/Items?$filtro"
}

# --- 2. Elenco di tutti gli elementi, a pagine ---
$elementi = New-Object System.Collections.Generic.List[object]
$visti = New-Object 'System.Collections.Generic.HashSet[string]'   # un film dentro una collezione non deve comparire due volte
$inizio = 0
do {
  $pagina = Chiedi "$base&StartIndex=$inizio&Limit=500"
  foreach ($e in $pagina.Items) { if ($visti.Add($e.Id)) { $elementi.Add($e) } }
  $inizio += 500
  Write-Host ("  letti {0} di {1} elementi" -f [Math]::Min($inizio, $pagina.TotalRecordCount), $pagina.TotalRecordCount)
} while ($inizio -lt $pagina.TotalRecordCount)

# --- 3. Cartella temporanea e copertine ---
$lavoro = Join-Path ([IO.Path]::GetTempPath()) ("catalogo-jellyfin-" + [guid]::NewGuid().ToString('N'))
$cartellaCopertine = Join-Path $lavoro 'copertine'
New-Item -ItemType Directory -Path $cartellaCopertine | Out-Null
$script:senzaCopertina = 0

function Copertina($elemento) {
  if (-not $elemento.ImageTags -or -not $elemento.ImageTags.Primary) { return $null }
  $nome = "$($elemento.Id).jpg"
  try {
    Invoke-WebRequest -Uri "$Server/Items/$($elemento.Id)/Images/Primary?maxWidth=$Larghezza&quality=85&format=Jpg" `
      -Headers $intestazioni -OutFile (Join-Path $cartellaCopertine $nome) -UseBasicParsing | Out-Null
    return "copertine/$nome"
  } catch {
    $script:senzaCopertina++
    return $null
  }
}
function Testo($v) { if ($v) { [string]$v } else { $null } }

# --- 4. Catalogo: film e serie con le loro stagioni ed episodi ---
$film = @($elementi | Where-Object { $_.Type -eq 'Movie' })
$serie = @($elementi | Where-Object { $_.Type -eq 'Series' })
$stagioni = @($elementi | Where-Object { $_.Type -eq 'Season' })
$episodi = @($elementi | Where-Object { $_.Type -eq 'Episode' })
$titoli = New-Object System.Collections.Generic.List[object]
$n = 0
$totale = [Math]::Max($film.Count + $serie.Count, 1)

foreach ($f in $film) {
  $n++; Write-Host ("  [{0}/{1}] {2}" -f $n, $totale, $f.Name)
  $titoli.Add([ordered]@{
      id = $f.Id; tipo = 'film'; titolo = $f.Name; titoloOriginale = (Testo $f.OriginalTitle)
      anno = $f.ProductionYear; generi = @($f.Genres); trama = (Testo $f.Overview)
      percorso = $f.Path; copertina = (Copertina $f); idEsterni = $f.ProviderIds
    })
}

foreach ($s in $serie) {
  $n++; Write-Host ("  [{0}/{1}] {2}" -f $n, $totale, $s.Name)
  $leStagioni = @($stagioni | Where-Object { $_.SeriesId -eq $s.Id } | Sort-Object IndexNumber | ForEach-Object {
      [ordered]@{ numero = $_.IndexNumber; titolo = $_.Name; percorso = $_.Path; copertina = (Copertina $_) }
    })
  $gliEpisodi = @($episodi | Where-Object { $_.SeriesId -eq $s.Id } | Sort-Object ParentIndexNumber, IndexNumber | ForEach-Object {
      [ordered]@{ stagione = $_.ParentIndexNumber; episodio = $_.IndexNumber; titolo = $_.Name; trama = (Testo $_.Overview); percorso = $_.Path }
    })
  $titoli.Add([ordered]@{
      id = $s.Id; tipo = 'serie'; titolo = $s.Name; titoloOriginale = (Testo $s.OriginalTitle)
      anno = $s.ProductionYear; generi = @($s.Genres); trama = (Testo $s.Overview)
      percorso = $s.Path; copertina = (Copertina $s); idEsterni = $s.ProviderIds
      stagioni = $leStagioni; episodi = $gliEpisodi
    })
}

$catalogo = [ordered]@{
  formato = 'filmshare-catalogo'; versione = 1
  generato = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
  origine = "Jellyfin $($info.Version)"
  titoli = $titoli
}
# JSON in UTF-8 senza BOM (PowerShell 5.1 altrimenti lo aggiunge)
$json = $catalogo | ConvertTo-Json -Depth 8
[IO.File]::WriteAllText((Join-Path $lavoro 'catalogo.json'), $json, (New-Object Text.UTF8Encoding $false))

# --- 5. Zip ---
if (Test-Path $Uscita) { Remove-Item $Uscita -Confirm:$false }
Compress-Archive -Path (Join-Path $lavoro '*') -DestinationPath $Uscita
Remove-Item $lavoro -Recurse -Force -Confirm:$false

$mb = [Math]::Round((Get-Item $Uscita).Length / 1MB, 1)
Write-Host ''
Write-Host "Fatto: $Uscita ($mb MB)"
Write-Host ("  {0} film, {1} serie, {2} stagioni, {3} episodi" -f $film.Count, $serie.Count, $stagioni.Count, $episodi.Count)
if ($script:senzaCopertina) { Write-Host "  $($script:senzaCopertina) copertine non scaricate (Jellyfin ha risposto con un errore)" }
