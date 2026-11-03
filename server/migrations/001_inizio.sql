-- FilmShare: struttura iniziale.
-- Date in testo ISO 8601 UTC. Dimensioni e quote in byte (INTEGER, fino a 9 EB).

-- Persone che possono accedere.
CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  name          TEXT    NOT NULL,
  password_hash TEXT,                                   -- NULL finché l'invito non è attivato
  role          TEXT    NOT NULL DEFAULT 'user'    CHECK (role IN ('user', 'admin')),
  status        TEXT    NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'blocked', 'suspended')),
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_seen_at  TEXT
);

-- Limiti di ogni persona: una quota unica che somma upload e download nel suo periodo.
CREATE TABLE user_limits (
  user_id         INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  quota_bytes     INTEGER NOT NULL CHECK (quota_bytes >= 0),
  period          TEXT    NOT NULL CHECK (period IN ('day', 'week', 'month')),
  max_speed_kbps  INTEGER NOT NULL CHECK (max_speed_kbps > 0),
  max_concurrent  INTEGER NOT NULL CHECK (max_concurrent > 0),
  approval        TEXT    NOT NULL DEFAULT 'over_threshold' CHECK (approval IN ('never', 'over_threshold', 'always'))
);

-- Inviti: il link contiene un token; qui se ne salva solo l'impronta.
CREATE TABLE invites (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT    NOT NULL UNIQUE,
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at  TEXT    NOT NULL,
  used_at     TEXT
);

-- Sessioni di accesso (cookie): si salva solo l'impronta del token.
CREATE TABLE sessions (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT    NOT NULL UNIQUE,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at  TEXT    NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

-- File pubblicati nella cartella condivisa (sul NAS).
CREATE TABLE files (
  id           INTEGER PRIMARY KEY,
  name         TEXT    NOT NULL,
  rel_path     TEXT    NOT NULL UNIQUE,                 -- percorso relativo alla cartella condivisa
  size_bytes   INTEGER NOT NULL CHECK (size_bytes >= 0),
  uploaded_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Ogni upload o download: è anche la richiesta di approvazione e la prenotazione sulla quota.
-- reserved_bytes conta nella quota del periodo che inizia a period_start; torna a 0 se annullato o rifiutato.
CREATE TABLE transfers (
  id              INTEGER PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind            TEXT    NOT NULL CHECK (kind IN ('upload', 'download')),
  file_id         INTEGER REFERENCES files(id) ON DELETE SET NULL,   -- per gli upload: valorizzato a pubblicazione
  name            TEXT    NOT NULL,
  size_bytes      INTEGER NOT NULL CHECK (size_bytes >= 0),
  status          TEXT    NOT NULL CHECK (status IN ('pending', 'approved', 'in_progress', 'completed', 'rejected', 'cancelled', 'expired')),
  reserved_bytes  INTEGER NOT NULL DEFAULT 0 CHECK (reserved_bytes >= 0),
  period_start    TEXT,                                   -- inizio del periodo su cui è prenotato
  tus_id          TEXT    UNIQUE,                         -- id dell'upload tus
  decided_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  decided_at      TEXT,
  decision_note   TEXT,
  link_expires_at TEXT,                                   -- per i download: scadenza del link firmato
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX transfers_user_period ON transfers(user_id, period_start);
CREATE INDEX transfers_status ON transfers(status);

-- Iscrizioni alle notifiche push del browser.
CREATE TABLE push_subscriptions (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint    TEXT    NOT NULL UNIQUE,
  p256dh      TEXT    NOT NULL,
  auth        TEXT    NOT NULL,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Regole globali (pagina "Regole di banda"): chiave → valore JSON.
CREATE TABLE settings (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);

INSERT INTO settings (key, value) VALUES
  ('default_quota_bytes',         '429496729600'),   -- 400 GB (400 * 1024^3)
  ('default_period',              '"week"'),
  ('default_max_speed_kbps',      '50000'),          -- 50 Mbps
  ('default_max_concurrent',      '2'),
  ('server_max_speed_kbps',       '500000'),         -- 500 Mbps
  ('server_max_concurrent',       '6'),
  ('night_window',                '{"start":"00:00","end":"07:00"}'),
  ('download_link_hours',         '48'),
  ('upload_approval_threshold',   '10737418240'),    -- 10 GB
  ('download_approval_threshold', '53687091200'),    -- 50 GB
  ('block_on_quota_exhausted',    'true'),
  ('slowdown_over_80',            'true'),
  ('require_approval_over_threshold', 'true'),
  ('suspend_after_3_overruns',    'false');
