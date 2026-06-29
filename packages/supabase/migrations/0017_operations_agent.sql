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
