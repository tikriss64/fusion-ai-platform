-- ============================================================================
-- 0012_agenda_compat.sql — Compatibilidad de la app Agenda con el esquema unificado
--
-- La app Agenda (ex-Tablón SaaS) espera tablas propias que NO se trajeron en la
-- reconciliación de 0008: profiles, settings, payments; y la columna
-- tenants.onboarding_completed. Sin ellas, getPanelContext / getOnboardingState
-- no resuelven y el panel se queda "Cargando…" para siempre.
--
-- Aquí se crean esas tablas mapeadas a NUESTRO modelo (tenants + tenant_members)
-- y se marca el onboarding como completado para que la app entre directa al panel.
-- ============================================================================

-- ── tenants: bandera de onboarding (la app la consulta al cargar) ───────────
alter table public.tenants
  add column if not exists onboarding_completed boolean not null default true;
update public.tenants set onboarding_completed = true where onboarding_completed is null;

-- ── profiles: la app la usa para resolver tenant + email del usuario ────────
-- Mapea 1:1 con tenant_members (cada usuario → su tenant). id = auth.users.id.
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  tenant_id  uuid references public.tenants(id) on delete set null,
  email      text,
  full_name  text,
  created_at timestamptz not null default now()
);

-- Sembrar profiles desde las membresías existentes (con email de auth.users).
insert into public.profiles (id, tenant_id, email)
select tm.user_id, tm.tenant_id, u.email
from public.tenant_members tm
join auth.users u on u.id = tm.user_id
on conflict (id) do update
  set tenant_id = excluded.tenant_id,
      email     = excluded.email;

-- Mantener profiles sincronizada cuando se añaden miembros nuevos.
create or replace function public.sync_profile_from_member()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, tenant_id, email)
  select new.user_id, new.tenant_id, u.email
  from auth.users u where u.id = new.user_id
  on conflict (id) do update set tenant_id = excluded.tenant_id, email = excluded.email;
  return new;
end;
$$;
drop trigger if exists sync_profile on public.tenant_members;
create trigger sync_profile after insert or update on public.tenant_members
  for each row execute function public.sync_profile_from_member();

-- ── settings: configuración por tenant (la app la lee al cargar) ────────────
create table if not exists public.settings (
  tenant_id  uuid primary key references public.tenants(id) on delete cascade,
  idioma     text default 'es',
  moneda     text default 'EUR',
  zona_horaria text default 'Europe/Madrid',
  created_at timestamptz not null default now()
);
insert into public.settings (tenant_id)
  select id from public.tenants on conflict do nothing;

-- ── payments: la app lo lee en el resumen del panel ─────────────────────────
create table if not exists public.payments (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  appointment_id uuid references public.appointments(id) on delete set null,
  importe    numeric(12,2) not null default 0,
  estado     text not null default 'pendiente',
  metodo     text,
  created_at timestamptz not null default now()
);
create index if not exists idx_payments_tenant on public.payments(tenant_id, created_at desc);

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.settings enable row level security;
alter table public.payments enable row level security;

grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.settings to authenticated;
grant select, insert, update, delete on public.payments to authenticated;
grant all on public.profiles, public.settings, public.payments to service_role;

-- profiles: cada usuario ve/edita la suya. (drop-if-exists → re-ejecutable)
drop policy if exists "self_profile" on public.profiles;
create policy "self_profile" on public.profiles for all to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- settings y payments: aislamiento por tenant.
drop policy if exists "tenant_rw_settings" on public.settings;
create policy "tenant_rw_settings" on public.settings for all to authenticated
  using (tenant_id = public.user_tenant_id())
  with check (tenant_id = public.user_tenant_id());
drop policy if exists "tenant_rw_payments" on public.payments;
create policy "tenant_rw_payments" on public.payments for all to authenticated
  using (tenant_id = public.user_tenant_id())
  with check (tenant_id = public.user_tenant_id());

revoke execute on function public.sync_profile_from_member() from public, anon, authenticated;
