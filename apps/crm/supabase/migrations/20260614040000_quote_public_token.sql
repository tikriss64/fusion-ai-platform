-- Feature 2: enlace público de presupuesto (aceptación con un clic).
-- public_token: código secreto (uuid) que va en la URL pública; no se puede adivinar.
-- accepted_at: registro de la aceptación (prueba legal — eIDAS firma simple).
alter table public.quotes add column if not exists public_token uuid not null default gen_random_uuid();
alter table public.quotes add column if not exists accepted_at timestamptz;
create unique index if not exists idx_quotes_public_token on public.quotes(public_token);
