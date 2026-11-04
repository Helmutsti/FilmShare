-- Interruttore per utente "Permetti upload" (1 = può caricare, 0 = solo download).
ALTER TABLE user_limits ADD COLUMN can_upload INTEGER NOT NULL DEFAULT 1 CHECK (can_upload IN (0, 1));
