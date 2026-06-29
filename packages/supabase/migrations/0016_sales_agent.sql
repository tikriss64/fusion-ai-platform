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
