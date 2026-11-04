-- Restano solo la quota di ogni persona (upload + download nel suo periodo) e il permesso di caricare.
-- Chi supera la quota va in approvazione. Spariscono velocità, trasferimenti simultanei, tipo di approvazione,
-- soglie e tutte le vecchie regole globali.
CREATE TABLE user_limits_new (
  user_id     INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  quota_bytes INTEGER NOT NULL CHECK (quota_bytes >= 0),
  period      TEXT    NOT NULL CHECK (period IN ('day', 'week', 'month')),
  can_upload  INTEGER NOT NULL DEFAULT 1 CHECK (can_upload IN (0, 1))
);
INSERT INTO user_limits_new SELECT user_id, quota_bytes, period, can_upload FROM user_limits;
DROP TABLE user_limits;
ALTER TABLE user_limits_new RENAME TO user_limits;

DELETE FROM settings WHERE key IN (
  'default_max_speed_kbps', 'default_max_concurrent', 'server_max_speed_kbps', 'server_max_concurrent',
  'night_window', 'upload_approval_threshold', 'download_approval_threshold', 'block_on_quota_exhausted',
  'slowdown_over_80', 'require_approval_over_threshold', 'suspend_after_3_overruns'
);
