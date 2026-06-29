-- ============================================================================
-- 0013_public_lead_intake.sql — Entrada pública de leads desde vaciadodepisos.cat
--
-- El formulario de la web (anónimo, sin login) NO puede insertar directamente en
-- `leads` porque: (a) tenant_id es NOT NULL y (b) el trigger de tenant solo sirve
-- para usuarios autenticados. Solución: una RPC controlada (SECURITY DEFINER) que
-- valida la entrada, resuelve el tenant por slug y crea el lead. Es el único camino
-- anónimo permitido (más seguro que exponer la tabla entera).
-- ============================================================================

create or replace function public.submit_lead(
  _nombre        text,
  _telefono      text default null,
  _email         text default null,
  _servicio      text default null,
  _ubicacion     text default null,
  _ciudad        text default null,
  _mensaje       text default null,
  _origen_pagina text default null,
  _tenant_slug   text default 'vaciadodepisos'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare t uuid; new_id uuid;
begin
  -- Validación mínima anti-basura.
  if _nombre is null or length(btrim(_nombre)) = 0 then
    raise exception 'El nombre es obligatorio';
  end if;
  if (_email is null or btrim(_email) = '') and (_telefono is null or btrim(_telefono) = '') then
    raise exception 'Indica al menos un email o un teléfono';
  end if;

  select id into t from public.tenants where slug = coalesce(_tenant_slug, 'vaciadodepisos');
  if t is null then raise exception 'Empresa no encontrada (%).', _tenant_slug; end if;

  insert into public.leads
    (tenant_id, nombre, telefono, email, servicio, ubicacion, ciudad, mensaje, origen_pagina, estado)
  values
    (t, left(btrim(_nombre),200), left(_telefono,40), left(_email,200),
     left(_servicio,100), left(_ubicacion,200), left(_ciudad,100),
     left(_mensaje,2000), left(_origen_pagina,300), 'nuevo')
  returning id into new_id;

  return new_id;
end; $$;

-- Permisos: solo anon + authenticated pueden llamarla; nada más.
revoke all on function
  public.submit_lead(text,text,text,text,text,text,text,text,text) from public;
grant execute on function
  public.submit_lead(text,text,text,text,text,text,text,text,text) to anon, authenticated;

-- Endurecimiento: la RPC es el ÚNICO camino anónimo. Se retira el INSERT directo
-- anónimo (que además estaba roto por el trigger de tenant).
revoke insert on public.leads from anon;
drop policy if exists "leads_insert_anon" on public.leads;
