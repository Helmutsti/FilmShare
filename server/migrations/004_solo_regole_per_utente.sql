-- Niente più pagina "Regole di banda": contano solo le regole di ogni persona (quota, periodo, velocità,
-- simultanei, approvazione). Si spengono le regole globali che cambiavano il comportamento in modo nascosto.
-- Restano come valori fissi: soglie di approvazione (10 GB upload, 50 GB download), scadenza link (48 ore),
-- valori proposti per i nuovi utenti.
UPDATE settings SET value = 'null'  WHERE key = 'night_window';
UPDATE settings SET value = 'false' WHERE key = 'slowdown_over_80';
UPDATE settings SET value = 'false' WHERE key = 'suspend_after_3_overruns';
UPDATE settings SET value = '0'     WHERE key = 'server_max_speed_kbps';
