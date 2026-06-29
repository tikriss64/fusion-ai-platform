-- Agente Supervisor + aprendizaje del sistema.
-- Idea (del usuario): un agente que supervise a los demás, aprenda de las
-- correcciones del usuario y crezca una base de conocimiento, con un informe
-- periódico de lo detectado para revisarlo juntos.

-- 1) Tabla de aprendizaje: registra las correcciones que el usuario hace sobre lo
--    que decidieron los agentes (p.ej. reclasificar un correo mal etiquetado).
--    Es la "memoria de errores" que hace al sistema más listo con el tiempo.
create table if not exists public.agent_learning (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid references public.tenants(id) on delete cascade,
  kind        text not null,            -- p.ej. 'email_reclassify'
  agent       text,                     -- agente afectado
  entity_type text,
  entity_id   text,
  before_value text,                    -- lo que puso el agente
  after_value  text,                    -- lo que corrigió el usuario
  note        text,
  created_at  timestamptz not null default now()
);
-- Solo el servidor (service role / funciones security definer) accede. RLS activado
-- sin políticas = denegado por defecto para clientes anon/authenticated. Seguro.
alter table public.agent_learning enable row level security;
create index if not exists idx_agent_learning_tenant on public.agent_learning(tenant_id, created_at desc);

-- 2) Agente Supervisor: una vez por semana resume la actividad de TODOS los agentes,
--    el estado de alertas y las correcciones aprendidas, en un informe (alerta
--    auto-resuelta) para que puedas revisarlo y mejorar el sistema juntos.
create or replace function public.run_supervisor_report_agent(_tenant uuid default null)
returns integer language plpgsql security definer set search_path = public as $$
declare
  n integer := 0; t record;
  v_acts int; v_ai int; v_open int; v_crit int; v_resolved int; v_learn int;
  agentes text; learn_txt text;
begin
  for t in select id from public.tenants where _tenant is null or id = _tenant loop
    update public.alerts set resolved = true, resolved_at = now()
      where tenant_id = t.id and not resolved and title like '🧭 Informe del supervisor%';

    select count(*), count(*) filter (where used_ai)
      into v_acts, v_ai
      from public.agent_activity
      where tenant_id = t.id and created_at >= now() - interval '7 days';

    select string_agg(x.agent || ' ×' || x.c, ', ' order by x.c desc)
      into agentes
      from (select agent, count(*) c from public.agent_activity
            where tenant_id = t.id and created_at >= now() - interval '7 days'
            group by agent) x;

    select count(*) filter (where not resolved),
           count(*) filter (where not resolved and severity = 'critical'),
           count(*) filter (where resolved and resolved_at >= now() - interval '7 days')
      into v_open, v_crit, v_resolved
      from public.alerts where tenant_id = t.id;

    select count(*) into v_learn from public.agent_learning
      where tenant_id = t.id and created_at >= now() - interval '7 days';
    select string_agg(y.kind || ' ×' || y.c, ', ' order by y.c desc)
      into learn_txt
      from (select kind, count(*) c from public.agent_learning
            where tenant_id = t.id and created_at >= now() - interval '7 days'
            group by kind) y;

    insert into public.alerts (tenant_id, severity, title, detail)
    values (t.id, 'info', '🧭 Informe del supervisor (semana)',
      concat(
        v_acts, ' acciones de agentes (', coalesce(v_ai, 0), ' con IA)',
        case when agentes is not null then concat(' · ', agentes) else '' end, E'\n',
        'Alertas: ', v_open, ' abiertas (', v_crit, ' críticas), ', v_resolved, ' resueltas esta semana.', E'\n',
        'Correcciones aprendidas: ', coalesce(v_learn, 0),
        case when learn_txt is not null then concat(' (', learn_txt, ')') else '' end));

    insert into public.agent_activity (tenant_id, agent, action, used_ai)
    values (t.id, 'supervisor', 'Generó el informe semanal de supervisión', false);
    n := n + 1;
  end loop;
  return n;
end; $$;
revoke execute on function public.run_supervisor_report_agent(uuid) from public, anon, authenticated;

-- 3) Programación semanal (lunes 8:10, tras el resumen semanal).
do $do$
begin
  perform cron.schedule('supervisor-report', '10 8 * * 1', $cron$select public.run_supervisor_report_agent();$cron$);
exception when others then
  raise notice 'No se pudo programar pg_cron (añádelo en el panel): %', sqlerrm;
end $do$;
