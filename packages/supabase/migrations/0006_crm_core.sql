-- ============================================================================
-- 0006_crm_core.sql — Dominio del CRM, unificado y multi-tenant
-- Versión canónica de las tablas del CRM original, ahora con tenant_id y RLS
-- por tenant (en vez de user_id). Coherente con los cimientos de 0001.
-- ============================================================================

-- ── Enums ───────────────────────────────────────────────────────────────────
create type public.quote_status   as enum ('borrador','enviado','aceptado','rechazado','facturado');
create type public.service_type   as enum ('vaciado','limpieza','retirada_muebles','mixto');
create type public.invoice_status as enum ('pendiente','pagada','parcial','vencida');
create type public.trabajo_status as enum ('pendiente','confirmado','en_curso','completado','cancelado');
create type public.lead_status    as enum ('nuevo','contactado','convertido','descartado');

-- Política RLS estándar: aislamiento por tenant. Se aplica a casi todas.
-- (se repite inline por claridad)

-- ── Ajustes de empresa (uno por tenant) ─────────────────────────────────────
create table public.company_settings (
  tenant_id    uuid primary key references public.tenants(id) on delete cascade,
  trade_name   text, legal_name text, tax_id text,
  address text, postal_code text, city text, province text,
  country text default 'España', phone text, email text, website text,
  logo_url text, iban text, bank_name text,
  default_vat numeric(5,2) default 21.00,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Clientes ────────────────────────────────────────────────────────────────
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  nombre text not null, nif_cif text, email text, telefono text,
  direccion text, poblacion text, notas text,
  tags text[] not null default '{}',
  primera_fecha date, ultima_fecha date,
  num_trabajos integer not null default 0,
  valoracion smallint check (valoracion between 1 and 5),
  recurrente boolean not null default false,
  rgpd_consent boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_clients_tenant on public.clients(tenant_id);
create index idx_clients_tags on public.clients using gin(tags);

-- ── Leads (formulario web → CRM) ────────────────────────────────────────────
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  created_at timestamptz not null default now(),
  nombre text not null, telefono text, email text,
  servicio text, ubicacion text, ciudad text, mensaje text,
  origen_pagina text,
  estado public.lead_status not null default 'nuevo',
  notas_internas text,
  client_id uuid references public.clients(id) on delete set null
);
create index idx_leads_tenant on public.leads(tenant_id, estado);

-- ── Presupuestos ────────────────────────────────────────────────────────────
create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  numero text, is_template boolean not null default false, template_name text,
  fecha date not null default current_date, valido_hasta date,
  estado public.quote_status not null default 'borrador',
  subtotal numeric(12,2) not null default 0,
  iva numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  tipo_servicio public.service_type,
  dificultad_acceso text, notas_operativas text, tipo_vivienda text,
  ascensor boolean default false, planta text, parking boolean default false,
  urgencia text, metros_cuadrados_estimados numeric(8,2), objetos_recuperables text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, numero)
);
create index idx_quotes_tenant on public.quotes(tenant_id, estado);

create table public.quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  descripcion text not null,
  cantidad numeric(10,2) not null default 1,
  precio_unit numeric(12,2) not null default 0,
  iva_aplicable numeric(5,2) not null default 21,
  orden integer not null default 0,
  created_at timestamptz not null default now()
);
create index idx_quote_items_quote on public.quote_items(quote_id);

-- ── Facturas ────────────────────────────────────────────────────────────────
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  quote_id uuid references public.quotes(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  serie text not null default 'A', numero text not null,
  fecha_emision date not null default current_date, vencimiento date,
  estado public.invoice_status not null default 'pendiente',
  subtotal numeric(12,2) not null default 0,
  iva numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  notas_legales text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, serie, numero)
);
create index idx_invoices_tenant on public.invoices(tenant_id, estado);

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  descripcion text not null,
  cantidad numeric(10,2) not null default 1,
  precio_unit numeric(12,2) not null default 0,
  iva_aplicable numeric(5,2) not null default 21,
  orden integer not null default 0,
  created_at timestamptz not null default now()
);
create index idx_invoice_items_invoice on public.invoice_items(invoice_id);

create table public.invoice_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  fecha date not null default current_date,
  importe numeric(12,2) not null, notas text,
  created_at timestamptz not null default now()
);
create index idx_invoice_payments_invoice on public.invoice_payments(invoice_id);

-- ── Trabajos / agenda ───────────────────────────────────────────────────────
create table public.trabajos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  quote_id uuid references public.quotes(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  fecha date, hora time, direccion text,
  tipo_servicio public.service_type, notas text,
  estado public.trabajo_status not null default 'pendiente',
  fotos_antes text[] not null default '{}',
  fotos_despues text[] not null default '{}',
  carpeta_fotos_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_trabajos_tenant_fecha on public.trabajos(tenant_id, fecha);

-- ── updated_at triggers ─────────────────────────────────────────────────────
create trigger company_settings_updated_at before update on public.company_settings
  for each row execute function public.set_updated_at();
create trigger clients_updated_at before update on public.clients
  for each row execute function public.set_updated_at();
create trigger quotes_updated_at before update on public.quotes
  for each row execute function public.set_updated_at();
create trigger invoices_updated_at before update on public.invoices
  for each row execute function public.set_updated_at();
create trigger trabajos_updated_at before update on public.trabajos
  for each row execute function public.set_updated_at();

-- ── RLS: aislamiento por tenant en todas las tablas ─────────────────────────
do $$
declare tbl text;
begin
  foreach tbl in array array['company_settings','clients','leads','quotes',
      'invoices','trabajos'] loop
    execute format('alter table public.%I enable row level security;', tbl);
    execute format('grant select,insert,update,delete on public.%I to authenticated;', tbl);
    execute format('grant all on public.%I to service_role;', tbl);
    execute format($f$
      create policy "tenant_rw_%1$s" on public.%1$I for all to authenticated
      using (tenant_id = public.user_tenant_id())
      with check (tenant_id = public.user_tenant_id());
    $f$, tbl);
  end loop;

  -- Hijos sin tenant_id propio: heredan del padre (RLS+grants, política aparte).
  foreach tbl in array array['quote_items','invoice_items','invoice_payments'] loop
    execute format('alter table public.%I enable row level security;', tbl);
    execute format('grant select,insert,update,delete on public.%I to authenticated;', tbl);
    execute format('grant all on public.%I to service_role;', tbl);
  end loop;
end $$;

create policy "tenant_rw_quote_items" on public.quote_items for all to authenticated
  using (exists (select 1 from public.quotes q
                 where q.id = quote_id and q.tenant_id = public.user_tenant_id()))
  with check (exists (select 1 from public.quotes q
                 where q.id = quote_id and q.tenant_id = public.user_tenant_id()));

create policy "tenant_rw_invoice_items" on public.invoice_items for all to authenticated
  using (exists (select 1 from public.invoices i
                 where i.id = invoice_id and i.tenant_id = public.user_tenant_id()))
  with check (exists (select 1 from public.invoices i
                 where i.id = invoice_id and i.tenant_id = public.user_tenant_id()));

-- invoice_payments también hereda el tenant de su factura padre.
create policy "tenant_rw_invoice_payments" on public.invoice_payments for all to authenticated
  using (exists (select 1 from public.invoices i
                 where i.id = invoice_id and i.tenant_id = public.user_tenant_id()))
  with check (exists (select 1 from public.invoices i
                 where i.id = invoice_id and i.tenant_id = public.user_tenant_id()));

-- El formulario web público inserta leads (clave anon), siempre con tenant_id.
grant insert on public.leads to anon;
create policy "leads_insert_anon" on public.leads
  for insert to anon with check (true);

-- ── Numeración por tenant (presupuestos y facturas) ─────────────────────────
create or replace function public.next_quote_number(_tenant uuid, _year int)
returns text language plpgsql security definer set search_path = public as $$
declare n int;
begin
  select coalesce(max(cast(split_part(numero,'-',3) as int)),0)+1 into n
  from public.quotes where tenant_id = _tenant and numero like 'PRES-'||_year||'-%';
  return 'PRES-'||_year||'-'||lpad(n::text,4,'0');
end; $$;

create or replace function public.next_invoice_number(_tenant uuid, _serie text, _year int)
returns text language plpgsql security definer set search_path = public as $$
declare n int;
begin
  select coalesce(max(cast(split_part(numero,'-',2) as int)),0)+1 into n
  from public.invoices where tenant_id = _tenant and serie = _serie and numero like _year||'-%';
  return _year||'-'||lpad(n::text,4,'0');
end; $$;

revoke execute on function public.next_quote_number(uuid,int) from public, anon;
revoke execute on function public.next_invoice_number(uuid,text,int) from public, anon;
