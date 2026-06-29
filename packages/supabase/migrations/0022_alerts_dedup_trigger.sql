-- ============================================================================
-- 0022_alerts_dedup_trigger.sql — Anti-duplicados de alertas (a nivel de tabla)
--
-- Problema: varios agentes (lead, urgency, operations, daily briefing,
-- supervisor) insertan directamente en public.alerts SIN comprobar si ya existe
-- una alerta abierta equivalente. Resultado: la campana se llenaba con la misma
-- alerta repetida en cada pasada del cron y el contador no paraba de subir.
--
-- Solución robusta y a prueba de futuro: un trigger BEFORE INSERT en la propia
-- tabla. Cubre a TODOS los agentes (los actuales y los que se añadan), usen o no
-- el helper create_alert_once. Si ya hay una alerta ABIERTA equivalente, descarta
-- silenciosamente el nuevo insert. Las alertas ya resueltas no cuentan: si el
-- problema reaparece tras resolverlo, se vuelve a avisar (pero solo una vez).
--
-- Dedup por entidad (entity_type + entity_id) cuando hay entidad; si no, por
-- título a nivel de tenant. Mismo criterio que create_alert_once (0019).
-- ============================================================================

create or replace function public.alerts_skip_duplicates()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from public.alerts a
    where a.tenant_id is not distinct from new.tenant_id
      and not a.resolved
      and (
        (new.entity_id is not null
           and a.entity_type is not distinct from new.entity_type
           and a.entity_id = new.entity_id)
        or
        (new.entity_id is null and a.title = new.title)
      )
  ) then
    return null;  -- ya existe una equivalente abierta → no insertamos otra
  end if;
  return new;
end; $$;

drop trigger if exists trg_alerts_skip_duplicates on public.alerts;
create trigger trg_alerts_skip_duplicates
  before insert on public.alerts
  for each row execute function public.alerts_skip_duplicates();

-- ── Limpieza única de los duplicados YA acumulados ──────────────────────────
-- Deja abierta solo la más reciente de cada grupo equivalente; el resto se marca
-- como resuelta. Así la campana baja de golpe sin perder ningún aviso distinto.
with ranked as (
  select id,
    row_number() over (
      partition by tenant_id,
        case
          when entity_id is not null then coalesce(entity_type,'') || ':' || entity_id::text
          else 'title:' || title
        end
      order by created_at desc
    ) as rn
  from public.alerts
  where not resolved
)
update public.alerts a
set resolved = true, resolved_at = now()
from ranked r
where a.id = r.id and r.rn > 1;
