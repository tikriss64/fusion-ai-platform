-- D1 (auditoría): mantener automáticamente las estadísticas del cliente.
-- num_trabajos = nº de trabajos COMPLETADOS del cliente.
-- ultima_fecha = fecha del trabajo completado más reciente.
-- Antes eran campos manuales que nunca se actualizaban → datos podridos que además
-- ensuciaban el contexto que la IA usa para redactar emails.

create or replace function public.recompute_client_stats(_client_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if _client_id is null then return; end if;
  update public.clients c set
    num_trabajos = (select count(*) from public.trabajos t
                      where t.client_id = _client_id and t.estado = 'completado'),
    ultima_fecha = (select max(t.fecha) from public.trabajos t
                      where t.client_id = _client_id and t.estado = 'completado')
  where c.id = _client_id;
end;
$$;

create or replace function public.trg_recompute_client_stats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (TG_OP = 'DELETE') then
    perform public.recompute_client_stats(OLD.client_id);
    return OLD;
  end if;
  perform public.recompute_client_stats(NEW.client_id);
  if (TG_OP = 'UPDATE' and OLD.client_id is distinct from NEW.client_id) then
    perform public.recompute_client_stats(OLD.client_id);
  end if;
  return NEW;
end;
$$;

drop trigger if exists trabajos_client_stats on public.trabajos;
create trigger trabajos_client_stats
after insert or update or delete on public.trabajos
for each row execute function public.trg_recompute_client_stats();

-- Backfill: recalcular todos los clientes existentes una vez.
update public.clients c set
  num_trabajos = coalesce((select count(*) from public.trabajos t
                             where t.client_id = c.id and t.estado = 'completado'), 0),
  ultima_fecha = (select max(t.fecha) from public.trabajos t
                    where t.client_id = c.id and t.estado = 'completado');
