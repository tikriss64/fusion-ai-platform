// Registro de modelos y selección de proveedor.
// Precios verificados a jun-2026 (USD por millón de tokens). Ajustables.

import type { ModelSpec, ModelTier, Sensitivity } from "./types.js";

/** ¿Tiene Gemini la facturación activada? Si sí, deja de entrenar con los datos. */
const GEMINI_BILLED = process.env.GEMINI_BILLING_ENABLED === "true";

/**
 * Registro de modelos, ordenado por preferencia dentro de cada nivel.
 * El router elige el primero disponible (con API key) que cumpla las
 * restricciones de la petición (nivel y seguridad de datos).
 */
export const MODELS: ModelSpec[] = [
  // ── Nivel 1: barato/gratis, datos anónimos o PII enmascarada ──────────────
  // Groq es inferencia pura (no entrena) y tiene tier gratis 14.400 req/día.
  {
    id: "llama-3.1-8b-instant",
    provider: "groq",
    tier: 1,
    costInPerM: 0.05,
    costOutPerM: 0.08,
    trainsOnData: false,
  },
  // Overflow gratis vía OpenRouter. Se usa su AUTO-ROUTER de modelos gratis
  // (`openrouter/free`): elige solo un modelo gratuito disponible (DeepSeek,
  // Qwen, etc.), así no se rompe cuando un id concreto se deprecia. Límite libre
  // ~20 req/min y ~200 req/día (Groq cubre el grueso con 14.400/día). Pueden
  // registrar datos → NO aptos para PII salvo ya enmascarada.
  {
    id: "openrouter/free",
    provider: "openrouter",
    tier: 1,
    costInPerM: 0,
    costOutPerM: 0,
    trainsOnData: true,
  },

  // ── Nivel 2: razonamiento complejo (informes, casos ambiguos) ─────────────
  // PREMIUM opt-in: Claude (Anthropic API). Solo se usa si hay ANTHROPIC_API_KEY
  // y se pide tier 2. NO entrena con los datos → ideal también para PII. Se listan
  // primero para que, cuando estén disponibles, sean la opción premium preferida.
  // Precios aproximados (USD/millón), ajustables a la tarifa vigente.
  {
    id: "claude-sonnet-4-6",
    provider: "claude",
    tier: 2,
    costInPerM: 3,
    costOutPerM: 15,
    trainsOnData: false,
  },
  {
    id: "claude-haiku-4-5-20251001",
    provider: "claude",
    tier: 2,
    costInPerM: 1,
    costOutPerM: 5,
    trainsOnData: false,
  },
  {
    id: "llama-3.3-70b-versatile",
    provider: "groq",
    tier: 2,
    costInPerM: 0.59,
    costOutPerM: 0.79,
    trainsOnData: false,
  },
  {
    id: "gemini-3.5-flash",
    provider: "gemini",
    tier: 2,
    costInPerM: 0.3,
    costOutPerM: 2.5,
    // En tier gratis Gemini entrena con los datos; con facturación, no.
    trainsOnData: !GEMINI_BILLED,
  },
];

/**
 * Elige el mejor modelo disponible para una petición.
 * @param tier       nivel deseado (1 o 2)
 * @param sensitivity si es "pii" se prefiere un modelo que NO entrene
 * @param available  proveedores con API key configurada
 */
export function pickModel(
  tier: ModelTier,
  sensitivity: Sensitivity,
  available: Set<string>,
): ModelSpec | null {
  const candidates = MODELS.filter(
    (m) => m.tier === tier && available.has(m.provider),
  );
  // Para PII, primero los que no entrenan; si no hay, el resto (irá enmascarado).
  const ordered =
    sensitivity === "pii"
      ? [...candidates].sort(
          (a, b) => Number(a.trainsOnData) - Number(b.trainsOnData),
        )
      : candidates;
  return ordered[0] ?? null;
}

export function findModel(id: string): ModelSpec | undefined {
  return MODELS.find((m) => m.id === id);
}

/** Coste en USD de una llamada según el modelo y los tokens consumidos. */
export function computeCost(spec: ModelSpec, tokensIn: number, tokensOut: number): number {
  return (tokensIn / 1_000_000) * spec.costInPerM + (tokensOut / 1_000_000) * spec.costOutPerM;
}
