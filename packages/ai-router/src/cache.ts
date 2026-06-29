// Capa de caché: exacta (hash) y semántica (embeddings). Evita gastar tokens.
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Clave de caché determinista. DEBE coincidir byte a byte con la función SQL
 * `ai_cache_key` (0002_ai_layer.sql): normaliza espacios y pasa a minúsculas.
 */
export function cacheKey(task: string, model: string | undefined, input: string): string {
  const normalized = input.replace(/\s+/g, " ").toLowerCase();
  return createHash("sha256")
    .update(`${task}|${model ?? ""}|${normalized}`)
    .digest("hex");
}

/** Busca una respuesta exacta ya cacheada. Devuelve null si no hay. */
export async function exactLookup<T>(
  sb: SupabaseClient,
  tenantId: string,
  key: string,
): Promise<T | null> {
  const { data } = await sb
    .from("ai_cache")
    .select("id, response")
    .eq("tenant_id", tenantId)
    .eq("cache_key", key)
    .maybeSingle();

  if (!data) return null;
  const row = data as { id: string; response: T };
  // Incremento atómico del contador de aciertos (ahorro acumulado). Fire-and-forget.
  void sb.rpc("bump_cache_hit", { _id: row.id });
  return row.response;
}

/** Guarda una respuesta para reutilizarla en el futuro (0 tokens la próxima vez). */
export async function writeCache(
  sb: SupabaseClient,
  tenantId: string,
  key: string,
  task: string,
  model: string | undefined,
  response: unknown,
  ttlSeconds?: number,
): Promise<void> {
  const expires_at = ttlSeconds ? new Date(Date.now() + ttlSeconds * 1000).toISOString() : null;
  await sb.from("ai_cache").upsert(
    { tenant_id: tenantId, cache_key: key, task, model, response, expires_at },
    { onConflict: "tenant_id,cache_key" },
  );
}

/** Función que genera el embedding de un texto (gte-small en Edge Function). */
export type EmbedFn = (text: string) => Promise<number[]>;

/**
 * Embedding vía Edge Function de Supabase (gte-small, 384d, gratis y privado).
 * Espera una función desplegada llamada "embed" que devuelva { embedding }.
 */
export function supabaseEmbed(sb: SupabaseClient): EmbedFn {
  return async (text: string) => {
    const { data, error } = await sb.functions.invoke("embed", { body: { input: text } });
    if (error) throw error;
    return (data as { embedding: number[] }).embedding;
  };
}

/**
 * Guarda el embedding de la entrada + la respuesta generada, para que una futura
 * petición casi idéntica se resuelva por similitud (0 tokens). Best-effort: si la
 * Edge Function de embeddings no está disponible, no rompe el flujo.
 */
export async function writeSemanticAnswer(
  sb: SupabaseClient,
  tenantId: string,
  embed: EmbedFn,
  input: string,
  answer: string,
): Promise<void> {
  try {
    const vector = await embed(input);
    await sb.rpc("store_answer_embedding", {
      _tenant: tenantId,
      _content: answer,
      _embedding: vector,
    });
  } catch {
    // best-effort
  }
}

export interface SemanticHit {
  source_id: string | null;
  content: string;
  metadata: Record<string, unknown>;
  similarity: number;
}

/**
 * Busca una respuesta previa MUY parecida por similitud semántica.
 * Si la similitud supera el umbral, se reutiliza en vez de llamar a la IA.
 */
export async function semanticLookup(
  sb: SupabaseClient,
  tenantId: string,
  embed: EmbedFn,
  text: string,
  sourceType = "answer",
  threshold = 0.9,
): Promise<SemanticHit | null> {
  const query = await embed(text);
  const { data } = await sb.rpc("match_embeddings", {
    _tenant: tenantId,
    _query: query,
    _source: sourceType,
    _threshold: threshold,
    _limit: 1,
  });
  const hit = (data as SemanticHit[] | null)?.[0];
  return hit ?? null;
}
