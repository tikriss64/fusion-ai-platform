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
