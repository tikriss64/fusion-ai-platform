-- Fase 2 del aprendizaje: el sistema se vuelve más listo SOLO.
-- run_learning_agent revisa las correcciones del usuario (agent_learning) y, cuando
-- un dominio de remitente ha sido reclasificado al mismo tipo >= 2 veces, crea una
-- REGLA de clasificación en router_rules. A partir de ahí el clasificador aplica esa
-- regla a 0 tokens y NO vuelve a equivocarse (lo aplica el Worker antes de la IA).

create or replace function public.run_learning_agent(_tenant uuid default null)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer := 0; t record; r record; pat text;
begin
  for t in select id from public.tenants where _tenant is null or id = _tenant loop
    for r in
      select distinct on (dom) dom, tipo, c from (
        select split_part(e.sender_email, '@', 2) as dom, al.after_value as tipo, count(*) as c
        from public.agent_learning al
        join public.email e on e.id = al.entity_id
        where al.tenant_id = t.id and al.kind = 'email_reclassify'
          and e.sender_email like '%@%' and coalesce(al.after_value, '') <> ''
        group by 1, 2
      ) s
      where c >= 2
      order by dom, c desc
    loop
      if r.dom is null or r.dom = '' then continue; end if;
      pat := replace(r.dom, '.', '\.');   -- escapar puntos para el regex
      -- ¿ya existe una regla de clasificación para este dominio? → no duplicar.
      if exists (
        select 1 from public.router_rules
        where tenant_id = t.id and kind = 'classification' and enabled and pattern = pat
      ) then continue; end if;
      insert into public.router_rules (tenant_id, kind, pattern, result, priority)
      values (t.id, 'classification', pat, jsonb_build_object('type', r.tipo), 50);
      insert into public.agent_activity (tenant_id, agent, action, used_ai)
      values (t.id, 'learning', concat('Aprendió regla: ', r.dom, ' → ', r.tipo, ' (0 tokens en adelante)'), false);
      n := n + 1;
    end loop;
  end loop;
  return n;
end; $$;
revoke execute on function public.run_learning_agent(uuid) from public, anon, authenticated;

-- Programación: cada día 7:50 (antes de los agentes de las 8:00).
do $do$
begin
  perform cron.schedule('learning-agent', '50 7 * * *', $cron$select public.run_learning_agent();$cron$);
exception when others then
  raise notice 'No se pudo programar pg_cron: %', sqlerrm;
end $do$;
