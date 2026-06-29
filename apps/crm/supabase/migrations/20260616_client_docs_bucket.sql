-- ============================================================================
-- client-docs — Almacén de documentos adjuntos a la ficha de cada cliente.
-- Bucket PRIVADO (los contratos/facturas son sensibles): se descargan con URL
-- firmada temporal. Ruta de cada archivo: <client_id>/<timestamp>__<nombre>.
-- Ejecutar una vez en el SQL Editor de Supabase.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('client-docs', 'client-docs', false)
on conflict (id) do nothing;

drop policy if exists "auth read client-docs"   on storage.objects;
drop policy if exists "auth insert client-docs" on storage.objects;
drop policy if exists "auth delete client-docs" on storage.objects;

create policy "auth read client-docs" on storage.objects
  for select to authenticated using (bucket_id = 'client-docs');

create policy "auth insert client-docs" on storage.objects
  for insert to authenticated with check (bucket_id = 'client-docs');

create policy "auth delete client-docs" on storage.objects
  for delete to authenticated using (bucket_id = 'client-docs');
