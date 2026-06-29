// @fusion/ai-router — Router de IA agnóstico de proveedor.
//
// Cascada: regla DB (0 tok) → caché exacta (0 tok) → caché semántica (0 tok)
//        → proveedor gratis con fallback automático.
// Protección RGPD: el texto con PII se enmascara antes de salir a cualquier IA.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { computeCost, MODELS } from "./config.js";
import {
  cacheKey,
  exactLookup,
  type EmbedFn,
  semanticLookup,
  supabaseEmbed,
  writeCache,
  writeSemanticAnswer,
} from "./cache.js";
import { logUsage } from "./observability.js";
import { redact, restore } from "./pii.js";
import { matchRule } from "./router.js";
import type {
  ChatMessage,
  ModelSpec,
  ModelTier,
  Provider,
  RouteRequest,
  RouteResult,
} from "./types.js";
import { buildProviders, readyProviderNames } from "./providers/index.js";

export * from "./types.js";
export { parseQuoteData } from "./router.js";
export { redact, restore } from "./pii.js";

export interface RouterOptions {
  /** Cliente Supabase ya inicializado. Si no, se crea con variables de entorno. */
  supabase?: SupabaseClient;
  env?: NodeJS.ProcessEnv;
  /** Generador de embeddings. Por defecto usa la Edge Function "embed". */
  embed?: EmbedFn;
}

export interface Router {
  route<T = string>(req: RouteRequest): Promise<RouteResult<T>>;
}

export function createRouter(opts: RouterOptions = {}): Router {
  // ⚠️ SEGURIDAD: este módulo NO debe importarse desde el navegador. Si se
  // ejecuta en browser, alguien podría haber bundleado SUPABASE_SERVICE_ROLE_KEY
  // a la salida pública. Detectamos y avisamos. Si el caller quiere usar este
  // router desde código que también corre en cliente, debe pasar su propio
  // cliente Supabase con clave anon vía `opts.supabase`.
  const env = opts.env ?? process.env;
  const isBrowser = typeof window !== "undefined";
  let sb = opts.supabase;
  if (!sb) {
    if (isBrowser) {
      throw new Error(
        "[ai-router] No pasar createRouter() sin opts.supabase en código de navegador. Inyecta un SupabaseClient con clave anon.",
      );
    }
    // Servidor: preferimos service_role; si no, anon como fallback de dev.
    sb = createClient(
      env.SUPABASE_URL ?? "",
      env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_ANON_KEY ?? "",
    );
  }
  const providers = buildProviders(env);
  const ready = readyProviderNames(providers);
  const embed = opts.embed ?? supabaseEmbed(sb);

  return { route: (req) => route(sb, providers, ready, embed, req) };
}

/** Modelos de un nivel disponibles, ordenados (PII → primero los que no entrenan). */
function candidateModels(tier: ModelTier, pii: boolean, ready: Set<string>): ModelSpec[] {
  const list = MODELS.filter((m) => m.tier === tier && ready.has(m.provider));
  return pii ? [...list].sort((a, b) => Number(a.trainsOnData) - Number(b.trainsOnData)) : list;
}

function safeJsonParse<T>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    // Rescata el primer bloque {...} o [...] si el modelo añadió texto extra.
    const m = text.match(/[[{][\s\S]*[\]}]/);
    if (m) return JSON.parse(m[0]) as T;
    throw new Error("La respuesta del modelo no es JSON válido");
  }
}

async function route<T>(
  sb: SupabaseClient,
  providers: Map<string, Provider>,
  ready: Set<string>,
  embed: EmbedFn,
  req: RouteRequest,
): Promise<RouteResult<T>> {
  const t0 = Date.now();
  const sensitivity = req.sensitivity ?? "anonymous";
  const wantsJson = req.task === "classify" || req.task === "extract";
  // Por defecto, NIVEL 1 (gratis) para TODO — máximo ahorro. El llamador puede
  // pedir tier 2 (frontier) solo para casos complejos (informe CEO, simulaciones).
  const tier: ModelTier = req.tier ?? 1;

  // ── Nivel 0a: reglas deterministas de la DB (clasificación/urgencia/spam) ──
  if (req.ruleKind) {
    const ruleResult = await matchRule(sb, req.tenantId, req.ruleKind, req.input);
    if (ruleResult) {
      await logUsage(sb, base(req, 0, false, true, t0));
      return done(ruleResult as T, "rule", 0, t0);
    }
  }

  // ── Nivel 0b: caché EXACTA ──────────────────────────────────────────────
  // Clave SIN model: dos llamadas con el mismo input + task comparten respuesta
  // aunque el router haya elegido modelos distintos (el "qué" es lo mismo, da
  // igual quién lo produjo). Esto evita perder hits válidos y reduce coste.
  const key = cacheKey(req.task, undefined, req.input);
  if (!req.noCache) {
    const cached = await exactLookup<T>(sb, req.tenantId, key);
    if (cached !== null) {
      await logUsage(sb, base(req, 0, true, true, t0));
      return done(cached, "cache", 0, t0);
    }
  }

  // ── Nivel 0c: caché SEMÁNTICA (reutiliza respuestas casi idénticas) ───────
  if (!req.noCache && (req.task === "generate" || req.task === "summarize")) {
    try {
      const hit = await semanticLookup(
        sb,
        req.tenantId,
        embed,
        req.input,
        "answer",
        req.semanticThreshold ?? 0.92,
      );
      if (hit) {
        await logUsage(sb, base(req, 0, true, true, t0));
        return done(hit.content as T, "embedding", 0, t0);
      }
    } catch {
      // Si la Edge Function de embeddings no está, se continúa sin caché semántica.
    }
  }

  // ── Niveles 1/2: llamar a un proveedor, con fallback automático ──────────
  const candidates = candidateModels(tier, sensitivity === "pii", ready);
  if (candidates.length === 0) {
    // Sin proveedores configurados (faltan API keys). Degradamos: la app sigue,
    // el caller ve degradedError y decide.
    await logUsage(sb, { ...base(req, tier, false, false, t0), success: false });
    return {
      data: null as T,
      source: "llm",
      tier,
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
      latencyMs: Date.now() - t0,
      cacheHit: false,
      degradedError: "No hay ningún proveedor de IA configurado",
    };
  }

  // RGPD: enmascarar PII antes de que el texto salga del servidor.
  const red = sensitivity === "pii" ? redact(req.input) : null;
  const userContent = red ? red.masked : req.input;
  const messages: ChatMessage[] = [
    ...(req.system ? [{ role: "system" as const, content: req.system }] : []),
    { role: "user", content: userContent },
  ];

  let lastErr: unknown;
  for (const spec of candidates) {
    const provider = providers.get(spec.provider);
    if (!provider) continue;
    try {
      const gen = await provider.generate(messages, {
        model: spec.id,
        temperature: req.temperature,
        json: wantsJson,
      });
      const text = red ? restore(gen.text, red.map) : gen.text;
      const data = (wantsJson ? safeJsonParse<T>(text) : (text as T));
      const cost = computeCost(spec, gen.tokensIn, gen.tokensOut);

      if (!req.noCache) {
        await writeCache(sb, req.tenantId, key, req.task, spec.id, data);
        // Caché semántica: indexa entrada→respuesta para reutilizar peticiones
        // casi idénticas en el futuro (solo generación de texto libre).
        if (req.task === "generate" || req.task === "summarize") {
          void writeSemanticAnswer(sb, req.tenantId, embed, req.input, String(data));
        }
      }
      await logUsage(sb, {
        tenantId: req.tenantId,
        task: req.task,
        tier,
        provider: spec.provider,
        model: spec.id,
        tokensIn: gen.tokensIn,
        tokensOut: gen.tokensOut,
        costUsd: cost,
        latencyMs: Date.now() - t0,
        cacheHit: false,
        success: true,
      });

      return {
        data,
        source: "llm",
        provider: spec.provider,
        model: spec.id,
        tier,
        tokensIn: gen.tokensIn,
        tokensOut: gen.tokensOut,
        costUsd: cost,
        latencyMs: Date.now() - t0,
        cacheHit: false,
      };
    } catch (err) {
      lastErr = err; // probar el siguiente proveedor
    }
  }

  // Degradación: si todos los proveedores fallan, NO lanzamos (evita tirar la
  // app entera). Devolvemos data=null y degradedError para que el caller decida.
  await logUsage(sb, { ...base(req, tier, false, false, t0), success: false });
  return {
    data: null as T,
    source: "llm",
    tier,
    tokensIn: 0,
    tokensOut: 0,
    costUsd: 0,
    latencyMs: Date.now() - t0,
    cacheHit: false,
    degradedError: String(lastErr ?? "no provider configured"),
  };
}

// Helpers de construcción de registros/resultados a coste 0.
function base(req: RouteRequest, tier: ModelTier, cacheHit: boolean, success: boolean, t0: number) {
  return {
    tenantId: req.tenantId,
    task: req.task,
    tier,
    tokensIn: 0,
    tokensOut: 0,
    costUsd: 0,
    latencyMs: Date.now() - t0,
    cacheHit,
    success,
  };
}

function done<T>(data: T, source: "rule" | "cache" | "embedding", tier: ModelTier, t0: number): RouteResult<T> {
  return {
    data,
    source,
    tier,
    tokensIn: 0,
    tokensOut: 0,
    costUsd: 0,
    latencyMs: Date.now() - t0,
    cacheHit: source !== "rule",
  };
}
