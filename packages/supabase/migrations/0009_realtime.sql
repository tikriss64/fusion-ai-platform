-- ============================================================================
-- 0009_realtime.sql — Activa Supabase Realtime para el Mission Control
-- Permite que el dashboard reciba cambios al instante (push) en vez de sondear.
-- ============================================================================

-- Añade las tablas del panel a la publicación de Realtime. Idempotente:
-- ignora el error si la tabla ya está en la publicación.
do $$
begin
  begin alter publication supabase_realtime add table public.alerts; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.agent_activity; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.metrics_daily; exception when duplicate_object then null; end;
end $$;
