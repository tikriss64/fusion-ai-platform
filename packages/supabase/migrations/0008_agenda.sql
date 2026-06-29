-- ============================================================================
-- 0008_agenda.sql — Módulo de operaciones de campo (ex-Tablón de reservas)
-- El Tablón ya era multi-tenant, pero con sus propias tablas tenants/clients/
-- invoices. Aquí se RECONCILIA: se reutilizan las canónicas (0001 tenants,
-- 0006 clients/invoices) y solo se traen las tablas operativas que faltan:
-- profesionales, servicios, recursos, citas y notificaciones.
-- ============================================================================

create type public.appointment_status as enum
  ('pending','confirmed','cancelled','completed','no_show');
create type public.resource_type as enum ('sala','equipo','vehiculo');
create type public.notification_type as enum ('email','sms','whatsapp');
create type public.notification_status as enum ('queued','sent','failed');

-- ── Profesionales / operarios ───────────────────────────────────────────────
create table public.professionals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  nombre text not null,
  email text, telefono text,
  color text,                              -- color en el calendario
  activo boolean not null default true,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index idx_professionals_tenant on public.professionals(tenant_id);

-- ── Servicios ofertados (duración y precio base) ────────────────────────────
create table public.services (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  nombre text not null,
  duracion_min integer not null default 60,
  precio numeric(12,2) not null default 0,
  tipo_servicio public.service_type,        -- enlaza con el dominio del CRM
  activo boolean not null default true,
  created_at timestamptz not null default now()
);
create index idx_services_tenant on public.services(tenant_id);

-- ── Recursos (salas, equipos, vehículos) ────────────────────────────────────
create table public.resources (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  nombre text not null,
  tipo public.resource_type not null default 'equipo',
  capacidad integer default 1,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);
create index idx_resources_tenant on public.resources(tenant_id);

-- ── Citas / intervenciones (el corazón del módulo) ──────────────────────────
-- Para vaciado de pisos, una "cita" es una intervención: fecha, equipo, vehículo.
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  professional_id uuid references public.professionals(id) on delete set null,
  service_id uuid references public.services(id) on delete set null,
  resource_id uuid references public.resources(id) on delete set null,
  -- Enlace opcional con el flujo comercial del CRM:
  quote_id uuid references public.quotes(id) on delete set null,
  trabajo_id uuid references public.trabajos(id) on delete set null,
  inicio timestamptz not null,
  fin timestamptz not null,
  estado public.appointment_status not null default 'pending',
  direccion text,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (fin > inicio)
);
create index idx_appointments_tenant_inicio on public.appointments(tenant_id, inicio);
create index idx_appointments_professional on public.appointments(professional_id, inicio);

create trigger appointments_updated_at before update on public.appointments
  for each row execute function public.set_updated_at();

-- Detección de conflictos de agenda (solapes por profesional o recurso). 0 IA.
create or replace function public.appointment_conflicts(
  _tenant uuid, _inicio timestamptz, _fin timestamptz,
  _professional uuid default null, _resource uuid default null, _exclude uuid default null
)
returns setof public.appointments
language sql stable security definer set search_path = public as $$
  select * from public.appointments a
  where a.tenant_id = _tenant
    and a.estado not in ('cancelled','no_show')
    and (_exclude is null or a.id <> _exclude)
    and (a.professional_id = _professional or a.resource_id = _resource)
    and a.inicio < _fin and a.fin > _inicio;   -- solape de intervalos
$$;

-- ── Notificaciones (recordatorios automáticos) ──────────────────────────────
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  appointment_id uuid references public.appointments(id) on delete cascade,
  tipo public.notification_type not null default 'email',
  estado public.notification_status not null default 'queued',
  destinatario text,
  programada_para timestamptz,
  enviada_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_notifications_pending
  on public.notifications(tenant_id, programada_para) where estado = 'queued';

-- ── RLS: aislamiento por tenant ─────────────────────────────────────────────
do $$
declare tbl text;
begin
  foreach tbl in array array['professionals','services','resources',
      'appointments','notifications'] loop
    execute format('alter table public.%I enable row level security;', tbl);
    execute format('grant select,insert,update,delete on public.%I to authenticated;', tbl);
    execute format('grant all on public.%I to service_role;', tbl);
    execute format($f$
      create policy "tenant_rw_%1$s" on public.%1$I for all to authenticated
      using (tenant_id = public.user_tenant_id())
      with check (tenant_id = public.user_tenant_id());
    $f$, tbl);
  end loop;
end $$;

revoke execute on function
  public.appointment_conflicts(uuid,timestamptz,timestamptz,uuid,uuid,uuid) from anon;
