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
