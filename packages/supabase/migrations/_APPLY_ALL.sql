-- _APPLY_ALL.sql

-- ####### 0001_foundation.sql
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


-- ####### 0002_ai_layer.sql
-- ============================================================================
-- 0002_ai_layer.sql — Capa que EVITA gastar tokens
-- Caché exacta + caché semántica (embeddings) + observabilidad de coste.
-- Regla de oro de la app: antes de llamar a una IA, consultar SIEMPRE estas
-- tablas. Si hay acierto, coste = 0 tokens.
-- ============================================================================

-- ── 1. Caché EXACTA de respuestas IA ────────────────────────────────────────
-- Clave = hash(tarea + modelo + entrada normalizada). Si llega la misma
-- petición otra vez, se devuelve la respuesta guardada sin tocar la IA.
create table public.ai_cache (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  cache_key   text not null,              -- hash determinista de la petición
  task        text not null,              -- 'classify_email','extract_invoice'...
  model       text,                       -- modelo que generó la respuesta
  response    jsonb not null,             -- resultado reutilizable
  hit_count   integer not null default 0, -- cuántas veces se reutilizó (ahorro)
  created_at  timestamptz not null default now(),
  expires_at  timestamptz,                -- null = no caduca
  unique (tenant_id, cache_key)
);

create index idx_ai_cache_key on public.ai_cache(tenant_id, cache_key);
create index idx_ai_cache_expiry on public.ai_cache(expires_at) where expires_at is not null;

-- Helper: construye la clave de caché de forma determinista.
create or replace function public.ai_cache_key(_task text, _model text, _input text)
returns text language sql immutable as $$
  select encode(digest(_task || '|' || coalesce(_model,'') || '|' ||
                        lower(regexp_replace(_input, '\s+', ' ', 'g')), 'sha256'), 'hex');
$$;

-- ── 2. Caché SEMÁNTICA (embeddings con gte-small = 384 dims) ─────────────────
-- Permite "ya respondí algo MUY parecido a esto": en vez de llamar a la IA,
-- se recupera por similitud. También es el RAG del Inbox (correos/documentos).
create table public.ai_embeddings (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  source_type text not null,              -- 'email','document','quote','faq','answer'
  source_id   uuid,                       -- id del registro original (si aplica)
  content     text not null,              -- texto indexado
  -- halfvec(384): media precisión = la MITAD de almacenamiento (2 bytes/dim) y
  -- búsqueda más rápida, sin pérdida apreciable de calidad. Clave en plan gratis.
  embedding   halfvec(384),               -- gte-small, generado GRATIS en Edge Function
  metadata    jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

-- HNSW = índice recomendado 2026 (<10ms hasta ~5M vectores). m/ef_construction
-- explícitos para mejor recall; subir ef_construction si se prioriza precisión.
create index idx_ai_embeddings_hnsw
  on public.ai_embeddings using hnsw (embedding halfvec_cosine_ops)
  with (m = 16, ef_construction = 64);
create index idx_ai_embeddings_source on public.ai_embeddings(tenant_id, source_type);

-- Búsqueda por similitud. Devuelve coincidencias por encima de un umbral.
-- Si encuentra algo casi idéntico, la app reutiliza en vez de llamar a la IA.
create or replace function public.match_embeddings(
  _tenant uuid,
  _query  vector(384),
  _source text default null,
  _threshold float default 0.82,
  _limit  int default 5
)
returns table (id uuid, source_type text, source_id uuid, content text,
               metadata jsonb, similarity float)
language sql stable security definer set search_path = public as $$
  -- _query llega como vector(384) (los clientes pasan un array); se castea a
  -- halfvec para operar contra la columna halfvec.
  select e.id, e.source_type, e.source_id, e.content, e.metadata,
         1 - (e.embedding <=> _query::halfvec) as similarity
  from public.ai_embeddings e
  where e.tenant_id = _tenant
    and (_source is null or e.source_type = _source)
    and 1 - (e.embedding <=> _query::halfvec) >= _threshold
  order by e.embedding <=> _query::halfvec
  limit _limit;
$$;

-- ── 3. Observabilidad de IA (control de coste) ──────────────────────────────
-- Cada llamada (o acierto de caché) se registra: modelo, tokens, coste, nivel.
-- Es el panel de "cuánto estoy gastando y dónde puedo ahorrar".
create table public.ai_usage_log (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  task        text not null,
  level       smallint not null default 1,   -- 0=router(0tok) 1=barato 2=frontier
  provider    text,                           -- 'groq','openrouter','gemini','local'
  model       text,
  tokens_in   integer not null default 0,
  tokens_out  integer not null default 0,
  cost_usd    numeric(10,6) not null default 0,
  latency_ms  integer,
  cache_hit   boolean not null default false, -- true = ahorrado, 0 tokens
  success     boolean not null default true,
  created_at  timestamptz not null default now()
);

create index idx_ai_usage_tenant_date on public.ai_usage_log(tenant_id, created_at desc);
create index idx_ai_usage_task on public.ai_usage_log(tenant_id, task);

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.ai_cache      enable row level security;
alter table public.ai_embeddings enable row level security;
alter table public.ai_usage_log  enable row level security;

grant select, insert, update, delete on public.ai_cache      to authenticated;
grant select, insert, update, delete on public.ai_embeddings to authenticated;
grant select, insert                 on public.ai_usage_log  to authenticated;
grant all on public.ai_cache, public.ai_embeddings, public.ai_usage_log to service_role;

create policy "tenant rw ai_cache" on public.ai_cache
  for all to authenticated
  using (tenant_id = public.user_tenant_id())
  with check (tenant_id = public.user_tenant_id());

create policy "tenant rw ai_embeddings" on public.ai_embeddings
  for all to authenticated
  using (tenant_id = public.user_tenant_id())
  with check (tenant_id = public.user_tenant_id());

create policy "tenant read ai_usage" on public.ai_usage_log
  for select to authenticated using (tenant_id = public.user_tenant_id());
create policy "tenant insert ai_usage" on public.ai_usage_log
  for insert to authenticated with check (tenant_id = public.user_tenant_id());

-- Incremento ATÓMICO del contador de aciertos (evita carreras lectura+escritura).
create or replace function public.bump_cache_hit(_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.ai_cache set hit_count = hit_count + 1 where id = _id;
$$;

-- Guarda el embedding de una entrada + su respuesta para la caché semántica.
-- Recibe el vector como vector(384) (array desde el cliente) y lo castea a halfvec.
create or replace function public.store_answer_embedding(
  _tenant uuid, _content text, _embedding vector(384)
)
returns void language sql security definer set search_path = public as $$
  insert into public.ai_embeddings (tenant_id, source_type, content, embedding)
  values (_tenant, 'answer', _content, _embedding::halfvec);
$$;

revoke execute on function public.ai_cache_key(text,text,text) from anon;
revoke execute on function public.match_embeddings(uuid,vector,text,float,int) from anon;


-- ####### 0003_rules_engine.sql
-- ============================================================================
-- 0003_rules_engine.sql — Reglas DETERMINISTAS (resuelven sin IA)
-- Todo lo que se puede decidir con patrones se decide aquí, en la DB, editable
-- sin redeploy. La IA solo entra cuando ninguna regla aplica.
-- ============================================================================

-- ── Reglas del router (Nivel 0): intención, clasificación, urgencia, servicio ─
-- Cada fila es un patrón regex y el resultado determinista que produce.
-- Editables desde el panel: añadir una regla = más cobertura sin tokens.
create table public.router_rules (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  kind       text not null check (kind in
             ('intent','classification','urgency','service_type','spam')),
  pattern    text not null,            -- regex (POSIX) que se prueba contra el texto
  flags      text not null default 'i',-- 'i' = ignore case
  result     jsonb not null,           -- salida determinista si el patrón casa
  priority   integer not null default 100, -- menor = se evalúa antes
  enabled    boolean not null default true,
  created_at timestamptz not null default now()
);

create index idx_router_rules_lookup
  on public.router_rules(tenant_id, kind, priority) where enabled;

-- Evalúa el texto contra las reglas de un tipo y devuelve el primer acierto.
-- Coste: 0 tokens. Esto cubre el grueso de la clasificación de correos.
create or replace function public.match_router_rule(
  _tenant uuid, _kind text, _text text
)
returns jsonb language sql stable security definer set search_path = public as $$
  select r.result
  from public.router_rules r
  where r.tenant_id = _tenant and r.kind = _kind and r.enabled
    and _text ~* r.pattern        -- match case-insensitive
  order by r.priority
  limit 1;
$$;

-- ── Reglas de precio: presupuestos automáticos SIN IA ───────────────────────
-- Precio = base + €/m² · metros, con multiplicadores por condiciones de acceso.
create table public.pricing_rules (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  tipo_servicio text not null,           -- 'vaciado','limpieza','retirada_muebles','mixto'
  base_price    numeric(12,2) not null default 0,
  price_per_m2  numeric(12,2) not null default 0,
  modifiers     jsonb not null default '{}', -- {"sin_ascensor":1.2,"urgente":1.3,...}
  min_price     numeric(12,2) not null default 0,
  enabled       boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (tenant_id, tipo_servicio)
);

-- Calcula un presupuesto de forma determinista. La app la usa para pre-rellenar
-- el presupuesto al instante; la IA solo se usaría para matices del texto libre.
create or replace function public.calc_quote_price(
  _tenant uuid, _tipo text, _m2 numeric, _flags text[] default '{}'
)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare
  r public.pricing_rules%rowtype;
  precio numeric := 0;
  f text;
  mult numeric;
begin
  select * into r from public.pricing_rules
    where tenant_id = _tenant and tipo_servicio = _tipo and enabled;
  if not found then return null; end if;

  precio := r.base_price + r.price_per_m2 * coalesce(_m2, 0);

  foreach f in array _flags loop          -- aplica multiplicadores activos
    mult := (r.modifiers ->> f)::numeric;
    if mult is not null then precio := precio * mult; end if;
  end loop;

  return greatest(precio, r.min_price);   -- nunca por debajo del mínimo
end;
$$;

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.router_rules  enable row level security;
alter table public.pricing_rules enable row level security;

grant select, insert, update, delete on public.router_rules  to authenticated;
grant select, insert, update, delete on public.pricing_rules to authenticated;
grant all on public.router_rules, public.pricing_rules to service_role;

create policy "tenant rw router_rules" on public.router_rules
  for all to authenticated
  using (tenant_id = public.user_tenant_id())
  with check (tenant_id = public.user_tenant_id());

create policy "tenant read pricing" on public.pricing_rules
  for select to authenticated using (tenant_id = public.user_tenant_id());
create policy "managers write pricing" on public.pricing_rules
  for all to authenticated
  using (tenant_id = public.user_tenant_id() and public.has_tenant_role('manager'))
  with check (tenant_id = public.user_tenant_id() and public.has_tenant_role('manager'));

revoke execute on function public.match_router_rule(uuid,text,text) from anon;
revoke execute on function public.calc_quote_price(uuid,text,numeric,text[]) from anon;


-- ####### 0004_automation_ops.sql
-- ============================================================================
-- 0004_automation_ops.sql — Automatización y operaciones
-- Motor de eventos→acciones, timeline, alertas y KPIs calculados en la DB.
-- Objetivo: automatizar el máximo volumen de acciones sin intervención ni IA.
-- ============================================================================

-- ── Motor de automatizaciones (evento → condiciones → acciones) ─────────────
-- Reglas de negocio declarativas. Ej: "lead.created → crear cliente + borrador
-- de presupuesto"; "quote.no_response_72h → enviar recordatorio".
-- La mayoría de acciones son deterministas (0 tokens).
create table public.automations (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  nombre        text not null,
  trigger_event text not null,          -- 'lead.created','quote.sent','email.received'...
  conditions    jsonb not null default '{}',  -- filtros que deben cumplirse
  actions       jsonb not null default '[]',  -- lista ordenada de acciones a ejecutar
  enabled       boolean not null default true,
  last_run_at   timestamptz,
  run_count     integer not null default 0,
  created_at    timestamptz not null default now()
);

create index idx_automations_event
  on public.automations(tenant_id, trigger_event) where enabled;

-- ── Timeline de actividad (Mission Control) ─────────────────────────────────
-- Cada acción del sistema/agentes deja rastro aquí. Alimenta el dashboard.
create table public.agent_activity (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  agent       text not null,            -- 'lead','urgency','sales','operations','ceo','system'
  action      text not null,            -- texto corto: "generó presupuesto PRES-2026-0042"
  entity_type text,                     -- 'lead','quote','invoice','trabajo','email'
  entity_id   uuid,
  used_ai     boolean not null default false,  -- ¿necesitó tokens? (para auditar ahorro)
  metadata    jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

create index idx_agent_activity_timeline
  on public.agent_activity(tenant_id, created_at desc);

-- ── Centro de alertas ───────────────────────────────────────────────────────
create table public.alerts (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  severity    text not null default 'info' check (severity in ('info','warning','critical')),
  title       text not null,
  detail      text,
  entity_type text,
  entity_id   uuid,
  resolved    boolean not null default false,
  resolved_at timestamptz,
  created_at  timestamptz not null default now()
);

create index idx_alerts_open
  on public.alerts(tenant_id, created_at desc) where not resolved;

-- ── KPIs diarios (materializados por la DB, no por IA) ──────────────────────
-- Una fila por tenant y día. Se rellena con un job de pg_cron (ver abajo),
-- así el dashboard lee KPIs instantáneos sin recalcular ni llamar a ningún LLM.
create table public.metrics_daily (
  tenant_id          uuid not null references public.tenants(id) on delete cascade,
  dia                date not null,
  correos_procesados integer not null default 0,
  leads_detectados   integer not null default 0,
  presupuestos       integer not null default 0,
  facturas           integer not null default 0,
  clientes_enfadados integer not null default 0,
  ai_tokens_in       bigint  not null default 0,
  ai_tokens_out      bigint  not null default 0,
  ai_cost_usd        numeric(12,6) not null default 0,
  ai_cache_hits      integer not null default 0,   -- llamadas ahorradas
  primary key (tenant_id, dia)
);

-- Recalcula TODOS los KPIs de un día (negocio + IA) desde las tablas reales.
-- Determinista, 0 IA. plpgsql → resuelve las tablas de dominio en tiempo de
-- ejecución (creadas en 0006/0007), así que no importa el orden de migración.
-- email.analyzed_at es epoch ms → to_timestamp(.../1000) para comparar por día.
create or replace function public.rebuild_metrics_daily(_tenant uuid, _dia date)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.metrics_daily as m (
    tenant_id, dia, correos_procesados, leads_detectados, presupuestos, facturas,
    clientes_enfadados, ai_tokens_in, ai_tokens_out, ai_cost_usd, ai_cache_hits)
  values (
    _tenant, _dia,
    (select count(*) from public.email e where e.tenant_id = _tenant
       and e.analyzed_at is not null and to_timestamp(e.analyzed_at/1000)::date = _dia),
    (select count(*) from public.leads l where l.tenant_id = _tenant and l.created_at::date = _dia),
    (select count(*) from public.quotes q where q.tenant_id = _tenant and q.created_at::date = _dia),
    (select count(*) from public.invoices i where i.tenant_id = _tenant and i.created_at::date = _dia),
    (select count(*) from public.email e where e.tenant_id = _tenant
       and (e.tone_warning is not null or e.type = 'Reclamación')
       and e.analyzed_at is not null and to_timestamp(e.analyzed_at/1000)::date = _dia),
    (select coalesce(sum(tokens_in),0)  from public.ai_usage_log
       where tenant_id = _tenant and created_at::date = _dia),
    (select coalesce(sum(tokens_out),0) from public.ai_usage_log
       where tenant_id = _tenant and created_at::date = _dia),
    (select coalesce(sum(cost_usd),0)   from public.ai_usage_log
       where tenant_id = _tenant and created_at::date = _dia),
    (select count(*) from public.ai_usage_log
       where tenant_id = _tenant and created_at::date = _dia and cache_hit)
  )
  on conflict (tenant_id, dia) do update set
    correos_procesados = excluded.correos_procesados,
    leads_detectados   = excluded.leads_detectados,
    presupuestos       = excluded.presupuestos,
    facturas           = excluded.facturas,
    clientes_enfadados = excluded.clientes_enfadados,
    ai_tokens_in       = excluded.ai_tokens_in,
    ai_tokens_out      = excluded.ai_tokens_out,
    ai_cost_usd        = excluded.ai_cost_usd,
    ai_cache_hits      = excluded.ai_cache_hits;
end;
$$;

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.automations    enable row level security;
alter table public.agent_activity enable row level security;
alter table public.alerts         enable row level security;
alter table public.metrics_daily  enable row level security;

grant select, insert, update, delete on public.automations    to authenticated;
grant select, insert                 on public.agent_activity to authenticated;
grant select, insert, update         on public.alerts         to authenticated;
grant select                         on public.metrics_daily  to authenticated;
grant all on public.automations, public.agent_activity, public.alerts,
            public.metrics_daily to service_role;

create policy "tenant rw automations" on public.automations
  for all to authenticated
  using (tenant_id = public.user_tenant_id())
  with check (tenant_id = public.user_tenant_id());

create policy "tenant read activity" on public.agent_activity
  for select to authenticated using (tenant_id = public.user_tenant_id());
create policy "tenant insert activity" on public.agent_activity
  for insert to authenticated with check (tenant_id = public.user_tenant_id());

create policy "tenant rw alerts" on public.alerts
  for all to authenticated
  using (tenant_id = public.user_tenant_id())
  with check (tenant_id = public.user_tenant_id());

create policy "tenant read metrics" on public.metrics_daily
  for select to authenticated using (tenant_id = public.user_tenant_id());

revoke execute on function public.rebuild_metrics_daily(uuid,date) from anon, authenticated;

-- ── Automatización programada (pg_cron) ─────────────────────────────────────
-- Tras activar pg_cron en el panel, programar el recálculo nocturno de KPIs:
--
--   select cron.schedule('rebuild-metrics', '5 0 * * *', $$
--     select public.rebuild_metrics_daily(t.id, current_date - 1)
--     from public.tenants t;
--   $$);
--
-- Recordatorios de presupuestos sin respuesta a 72h, limpieza de ai_cache
-- caducada, etc. se programan igual. Todo en la DB, sin servidor y sin IA.


-- ####### 0006_crm_core.sql
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


-- ####### 0007_inbox.sql
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


-- ####### 0008_agenda.sql
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


-- ####### 0009_realtime.sql
-- ============================================================================
-- 0009_realtime.sql — Activa Supabase Realtime para el Mission Control
-- Permite que el dashboard reciba cambios al instante (push) en vez de sondear.
-- ============================================================================

-- Añade las tablas del panel a la publicación de Realtime. Idempotente:
-- ignora el error si la tabla ya está en la publicación.
do $$
begin
  begin alter publication supabase_realtime add table public.alerts; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.agent_activity; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.metrics_daily; exception when duplicate_object then null; end;
end $$;


-- ####### 0010_runtime_compat.sql
-- ============================================================================
-- 0010_runtime_compat.sql — Compatibilidad runtime con el código heredado
--  1) GRANT EXECUTE de helpers RLS a authenticated (faltaba en 0001).
--  2) Columna user_id (legacy) en tablas que el CRM antiguo aún rellena.
--  3) Trigger BEFORE INSERT que rellena tenant_id automáticamente desde el
--     tenant del usuario actual, para que el código viejo siga funcionando.
-- Es un parche "puente" hasta el refactor user_id→tenant_id del CRM.
-- ============================================================================

-- ── 1. Permisos faltantes ───────────────────────────────────────────────────
grant execute on function public.user_tenant_id() to authenticated;
grant execute on function public.has_tenant_role(text) to authenticated;

-- ── 1b. Política NO recursiva para tenant_members ───────────────────────────
-- La política original ('members see co-members') usa user_tenant_id(), que a su
-- vez consulta tenant_members → recursión + 403. Sustituimos por una directa:
-- cada usuario ve siempre SU propia fila de membresía. (Los admins se cubren con
-- 'admins manage members' que sigue valiendo.)
drop policy if exists "members see co-members" on public.tenant_members;
create policy "self_see_membership" on public.tenant_members
  for select to authenticated using (user_id = auth.uid());

-- ── 1c. Vista de compatibilidad user_roles ──────────────────────────────────
-- El código heredado del CRM consulta `user_roles(role, user_id)`. Ya no existe
-- esa tabla (se sustituyó por tenant_members), pero exponemos una vista con la
-- misma forma para que las queries antiguas funcionen sin tocar código.
create or replace view public.user_roles
  with (security_invoker = true)
  as select user_id, role::text as role
       from public.tenant_members
      where user_id = auth.uid();
grant select on public.user_roles to authenticated;

-- ── 2. Columna user_id legacy donde el código antiguo la espera ─────────────
alter table public.clients          add column if not exists user_id uuid references auth.users(id);
alter table public.quotes           add column if not exists user_id uuid references auth.users(id);
alter table public.invoices         add column if not exists user_id uuid references auth.users(id);
alter table public.trabajos         add column if not exists user_id uuid references auth.users(id);
alter table public.invoice_payments add column if not exists user_id uuid references auth.users(id);

-- ── 3. Trigger: rellenar tenant_id automáticamente al insertar ──────────────
create or replace function public.fill_tenant_from_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.tenant_id is null then
    new.tenant_id := public.user_tenant_id();
  end if;
  if new.tenant_id is null then
    raise exception 'No se pudo determinar el tenant: el usuario no es miembro de ninguno';
  end if;
  return new;
end;
$$;

do $$
declare tbl text;
begin
  foreach tbl in array array['clients','quotes','invoices','trabajos','leads',
      'appointments','professionals','services','resources','notifications',
      'company_settings'] loop
    execute format('drop trigger if exists fill_tenant_on_insert on public.%I;', tbl);
    execute format(
      'create trigger fill_tenant_on_insert before insert on public.%I
         for each row execute function public.fill_tenant_from_user();',
      tbl
    );
  end loop;
end $$;

revoke execute on function public.fill_tenant_from_user() from public, anon, authenticated;


-- ####### 0011_advanced_anti_tokens.sql
-- ============================================================================
-- 0011_advanced_anti_tokens.sql — Maximización del ahorro de tokens (estado 2026)
--
-- Cierra los gaps frente al estado del arte 2026 que la primera capa anti-tokens
-- (0002_ai_layer) no cubría. Cada bloque está documentado con qué problema real
-- evita y cuánta carga le quita a los LLMs.
-- ============================================================================

-- ── 1. Hybrid search (BM25 + vector + RRF) ──────────────────────────────────
-- POR QUÉ: vector puro pierde matches por palabras clave exactas (nombres,
-- referencias, números de factura). Hybrid combina ambos y aplica Reciprocal
-- Rank Fusion (RRF, k=60) — el patrón de retrieval dominante en 2026.

-- Idioma español para stemming y stopwords adecuados.
alter table public.email
  add column if not exists fts tsvector
  generated always as (
    setweight(to_tsvector('spanish', coalesce(subject, '')), 'A') ||
    setweight(to_tsvector('spanish', coalesce(summary, '')), 'B') ||
    setweight(to_tsvector('spanish', coalesce(snippet, '')), 'C') ||
    setweight(to_tsvector('spanish', coalesce(sender, '')), 'D')
  ) stored;

create index if not exists idx_email_fts on public.email using gin(fts);

-- Búsqueda híbrida con RRF. Devuelve los mejores resultados combinando ranking
-- por keyword (BM25-style ts_rank) y similitud semántica.
create or replace function public.hybrid_search_emails(
  _query_text text,
  _query_vec  vector(384),
  _limit      int default 10,
  _k          int default 60       -- constante RRF; 60 es el valor de la literatura
)
returns table (
  id text, subject text, summary text, type text, folder text,
  sender text, sender_email text, received_at bigint,
  rrf_score float
)
language sql stable security definer set search_path = public as $$
  with kw as (
    select e.id, row_number() over (order by ts_rank_cd(e.fts, plainto_tsquery('spanish', _query_text)) desc) as rk
    from public.email e
    where e.fts @@ plainto_tsquery('spanish', _query_text)
    limit 50
  ),
  vc as (
    select e.id, row_number() over (order by e.embedding <=> _query_vec::halfvec) as rk
    from public.email e
    where e.embedding is not null
    limit 50
  ),
  fused as (
    select coalesce(kw.id, vc.id) as id,
           coalesce(1.0/(_k + kw.rk), 0) + coalesce(1.0/(_k + vc.rk), 0) as score
    from kw full outer join vc on kw.id = vc.id
  )
  select e.id, e.subject, e.summary, e.type, e.folder, e.sender, e.sender_email,
         e.received_at, f.score
  from fused f join public.email e on e.id = f.id
  order by f.score desc
  limit _limit;
$$;

-- ── 2. Caché negativa: respuestas "no clasificable" / "sin valor" ───────────
-- POR QUÉ: hay correos que la IA marca como "spam genérico" o "sin acción".
-- Hoy se vuelven a procesar idénticos. Guardándolos como negativos, no se
-- vuelve a llamar a la IA por el mismo hash. Ahorro real medible.
create table if not exists public.ai_negative_cache (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  cache_key   text not null,
  task        text not null,
  reason      text,                       -- 'spam','no_intent','low_confidence',...
  hit_count   integer not null default 0,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz default (now() + interval '30 days'),
  unique (tenant_id, cache_key)
);
create index if not exists idx_negcache_key on public.ai_negative_cache(tenant_id, cache_key);
create index if not exists idx_negcache_expiry on public.ai_negative_cache(expires_at);

-- ── 3. Respuestas canónicas / FAQ precuradas ────────────────────────────────
-- POR QUÉ: hay preguntas que se repiten (precio orientativo, plazos, zonas).
-- Curadas a mano por el operador → hit instantáneo, 0 tokens, calidad humana.
-- El cliente puede ampliarla desde el panel.
create table if not exists public.ai_canonical_answers (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  question    text not null,
  answer      text not null,
  tags        text[] not null default '{}',
  embedding   halfvec(384),               -- para match semántico de la pregunta
  use_count   integer not null default 0,
  enabled     boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists idx_canonical_hnsw
  on public.ai_canonical_answers using hnsw (embedding halfvec_cosine_ops)
  with (m = 16, ef_construction = 64) where enabled;
create index if not exists idx_canonical_tenant on public.ai_canonical_answers(tenant_id);

create or replace function public.match_canonical_answer(
  _tenant uuid, _query vector(384), _threshold float default 0.85
)
returns table (id uuid, question text, answer text, similarity float)
language sql stable security definer set search_path = public as $$
  select c.id, c.question, c.answer,
         1 - (c.embedding <=> _query::halfvec) as similarity
  from public.ai_canonical_answers c
  where c.tenant_id = _tenant and c.enabled
    and c.embedding is not null
    and 1 - (c.embedding <=> _query::halfvec) >= _threshold
  order by c.embedding <=> _query::halfvec
  limit 1;
$$;

-- ── 4. Prompt templates: clave para el prompt caching de Anthropic/Gemini ───
-- POR QUÉ: Anthropic da -90% si el system prompt es idéntico (cache_control).
-- Si la app construye prompts ad-hoc cada vez, no aprovecha el cache. Guardar
-- system prompts versionados aquí garantiza identidad y permite A/B testing.
create table if not exists public.prompt_templates (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid references public.tenants(id) on delete cascade,
  key         text not null,              -- 'classify_email','extract_quote',...
  version     integer not null default 1,
  system      text not null,              -- prompt de sistema (cacheable)
  notes       text,
  enabled     boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (tenant_id, key, version)
);

-- ── 5. Quality tracking en ai_cache (false-positive monitoring) ─────────────
-- POR QUÉ: la literatura 2026 exige medir false-positive rate del cache para
-- ajustar umbrales. Sin esto, el cache semántico puede degradar la calidad.
alter table public.ai_cache
  add column if not exists feedback_positive integer not null default 0,
  add column if not exists feedback_negative integer not null default 0,
  add column if not exists last_used_at timestamptz default now();

create or replace function public.bump_cache_feedback(
  _id uuid, _positive boolean
) returns void language sql security definer set search_path = public as $$
  update public.ai_cache set
    feedback_positive = feedback_positive + case when _positive then 1 else 0 end,
    feedback_negative = feedback_negative + case when _positive then 0 else 1 end,
    last_used_at = now()
  where id = _id;
$$;

-- TTL por defecto en ai_cache (si nadie pone expires_at).
alter table public.ai_cache
  alter column expires_at set default (now() + interval '90 days');

-- ── 6. Eviction / limpieza de caché expirada ────────────────────────────────
-- POR QUÉ: sin esto crece sin control. Función para invocar desde pg_cron.
create or replace function public.evict_expired_cache()
returns table (cache_deleted bigint, neg_deleted bigint)
language plpgsql security definer set search_path = public as $$
declare a bigint; b bigint;
begin
  delete from public.ai_cache where expires_at < now();
  get diagnostics a = row_count;
  delete from public.ai_negative_cache where expires_at < now();
  get diagnostics b = row_count;
  return query select a, b;
end;
$$;

-- También: cache_key cuyo feedback_negative supera positive en >2 = mal hit;
-- se invalida automáticamente para forzar recomputo.
create or replace function public.invalidate_bad_cache()
returns bigint language plpgsql security definer set search_path = public as $$
declare n bigint;
begin
  delete from public.ai_cache
    where feedback_negative > feedback_positive + 2;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ── 7. Vista de ahorro real para el dashboard ───────────────────────────────
create or replace view public.ai_savings_summary
  with (security_invoker = true) as
  select
    tenant_id,
    count(*)                                 as total_calls,
    count(*) filter (where cache_hit)        as cache_hits,
    coalesce(sum(cost_usd) filter (where not cache_hit), 0) as paid_cost,
    -- Estimación de coste evitado: cada hit valió aproximadamente lo que la
    -- llamada media de las NO cacheadas en esta misma tarea.
    coalesce(
      (count(*) filter (where cache_hit))::numeric *
      nullif(avg(cost_usd) filter (where not cache_hit), 0)
    , 0)                                     as savings_usd,
    case when count(*) > 0
         then round(100.0 * count(*) filter (where cache_hit) / count(*), 1)
         else 0 end                          as hit_rate_pct
  from public.ai_usage_log
  where created_at > now() - interval '30 days'
  group by tenant_id;

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table public.ai_negative_cache   enable row level security;
alter table public.ai_canonical_answers enable row level security;
alter table public.prompt_templates    enable row level security;

grant select,insert,update,delete on public.ai_negative_cache   to authenticated;
grant select,insert,update,delete on public.ai_canonical_answers to authenticated;
grant select,insert,update,delete on public.prompt_templates    to authenticated;
grant all on public.ai_negative_cache, public.ai_canonical_answers,
            public.prompt_templates to service_role;
grant select on public.ai_savings_summary to authenticated;

create policy "tenant_rw_negcache" on public.ai_negative_cache for all to authenticated
  using (tenant_id = public.user_tenant_id())
  with check (tenant_id = public.user_tenant_id());
create policy "tenant_rw_canonical" on public.ai_canonical_answers for all to authenticated
  using (tenant_id = public.user_tenant_id())
  with check (tenant_id = public.user_tenant_id());
create policy "tenant_rw_prompts" on public.prompt_templates for all to authenticated
  using (tenant_id = public.user_tenant_id() or tenant_id is null)
  with check (tenant_id = public.user_tenant_id());

revoke execute on function public.hybrid_search_emails(text,vector,int,int) from anon;
revoke execute on function public.match_canonical_answer(uuid,vector,float) from anon;
revoke execute on function public.evict_expired_cache() from anon, authenticated;
revoke execute on function public.invalidate_bad_cache() from anon, authenticated;
revoke execute on function public.bump_cache_feedback(uuid,boolean) from anon;
grant  execute on function public.bump_cache_feedback(uuid,boolean) to authenticated;

-- ── Seed: prompts canónicos para arrancar ──────────────────────────────────
insert into public.prompt_templates (tenant_id, key, system, notes) values
  (null, 'classify_email_v1',
   'Eres un clasificador de correos para una empresa de vaciado de pisos. Devuelve SOLO JSON con: {"type":"Cliente|Proveedor|Reclamación|Comercial|Urgente","summary":"resumen 1 frase","urgency":"baja|media|alta|critica"}.',
   'System prompt estable: dispara prompt cache de Anthropic (-90%).'),
  (null, 'extract_quote_v1',
   'Eres un extractor de datos de presupuestos para vaciado de pisos. Devuelve JSON con: tipo_servicio, metros_cuadrados, precio_estimado, ubicacion, urgencia. Si un campo falta, omítelo.',
   'System prompt estable para extracción.')
on conflict do nothing;


-- ####### 0012_agenda_compat.sql
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


-- ####### 0013_public_lead_intake.sql
-- ============================================================================
-- 0013_public_lead_intake.sql — Entrada pública de leads desde vaciadodepisos.cat
--
-- El formulario de la web (anónimo, sin login) NO puede insertar directamente en
-- `leads` porque: (a) tenant_id es NOT NULL y (b) el trigger de tenant solo sirve
-- para usuarios autenticados. Solución: una RPC controlada (SECURITY DEFINER) que
-- valida la entrada, resuelve el tenant por slug y crea el lead. Es el único camino
-- anónimo permitido (más seguro que exponer la tabla entera).
-- ============================================================================

create or replace function public.submit_lead(
  _nombre        text,
  _telefono      text default null,
  _email         text default null,
  _servicio      text default null,
  _ubicacion     text default null,
  _ciudad        text default null,
  _mensaje       text default null,
  _origen_pagina text default null,
  _tenant_slug   text default 'vaciadodepisos'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare t uuid; new_id uuid;
begin
  -- Validación mínima anti-basura.
  if _nombre is null or length(btrim(_nombre)) = 0 then
    raise exception 'El nombre es obligatorio';
  end if;
  if (_email is null or btrim(_email) = '') and (_telefono is null or btrim(_telefono) = '') then
    raise exception 'Indica al menos un email o un teléfono';
  end if;

  select id into t from public.tenants where slug = coalesce(_tenant_slug, 'vaciadodepisos');
  if t is null then raise exception 'Empresa no encontrada (%).', _tenant_slug; end if;

  insert into public.leads
    (tenant_id, nombre, telefono, email, servicio, ubicacion, ciudad, mensaje, origen_pagina, estado)
  values
    (t, left(btrim(_nombre),200), left(_telefono,40), left(_email,200),
     left(_servicio,100), left(_ubicacion,200), left(_ciudad,100),
     left(_mensaje,2000), left(_origen_pagina,300), 'nuevo')
  returning id into new_id;

  return new_id;
end; $$;

-- Permisos: solo anon + authenticated pueden llamarla; nada más.
revoke all on function
  public.submit_lead(text,text,text,text,text,text,text,text,text) from public;
grant execute on function
  public.submit_lead(text,text,text,text,text,text,text,text,text) to anon, authenticated;

-- Endurecimiento: la RPC es el ÚNICO camino anónimo. Se retira el INSERT directo
-- anónimo (que además estaba roto por el trigger de tenant).
revoke insert on public.leads from anon;
drop policy if exists "leads_insert_anon" on public.leads;


-- ####### 0005_seed.sql
-- ============================================================================
-- 0005_seed.sql — Datos iniciales para que el sistema funcione SIN IA desde ya
-- Reemplaza '<TENANT_ID>' por el id real de tu tenant tras crearlo.
-- (Estas reglas replican y amplían el command router del CRM original.)
-- ============================================================================

-- Crea el tenant de tu empresa (ejecutar una vez; copia el id que devuelve).
insert into public.tenants (nombre, slug)
values ('vaciadodepisos.cat', 'vaciadodepisos')
on conflict (slug) do nothing;

do $$
declare t uuid;
begin
  select id into t from public.tenants where slug = 'vaciadodepisos';

  -- ── Detección de tipo de servicio (0 tokens) ─────────────────────────────
  insert into public.router_rules (tenant_id, kind, pattern, result, priority) values
    (t,'service_type','retirada\s+de\s+muebles|retirar\s+muebles', '{"tipo_servicio":"retirada_muebles"}', 10),
    (t,'service_type','vaciado',   '{"tipo_servicio":"vaciado"}',   20),
    (t,'service_type','limpieza',  '{"tipo_servicio":"limpieza"}',  30),
    (t,'service_type','mixto',     '{"tipo_servicio":"mixto"}',     40);

  -- ── Detección de urgencia (alimenta el Urgency Agent sin IA) ─────────────
  insert into public.router_rules (tenant_id, kind, pattern, result, priority) values
    (t,'urgency','urgente|cuanto antes|hoy mismo|inmediato|ya',          '{"nivel":"alta"}',    10),
    (t,'urgency','esta semana|pronto|lo antes posible',                   '{"nivel":"media"}',   20),
    (t,'urgency','reclamaci[oó]n|queja|enfadad|indignad|fatal|verg[uü]enza','{"nivel":"critica","cliente_enfadado":true}', 5);

  -- ── Spam / no-lead (descarta sin gastar tokens) ──────────────────────────
  insert into public.router_rules (tenant_id, kind, pattern, result, priority) values
    (t,'spam','newsletter|unsubscribe|no-reply|publicidad|promoci[oó]n', '{"spam":true}', 10);

  -- ── Precios base (presupuestos automáticos deterministas) ────────────────
  -- Ajusta a tus tarifas reales. min_price evita presupuestos irrisorios.
  insert into public.pricing_rules
    (tenant_id, tipo_servicio, base_price, price_per_m2, min_price, modifiers) values
    (t,'vaciado',          120, 6.5, 180, '{"sin_ascensor":1.25,"urgente":1.30,"planta_alta":1.15}'),
    (t,'retirada_muebles',  80, 3.0, 120, '{"sin_ascensor":1.20,"urgente":1.30}'),
    (t,'limpieza',          90, 4.0, 120, '{"urgente":1.25}'),
    (t,'mixto',            160, 8.0, 240, '{"sin_ascensor":1.25,"urgente":1.30,"planta_alta":1.15}');
end $$;


-- ####### 0014_lead_agent.sql
-- ============================================================================
-- 0014_lead_agent.sql — Lead Agent v1 (el primer agente IA, 100% determinista)
--
-- Cada lead que entra (web o manual) se analiza AUTOMÁTICAMENTE dentro de la base
-- de datos, usando las reglas del Nivel 0 (0 tokens, ya sembradas en 0005):
--   · detecta spam → lo descarta solo
--   · detecta urgencia → asigna prioridad (crítica/alta/media/normal)
--   · detecta tipo de servicio → lo etiqueta
--   · genera un resumen
--   · deja rastro en el timeline (agent_activity) y crea alertas si es urgente
-- Cero LLM, cero claves, cero código de app → cero superficie de fallo.
-- La capa LLM (resúmenes ricos) se añadirá encima en una v2.
-- ============================================================================

-- ── Campos de análisis en leads ─────────────────────────────────────────────
alter table public.leads
  add column if not exists prioridad text not null default 'normal'
    check (prioridad in ('critica','alta','media','normal')),
  add column if not exists ai_etiquetas text[] not null default '{}',
  add column if not exists ai_resumen text,
  add column if not exists ai_analizado_at timestamptz;

create index if not exists idx_leads_prioridad on public.leads(tenant_id, prioridad);

-- ── El agente: analiza un lead concreto ─────────────────────────────────────
create or replace function public.analyze_lead(_lead_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  l          public.leads%rowtype;
  blob       text;
  spam       jsonb;
  urg        jsonb;
  svc        jsonb;
  prio       text := 'normal';
  etiquetas  text[] := '{}';
  resumen    text;
begin
  select * into l from public.leads where id = _lead_id;
  if not found then return; end if;

  -- Texto a analizar (todo lo que dijo el cliente).
  blob := concat_ws(' ', l.nombre, l.servicio, l.mensaje, l.ubicacion, l.ciudad);

  -- Nivel 0 — reglas deterministas (0 tokens).
  spam := public.match_router_rule(l.tenant_id, 'spam',         blob);
  urg  := public.match_router_rule(l.tenant_id, 'urgency',      blob);
  svc  := public.match_router_rule(l.tenant_id, 'service_type', blob);

  -- ¿Spam? → descartar solo y registrar.
  if spam is not null and coalesce((spam->>'spam')::boolean, false) then
    update public.leads set
      estado = 'descartado', prioridad = 'normal',
      ai_resumen = 'Descartado automáticamente: parece spam o no es un lead real.',
      ai_analizado_at = now()
    where id = _lead_id;
    insert into public.agent_activity (tenant_id, agent, action, entity_type, entity_id, used_ai)
    values (l.tenant_id, 'lead', concat('Descartó lead spam: ', l.nombre), 'lead', _lead_id, false);
    return;
  end if;

  -- Prioridad a partir de la urgencia detectada.
  if urg is not null then
    if (urg->>'nivel') = 'critica' or coalesce((urg->>'cliente_enfadado')::boolean, false) then
      prio := 'critica';
    elsif (urg->>'nivel') = 'alta'  then prio := 'alta';
    elsif (urg->>'nivel') = 'media' then prio := 'media';
    end if;
  end if;

  -- Etiquetas.
  if svc is not null and (svc->>'tipo_servicio') is not null then
    etiquetas := array_append(etiquetas, svc->>'tipo_servicio');
  end if;
  if prio in ('alta','critica') then
    etiquetas := array_append(etiquetas, 'urgente');
  end if;

  -- Resumen (determinista, legible).
  resumen := concat(
    'Lead de ', coalesce(nullif(l.servicio,''), 'servicio'),
    case when coalesce(l.ciudad,'') <> '' then concat(' en ', l.ciudad)
         when coalesce(l.ubicacion,'') <> '' then concat(' en ', l.ubicacion)
         else '' end,
    '. Prioridad ', prio, '.'
  );

  update public.leads set
    prioridad = prio,
    ai_etiquetas = etiquetas,
    ai_resumen = resumen,
    ai_analizado_at = now()
  where id = _lead_id;

  insert into public.agent_activity (tenant_id, agent, action, entity_type, entity_id, used_ai)
  values (l.tenant_id, 'lead',
    concat('Analizó lead "', l.nombre, '" → prioridad ', prio), 'lead', _lead_id, false);

  -- Alerta proporcional a la prioridad.
  if prio = 'critica' then
    insert into public.alerts (tenant_id, severity, title, detail, entity_type, entity_id)
    values (l.tenant_id, 'critical', concat('🔴 Lead urgente: ', l.nombre),
            coalesce(nullif(l.mensaje,''), 'Requiere atención inmediata.'), 'lead', _lead_id);
  elsif prio = 'alta' then
    insert into public.alerts (tenant_id, severity, title, detail, entity_type, entity_id)
    values (l.tenant_id, 'warning', concat('🟡 Lead prioritario: ', l.nombre),
            coalesce(nullif(l.mensaje,''), ''), 'lead', _lead_id);
  end if;
end; $$;

-- ── Disparo automático: cada lead nuevo se analiza al instante ──────────────
create or replace function public.trg_analyze_lead()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.analyze_lead(new.id);
  return new;
end; $$;

drop trigger if exists analyze_on_insert on public.leads;
create trigger analyze_on_insert after insert on public.leads
  for each row execute function public.trg_analyze_lead();

-- ── Backfill: analizar los leads que ya existían (p.ej. el de prueba) ───────
do $$
declare r record;
begin
  for r in select id from public.leads where ai_analizado_at is null loop
    perform public.analyze_lead(r.id);
  end loop;
end $$;

revoke execute on function public.analyze_lead(uuid)   from anon;
revoke execute on function public.trg_analyze_lead()   from public, anon, authenticated;


-- ####### 0015_urgency_agent.sql
-- ============================================================================
-- 0015_urgency_agent.sql — Urgency Agent v1 (vigilancia proactiva de riesgos)
--
-- A diferencia del Lead Agent (reacciona al insertar), este es PROACTIVO: se
-- ejecuta en segundo plano (pg_cron) y escanea datos existentes buscando riesgos:
--   1) Presupuestos enviados sin respuesta > 72h  → alerta de seguimiento.
--   2) Facturas vencidas (sin pagar, fecha pasada) → alerta crítica + marca vencida.
-- 100% determinista (0 tokens). No duplica alertas (comprueba si ya hay una abierta).
--
-- FUTURO: cuando el Inbox tenga Gmail, se añade aquí el escaneo de correos con
-- tono de enfado / reclamaciones (necesita reconciliar email.id text ↔ alertas).
-- ============================================================================

create or replace function public.run_urgency_agent(_tenant uuid default null)
returns integer language plpgsql security definer set search_path = public as $$
declare
  n integer := 0;
  r record;
begin
  -- ── 1) Presupuestos enviados sin respuesta > 72h ──────────────────────────
  for r in
    select q.id, q.numero, q.total, q.tenant_id, c.nombre
    from public.quotes q
    left join public.clients c on c.id = q.client_id
    where (_tenant is null or q.tenant_id = _tenant)
      and q.estado = 'enviado'
      and q.created_at < now() - interval '72 hours'
      and not exists (
        select 1 from public.alerts a
        where a.entity_type = 'quote' and a.entity_id = q.id and not a.resolved
      )
  loop
    insert into public.alerts (tenant_id, severity, title, detail, entity_type, entity_id)
    values (r.tenant_id, 'warning',
      concat('🟡 Presupuesto sin respuesta: ', coalesce(r.numero, '(s/n)')),
      concat('Enviado a ', coalesce(r.nombre, 'cliente'),
             ' hace más de 72h sin respuesta. Total ', coalesce(r.total, 0), ' €.'),
      'quote', r.id);
    insert into public.agent_activity (tenant_id, agent, action, entity_type, entity_id, used_ai)
    values (r.tenant_id, 'urgency',
      concat('Detectó presupuesto sin respuesta: ', coalesce(r.numero, '(s/n)')),
      'quote', r.id, false);
    n := n + 1;
  end loop;

  -- ── 2) Facturas vencidas ──────────────────────────────────────────────────
  for r in
    select i.id, i.serie, i.numero, i.total, i.vencimiento, i.tenant_id, c.nombre
    from public.invoices i
    left join public.clients c on c.id = i.client_id
    where (_tenant is null or i.tenant_id = _tenant)
      and i.estado in ('pendiente', 'parcial')
      and i.vencimiento is not null
      and i.vencimiento < current_date
      and not exists (
        select 1 from public.alerts a
        where a.entity_type = 'invoice' and a.entity_id = i.id and not a.resolved
      )
  loop
    update public.invoices set estado = 'vencida' where id = r.id;
    insert into public.alerts (tenant_id, severity, title, detail, entity_type, entity_id)
    values (r.tenant_id, 'critical',
      concat('🔴 Factura vencida: ', r.serie, '-', r.numero),
      concat(coalesce(r.nombre, 'Cliente'), ' · ', coalesce(r.total, 0),
             ' € · venció el ', r.vencimiento, '.'),
      'invoice', r.id);
    insert into public.agent_activity (tenant_id, agent, action, entity_type, entity_id, used_ai)
    values (r.tenant_id, 'urgency',
      concat('Marcó factura vencida: ', r.serie, '-', r.numero),
      'invoice', r.id, false);
    n := n + 1;
  end loop;

  return n;
end; $$;

-- Solo el servidor / pg_cron la ejecutan; no se expone a clientes.
revoke execute on function public.run_urgency_agent(uuid) from public, anon, authenticated;


-- ####### 0016_sales_agent.sql
-- ============================================================================
-- 0016_sales_agent.sql — Sales Agent v1 (lead convertido → presupuesto borrador)
--
-- Cuando un lead se convierte en cliente (se le asigna client_id), el Sales Agent
-- genera AUTOMÁTICAMENTE un presupuesto en borrador:
--   · extrae m² y condiciones (sin ascensor / urgente / planta alta) del mensaje
--   · detecta el tipo de servicio
--   · calcula el precio con calc_quote_price (reglas ya sembradas) + IVA
--   · crea el presupuesto + su línea, en estado 'borrador'
-- 100% determinista (0 tokens). Tú solo revisas y envías.
-- ============================================================================

create or replace function public.generate_quote_for_lead(_lead_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  l        public.leads%rowtype;
  blob     text;
  m2       numeric;
  flags    text[] := '{}';
  svc      jsonb;
  tipo     text;
  subtotal numeric(12,2);
  iva      numeric(12,2);
  total    numeric(12,2);
  numero   text;
  q_id     uuid;
begin
  select * into l from public.leads where id = _lead_id;
  if not found then return null; end if;

  blob := concat_ws(' ', l.mensaje, l.servicio, l.ubicacion);

  -- m² del mensaje ("60m2", "60 metros"…)
  m2 := nullif(replace((regexp_match(blob, '(\d+(?:[.,]\d+)?)\s*m(?:2|²|etros)', 'i'))[1], ',', '.'), '')::numeric;

  -- condiciones que afectan al precio
  if blob ~* 'sin\s+ascensor|no\s+hay\s+ascensor' then flags := array_append(flags, 'sin_ascensor'); end if;
  if blob ~* 'urgent|hoy\s+mismo|cuanto\s+antes|inmediato' then flags := array_append(flags, 'urgente'); end if;
  if blob ~* 'planta\s+(?:alta|[4-9]|1[0-9])' then flags := array_append(flags, 'planta_alta'); end if;

  -- tipo de servicio (regla → servicio del lead → vaciado por defecto)
  svc  := public.match_router_rule(l.tenant_id, 'service_type', blob);
  tipo := coalesce(svc->>'tipo_servicio', nullif(l.servicio, ''), 'vaciado');
  if tipo not in ('vaciado','limpieza','retirada_muebles','mixto') then tipo := 'vaciado'; end if;

  -- precio (subtotal sin IVA) + IVA 21%
  subtotal := round(coalesce(public.calc_quote_price(l.tenant_id, tipo, coalesce(m2, 0), flags), 0), 2);
  iva      := round(subtotal * 0.21, 2);
  total    := subtotal + iva;

  numero := public.next_quote_number(l.tenant_id, extract(year from now())::int);

  insert into public.quotes
    (tenant_id, client_id, numero, estado, tipo_servicio, fecha, valido_hasta,
     subtotal, iva, total, metros_cuadrados_estimados, urgencia, notas_operativas)
  values
    (l.tenant_id, l.client_id, numero, 'borrador', tipo::public.service_type,
     current_date, current_date + 30, subtotal, iva, total, m2,
     case when 'urgente' = any(flags) then 'urgente' else null end,
     concat('Generado automáticamente por el Sales Agent desde el lead de ', l.nombre, '.'))
  returning id into q_id;

  insert into public.quote_items (quote_id, descripcion, cantidad, precio_unit, iva_aplicable, orden)
  values (q_id,
    concat('Servicio de ', replace(tipo, '_', ' '),
           case when m2 is not null then concat(' (', m2, ' m²)') else '' end),
    1, subtotal, 21, 0);

  insert into public.agent_activity (tenant_id, agent, action, entity_type, entity_id, used_ai)
  values (l.tenant_id, 'sales',
    concat('Generó presupuesto ', numero, ' (', total, ' €) desde lead ', l.nombre),
    'quote', q_id, false);

  return q_id;
end; $$;

-- ── Disparo automático: al convertir un lead (se le asigna client_id) ───────
create or replace function public.trg_sales_on_convert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.client_id is not null and old.client_id is null then
    perform public.generate_quote_for_lead(new.id);
  end if;
  return new;
end; $$;

drop trigger if exists sales_on_convert on public.leads;
create trigger sales_on_convert after update on public.leads
  for each row execute function public.trg_sales_on_convert();

revoke execute on function public.generate_quote_for_lead(uuid) from anon;
revoke execute on function public.trg_sales_on_convert()       from public, anon, authenticated;


-- ####### 0017_operations_agent.sql
-- ============================================================================
-- 0017_operations_agent.sql — Operations Agent v1 (presupuesto aceptado → trabajo)
--
-- Dos comportamientos automáticos (deterministas, 0 tokens):
--   A) Al ACEPTAR un presupuesto → crea el trabajo en la agenda (pendiente de
--      fecha), con cliente, servicio y dirección del cliente.
--   B) Cuando un trabajo recibe fecha + hora → detecta si choca con otro trabajo
--      en la misma franja y crea una alerta de conflicto.
-- ============================================================================

-- ── A) Presupuesto aceptado → trabajo ───────────────────────────────────────
create or replace function public.generate_trabajo_for_quote(_quote_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  q   public.quotes%rowtype;
  cli public.clients%rowtype;
  dir text;
  t_id uuid;
begin
  select * into q from public.quotes where id = _quote_id;
  if not found then return null; end if;

  -- Evitar duplicados: un solo trabajo por presupuesto.
  if exists (select 1 from public.trabajos where quote_id = _quote_id) then
    return null;
  end if;

  select * into cli from public.clients where id = q.client_id;
  dir := nullif(concat_ws(', ', cli.direccion, cli.poblacion), '');

  insert into public.trabajos
    (tenant_id, quote_id, client_id, tipo_servicio, direccion, notas, estado)
  values
    (q.tenant_id, q.id, q.client_id, q.tipo_servicio, dir,
     concat('Generado por el Operations Agent al aceptar el presupuesto ',
            coalesce(q.numero, ''), '. Pendiente de asignar fecha.'),
     'pendiente')
  returning id into t_id;

  insert into public.agent_activity (tenant_id, agent, action, entity_type, entity_id, used_ai)
  values (q.tenant_id, 'operations',
    concat('Creó trabajo pendiente desde presupuesto ', coalesce(q.numero, '')),
    'trabajo', t_id, false);

  return t_id;
end; $$;

create or replace function public.trg_ops_on_accept()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.estado = 'aceptado' and old.estado is distinct from 'aceptado' then
    perform public.generate_trabajo_for_quote(new.id);
  end if;
  return new;
end; $$;

drop trigger if exists ops_on_accept on public.quotes;
create trigger ops_on_accept after update on public.quotes
  for each row execute function public.trg_ops_on_accept();

-- ── B) Trabajo con fecha+hora → detectar conflicto de franja ────────────────
create or replace function public.check_trabajo_conflict(_trabajo_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare t public.trabajos%rowtype; n integer;
begin
  select * into t from public.trabajos where id = _trabajo_id;
  if not found or t.fecha is null or t.hora is null then return; end if;

  select count(*) into n from public.trabajos x
  where x.tenant_id = t.tenant_id and x.id <> t.id
    and x.fecha = t.fecha and x.hora = t.hora
    and x.estado not in ('cancelado', 'completado');

  if n > 0 and not exists (
    select 1 from public.alerts a
    where a.entity_type = 'trabajo' and a.entity_id = t.id and not a.resolved
  ) then
    insert into public.alerts (tenant_id, severity, title, detail, entity_type, entity_id)
    values (t.tenant_id, 'warning',
      concat('⚠️ Conflicto de agenda: ', to_char(t.fecha, 'DD/MM'), ' ', to_char(t.hora, 'HH24:MI')),
      concat('Hay ', n + 1, ' trabajos en la misma franja. Revisa la planificación.'),
      'trabajo', t.id);
    insert into public.agent_activity (tenant_id, agent, action, entity_type, entity_id, used_ai)
    values (t.tenant_id, 'operations',
      concat('Detectó conflicto de agenda el ', to_char(t.fecha, 'DD/MM'), ' ', to_char(t.hora, 'HH24:MI')),
      'trabajo', t.id, false);
  end if;
end; $$;

create or replace function public.trg_ops_conflict()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.fecha is not null and new.hora is not null then
    perform public.check_trabajo_conflict(new.id);
  end if;
  return new;
end; $$;

drop trigger if exists ops_conflict on public.trabajos;
create trigger ops_conflict after insert or update on public.trabajos
  for each row execute function public.trg_ops_conflict();

revoke execute on function public.generate_trabajo_for_quote(uuid) from anon;
revoke execute on function public.check_trabajo_conflict(uuid)     from anon;
revoke execute on function public.trg_ops_on_accept()  from public, anon, authenticated;
revoke execute on function public.trg_ops_conflict()   from public, anon, authenticated;


-- ####### 0018_ceo_agent.sql
-- ============================================================================
-- 0018_ceo_agent.sql — CEO Agent v1 (informe ejecutivo diario)
--
-- Resume el trabajo de todos los agentes y del negocio en un informe diario:
-- KPIs, riesgos detectados y oportunidades. 100% determinista (0 tokens).
-- Pensado para ejecutarse con pg_cron una vez al día.
-- ============================================================================

create table if not exists public.ceo_reports (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  dia           date not null,
  resumen       text,
  kpis          jsonb not null default '{}',
  riesgos       text[] not null default '{}',
  oportunidades text[] not null default '{}',
  created_at    timestamptz not null default now(),
  unique (tenant_id, dia)
);

alter table public.ceo_reports enable row level security;
grant select on public.ceo_reports to authenticated;
grant all    on public.ceo_reports to service_role;
drop policy if exists "tenant_read_ceo" on public.ceo_reports;
create policy "tenant_read_ceo" on public.ceo_reports for select to authenticated
  using (tenant_id = public.user_tenant_id());

create or replace function public.generate_ceo_report(_tenant uuid, _dia date default current_date)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_leads int; v_leads_urg int; v_pres int; v_pres_acc int;
  v_fact int; v_facturado numeric; v_alert int; v_alert_crit int;
  v_trab_pend int; v_venc int; v_pres_sin int;
  m public.metrics_daily%rowtype;
  riesgos text[] := '{}'; oport text[] := '{}'; resumen text; rid uuid;
begin
  perform public.rebuild_metrics_daily(_tenant, _dia);

  select count(*) into v_leads     from public.leads   where tenant_id=_tenant and created_at::date=_dia;
  select count(*) into v_leads_urg from public.leads   where tenant_id=_tenant and created_at::date=_dia and prioridad in ('critica','alta');
  select count(*) into v_pres      from public.quotes  where tenant_id=_tenant and created_at::date=_dia;
  select count(*) into v_pres_acc  from public.quotes  where tenant_id=_tenant and estado='aceptado' and updated_at::date=_dia;
  select count(*), coalesce(sum(total),0) into v_fact, v_facturado
                                   from public.invoices where tenant_id=_tenant and created_at::date=_dia;
  select count(*) into v_alert     from public.alerts  where tenant_id=_tenant and not resolved;
  select count(*) into v_alert_crit from public.alerts where tenant_id=_tenant and not resolved and severity='critical';
  select count(*) into v_trab_pend from public.trabajos where tenant_id=_tenant and estado='pendiente';
  select count(*) into v_venc      from public.invoices where tenant_id=_tenant and estado='vencida';
  select count(*) into v_pres_sin  from public.quotes  where tenant_id=_tenant and estado='enviado' and created_at < now()-interval '72 hours';
  select * into m from public.metrics_daily where tenant_id=_tenant and dia=_dia;

  if v_venc > 0       then riesgos := array_append(riesgos, concat(v_venc, ' factura(s) vencida(s) sin cobrar')); end if;
  if v_pres_sin > 0   then riesgos := array_append(riesgos, concat(v_pres_sin, ' presupuesto(s) sin respuesta >72h')); end if;
  if v_alert_crit > 0 then riesgos := array_append(riesgos, concat(v_alert_crit, ' alerta(s) crítica(s) abierta(s)')); end if;

  if v_leads_urg > 0 then oport := array_append(oport, concat(v_leads_urg, ' lead(s) de alta prioridad por contactar')); end if;
  if v_pres_acc > 0  then oport := array_append(oport, concat(v_pres_acc, ' presupuesto(s) aceptado(s) hoy')); end if;
  if v_trab_pend > 0 then oport := array_append(oport, concat(v_trab_pend, ' trabajo(s) pendiente(s) de agendar')); end if;

  resumen := concat(
    'Hoy: ', v_leads, ' leads (', v_leads_urg, ' urgentes), ',
    v_pres, ' presupuestos, ', v_fact, ' facturas (', round(v_facturado, 2), ' €). ',
    case when array_length(riesgos, 1) is null then 'Sin riesgos destacados. '
         else concat(array_length(riesgos, 1), ' riesgo(s) a vigilar. ') end,
    'Coste IA: ', coalesce(round(m.ai_cost_usd, 4), 0), ' $ (',
    coalesce(m.ai_cache_hits, 0), ' ahorros de caché).'
  );

  insert into public.ceo_reports (tenant_id, dia, resumen, kpis, riesgos, oportunidades)
  values (_tenant, _dia, resumen,
    jsonb_build_object(
      'leads', v_leads, 'leads_urgentes', v_leads_urg, 'presupuestos', v_pres,
      'presupuestos_aceptados', v_pres_acc, 'facturas', v_fact, 'facturado_eur', round(v_facturado,2),
      'alertas_abiertas', v_alert, 'alertas_criticas', v_alert_crit, 'trabajos_pendientes', v_trab_pend,
      'ai_cost_usd', coalesce(round(m.ai_cost_usd,4),0), 'ai_cache_hits', coalesce(m.ai_cache_hits,0)),
    riesgos, oport)
  on conflict (tenant_id, dia) do update set
    resumen = excluded.resumen, kpis = excluded.kpis,
    riesgos = excluded.riesgos, oportunidades = excluded.oportunidades
  returning id into rid;

  insert into public.agent_activity (tenant_id, agent, action, used_ai)
  values (_tenant, 'ceo', concat('Generó informe ejecutivo del ', _dia), false);

  return rid;
end; $$;

revoke execute on function public.generate_ceo_report(uuid, date) from anon, authenticated;

-- Backfill: generar el informe de hoy.
do $$
declare t uuid;
begin
  select id into t from public.tenants where slug = 'vaciadodepisos';
  if t is not null then perform public.generate_ceo_report(t, current_date); end if;
end $$;


-- ####### 0019_guardian_agent.sql
-- ============================================================================
-- 0019_guardian_agent.sql — Helper de alertas + Guardian Agent (calidad de datos)
--
-- Guardian vigila incoherencias y datos incompletos para que la app no acumule
-- errores silenciosos. 100% determinista (0 tokens).
-- ============================================================================

-- ── Helper: crea una alerta SOLO si no hay ya una abierta equivalente ───────
-- Dedup por entidad (si se da entity_id) o por título (alertas a nivel tenant).
-- Reutilizable por todos los agentes.
create or replace function public.create_alert_once(
  _tenant uuid, _severity text, _title text, _detail text,
  _entity_type text default null, _entity_id uuid default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from public.alerts a
    where a.tenant_id = _tenant and not a.resolved
      and (
        (_entity_id is not null and a.entity_type = _entity_type and a.entity_id = _entity_id)
        or (_entity_id is null and a.title = _title)
      )
  ) then
    return;
  end if;
  insert into public.alerts (tenant_id, severity, title, detail, entity_type, entity_id)
  values (_tenant, _severity, _title, _detail, _entity_type, _entity_id);
end; $$;

-- ── Guardian Agent ──────────────────────────────────────────────────────────
create or replace function public.run_guardian_agent(_tenant uuid default null)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer := 0; r record;
begin
  -- Presupuestos a 0 € (precio sin poner)
  for r in
    select id, numero, tenant_id from public.quotes
    where (_tenant is null or tenant_id = _tenant)
      and estado in ('borrador','enviado') and coalesce(total,0) = 0
  loop
    perform public.create_alert_once(r.tenant_id, 'info',
      concat('Presupuesto sin precio: ', coalesce(r.numero,'(s/n)')),
      'Este presupuesto está a 0 €. Revisa el importe antes de enviarlo.', 'quote', r.id);
    n := n + 1;
  end loop;

  -- Leads activos sin teléfono NI email
  for r in
    select id, nombre, tenant_id from public.leads
    where (_tenant is null or tenant_id = _tenant)
      and estado in ('nuevo','contactado')
      and coalesce(telefono,'') = '' and coalesce(email,'') = ''
  loop
    perform public.create_alert_once(r.tenant_id, 'info',
      concat('Lead sin datos de contacto: ', r.nombre),
      'No tiene teléfono ni email; será difícil de contactar.', 'lead', r.id);
    n := n + 1;
  end loop;

  -- Facturas pendientes sin fecha de vencimiento
  for r in
    select id, serie, numero, tenant_id from public.invoices
    where (_tenant is null or tenant_id = _tenant)
      and estado in ('pendiente','parcial') and vencimiento is null
  loop
    perform public.create_alert_once(r.tenant_id, 'info',
      concat('Factura sin vencimiento: ', r.serie, '-', r.numero),
      'Sin fecha de vencimiento no se podrá detectar si vence.', 'invoice', r.id);
    n := n + 1;
  end loop;

  -- Trabajos aceptados pero sin fecha hace > 3 días (atascados)
  for r in
    select id, tenant_id from public.trabajos
    where (_tenant is null or tenant_id = _tenant)
      and estado = 'pendiente' and fecha is null
      and created_at < now() - interval '3 days'
  loop
    perform public.create_alert_once(r.tenant_id, 'warning',
      'Trabajo sin agendar hace días',
      'Un trabajo aceptado lleva más de 3 días sin fecha asignada.', 'trabajo', r.id);
    n := n + 1;
  end loop;

  if _tenant is not null then
    insert into public.agent_activity (tenant_id, agent, action, used_ai)
    values (_tenant, 'guardian', concat('Revisión de calidad: ', n, ' incidencia(s)'), false);
  end if;
  return n;
end; $$;

revoke execute on function public.create_alert_once(uuid,text,text,text,text,uuid) from anon;
revoke execute on function public.run_guardian_agent(uuid) from public, anon, authenticated;


-- ####### 0020_followup_agent.sql
-- ============================================================================
-- 0020_followup_agent.sql — Follow-up Agent (que no se escape negocio)
--
-- Recordatorios proactivos para no dejar caer oportunidades ni dinero:
--   · Leads "nuevo" sin contactar en 48h.
--   · Trabajos completados sin facturar (dinero sin cobrar).
--   · Clientes inactivos hace mucho (oportunidad de recontacto).
-- 100% determinista (0 tokens).
-- ============================================================================

create or replace function public.run_followup_agent(_tenant uuid default null)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer := 0; r record;
begin
  -- Leads "nuevo" sin contactar > 48h
  for r in
    select id, nombre, tenant_id from public.leads
    where (_tenant is null or tenant_id = _tenant)
      and estado = 'nuevo' and created_at < now() - interval '48 hours'
  loop
    perform public.create_alert_once(r.tenant_id, 'warning',
      concat('Lead sin contactar 48h: ', r.nombre),
      'Lleva más de 2 días sin gestionar. Contáctalo o descártalo.', 'lead', r.id);
    n := n + 1;
  end loop;

  -- Trabajos completados sin factura asociada (estás dejando de cobrar)
  for r in
    select t.id, t.tenant_id, c.nombre
    from public.trabajos t
    left join public.clients c on c.id = t.client_id
    where (_tenant is null or t.tenant_id = _tenant)
      and t.estado = 'completado'
      and not exists (
        select 1 from public.invoices i
        where i.quote_id is not distinct from t.quote_id and i.client_id is not distinct from t.client_id
      )
  loop
    perform public.create_alert_once(r.tenant_id, 'warning',
      concat('Trabajo completado sin facturar: ', coalesce(r.nombre, 'cliente')),
      'Un trabajo terminado aún no tiene factura. Estás dejando de cobrar.', 'trabajo', r.id);
    n := n + 1;
  end loop;

  -- Clientes recurrentes inactivos > 6 meses (oportunidad de recontacto)
  for r in
    select id, nombre, tenant_id from public.clients
    where (_tenant is null or tenant_id = _tenant)
      and recurrente = true
      and ultima_fecha is not null
      and ultima_fecha < current_date - interval '6 months'
  loop
    perform public.create_alert_once(r.tenant_id, 'info',
      concat('Cliente inactivo: ', r.nombre),
      'Cliente recurrente sin actividad en más de 6 meses. Oportunidad de recontacto.', 'client', r.id);
    n := n + 1;
  end loop;

  if _tenant is not null then
    insert into public.agent_activity (tenant_id, agent, action, used_ai)
    values (_tenant, 'followup', concat('Seguimiento: ', n, ' recordatorio(s)'), false);
  end if;
  return n;
end; $$;

revoke execute on function public.run_followup_agent(uuid) from public, anon, authenticated;


-- ####### 0021_health_agent.sql
-- ============================================================================
-- 0021_health_agent.sql — Health / Setup Agent (te ayuda a configurar la app)
--
-- Comprueba que la app está bien configurada para sacarle partido, y te guía con
-- avisos accionables (datos de empresa, reglas de precio, etc.). 0 tokens.
-- También auto-resuelve sus propios avisos cuando el problema ya está corregido.
-- ============================================================================

create or replace function public.run_health_check(_tenant uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer := 0; cs public.company_settings%rowtype; ok_fiscal boolean; ok_precios boolean;
begin
  if _tenant is null then return 0; end if;

  -- 1) Datos fiscales de la empresa
  select * into cs from public.company_settings where tenant_id = _tenant;
  ok_fiscal := found and coalesce(cs.tax_id,'') <> '' and coalesce(cs.legal_name,'') <> '';
  if not ok_fiscal then
    perform public.create_alert_once(_tenant, 'info',
      'Completa los datos fiscales de tu empresa',
      'Faltan NIF/CIF o razón social. Son necesarios para emitir facturas válidas.', null, null);
    n := n + 1;
  end if;

  -- 2) Reglas de precio (sin ellas, el Sales Agent no calcula presupuestos)
  ok_precios := exists (select 1 from public.pricing_rules where tenant_id = _tenant and enabled);
  if not ok_precios then
    perform public.create_alert_once(_tenant, 'info',
      'Configura tus reglas de precio',
      'Sin reglas de precio el Sales Agent no puede calcular presupuestos automáticos.', null, null);
    n := n + 1;
  end if;

  -- Auto-resolución: si un problema ya está resuelto, cerramos su aviso.
  if ok_fiscal then
    update public.alerts set resolved = true, resolved_at = now()
    where tenant_id = _tenant and not resolved
      and title = 'Completa los datos fiscales de tu empresa';
  end if;
  if ok_precios then
    update public.alerts set resolved = true, resolved_at = now()
    where tenant_id = _tenant and not resolved
      and title = 'Configura tus reglas de precio';
  end if;

  insert into public.agent_activity (tenant_id, agent, action, used_ai)
  values (_tenant, 'health', concat('Chequeo de configuración: ', n, ' aviso(s)'), false);
  return n;
end; $$;

revoke execute on function public.run_health_check(uuid) from public, anon, authenticated;




-- ####### 0022_alerts_dedup_trigger.sql
-- ============================================================================
-- 0022_alerts_dedup_trigger.sql — Anti-duplicados de alertas (a nivel de tabla)
--
-- Problema: varios agentes (lead, urgency, operations, daily briefing,
-- supervisor) insertan directamente en public.alerts SIN comprobar si ya existe
-- una alerta abierta equivalente. Resultado: la campana se llenaba con la misma
-- alerta repetida en cada pasada del cron y el contador no paraba de subir.
--
-- Solución robusta y a prueba de futuro: un trigger BEFORE INSERT en la propia
-- tabla. Cubre a TODOS los agentes (los actuales y los que se añadan), usen o no
-- el helper create_alert_once. Si ya hay una alerta ABIERTA equivalente, descarta
-- silenciosamente el nuevo insert. Las alertas ya resueltas no cuentan: si el
-- problema reaparece tras resolverlo, se vuelve a avisar (pero solo una vez).
--
-- Dedup por entidad (entity_type + entity_id) cuando hay entidad; si no, por
-- título a nivel de tenant. Mismo criterio que create_alert_once (0019).
-- ============================================================================

create or replace function public.alerts_skip_duplicates()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from public.alerts a
    where a.tenant_id is not distinct from new.tenant_id
      and not a.resolved
      and (
        (new.entity_id is not null
           and a.entity_type is not distinct from new.entity_type
           and a.entity_id = new.entity_id)
        or
        (new.entity_id is null and a.title = new.title)
      )
  ) then
    return null;  -- ya existe una equivalente abierta → no insertamos otra
  end if;
  return new;
end; $$;

drop trigger if exists trg_alerts_skip_duplicates on public.alerts;
create trigger trg_alerts_skip_duplicates
  before insert on public.alerts
  for each row execute function public.alerts_skip_duplicates();

-- ── Limpieza única de los duplicados YA acumulados ──────────────────────────
-- Deja abierta solo la más reciente de cada grupo equivalente; el resto se marca
-- como resuelta. Así la campana baja de golpe sin perder ningún aviso distinto.
with ranked as (
  select id,
    row_number() over (
      partition by tenant_id,
        case
          when entity_id is not null then coalesce(entity_type,'') || ':' || entity_id::text
          else 'title:' || title
        end
      order by created_at desc
    ) as rn
  from public.alerts
  where not resolved
)
update public.alerts a
set resolved = true, resolved_at = now()
from ranked r
where a.id = r.id and r.rn > 1;
