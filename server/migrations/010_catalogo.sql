-- Catalogo esportato da Jellyfin (pagina "Catalogo"): titoli, stagioni, copertine e i file che Jellyfin conosce.
-- Lo zip caricato sostituisce sempre tutto il catalogo precedente. L'abbinamento ai file del NAS (tabella files)
-- si fa a ogni lettura, per nome del file e cartelle finali: così vale anche per i file aggiunti dopo.
-- Le copertine sono file nella cartella COVERS_PATH; qui c'è solo il nome.

CREATE TABLE catalog_titles (
  id             INTEGER PRIMARY KEY,
  kind           TEXT    NOT NULL CHECK (kind IN ('movie', 'series')),
  source_id      TEXT    NOT NULL UNIQUE,              -- identificativo dell'elemento in Jellyfin
  title          TEXT    NOT NULL,
  original_title TEXT,
  year           INTEGER,
  genres         TEXT    NOT NULL DEFAULT '[]',         -- JSON: elenco di generi
  overview       TEXT,
  cover          TEXT
);

CREATE TABLE catalog_seasons (
  title_id INTEGER NOT NULL REFERENCES catalog_titles(id) ON DELETE CASCADE,
  number   INTEGER NOT NULL,
  name     TEXT,
  cover    TEXT,
  PRIMARY KEY (title_id, number)
);

-- Un file noto a Jellyfin: il film, o un episodio di una serie.
CREATE TABLE catalog_entries (
  id            INTEGER PRIMARY KEY,
  title_id      INTEGER NOT NULL REFERENCES catalog_titles(id) ON DELETE CASCADE,
  path          TEXT    NOT NULL,                       -- percorso come lo vede Jellyfin
  file_name     TEXT    NOT NULL,                       -- nome del file in minuscolo, per l'abbinamento
  season        INTEGER,
  episode       INTEGER,
  episode_title TEXT
);
CREATE INDEX catalog_entries_file_name ON catalog_entries(file_name);

-- Quando e da dove è arrivato il catalogo attuale (null = nessun catalogo caricato).
INSERT INTO settings (key, value) VALUES ('catalog_info', 'null');
