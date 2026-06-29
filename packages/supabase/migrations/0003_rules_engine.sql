-- ============================================================================
-- 0003_rules_engine.sql — Reglas DETERMINISTAS (resuelven sin IA)
-- Todo lo que se puede decidir con patrones se decide aquí, en la DB, editable
-- sin redeploy. La IA solo entra cuando ninguna regla aplica.
-- ============================================================================

-- ── Reglas del router (Nivel 0): intención, clasificación, urgencia, servicio ─
-- Cada fila es un patrón regex y el resultado determinista que produce.
-- Editables desde el panel: añadir una regla = más cobertura sin tokens.
create table public.router_rules (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  kind       text not null check (kind in
             ('intent','classification','urgency','service_type','spam')),
  pattern    text not null,            -- regex (POSIX) que se prueba contra el texto
  flags      text not null default 'i',-- 'i' = ignore case
  result     jsonb not null,           -- salida determinista si el patrón casa
  priority   integer not null default 100, -- menor = se evalúa antes
  enabled    boolean not null default true,
  created_at timestamptz not null default now()
);

create index idx_router_rules_lookup
  on public.router_rules(tenant_id, kind, priority) where enabled;

-- Evalúa el texto contra las reglas de un tipo y devuelve el primer acierto.
-- Coste: 0 tokens. Esto cubre el grueso de la clasificación de correos.
create or replace function public.match_router_rule(
  _tenant uuid, _kind text, _text text
)
returns jsonb language sql stable security definer set search_path = public as $$
  select r.result
  from public.router_rules r
  where r.tenant_id = _tenant and r.kind = _kind and r.enabled
    and _text ~* r.pattern        -- match case-insensitive
  order by r.priority
  limit 1;
$$;

-- ── Reglas de precio: presupuestos automáticos SIN IA ───────────────────────
-- Precio = base + €/m² · metros, con multiplicadores por condiciones de acceso.
create table public.pricing_rules (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  tipo_servicio text not null,           -- 'vaciado','limpieza','retirada_muebles','mixto'
  base_price    numeric(12,2) not null default 0,
  price_per_m2  numeric(12,2) not null default 0,
  modifiers     jsonb not null default '{}', -- {"sin_ascensor":1.2,"urgente":1.3,...}
  min_price     numeric(12,2) not null default 0,
  enabled       boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (tenant_id, tipo_servicio)
);

-- Calcula un presupuesto de forma determinista. La app la usa para pre-rellenar
-- el presupuesto al instante; la IA solo se usaría para matices del texto libre.
create or replace function public.calc_quote_price(
  _tenant uuid, _tipo text, _m2 numeric, _flags text[] default '{}'
)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare
  r public.pricing_rules%rowtype;
  precio numeric := 0;
  f text;
  mult numeric;
begin
  select * into r from public.pricing_rules
    where tenant_id = _tenant and tipo_servicio = _tipo and enabled;
  if not found then return null; end if;

  precio := r.base_price + r.price_per_m2 * coalesce(_m2, 0);

  foreach f in array _flags loop          -- aplica multiplicadores activos
    mult := (r.modifiers ->> f)::numeric;
    if mult is not null then precio := precio * mult; end if;
  end loop;

  return greatest(precio, r.min_price);   -- nunca por debajo del mínimo
end;
$$;

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.router_rules  enable row level security;
alter table public.pricing_rules enable row level security;

grant select, insert, update, delete on public.router_rules  to authenticated;
grant select, insert, update, delete on public.pricing_rules to authenticated;
grant all on public.router_rules, public.pricing_rules to service_role;

create policy "tenant rw router_rules" on public.router_rules
  for all to authenticated
  using (tenant_id = public.user_tenant_id())
  with check (tenant_id = public.user_tenant_id());

create policy "tenant read pricing" on public.pricing_rules
  for select to authenticated using (tenant_id = public.user_tenant_id());
create policy "managers write pricing" on public.pricing_rules
  for all to authenticated
  using (tenant_id = public.user_tenant_id() and public.has_tenant_role('manager'))
  with check (tenant_id = public.user_tenant_id() and public.has_tenant_role('manager'));

revoke execute on function public.match_router_rule(uuid,text,text) from anon;
revoke execute on function public.calc_quote_price(uuid,text,numeric,text[]) from anon;
