-- ============================================================================
-- 0005_seed.sql — Datos iniciales para que el sistema funcione SIN IA desde ya
-- Reemplaza '<TENANT_ID>' por el id real de tu tenant tras crearlo.
-- (Estas reglas replican y amplían el command router del CRM original.)
-- ============================================================================

-- Crea el tenant de tu empresa (ejecutar una vez; copia el id que devuelve).
insert into public.tenants (nombre, slug)
values ('vaciadodepisos.cat', 'vaciadodepisos')
on conflict (slug) do nothing;

do $$
declare t uuid;
begin
  select id into t from public.tenants where slug = 'vaciadodepisos';

  -- ── Detección de tipo de servicio (0 tokens) ─────────────────────────────
  insert into public.router_rules (tenant_id, kind, pattern, result, priority) values
    (t,'service_type','retirada\s+de\s+muebles|retirar\s+muebles', '{"tipo_servicio":"retirada_muebles"}', 10),
    (t,'service_type','vaciado',   '{"tipo_servicio":"vaciado"}',   20),
    (t,'service_type','limpieza',  '{"tipo_servicio":"limpieza"}',  30),
    (t,'service_type','mixto',     '{"tipo_servicio":"mixto"}',     40);

  -- ── Detección de urgencia (alimenta el Urgency Agent sin IA) ─────────────
  insert into public.router_rules (tenant_id, kind, pattern, result, priority) values
    (t,'urgency','urgente|cuanto antes|hoy mismo|inmediato|ya',          '{"nivel":"alta"}',    10),
    (t,'urgency','esta semana|pronto|lo antes posible',                   '{"nivel":"media"}',   20),
    (t,'urgency','reclamaci[oó]n|queja|enfadad|indignad|fatal|verg[uü]enza','{"nivel":"critica","cliente_enfadado":true}', 5);

  -- ── Spam / no-lead (descarta sin gastar tokens) ──────────────────────────
  insert into public.router_rules (tenant_id, kind, pattern, result, priority) values
    (t,'spam','newsletter|unsubscribe|no-reply|publicidad|promoci[oó]n', '{"spam":true}', 10);

  -- ── Precios base (presupuestos automáticos deterministas) ────────────────
  -- Ajusta a tus tarifas reales. min_price evita presupuestos irrisorios.
  insert into public.pricing_rules
    (tenant_id, tipo_servicio, base_price, price_per_m2, min_price, modifiers) values
    (t,'vaciado',          120, 6.5, 180, '{"sin_ascensor":1.25,"urgente":1.30,"planta_alta":1.15}'),
    (t,'retirada_muebles',  80, 3.0, 120, '{"sin_ascensor":1.20,"urgente":1.30}'),
    (t,'limpieza',          90, 4.0, 120, '{"urgente":1.25}'),
    (t,'mixto',            160, 8.0, 240, '{"sin_ascensor":1.25,"urgente":1.30,"planta_alta":1.15}');
end $$;
