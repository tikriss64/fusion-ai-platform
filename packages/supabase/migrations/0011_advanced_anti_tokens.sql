-- ============================================================================
-- 0011_advanced_anti_tokens.sql — Maximización del ahorro de tokens (estado 2026)
--
-- Cierra los gaps frente al estado del arte 2026 que la primera capa anti-tokens
-- (0002_ai_layer) no cubría. Cada bloque está documentado con qué problema real
-- evita y cuánta carga le quita a los LLMs.
-- ============================================================================

-- ── 1. Hybrid search (BM25 + vector + RRF) ──────────────────────────────────
-- POR QUÉ: vector puro pierde matches por palabras clave exactas (nombres,
-- referencias, números de factura). Hybrid combina ambos y aplica Reciprocal
-- Rank Fusion (RRF, k=60) — el patrón de retrieval dominante en 2026.

-- Idioma español para stemming y stopwords adecuados.
alter table public.email
  add column if not exists fts tsvector
  generated always as (
    setweight(to_tsvector('spanish', coalesce(subject, '')), 'A') ||
    setweight(to_tsvector('spanish', coalesce(summary, '')), 'B') ||
    setweight(to_tsvector('spanish', coalesce(snippet, '')), 'C') ||
    setweight(to_tsvector('spanish', coalesce(sender, '')), 'D')
  ) stored;

create index if not exists idx_email_fts on public.email using gin(fts);

-- Búsqueda híbrida con RRF. Devuelve los mejores resultados combinando ranking
-- por keyword (BM25-style ts_rank) y similitud semántica.
create or replace function public.hybrid_search_emails(
  _query_text text,
  _query_vec  vector(384),
  _limit      int default 10,
  _k          int default 60       -- constante RRF; 60 es el valor de la literatura
)
returns table (
  id text, subject text, summary text, type text, folder text,
  sender text, sender_email text, received_at bigint,
  rrf_score float
)
language sql stable security definer set search_path = public as $$
  with kw as (
    select e.id, row_number() over (order by ts_rank_cd(e.fts, plainto_tsquery('spanish', _query_text)) desc) as rk
    from public.email e
    where e.fts @@ plainto_tsquery('spanish', _query_text)
    limit 50
  ),
  vc as (
    select e.id, row_number() over (order by e.embedding <=> _query_vec::halfvec) as rk
    from public.email e
    where e.embedding is not null
    limit 50
  ),
  fused as (
    select coalesce(kw.id, vc.id) as id,
           coalesce(1.0/(_k + kw.rk), 0) + coalesce(1.0/(_k + vc.rk), 0) as score
    from kw full outer join vc on kw.id = vc.id
  )
  select e.id, e.subject, e.summary, e.type, e.folder, e.sender, e.sender_email,
         e.received_at, f.score
  from fused f join public.email e on e.id = f.id
  order by f.score desc
  limit _limit;
$$;

-- ── 2. Caché negativa: respuestas "no clasificable" / "sin valor" ───────────
-- POR QUÉ: hay correos que la IA marca como "spam genérico" o "sin acción".
-- Hoy se vuelven a procesar idénticos. Guardándolos como negativos, no se
-- vuelve a llamar a la IA por el mismo hash. Ahorro real medible.
create table if not exists public.ai_negative_cache (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  cache_key   text not null,
  task        text not null,
  reason      text,                       -- 'spam','no_intent','low_confidence',...
  hit_count   integer not null default 0,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz default (now() + interval '30 days'),
  unique (tenant_id, cache_key)
);
create index if not exists idx_negcache_key on public.ai_negative_cache(tenant_id, cache_key);
create index if not exists idx_negcache_expiry on public.ai_negative_cache(expires_at);

-- ── 3. Respuestas canónicas / FAQ precuradas ────────────────────────────────
-- POR QUÉ: hay preguntas que se repiten (precio orientativo, plazos, zonas).
-- Curadas a mano por el operador → hit instantáneo, 0 tokens, calidad humana.
-- El cliente puede ampliarla desde el panel.
create table if not exists public.ai_canonical_answers (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  question    text not null,
  answer      text not null,
  tags        text[] not null default '{}',
  embedding   halfvec(384),               -- para match semántico de la pregunta
  use_count   integer not null default 0,
  enabled     boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists idx_canonical_hnsw
  on public.ai_canonical_answers using hnsw (embedding halfvec_cosine_ops)
  with (m = 16, ef_construction = 64) where enabled;
create index if not exists idx_canonical_tenant on public.ai_canonical_answers(tenant_id);

create or replace function public.match_canonical_answer(
  _tenant uuid, _query vector(384), _threshold float default 0.85
)
returns table (id uuid, question text, answer text, similarity float)
language sql stable security definer set search_path = public as $$
  select c.id, c.question, c.answer,
         1 - (c.embedding <=> _query::halfvec) as similarity
  from public.ai_canonical_answers c
  where c.tenant_id = _tenant and c.enabled
    and c.embedding is not null
    and 1 - (c.embedding <=> _query::halfvec) >= _threshold
  order by c.embedding <=> _query::halfvec
  limit 1;
$$;

-- ── 4. Prompt templates: clave para el prompt caching de Anthropic/Gemini ───
-- POR QUÉ: Anthropic da -90% si el system prompt es idéntico (cache_control).
-- Si la app construye prompts ad-hoc cada vez, no aprovecha el cache. Guardar
-- system prompts versionados aquí garantiza identidad y permite A/B testing.
create table if not exists public.prompt_templates (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid references public.tenants(id) on delete cascade,
  key         text not null,              -- 'classify_email','extract_quote',...
  version     integer not null default 1,
  system      text not null,              -- prompt de sistema (cacheable)
  notes       text,
  enabled     boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (tenant_id, key, version)
);

-- ── 5. Quality tracking en ai_cache (false-positive monitoring) ─────────────
-- POR QUÉ: la literatura 2026 exige medir false-positive rate del cache para
-- ajustar umbrales. Sin esto, el cache semántico puede degradar la calidad.
alter table public.ai_cache
  add column if not exists feedback_positive integer not null default 0,
  add column if not exists feedback_negative integer not null default 0,
  add column if not exists last_used_at timestamptz default now();

create or replace function public.bump_cache_feedback(
  _id uuid, _positive boolean
) returns void language sql security definer set search_path = public as $$
  update public.ai_cache set
    feedback_positive = feedback_positive + case when _positive then 1 else 0 end,
    feedback_negative = feedback_negative + case when _positive then 0 else 1 end,
    last_used_at = now()
  where id = _id;
$$;

-- TTL por defecto en ai_cache (si nadie pone expires_at).
alter table public.ai_cache
  alter column expires_at set default (now() + interval '90 days');

-- ── 6. Eviction / limpieza de caché expirada ────────────────────────────────
-- POR QUÉ: sin esto crece sin control. Función para invocar desde pg_cron.
create or replace function public.evict_expired_cache()
returns table (cache_deleted bigint, neg_deleted bigint)
language plpgsql security definer set search_path = public as $$
declare a bigint; b bigint;
begin
  delete from public.ai_cache where expires_at < now();
  get diagnostics a = row_count;
  delete from public.ai_negative_cache where expires_at < now();
  get diagnostics b = row_count;
  return query select a, b;
end;
$$;

-- También: cache_key cuyo feedback_negative supera positive en >2 = mal hit;
-- se invalida automáticamente para forzar recomputo.
create or replace function public.invalidate_bad_cache()
returns bigint language plpgsql security definer set search_path = public as $$
declare n bigint;
begin
  delete from public.ai_cache
    where feedback_negative > feedback_positive + 2;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ── 7. Vista de ahorro real para el dashboard ───────────────────────────────
create or replace view public.ai_savings_summary
  with (security_invoker = true) as
  select
    tenant_id,
    count(*)                                 as total_calls,
    count(*) filter (where cache_hit)        as cache_hits,
    coalesce(sum(cost_usd) filter (where not cache_hit), 0) as paid_cost,
    -- Estimación de coste evitado: cada hit valió aproximadamente lo que la
    -- llamada media de las NO cacheadas en esta misma tarea.
    coalesce(
      (count(*) filter (where cache_hit))::numeric *
      nullif(avg(cost_usd) filter (where not cache_hit), 0)
    , 0)                                     as savings_usd,
    case when count(*) > 0
         then round(100.0 * count(*) filter (where cache_hit) / count(*), 1)
         else 0 end                          as hit_rate_pct
  from public.ai_usage_log
  where created_at > now() - interval '30 days'
  group by tenant_id;

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table public.ai_negative_cache   enable row level security;
alter table public.ai_canonical_answers enable row level security;
alter table public.prompt_templates    enable row level security;

grant select,insert,update,delete on public.ai_negative_cache   to authenticated;
grant select,insert,update,delete on public.ai_canonical_answers to authenticated;
grant select,insert,update,delete on public.prompt_templates    to authenticated;
grant all on public.ai_negative_cache, public.ai_canonical_answers,
            public.prompt_templates to service_role;
grant select on public.ai_savings_summary to authenticated;

create policy "tenant_rw_negcache" on public.ai_negative_cache for all to authenticated
  using (tenant_id = public.user_tenant_id())
  with check (tenant_id = public.user_tenant_id());
create policy "tenant_rw_canonical" on public.ai_canonical_answers for all to authenticated
  using (tenant_id = public.user_tenant_id())
  with check (tenant_id = public.user_tenant_id());
create policy "tenant_rw_prompts" on public.prompt_templates for all to authenticated
  using (tenant_id = public.user_tenant_id() or tenant_id is null)
  with check (tenant_id = public.user_tenant_id());

revoke execute on function public.hybrid_search_emails(text,vector,int,int) from anon;
revoke execute on function public.match_canonical_answer(uuid,vector,float) from anon;
revoke execute on function public.evict_expired_cache() from anon, authenticated;
revoke execute on function public.invalidate_bad_cache() from anon, authenticated;
revoke execute on function public.bump_cache_feedback(uuid,boolean) from anon;
grant  execute on function public.bump_cache_feedback(uuid,boolean) to authenticated;

-- ── Seed: prompts canónicos para arrancar ──────────────────────────────────
insert into public.prompt_templates (tenant_id, key, system, notes) values
  (null, 'classify_email_v1',
   'Eres un clasificador de correos para una empresa de vaciado de pisos. Devuelve SOLO JSON con: {"type":"Cliente|Proveedor|Reclamación|Comercial|Urgente","summary":"resumen 1 frase","urgency":"baja|media|alta|critica"}.',
   'System prompt estable: dispara prompt cache de Anthropic (-90%).'),
  (null, 'extract_quote_v1',
   'Eres un extractor de datos de presupuestos para vaciado de pisos. Devuelve JSON con: tipo_servicio, metros_cuadrados, precio_estimado, ubicacion, urgencia. Si un campo falta, omítelo.',
   'System prompt estable para extracción.')
on conflict do nothing;
