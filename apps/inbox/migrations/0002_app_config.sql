-- Configuración de la app (clave/valor). Usado para password_hash y recovery_hash.
CREATE TABLE IF NOT EXISTS app_config (
  key   TEXT PRIMARY KEY,
  value TEXT
);
