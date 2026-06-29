-- AI Inbox Assistant — esquema inicial
-- App de un solo usuario: la cuenta de correo conectada vive en una única fila (id = 1).

CREATE TABLE IF NOT EXISTS mail_account (
  id            INTEGER PRIMARY KEY,        -- siempre 1 (un solo usuario)
  provider      TEXT NOT NULL,              -- 'gmail' | 'outlook'
  email         TEXT,                       -- correo conectado
  access_token  TEXT,                       -- token de acceso (corta vida)
  refresh_token TEXT,                       -- token de refresco (larga vida)
  token_expiry  INTEGER,                    -- epoch ms en que caduca el access_token
  connected_at  INTEGER                     -- epoch ms de la conexión
);

-- Cache de correos analizados (se irá poblando desde Gmail + IA en hitos posteriores).
CREATE TABLE IF NOT EXISTS email (
  id            TEXT PRIMARY KEY,           -- id del mensaje en Gmail
  thread_id     TEXT,
  sender        TEXT,
  sender_email  TEXT,
  subject       TEXT,
  snippet       TEXT,
  received_at   INTEGER,                    -- epoch ms
  -- Campos rellenados por la IA (hito 4):
  type          TEXT,                       -- Cliente | Proveedor | Reclamación | Comercial | Urgente
  summary       TEXT,
  promise       TEXT,
  tone_warning  TEXT,
  effort        TEXT,                       -- quick | medium | long
  analyzed_at   INTEGER
);

CREATE INDEX IF NOT EXISTS idx_email_received ON email (received_at DESC);
