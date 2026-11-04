-- Velocità massima 0 = nessun limite. SQLite non permette di cambiare un CHECK: si ricrea la tabella.
CREATE TABLE user_limits_new (
  user_id         INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  quota_bytes     INTEGER NOT NULL CHECK (quota_bytes >= 0),
  period          TEXT    NOT NULL CHECK (period IN ('day', 'week', 'month')),
  max_speed_kbps  INTEGER NOT NULL CHECK (max_speed_kbps >= 0),   -- 0 = nessun limite
  max_concurrent  INTEGER NOT NULL CHECK (max_concurrent > 0),
  approval        TEXT    NOT NULL DEFAULT 'over_threshold' CHECK (approval IN ('never', 'over_threshold', 'always'))
);
INSERT INTO user_limits_new SELECT user_id, quota_bytes, period, max_speed_kbps, max_concurrent, approval FROM user_limits;
DROP TABLE user_limits;
ALTER TABLE user_limits_new RENAME TO user_limits;
