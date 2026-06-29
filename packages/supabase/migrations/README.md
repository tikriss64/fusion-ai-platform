# Migraciones — Base de datos unificada FUSION

Diseñada con una idea central: **que la base de datos evite llamar a la IA**.
Caché, reglas deterministas y automatización viven en Postgres; los modelos solo
se invocan cuando ninguna regla ni caché resuelve la petición.

## Orden de ejecución

| # | Archivo | Qué crea |
|---|---------|----------|
| 0001 | `0001_foundation.sql` | Extensiones (pgvector), **tenants + RLS multi-tenant**, helpers |
| 0002 | `0002_ai_layer.sql` | **Caché exacta** + **caché semántica (384d)** + observabilidad de coste |
| 0003 | `0003_rules_engine.sql` | **Reglas deterministas**: clasificación, urgencia, precios sin IA |
| 0004 | `0004_automation_ops.sql` | Motor evento→acción, timeline, alertas, **KPIs por pg_cron** |
| 0005 | `0005_seed.sql` | Reglas y precios iniciales — funciona sin IA desde el minuto 1 |
| 0006 | `0006_crm_core.sql` | **Dominio CRM** (clients, quotes, invoices, trabajos, leads…) con `tenant_id` y RLS por tenant |
| 0007 | `0007_inbox.sql` | **Dominio Inbox** migrado de D1→Postgres; `halfvec(384)` reemplaza Vectorize |
| 0008 | `0008_agenda.sql` | **Módulo operaciones** (citas, recursos, profesionales) reconciliado con las tablas canónicas |
| 0009 | `0009_realtime.sql` | **Realtime** (push instantáneo en Mission Control) |
| 0010 | `0010_runtime_compat.sql` | **Compatibilidad runtime** (helpers RLS, columna user_id legacy, trigger autoseed de tenant) |
| 0011 | `0011_advanced_anti_tokens.sql` | **MÁXIMO ahorro tokens 2026**: hybrid search BM25+vector+RRF, caché negativa, FAQ canónicas, prompt templates (Anthropic cache_control −90%), quality tracking, eviction y vista de ahorro |

> Las tablas del CRM, Inbox y Agenda se han **unificado aquí** como fuente de
> verdad, todas con `tenant_id` y RLS `tenant_id = user_tenant_id()`. El Tablón
> ya era multi-tenant: sus `tenants`/`clients`/`invoices` se descartan en favor
> de las canónicas (0001/0006) y solo se conserva su módulo operativo (0008).

## Cómo la DB ahorra tokens (resumen)

```
Petición → ai_cache (hash exacto)        ¿acierto? → 0 tokens
        → match_router_rule (regex)      ¿acierto? → 0 tokens
        → match_embeddings (similitud)   ¿>0.82?   → 0 tokens (reutiliza)
        → calc_quote_price (fórmula)     presupuesto → 0 tokens
        → [solo si todo falla] llamar a la IA (Groq/OpenRouter/Gemini)
                                         y guardar el resultado en ai_cache
```

Cada llamada (o ahorro) se registra en `ai_usage_log`; `metrics_daily` agrega el
gasto y los aciertos de caché para el dashboard. Las acciones repetitivas
(crear cliente desde lead, recordatorios a 72h, recálculo de KPIs) las ejecuta
`automations` + `pg_cron`, sin servidor y sin IA.

## Aplicar las migraciones

```bash
# Con Supabase CLI (recomendado)
supabase db push

# O pegando cada archivo, en orden, en el SQL Editor de Supabase.
# Tras 0005, activar pg_cron y pg_net en Database > Extensions y programar
# los jobs indicados al final de 0004.
```

## Nota sobre embeddings

`gte-small` (384 dimensiones) corre **dentro** de Supabase Edge Functions:
embeddings **gratis y privados**, el dato del cliente nunca sale del servidor.
La columna `vector(384)` y el índice HNSW están fijados a esa dimensión.
