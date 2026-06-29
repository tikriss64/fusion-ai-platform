-- ============================================================================
-- 0015_urgency_agent.sql — Urgency Agent v1 (vigilancia proactiva de riesgos)
--
-- A diferencia del Lead Agent (reacciona al insertar), este es PROACTIVO: se
-- ejecuta en segundo plano (pg_cron) y escanea datos existentes buscando riesgos:
--   1) Presupuestos enviados sin respuesta > 72h  → alerta de seguimiento.
--   2) Facturas vencidas (sin pagar, fecha pasada) → alerta crítica + marca vencida.
-- 100% determinista (0 tokens). No duplica alertas (comprueba si ya hay una abierta).
--
-- FUTURO: cuando el Inbox tenga Gmail, se añade aquí el escaneo de correos con
-- tono de enfado / reclamaciones (necesita reconciliar email.id text ↔ alertas).
-- ============================================================================

create or replace function public.run_urgency_agent(_tenant uuid default null)
returns integer language plpgsql security definer set search_path = public as $$
declare
  n integer := 0;
  r record;
begin
  -- ── 1) Presupuestos enviados sin respuesta > 72h ──────────────────────────
  for r in
    select q.id, q.numero, q.total, q.tenant_id, c.nombre
    from public.quotes q
    left join public.clients c on c.id = q.client_id
    where (_tenant is null or q.tenant_id = _tenant)
      and q.estado = 'enviado'
      and q.created_at < now() - interval '72 hours'
      and not exists (
        select 1 from public.alerts a
        where a.entity_type = 'quote' and a.entity_id = q.id and not a.resolved
      )
  loop
    insert into public.alerts (tenant_id, severity, title, detail, entity_type, entity_id)
    values (r.tenant_id, 'warning',
      concat('🟡 Presupuesto sin respuesta: ', coalesce(r.numero, '(s/n)')),
      concat('Enviado a ', coalesce(r.nombre, 'cliente'),
             ' hace más de 72h sin respuesta. Total ', coalesce(r.total, 0), ' €.'),
      'quote', r.id);
    insert into public.agent_activity (tenant_id, agent, action, entity_type, entity_id, used_ai)
    values (r.tenant_id, 'urgency',
      concat('Detectó presupuesto sin respuesta: ', coalesce(r.numero, '(s/n)')),
      'quote', r.id, false);
    n := n + 1;
  end loop;

  -- ── 2) Facturas vencidas ──────────────────────────────────────────────────
  for r in
    select i.id, i.serie, i.numero, i.total, i.vencimiento, i.tenant_id, c.nombre
    from public.invoices i
    left join public.clients c on c.id = i.client_id
    where (_tenant is null or i.tenant_id = _tenant)
      and i.estado in ('pendiente', 'parcial')
      and i.vencimiento is not null
      and i.vencimiento < current_date
      and not exists (
        select 1 from public.alerts a
        where a.entity_type = 'invoice' and a.entity_id = i.id and not a.resolved
      )
  loop
    update public.invoices set estado = 'vencida' where id = r.id;
    insert into public.alerts (tenant_id, severity, title, detail, entity_type, entity_id)
    values (r.tenant_id, 'critical',
      concat('🔴 Factura vencida: ', r.serie, '-', r.numero),
      concat(coalesce(r.nombre, 'Cliente'), ' · ', coalesce(r.total, 0),
             ' € · venció el ', r.vencimiento, '.'),
      'invoice', r.id);
    insert into public.agent_activity (tenant_id, agent, action, entity_type, entity_id, used_ai)
    values (r.tenant_id, 'urgency',
      concat('Marcó factura vencida: ', r.serie, '-', r.numero),
      'invoice', r.id, false);
    n := n + 1;
  end loop;

  return n;
end; $$;

-- Solo el servidor / pg_cron la ejecutan; no se expone a clientes.
revoke execute on function public.run_urgency_agent(uuid) from public, anon, authenticated;
