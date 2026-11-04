-- Cartelle (pagina "Cartelle"): Docker monta una sola cartella principale del NAS (SHARED_PATH);
-- l'admin sceglie quali sottocartelle sono esposte ai download e quale riceve gli upload.
-- Percorsi relativi alla cartella principale; "" = la cartella principale intera.
INSERT INTO settings (key, value) VALUES
  ('exposed_folders', '[""]'),
  ('upload_folder',   '""');
