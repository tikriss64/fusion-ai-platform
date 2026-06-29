// Registro de uso de IA (control de coste). Escribe en ai_usage_log.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ModelTier } from "./types.js";

export interface UsageRecord {
  tenantId: string;
  task: string;
  tier: ModelTier;
  provider?: string;
  model?: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  latencyMs: number;
  cacheHit: boolean;
  success: boolean;
}

/** Registra una llamada (o un ahorro de caché). Fire-and-forget tolerante a fallos. */
export async function logUsage(sb: SupabaseClient, r: UsageRecord): Promise<void> {
  try {
    await sb.from("ai_usage_log").insert({
      tenant_id: r.tenantId,
      task: r.task,
      level: r.tier,
      provider: r.provider,
      model: r.model,
      tokens_in: r.tokensIn,
      tokens_out: r.tokensOut,
      cost_usd: r.costUsd,
      latency_ms: r.latencyMs,
      cache_hit: r.cacheHit,
      success: r.success,
    });
  } catch {
    // La observabilidad nunca debe romper el flujo principal.
  }
}
