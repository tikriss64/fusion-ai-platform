-- Marca de tiempo de cuándo el correo se indexó en la memoria (Vectorize). NULL = pendiente.
ALTER TABLE email ADD COLUMN embedded_at INTEGER;
