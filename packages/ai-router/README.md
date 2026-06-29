# @fusion/ai-router — Router de IA agnóstico + protección de datos

El cerebro de coste/privacidad. **No se ata a ningún proveedor.** Resuelve cada
petición por la cascada más barata posible y solo llama a un LLM como último
recurso, con fallback automático entre proveedores gratis.

## Cascada (de 0 tokens hacia arriba)

```
route(req)
 ├─ Nivel 0a  matchRule (reglas DB)        → 0 tokens
 ├─ Nivel 0b  exactLookup (caché hash)     → 0 tokens
 ├─ Nivel 0c  semanticLookup (embeddings)  → 0 tokens (reutiliza)
 └─ Nivel 1/2 proveedor gratis + fallback  → tokens (mínimos), y se cachea
```

Antes de salir a cualquier IA, si el dato es PII se **enmascara** localmente
(`redact`) y se restaura al volver (`restore`). RGPD por diseño.

## Uso

```ts
import { createRouter } from "@fusion/ai-router";

const router = createRouter(); // lee SUPABASE_*, GROQ_API_KEY, etc. del entorno

// Clasificar un correo — lo resuelven las reglas DB sin gastar tokens
const r1 = await router.route({
  tenantId,
  task: "classify",
  ruleKind: "urgency",
  input: correo.texto,
});
// r1.source === "rule", r1.costUsd === 0

// Extraer datos de presupuesto con PII protegida
const r2 = await router.route({
  tenantId,
  task: "extract",
  input: "Presupuesto para Juan Pérez, 666112233, vaciado 60m2 en Gràcia sin ascensor",
  sensitivity: "pii", // se enmascara antes de enviar
});

// Generar un texto (usa caché semántica si ya respondió algo parecido)
const r3 = await router.route({ tenantId, task: "generate", input: prompt });
console.log(r3.source, r3.provider, r3.costUsd); // "llm" | "cache" | "embedding"
```

### Extracción 100% local (0 tokens, sin red)

```ts
import { parseQuoteData } from "@fusion/ai-router";
const datos = parseQuoteData("vaciado 60m2 en Gràcia por 450 euros sin ascensor");
// { tipo_servicio: "vaciado", metros_cuadrados: 60, precio: 450,
//   poblacion: "Gràcia", flags: ["sin_ascensor"] }
```

## Estructura

| Archivo | Rol |
|---------|-----|
| `index.ts` | Orquestador de la cascada (`createRouter`, `route`) |
| `router.ts` | Nivel 0: reglas DB + parsers locales (`parseQuoteData`) |
| `cache.ts` | Caché exacta (hash) y semántica (embeddings 384d) |
| `pii.ts` | Redacción/restauración RGPD (email, tel, DNI, IBAN, nombres) |
| `config.ts` | Registro de modelos, precios y selección por nivel/sensibilidad |
| `providers/` | Groq, OpenRouter (OpenAI-compat) y Gemini (REST) |
| `observability.ts` | Registro de coste en `ai_usage_log` |

## Opción premium: Claude (opt-in)

Si defines `ANTHROPIC_API_KEY`, el router usa **Claude** (Anthropic API) para el
**nivel 2** (tareas complejas/sensibles). Es la opción de máxima calidad y **no
entrena con tus datos** (apto para PII). Es **opt-in y por petición**:

```ts
// Tarea compleja → usa Claude si hay clave; si no, cae a Groq 70B / Gemini
await router.route({ tenantId, task: "summarize", input: textoLargo, tier: 2 });
```

Sin la clave, el nivel 2 usa modelos gratis y **todo sigue a coste cero**. El
grueso del tráfico (nivel 0 y 1) nunca toca Claude. Pago por tokens, reservado
al ~2-5% de tareas que lo justifican.

## Añadir un proveedor

Una línea en `providers/index.ts` + una entrada en `MODELS` (config.ts). El
router lo incorpora a la cascada y al fallback automáticamente.

## Depende de

- Tablas/funciones de `@fusion/supabase`: `ai_cache`, `ai_embeddings`,
  `ai_usage_log`, `match_router_rule`, `match_embeddings`.
- Edge Function `embed` (gte-small) desplegada para la caché semántica.
