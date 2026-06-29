-- Punto 3 (auditoría): agentes diarios que faltaban.
--   A) run_daily_briefing_agent  → "preparación del día siguiente" + "cobros próximos"
--   B) run_weekly_summary_agent  → "resumen semanal"
-- Usan alertas de RESUMEN que se AUTO-RESUELVEN (como mucho una abierta por tipo y
-- tenant). Por eso NO interfieren con las alertas por-entidad (vencidas, leads,
-- trabajos sin facturar…) del resto de agentes, que siguen igual.

create or replace function public.run_daily_briefing_agent(_tenant uuid default null)
returns integer language plpgsql security definer set search_path = public as $$
declare
  n integer := 0; t record; manana date := current_date + 1;
  n_jobs integer; jobs_txt text; n_inv integer; sum_inv numeric;
begin
  for t in select id from public.tenants where _tenant is null or id = _tenant loop
    -- Resolver el briefing anterior → siempre máximo uno abierto por tipo.
    update public.alerts set resolved = true, resolved_at = now()
      where tenant_id = t.id and not resolved
        and (title like '📅 Mañana%' or title like '💶 Cobros próximos%');

    -- 1) Preparación del día siguiente: trabajos activos de mañana.
    select count(*), string_agg(
        concat(coalesce(substring(tr.hora::text from 1 for 5), '—'), ' · ',
               coalesce(c.nombre, 'sin cliente'),
               case when tr.tipo_servicio is not null
                    then concat(' (', replace(tr.tipo_servicio::text, '_', ' '), ')') else '' end),
        E'\n' order by tr.hora nulls last)
      into n_jobs, jobs_txt
      from public.trabajos tr
      left join public.clients c on c.id = tr.client_id
      where tr.tenant_id = t.id and tr.fecha = manana
        and tr.estado not in ('completado', 'cancelado');
    if coalesce(n_jobs, 0) > 0 then
      insert into public.alerts (tenant_id, severity, title, detail)
      values (t.id, 'info',
        concat('📅 Mañana: ', n_jobs, ' trabajo', case when n_jobs = 1 then '' else 's' end),
        jobs_txt);
      insert into public.agent_activity (tenant_id, agent, action, used_ai)
      values (t.id, 'briefing', concat('Preparó el día siguiente: ', n_jobs, ' trabajo(s)'), false);
      n := n + 1;
    end if;

    -- 2) Cobros próximos: facturas que vencen en 7 días (aún no vencidas).
    select count(*), coalesce(sum(greatest(0, i.total - coalesce(p.pagado, 0))), 0)
      into n_inv, sum_inv
      from public.invoices i
      left join (select invoice_id, sum(importe) pagado from public.invoice_payments group by invoice_id) p
        on p.invoice_id = i.id
      where i.tenant_id = t.id and i.estado in ('pendiente', 'parcial')
        and i.vencimiento is not null
        and i.vencimiento >= current_date and i.vencimiento <= current_date + 7;
    if coalesce(n_inv, 0) > 0 then
      insert into public.alerts (tenant_id, severity, title, detail)
      values (t.id, 'info',
        concat('💶 Cobros próximos: ', n_inv, ' factura', case when n_inv = 1 then '' else 's' end),
        concat(round(sum_inv, 2), ' € vencen en los próximos 7 días.'));
      n := n + 1;
    end if;
  end loop;
  return n;
end; $$;

revoke execute on function public.run_daily_briefing_agent(uuid) from public, anon, authenticated;


create or replace function public.run_weekly_summary_agent(_tenant uuid default null)
returns integer language plpgsql security definer set search_path = public as $$
declare
  n integer := 0; t record;
  v_leads int; v_quotes int; v_fact numeric; v_cobr numeric;
begin
  for t in select id from public.tenants where _tenant is null or id = _tenant loop
    update public.alerts set resolved = true, resolved_at = now()
      where tenant_id = t.id and not resolved and title like '📊 Resumen semanal%';

    select count(*) into v_leads from public.leads
      where tenant_id = t.id and created_at >= now() - interval '7 days';
    select count(*) into v_quotes from public.quotes
      where tenant_id = t.id and is_template = false and created_at >= now() - interval '7 days';
    select coalesce(sum(total), 0) into v_fact from public.invoices
      where tenant_id = t.id and fecha_emision >= current_date - 7;
    select coalesce(sum(p.importe), 0) into v_cobr
      from public.invoice_payments p join public.invoices i on i.id = p.invoice_id
      where i.tenant_id = t.id and p.fecha >= current_date - 7;

    insert into public.alerts (tenant_id, severity, title, detail)
    values (t.id, 'info', '📊 Resumen semanal',
      concat('Últimos 7 días: ', v_leads, ' leads · ', v_quotes, ' presupuestos · ',
             round(v_fact, 2), ' € facturado · ', round(v_cobr, 2), ' € cobrado.'));
    insert into public.agent_activity (tenant_id, agent, action, used_ai)
    values (t.id, 'weekly', 'Generó el resumen semanal', false);
    n := n + 1;
  end loop;
  return n;
end; $$;

revoke execute on function public.run_weekly_summary_agent(uuid) from public, anon, authenticated;

-- Programación pg_cron (best-effort; si falla por permisos, añadir en el panel).
do $do$
begin
  perform cron.schedule('daily-briefing', '0 20 * * *', $cron$select public.run_daily_briefing_agent();$cron$);
  perform cron.schedule('weekly-summary', '5 8 * * 1', $cron$select public.run_weekly_summary_agent();$cron$);
exception when others then
  raise notice 'No se pudo programar pg_cron (hazlo en el panel de Supabase): %', sqlerrm;
end $do$;
