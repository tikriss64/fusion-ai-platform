-- ============================================================================
-- 0002_ai_layer.sql — Capa que EVITA gastar tokens
-- Caché exacta + caché semántica (embeddings) + observabilidad de coste.
-- Regla de oro de la app: antes de llamar a una IA, consultar SIEMPRE estas
-- tablas. Si hay acierto, coste = 0 tokens.
-- ============================================================================

-- ── 1. Caché EXACTA de respuestas IA ────────────────────────────────────────
-- Clave = hash(tarea + modelo + entrada normalizada). Si llega la misma
-- petición otra vez, se devuelve la respuesta guardada sin tocar la IA.
create table public.ai_cache (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  cache_key   text not null,              -- hash determinista de la petición
  task        text not null,              -- 'classify_email','extract_invoice'...
  model       text,                       -- modelo que generó la respuesta
  response    jsonb not null,             -- resultado reutilizable
  hit_count   integer not null default 0, -- cuántas veces se reutilizó (ahorro)
  created_at  timestamptz not null default now(),
  expires_at  timestamptz,                -- null = no caduca
  unique (tenant_id, cache_key)
);

create index idx_ai_cache_key on public.ai_cache(tenant_id, cache_key);
create index idx_ai_cache_expiry on public.ai_cache(expires_at) where expires_at is not null;

-- Helper: construye la clave de caché de forma determinista.
create or replace function public.ai_cache_key(_task text, _model text, _input text)
returns text language sql immutable as $$
  select encode(digest(_task || '|' || coalesce(_model,'') || '|' ||
                        lower(regexp_replace(_input, '\s+', ' ', 'g')), 'sha256'), 'hex');
$$;

-- ── 2. Caché SEMÁNTICA (embeddings con gte-small = 384 dims) ─────────────────
-- Permite "ya respondí algo MUY parecido a esto": en vez de llamar a la IA,
-- se recupera por similitud. También es el RAG del Inbox (correos/documentos).
create table public.ai_embeddings (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  source_type text not null,              -- 'email','document','quote','faq','answer'
  source_id   uuid,                       -- id del registro original (si aplica)
  content     text not null,              -- texto indexado
  -- halfvec(384): media precisión = la MITAD de almacenamiento (2 bytes/dim) y
  -- búsqueda más rápida, sin pérdida apreciable de calidad. Clave en plan gratis.
  embedding   halfvec(384),               -- gte-small, generado GRATIS en Edge Function
  metadata    jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

-- HNSW = índice recomendado 2026 (<10ms hasta ~5M vectores). m/ef_construction
-- explícitos para mejor recall; subir ef_construction si se prioriza precisión.
create index idx_ai_embeddings_hnsw
  on public.ai_embeddings using hnsw (embedding halfvec_cosine_ops)
  with (m = 16, ef_construction = 64);
create index idx_ai_embeddings_source on public.ai_embeddings(tenant_id, source_type);

-- Búsqueda por similitud. Devuelve coincidencias por encima de un umbral.
-- Si encuentra algo casi idéntico, la app reutiliza en vez de llamar a la IA.
create or replace function public.match_embeddings(
  _tenant uuid,
  _query  vector(384),
  _source text default null,
  _threshold float default 0.82,
  _limit  int default 5
)
returns table (id uuid, source_type text, source_id uuid, content text,
               metadata jsonb, similarity float)
language sql stable security definer set search_path = public as $$
  -- _query llega como vector(384) (los clientes pasan un array); se castea a
  -- halfvec para operar contra la columna halfvec.
  select e.id, e.source_type, e.source_id, e.content, e.metadata,
         1 - (e.embedding <=> _query::halfvec) as similarity
  from public.ai_embeddings e
  where e.tenant_id = _tenant
    and (_source is null or e.source_type = _source)
    and 1 - (e.embedding <=> _query::halfvec) >= _threshold
  order by e.embedding <=> _query::halfvec
  limit _limit;
$$;

-- ── 3. Observabilidad de IA (control de coste) ──────────────────────────────
-- Cada llamada (o acierto de caché) se registra: modelo, tokens, coste, nivel.
-- Es el panel de "cuánto estoy gastando y dónde puedo ahorrar".
create table public.ai_usage_log (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  task        text not null,
  level       smallint not null default 1,   -- 0=router(0tok) 1=barato 2=frontier
  provider    text,                           -- 'groq','openrouter','gemini','local'
  model       text,
  tokens_in   integer not null default 0,
  tokens_out  integer not null default 0,
  cost_usd    numeric(10,6) not null default 0,
  latency_ms  integer,
  cache_hit   boolean not null default false, -- true = ahorrado, 0 tokens
  success     boolean not null default true,
  created_at  timestamptz not null default now()
);

create index idx_ai_usage_tenant_date on public.ai_usage_log(tenant_id, created_at desc);
create index idx_ai_usage_task on public.ai_usage_log(tenant_id, task);

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.ai_cache      enable row level security;
alter table public.ai_embeddings enable row level security;
alter table public.ai_usage_log  enable row level security;

grant select, insert, update, delete on public.ai_cache      to authenticated;
grant select, insert, update, delete on public.ai_embeddings to authenticated;
grant select, insert                 on public.ai_usage_log  to authenticated;
grant all on public.ai_cache, public.ai_embeddings, public.ai_usage_log to service_role;

create policy "tenant rw ai_cache" on public.ai_cache
  for all to authenticated
  using (tenant_id = public.user_tenant_id())
  with check (tenant_id = public.user_tenant_id());

create policy "tenant rw ai_embeddings" on public.ai_embeddings
  for all to authenticated
  using (tenant_id = public.user_tenant_id())
  with check (tenant_id = public.user_tenant_id());

create policy "tenant read ai_usage" on public.ai_usage_log
  for select to authenticated using (tenant_id = public.user_tenant_id());
create policy "tenant insert ai_usage" on public.ai_usage_log
  for insert to authenticated with check (tenant_id = public.user_tenant_id());

-- Incremento ATÓMICO del contador de aciertos (evita carreras lectura+escritura).
create or replace function public.bump_cache_hit(_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.ai_cache set hit_count = hit_count + 1 where id = _id;
$$;

-- Guarda el embedding de una entrada + su respuesta para la caché semántica.
-- Recibe el vector como vector(384) (array desde el cliente) y lo castea a halfvec.
create or replace function public.store_answer_embedding(
  _tenant uuid, _content text, _embedding vector(384)
)
returns void language sql security definer set search_path = public as $$
  insert into public.ai_embeddings (tenant_id, source_type, content, embedding)
  values (_tenant, 'answer', _content, _embedding::halfvec);
$$;

revoke execute on function public.ai_cache_key(text,text,text) from anon;
revoke execute on function public.match_embeddings(uuid,vector,text,float,int) from anon;
