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
