# Migración Inbox: Cloudflare D1 + Vectorize → Supabase ✅

Hecha en código con el enfoque de **mínimo riesgo**: el SQL existente corre
verbatim sobre Postgres a través de un shim; solo se reescribió la memoria
semántica a pgvector. Los nombres de tabla/columna se conservan idénticos a D1.

## Cómo funciona ahora

| Antes (Cloudflare) | Ahora (Supabase) |
|---|---|
| `env.DB` (D1, binding) | **`d1-compat.server.ts`** — shim que traduce `?`→`$n` y ejecuta sobre Postgres (`postgres` lib). Mismo interfaz `prepare().bind().all/first/run` |
| `env.MEMORY` (Vectorize 768d) | **`memory.server.ts`** reescrito: embeddings **gte-small 384d** (Edge Function `embed`) + búsqueda con `pgvector` por SQL |
| Tablas `email`, `mail_account`, `app_config` (D1) | Mismas tablas en Postgres (`0007_inbox.sql`), con `tenant_id` (default vía GUC) y `embedding vector(384)` |
| Embeddings Gemini (cuota aparte) | Embeddings **gratis y privados** dentro de Supabase |

## Inyección de dependencias

`server.ts` → `prepareEnv(env)` construye `env.DB` desde **`SUPABASE_DB_URL`** y
propaga `SUPABASE_URL` / claves desde el entorno. Idempotente: si hubiera un
binding D1 real (Workers), no lo pisa. Funciona en Node/Bun y en Workers.

## Variables de entorno necesarias

```
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_DB_URL=postgresql://...    # conexión directa (Project Settings > Database)
FUSION_TENANT_ID=<uuid del tenant>  # opcional (single-tenant funciona sin él)
```

## Para arrancar

1. Aplicar migraciones de `packages/supabase` (incluye `0007_inbox`).
2. Desplegar la Edge Function: `supabase functions deploy embed`.
3. `bun install` (instala `postgres` y los paquetes `@fusion/*`).
4. Definir las variables de entorno de arriba.
5. `wrangler.jsonc` y `migrations/` (D1) quedan obsoletos — se pueden borrar.

## Tipos de fecha

`received_at`, `analyzed_at`, `embedded_at` siguen siendo **epoch ms** (`bigint`),
igual que en D1 — la lógica de fechas de la app no cambia.
