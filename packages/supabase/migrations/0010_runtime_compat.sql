-- ============================================================================
-- 0010_runtime_compat.sql — Compatibilidad runtime con el código heredado
--  1) GRANT EXECUTE de helpers RLS a authenticated (faltaba en 0001).
--  2) Columna user_id (legacy) en tablas que el CRM antiguo aún rellena.
--  3) Trigger BEFORE INSERT que rellena tenant_id automáticamente desde el
--     tenant del usuario actual, para que el código viejo siga funcionando.
-- Es un parche "puente" hasta el refactor user_id→tenant_id del CRM.
-- ============================================================================

-- ── 1. Permisos faltantes ───────────────────────────────────────────────────
grant execute on function public.user_tenant_id() to authenticated;
grant execute on function public.has_tenant_role(text) to authenticated;

-- ── 1b. Política NO recursiva para tenant_members ───────────────────────────
-- La política original ('members see co-members') usa user_tenant_id(), que a su
-- vez consulta tenant_members → recursión + 403. Sustituimos por una directa:
-- cada usuario ve siempre SU propia fila de membresía. (Los admins se cubren con
-- 'admins manage members' que sigue valiendo.)
drop policy if exists "members see co-members" on public.tenant_members;
create policy "self_see_membership" on public.tenant_members
  for select to authenticated using (user_id = auth.uid());

-- ── 1c. Vista de compatibilidad user_roles ──────────────────────────────────
-- El código heredado del CRM consulta `user_roles(role, user_id)`. Ya no existe
-- esa tabla (se sustituyó por tenant_members), pero exponemos una vista con la
-- misma forma para que las queries antiguas funcionen sin tocar código.
create or replace view public.user_roles
  with (security_invoker = true)
  as select user_id, role::text as role
       from public.tenant_members
      where user_id = auth.uid();
grant select on public.user_roles to authenticated;

-- ── 2. Columna user_id legacy donde el código antiguo la espera ─────────────
alter table public.clients          add column if not exists user_id uuid references auth.users(id);
alter table public.quotes           add column if not exists user_id uuid references auth.users(id);
alter table public.invoices         add column if not exists user_id uuid references auth.users(id);
alter table public.trabajos         add column if not exists user_id uuid references auth.users(id);
alter table public.invoice_payments add column if not exists user_id uuid references auth.users(id);

-- ── 3. Trigger: rellenar tenant_id automáticamente al insertar ──────────────
create or replace function public.fill_tenant_from_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.tenant_id is null then
    new.tenant_id := public.user_tenant_id();
  end if;
  if new.tenant_id is null then
    raise exception 'No se pudo determinar el tenant: el usuario no es miembro de ninguno';
  end if;
  return new;
end;
$$;

do $$
declare tbl text;
begin
  foreach tbl in array array['clients','quotes','invoices','trabajos','leads',
      'appointments','professionals','services','resources','notifications',
      'company_settings'] loop
    execute format('drop trigger if exists fill_tenant_on_insert on public.%I;', tbl);
    execute format(
      'create trigger fill_tenant_on_insert before insert on public.%I
         for each row execute function public.fill_tenant_from_user();',
      tbl
    );
  end loop;
end $$;

revoke execute on function public.fill_tenant_from_user() from public, anon, authenticated;
