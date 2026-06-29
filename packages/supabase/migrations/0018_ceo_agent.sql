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
