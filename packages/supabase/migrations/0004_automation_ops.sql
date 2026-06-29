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
