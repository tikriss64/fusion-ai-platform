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
