// "Cerebro de memoria" (Company Brain) — memoria semántica del asistente.
//
// MIGRADO a Supabase (antes Cloudflare Vectorize + Gemini embeddings):
//  - Embeddings con gte-small (384d) vía la Edge Function "embed" de Supabase:
//    GRATIS y privado, el dato no sale del servidor.
//  - Almacenamiento y búsqueda con pgvector (columna email.embedding), por SQL
//    directo a través del shim D1-compatible (env.DB).
//
// Mantiene las MISMAS firmas exportadas que la versión D1, así que el resto de
// la app (server.ts) no cambia. Degrada con elegancia: si faltan credenciales o
// falla la red, devuelve vacío y la app sigue funcionando.
import type { D1Like } from "./d1-compat.server";

const EMBED_DIMS = 384;

export interface MemoryEnv {
  DB?: D1Like;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_ANON_KEY?: string;
  [key: string]: unknown;
}

export interface MemorableEmail {
  id: string;
  sender: string;
  sender_email: string;
  subject: string;
  snippet: string;
  summary?: string | null;
  type?: string | null;
  received_at: number;
  folder?: string | null;
}

export interface MemoryHit {
  id: string;
  score: number;
  sender: string;
  sender_email: string;
  subject: string;
  summary: string;
  type: string;
  folder: string;
  received_at: number;
}

function hasBindings(
  env: MemoryEnv,
): env is MemoryEnv & { DB: D1Like; SUPABASE_URL: string } {
  return !!env.DB && !!env.SUPABASE_URL;
}

function authKey(env: MemoryEnv): string {
  return env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_ANON_KEY ?? "";
}

// Texto compacto y limpio que representa el correo para el embedding.
function emailToText(e: MemorableEmail): string {
  const dir = e.folder === "sent" ? "Enviado a" : "Recibido de";
  const body = (e.summary || e.snippet || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 400);
  return `${dir}: ${e.sender} <${e.sender_email}> | Asunto: ${e.subject} | ${body}`;
}

// Formato literal de pgvector: '[0.1,0.2,...]'
function toVectorLiteral(v: number[]): string {
  return `[${v.join(",")}]`;
}

// Genera embeddings (384d) vía la Edge Function "embed". Uno por texto, en orden.
export async function embed(env: MemoryEnv, texts: string[]): Promise<(number[] | null)[]> {
  if (!hasBindings(env) || texts.length === 0) return [];
  const url = `${env.SUPABASE_URL}/functions/v1/embed`;
  const key = authKey(env);
  const results: (number[] | null)[] = [];
  for (const t of texts) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ input: t.slice(0, 2000) }),
      });
      if (!res.ok) {
        console.error(`[memory.embed] HTTP ${res.status}`);
        results.push(null);
        continue;
      }
      const data = (await res.json()) as { embedding?: number[] };
      const v = data.embedding;
      results.push(Array.isArray(v) && v.length === EMBED_DIMS ? v : null);
    } catch (e) {
      console.error(`[memory.embed] ${e}`);
      results.push(null);
    }
  }
  return results;
}

// Indexa los correos dados (guarda su embedding). Devuelve los IDs indexados.
export async function rememberEmails(env: MemoryEnv, emails: MemorableEmail[]): Promise<string[]> {
  if (!hasBindings(env) || emails.length === 0) return [];
  const vectors = await embed(env, emails.map(emailToText));
  const done: string[] = [];
  for (let i = 0; i < emails.length; i++) {
    const v = vectors[i];
    if (!Array.isArray(v)) continue;
    try {
      await env.DB.prepare(
        "UPDATE email SET embedding = ?::halfvec, embedded_at = ? WHERE id = ?",
      )
        .bind(toVectorLiteral(v), Date.now(), emails[i].id)
        .run();
      done.push(emails[i].id);
    } catch (e) {
      console.error(`[memory.remember] ${e}`);
    }
  }
  return done;
}

// Recupera los correos semánticamente más parecidos a una consulta de texto libre.
export async function recall(
  env: MemoryEnv,
  queryText: string,
  opts: { topK?: number; excludeId?: string; minScore?: number } = {},
): Promise<MemoryHit[]> {
  if (!hasBindings(env) || !queryText.trim()) return [];
  const [vec] = await embed(env, [queryText.slice(0, 1800)]);
  if (!vec) return [];
  const topK = opts.topK ?? 5;
  const minScore = opts.minScore ?? 0.35;
  const lit = toVectorLiteral(vec);
  try {
    const { results } = await env.DB.prepare(
      `SELECT id, sender, sender_email, subject, summary, type, folder, received_at,
              1 - (embedding <=> ?::halfvec) AS score
         FROM email
        WHERE embedding IS NOT NULL
        ORDER BY embedding <=> ?::halfvec
        LIMIT ?`,
    )
      .bind(lit, lit, topK + 1)
      .all<{
        id: string;
        sender: string;
        sender_email: string;
        subject: string;
        summary: string;
        type: string;
        folder: string;
        received_at: number;
        score: number;
      }>();

    return results
      .filter((m) => m.id !== opts.excludeId && Number(m.score) >= minScore)
      .slice(0, topK)
      .map((m) => ({
        id: m.id,
        score: Number(m.score),
        sender: String(m.sender ?? ""),
        sender_email: String(m.sender_email ?? ""),
        subject: String(m.subject ?? ""),
        summary: String(m.summary ?? ""),
        type: String(m.type ?? ""),
        folder: String(m.folder ?? "inbox"),
        received_at: Number(m.received_at ?? 0),
      }));
  } catch (e) {
    console.error(`[memory.recall] ${e}`);
    return [];
  }
}

// Formatea los recuerdos como contexto legible para inyectar en un prompt de IA.
export function formatMemoryContext(hits: MemoryHit[], fr: boolean): string {
  if (hits.length === 0) return "";
  const fmtDate = (ms: number) =>
    ms
      ? new Date(ms).toLocaleDateString(fr ? "fr-FR" : "es-ES", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
      : "";
  const lines = hits.map((h) => {
    const dir =
      h.folder === "sent"
        ? fr
          ? "Tu as écrit"
          : "Escribiste tú"
        : fr
          ? "Reçu de"
          : "Recibido de";
    return `- [${fmtDate(h.received_at)}] ${dir} ${h.sender}: "${h.subject}" — ${h.summary}`;
  });
  return lines.join("\n");
}
