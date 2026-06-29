-- ============================================================================
-- 0001_foundation.sql — Cimientos del esquema unificado FUSION
-- Multi-tenant desde el día 1, extensiones y helpers compartidos.
-- ============================================================================

-- ── Extensiones ─────────────────────────────────────────────────────────────
create extension if not exists pgcrypto;   -- gen_random_uuid, digest()
create extension if not exists vector;      -- pgvector (búsqueda semántica)
-- pg_cron y pg_net se activan desde el panel de Supabase (Database > Extensions).
-- Se usan en 0004 para automatizaciones programadas sin servidor.

-- ── Tenants (empresas) ──────────────────────────────────────────────────────
-- Aunque hoy solo está tu empresa, modelar tenant_id ahora evita un refactor
-- enorme el día que vendas la plataforma a otras empresas de servicios.
create table public.tenants (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null,
  slug       text not null unique,
  plan       text not null default 'free' check (plan in ('free','pro','enterprise')),
  created_at timestamptz not null default now()
);

create table public.tenant_members (
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  user_id    uuid not null references auth.users(id)     on delete cascade,
  role       text not null default 'employee'
             check (role in ('admin','manager','employee')),
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

create index idx_tenant_members_user on public.tenant_members(user_id);

-- ── Helpers de seguridad (RLS) ──────────────────────────────────────────────
-- Tenant del usuario autenticado. SECURITY DEFINER para poder usarlo en RLS.
create or replace function public.user_tenant_id()
returns uuid language sql stable security definer set search_path = public as $$
  select tenant_id from public.tenant_members where user_id = auth.uid() limit 1;
$$;

-- ¿El usuario tiene rol >= manager en su tenant?
create or replace function public.has_tenant_role(_role text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tenant_members
    where user_id = auth.uid()
      and (role = _role or (role = 'admin'))   -- admin cubre todo
  );
$$;

-- updated_at automático (reutilizado por todas las tablas)
create or replace function public.set_updated_at()
returns trigger language plpgsql security definer set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;

-- ── RLS de las tablas de tenant ─────────────────────────────────────────────
alter table public.tenants        enable row level security;
alter table public.tenant_members enable row level security;

grant select on public.tenants        to authenticated;
grant select on public.tenant_members to authenticated;
grant all    on public.tenants        to service_role;
grant all    on public.tenant_members to service_role;

create policy "members see their tenant" on public.tenants
  for select to authenticated using (id = public.user_tenant_id());

create policy "members see co-members" on public.tenant_members
  for select to authenticated using (tenant_id = public.user_tenant_id());

create policy "admins manage members" on public.tenant_members
  for all to authenticated
  using (tenant_id = public.user_tenant_id() and public.has_tenant_role('admin'))
  with check (tenant_id = public.user_tenant_id() and public.has_tenant_role('admin'));

revoke execute on function public.user_tenant_id()         from public, anon;
revoke execute on function public.has_tenant_role(text)    from public, anon;
revoke execute on function public.set_updated_at()         from public, anon, authenticated;
-- authenticated SÍ necesita ejecutar los helpers para que las políticas RLS funcionen.
grant  execute on function public.user_tenant_id()         to authenticated;
grant  execute on function public.has_tenant_role(text)    to authenticated;
