-- Distingue correos de bandeja de entrada vs enviados.
ALTER TABLE email ADD COLUMN folder TEXT DEFAULT 'inbox';
