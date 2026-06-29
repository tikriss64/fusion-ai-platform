-- ============================================================================
-- 0023_lead_antispam.sql — Anti-spam en la entrada pública de leads.
--
-- El formulario público (submit_lead) no tenía ninguna protección y los bots lo
-- estaban llenando de basura (backlinks, phishing, jackpots, texto aleatorio).
-- Añadimos, sin tocar la web:
--   1) Honeypot opcional (_hp): si viene relleno = bot → se descarta en silencio.
--   2) Filtro de contenido: URLs y palabras típicas de spam/estafa.
--   3) Nombre basura (mayúsculas+dígitos largos, p.ej. NATREGTEGH478780).
--   4) Rate-limit por contacto (mismo email/teléfono en 10 min).
--   5) Throttle global del formulario (ráfagas de envíos).
-- Los descartes silenciosos devuelven NULL (la web cree que fue bien y el bot no
-- sabe que ha sido bloqueado). Los leads legítimos entran igual que siempre.
-- ============================================================================

drop function if exists public.submit_lead(text,text,text,text,text,text,text,text,text);

create or replace function public.submit_lead(
  _nombre        text,
  _telefono      text default null,
  _email         text default null,
  _servicio      text default null,
  _ubicacion     text default null,
  _ciudad        text default null,
  _mensaje       text default null,
  _origen_pagina text default null,
  _tenant_slug   text default 'vaciadodepisos',
  _hp            text default null   -- honeypot (campo oculto en el formulario)
) returns uuid
language plpgsql security definer set search_path = public as $fn$
declare t uuid; new_id uuid; msg text;
begin
  -- 0) Honeypot: un humano nunca rellena este campo oculto.
  if _hp is not null and btrim(_hp) <> '' then return null; end if;

  -- Validación mínima.
  if _nombre is null or length(btrim(_nombre)) = 0 then
    raise exception 'El nombre es obligatorio';
  end if;
  if (_email is null or btrim(_email) = '') and (_telefono is null or btrim(_telefono) = '') then
    raise exception 'Indica al menos un email o un teléfono';
  end if;

  select id into t from public.tenants where slug = coalesce(_tenant_slug, 'vaciadodepisos');
  if t is null then raise exception 'Empresa no encontrada (%).', _tenant_slug; end if;

  -- Texto combinado (en minúsculas y con espacios alrededor para casar palabras).
  msg := ' ' || lower(coalesce(_mensaje, '') || ' ' || coalesce(_nombre, '')) || ' ';

  -- 1) Enlaces: un cliente de vaciado de pisos no manda URLs → casi siempre spam.
  if msg ~ '(https?://|www\.|t\.me/|bit\.ly|\.ru/|\.top/|telegram)' then return null; end if;

  -- 2) Palabras típicas de spam/estafa (con espacios para evitar falsos positivos
  --    como "deseo"/"museo" frente a "seo").
  if msg ~ '(jackpot|casino|crypto|bitcoin|viagra|cialis|forex|backlink| seo | usd | loan |rank your|click here|inactive for|claim your|gift card| bonus |earn money|make money|\$\s?[0-9])' then
    return null;
  end if;

  -- 3) Nombre basura: 12+ caracteres seguidos en MAYÚSCULAS/dígitos con algún número.
  if _nombre ~ '[A-Z0-9]{12,}' and _nombre ~ '[0-9]' then return null; end if;

  -- 4) Rate-limit por contacto: mismo email o teléfono en los últimos 10 minutos.
  if exists (
    select 1 from public.leads
    where tenant_id = t and created_at > now() - interval '10 minutes'
      and ((nullif(btrim(_email), '') is not null and lower(email) = lower(btrim(_email)))
        or (nullif(btrim(_telefono), '') is not null and telefono = btrim(_telefono)))
  ) then
    return null;
  end if;

  -- 5) Throttle global del formulario: máx. 8 envíos en 2 minutos.
  if (
    select count(*) from public.leads
    where tenant_id = t and coalesce(origen_pagina, '') <> 'manual'
      and created_at > now() - interval '2 minutes'
  ) >= 8 then
    raise exception 'Demasiadas solicitudes. Inténtalo en unos minutos.';
  end if;

  insert into public.leads
    (tenant_id, nombre, telefono, email, servicio, ubicacion, ciudad, mensaje, origen_pagina, estado)
  values
    (t, left(btrim(_nombre),200), left(_telefono,40), left(_email,200),
     left(_servicio,100), left(_ubicacion,200), left(_ciudad,100),
     left(_mensaje,2000), left(_origen_pagina,300), 'nuevo')
  returning id into new_id;

  return new_id;
end; $fn$;

revoke all on function
  public.submit_lead(text,text,text,text,text,text,text,text,text,text) from public;
grant execute on function
  public.submit_lead(text,text,text,text,text,text,text,text,text,text) to anon, authenticated;
