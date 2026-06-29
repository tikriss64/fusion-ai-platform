-- ============================================================================
-- 0007_inbox.sql — Dominio del Inbox, migrado de Cloudflare D1 a Postgres
-- ESTRATEGIA: replicar el esquema D1 con los MISMOS nombres de tabla/columna,
-- para que el SQL existente de la app corra verbatim (el shim solo traduce los
-- placeholders ? → $n). Se añaden: tenant_id (con default vía GUC, para encajar
-- en el modelo multi-tenant) y embedding vector(384) que reemplaza a Vectorize.
-- ============================================================================

-- El tenant activo de la conexión lo fija el shim con:
--   select set_config('app.fusion_tenant', '<uuid>', false);
-- y los DEFAULT de abajo lo recogen. Si no se fija, queda NULL (single-tenant ok).
create or replace function public.fusion_current_tenant()
returns uuid language sql stable as $$
  select nullif(current_setting('app.fusion_tenant', true), '')::uuid;
$$;

-- ── Cuenta de correo conectada (fila única id=1, igual que en D1) ───────────
-- NOTA: en producción, cifrar los tokens con Supabase Vault.
create table public.mail_account (
  id            integer primary key default 1,
  tenant_id     uuid default public.fusion_current_tenant(),
  provider      text not null,
  email         text,
  access_token  text,
  refresh_token text,
  token_expiry  bigint,                   -- epoch ms
  connected_at  bigint,
  constraint mail_account_singleton check (id = 1)
);

-- ── Correos analizados (mismo nombre y columnas que el D1 'email') ──────────
create table public.email (
  id            text primary key,         -- id del mensaje en Gmail
  tenant_id     uuid default public.fusion_current_tenant(),
  thread_id     text,
  sender        text,
  sender_email  text,
  subject       text,
  snippet       text,
  received_at   bigint,                   -- epoch ms
  folder        text default 'inbox',
  type          text,
  summary       text,
  promise       text,
  tone_warning  text,
  effort        text,
  analyzed_at   bigint,
  embedding     halfvec(384),             -- gte-small, gratis y privado (media precisión)
  embedded_at   bigint
);

create index idx_email_received on public.email(received_at desc);
create index idx_email_folder   on public.email(folder);
create index idx_email_embedding on public.email using hnsw (embedding halfvec_cosine_ops)
  with (m = 16, ef_construction = 64);

-- ── Configuración clave/valor (igual que D1) ────────────────────────────────
create table public.app_config (
  key       text primary key,
  value     text,
  tenant_id uuid default public.fusion_current_tenant()
);

-- ── Búsqueda semántica (opcional; la memoria usa SQL directo en la app) ─────
create or replace function public.match_emails(
  _query vector(384), _threshold float default 0.5, _limit int default 10
)
returns table (id text, subject text, summary text, type text, folder text,
               sender text, sender_email text, received_at bigint, score float)
language sql stable as $$
  select e.id, e.subject, e.summary, e.type, e.folder, e.sender, e.sender_email,
         e.received_at, 1 - (e.embedding <=> _query::halfvec) as score
  from public.email e
  where e.embedding is not null and 1 - (e.embedding <=> _query::halfvec) >= _threshold
  order by e.embedding <=> _query::halfvec
  limit _limit;
$$;

-- ── RLS (protege el acceso vía API REST; el servidor usa conexión directa) ──
alter table public.mail_account enable row level security;
alter table public.email        enable row level security;
alter table public.app_config   enable row level security;
grant all on public.mail_account, public.email, public.app_config to service_role;

create policy "service_all_mail_account" on public.mail_account
  for all to service_role using (true) with check (true);
create policy "service_all_email" on public.email
  for all to service_role using (true) with check (true);
create policy "service_all_app_config" on public.app_config
  for all to service_role using (true) with check (true);
