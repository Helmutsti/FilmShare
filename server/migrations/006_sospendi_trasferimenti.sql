-- Interruttore globale "Sospendi trasferimenti" (pagina Utenti): blocca ogni upload e download per tutti.
INSERT INTO settings (key, value) VALUES ('transfers_paused', 'false');
