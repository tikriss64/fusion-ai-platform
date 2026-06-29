import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

// ── Bandeja IA (fusionado desde la app Inbox) ─────────────────────────────
// Módulos de servidor autocontenidos (Gmail, análisis IA, memoria pgvector).
import { createD1, type D1Like } from "./lib/inbox/d1-compat.server";
import {
  handleGmailStart,
  handleGmailCallback,
  handleGmailStatus,
  handleGmailDisconnect,
  type GmailEnv,
} from "./lib/inbox/gmail-oauth.server";
import { syncRecentEmails, syncSentEmails, listEmails, listSent } from "./lib/inbox/gmail-api.server";
import { getEmailDetail, getAttachment } from "./lib/inbox/gmail-message.server";
import { archiveEmail, trashEmail, spamEmail, markRead, sendReply, sendNewEmail } from "./lib/inbox/gmail-actions.server";
import { extractDocument } from "./lib/inbox/doc-extract.server";
import { analyzeBatch, generateReply, answerInboxQuestion, type AiEnv } from "./lib/inbox/ai-analyze.server";
import { localSearch } from "./lib/inbox/local-search.server";
import { getAiRouter } from "./lib/inbox/ai-router.server";
import { rememberEmails, recall, formatMemoryContext, type MemoryEnv, type MemorableEmail } from "./lib/inbox/memory.server";
import { fetchCrmContext, formatCrmContextForAI } from "./lib/inbox/crm-context.server";
import { CRM_TOOLS, executeTool } from "./lib/inbox/crm-ai-tools.server";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

const DEV_CSP =
  "default-src 'self'; " +
  "script-src 'self' 'unsafe-eval' 'unsafe-inline'; " +
  "style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: blob: https:; " +
  "font-src 'self' data:; " +
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co;";

function applySecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.delete("Content-Security-Policy");
  headers.delete("content-security-policy");
  headers.set("Content-Security-Policy", DEV_CSP);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

// ── Proxy IA en el Worker ─────────────────────────────────────────────────
// Gemini format conversion from OpenAI
function toGemini(messages: any[], tools: any[]) {
  const sys  = messages.find((m: any) => m.role === "system");
  const rest = messages.filter((m: any) => m.role !== "system");
  const contents = rest.map((m: any) => {
    // Respuestas de herramientas (role:"tool" en formato OpenAI)
    if (m.role === "tool") {
      return { role: "user", parts: [{ functionResponse: { name: m.name ?? "tool", response: { content: m.content ?? "" } } }] };
    }
    if (m.role === "user")      return { role: "user",  parts: [{ text: m.content ?? "" }] };
    if (m.role === "assistant") {
      if (m.tool_calls?.length) {
        return { role: "model", parts: m.tool_calls.map((tc: any) => ({ functionCall: { name: tc.function.name, args: JSON.parse(tc.function.arguments ?? "{}") } })) };
      }
      return { role: "model", parts: [{ text: m.content ?? "" }] };
    }
    return null;
  }).filter(Boolean);

  return {
    system_instruction: sys ? { parts: [{ text: sys.content }] } : undefined,
    contents,
    tools: [{ function_declarations: tools.map((t: any) => t.function) }],
    tool_config: { function_calling_config: { mode: "AUTO" } },
    generation_config: { temperature: 0.2, max_output_tokens: 512 },
  };
}

function fromGemini(resp: any) {
  const parts = resp.candidates?.[0]?.content?.parts ?? [];
  const calls = parts.filter((p: any) => p.functionCall);
  if (calls.length) {
    return { choices: [{ message: { role: "assistant", content: null,
      tool_calls: calls.map((p: any, i: number) => ({ id: `call_${i}`, type: "function",
        function: { name: p.functionCall.name, arguments: JSON.stringify(p.functionCall.args ?? {}) } })) } }] };
  }
  const text = parts.filter((p: any) => p.text).map((p: any) => p.text).join("") || "…";
  return { choices: [{ message: { role: "assistant", content: text } }] };
}

// Coste por millón de tokens (USD) — estimaciones conservadoras para ai_usage_log
const TOKEN_COSTS: Record<string, [number, number]> = {
  "gemini-3.5-flash":                            [0.10, 0.40],
  "gemini-3.1-flash-lite":                       [0.075, 0.30],
  "meta-llama/llama-4-scout-17b-16e-instruct":   [0.11, 0.34],
  "llama-3.3-70b-versatile":                     [0.59, 0.79],
  "llama-3.1-8b-instant":                        [0.05, 0.08],
};
function calcCost(model: string, tokIn: number, tokOut: number): number {
  const [cIn, cOut] = TOKEN_COSTS[model] ?? [0.10, 0.40];
  return (tokIn * cIn + tokOut * cOut) / 1_000_000;
}

// Registra cada llamada IA real en ai_usage_log para alimentar el panel de ahorros.
async function logAiCall(envOrPenv: Record<string, unknown>, opts: {
  provider: string; model: string; tokensIn: number; tokensOut: number; task?: string;
}): Promise<void> {
  const penv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
  const url  = (envOrPenv.SUPABASE_URL  ?? penv.SUPABASE_URL)  as string | undefined;
  const key  = (envOrPenv.SUPABASE_SERVICE_ROLE_KEY ?? penv.SUPABASE_SERVICE_ROLE_KEY) as string | undefined;
  const tid  = (envOrPenv.FUSION_TENANT_ID ?? penv.FUSION_TENANT_ID) as string | undefined;
  if (!url || !key || !tid) return;
  const cost = calcCost(opts.model, opts.tokensIn, opts.tokensOut);
  try {
    await fetch(`${url}/rest/v1/ai_usage_log`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": key,
        "Authorization": `Bearer ${key}`,
        "Prefer": "return=minimal",
      },
      body: JSON.stringify({
        tenant_id: tid,
        task: opts.task ?? "proxy",
        provider: opts.provider,
        model: opts.model,
        tokens_in: opts.tokensIn,
        tokens_out: opts.tokensOut,
        cost_usd: cost,
        cache_hit: false,
        success: true,
      }),
    });
  } catch (e) {
    console.error("[logAiCall]", e);
  }
}

async function callGemini(apiKey: string, messages: any[], tools: any[]) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(toGemini(messages, tools)) },
  );
  if (!res.ok) {
    const err: any = await res.json().catch(() => ({}));
    throw { status: res.status, message: err?.error?.message ?? `Gemini HTTP ${res.status}`, provider: "gemini" };
  }
  const raw = await res.json();
  return {
    result: fromGemini(raw),
    tokensIn:  (raw.usageMetadata?.promptTokenCount     ?? 0) as number,
    tokensOut: (raw.usageMetadata?.candidatesTokenCount ?? 0) as number,
  };
}

const GROQ_AI_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

async function callGroq(apiKey: string, messages: any[], tools: any[]) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    // llama-4-scout: 30.000 TPM en free tier (5x más que 8b-instant) → menos rate limits
    body: JSON.stringify({ model: GROQ_AI_MODEL, messages, tools, tool_choice: "auto", temperature: 0.2, max_tokens: 512 }),
  });
  if (!res.ok) {
    const err: any = await res.json().catch(() => ({}));
    throw { status: res.status, message: err?.error?.message ?? `Groq HTTP ${res.status}`, provider: "groq" };
  }
  const raw = await res.json();
  return {
    result: raw,
    tokensIn:  (raw.usage?.prompt_tokens     ?? 0) as number,
    tokensOut: (raw.usage?.completion_tokens ?? 0) as number,
  };
}

// Valida DE VERDAD que las claves funcionan (llamada real a cada proveedor).
// Usado por el chat (POST) y por Configuración (GET) → ambos muestran lo mismo.
async function checkAiKeys(geminiKey?: string, groqKey?: string): Promise<{ gemini: boolean; groq: boolean }> {
  // .trim(): los secretos pueden traer espacios/BOM invisibles que invalidan la clave.
  const g = geminiKey?.trim();
  const q = groqKey?.trim();
  const safe = async (fn: () => Promise<boolean>) => { try { return await fn(); } catch { return false; } };
  const [gemini, groq] = await Promise.all([
    safe(async () => {
      if (!g) return false;
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash?key=${g}`);
      return r.ok;
    }),
    safe(async () => {
      if (!q) return false;
      const r = await fetch("https://api.groq.com/openai/v1/models", {
        headers: { Authorization: `Bearer ${q}` },
      });
      return r.ok;
    }),
  ]);
  return { gemini, groq };
}

// Resuelve una clave desde: navegador (body) → binding del Worker (env) → process.env.
function resolveKey(body: any, envMap: Record<string, unknown>, penv: Record<string, string | undefined>, name: string): string | undefined {
  return body?.[name === "GEMINI_API_KEY" ? "geminiKey" : "groqKey"]
    || (envMap[name] as string | undefined)
    || penv[name];
}

async function handleAiStatus(request: Request, env: unknown = {}): Promise<Response> {
  const body: any = await request.json().catch(() => ({}));
  const penv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
  const envMap = (env as Record<string, unknown>) ?? {};
  const geminiKey = resolveKey(body, envMap, penv, "GEMINI_API_KEY");
  const groqKey = resolveKey(body, envMap, penv, "GROQ_API_KEY");
  return Response.json(await checkAiKeys(geminiKey, groqKey));
}

async function handleAiProxy(request: Request, env: unknown = {}): Promise<Response> {
  try {
    const body: any = await request.json();
    const { messages, tools, prefer = "gemini" } = body;
    // Claves unificadas: usa la del navegador (Ajustes → Asistente IA) si la hay;
    // si no, cae a las del servidor (.env: GEMINI_API_KEY / GROQ_API_KEY) — las
    // mismas que usa la Bandeja. Así no hace falta ponerlas en dos sitios.
    const penv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
    const envMap = (env as Record<string, unknown>) ?? {};
    // Clave de cada proveedor: navegador → binding del Worker (env) → process.env.
    // .trim(): los secretos pueden traer espacios/BOM invisibles que invalidan la clave.
    const geminiKey = (body.geminiKey || (envMap.GEMINI_API_KEY as string | undefined) || penv.GEMINI_API_KEY)?.trim();
    const groqKey = (body.groqKey || (envMap.GROQ_API_KEY as string | undefined) || penv.GROQ_API_KEY)?.trim();

    if (!geminiKey && !groqKey) {
      return new Response(JSON.stringify({ error: "Configura una clave de IA en Ajustes → Asistente IA, o en el archivo .env del servidor." }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    const order: Array<"gemini" | "groq"> = prefer === "gemini" ? ["gemini", "groq"] : ["groq", "gemini"];
    let lastErr: any;

    for (const p of order) {
      try {
        let called: { result: any; tokensIn: number; tokensOut: number } | undefined;
        if (p === "gemini" && geminiKey) called = await callGemini(geminiKey, messages, tools);
        else if (p === "groq" && groqKey) called = await callGroq(groqKey, messages, tools);
        else continue;

        // Registro en ai_usage_log: alimenta el panel de ahorros del Mission Control.
        void logAiCall({ ...envMap, ...Object.fromEntries(Object.entries(penv).map(([k,v]) => [k, v ?? ""])) }, {
          provider: p,
          model: p === "gemini" ? "gemini-3.5-flash" : GROQ_AI_MODEL,
          tokensIn: called.tokensIn,
          tokensOut: called.tokensOut,
          task: "assistant",
        });

        return new Response(JSON.stringify({ ...called.result, _provider: p }), { headers: { "Content-Type": "application/json" } });
      } catch (e) {
        lastErr = e;
      }
    }

    const errMsg = lastErr?.message ?? "Error desconocido";
    return new Response(JSON.stringify({ error: errMsg, provider: lastErr?.provider }), { status: lastErr?.status ?? 500, headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message ?? "Error interno" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}

// ── Helpers Bandeja IA (fusionado desde Inbox) ────────────────────────────
// Augmenta el env con un cliente DB Postgres compatible con D1 (a partir de
// SUPABASE_DB_URL) y propaga las credenciales Supabase desde process.env.
// Idempotente: si env.DB ya existe, no hace nada.
function prepareEnv<T extends Record<string, unknown>>(env: T): T & { DB: D1Like } {
  const penv =
    (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
  const e = (env ?? {}) as Record<string, unknown>;
  for (const k of [
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_DB_URL",
    "FUSION_TENANT_ID",
    "GEMINI_API_KEY",
    "GROQ_API_KEY",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "INBOX_REQUIRE_AUTH",
    "INBOX_USE_ROUTER",
  ]) {
    if (e[k] == null && penv[k] != null) e[k] = penv[k];
  }
  if (!e.DB && typeof e.SUPABASE_DB_URL === "string") {
    e.DB = createD1(e.SUPABASE_DB_URL, e.FUSION_TENANT_ID as string | undefined);
  }
  return e as T & { DB: D1Like };
}

// Indexa en la memoria (pgvector) los correos que aún no estén indexados.
// Nunca lanza: si no hay bindings o falla, devuelve 0.
async function embedPending(env: GmailEnv & MemoryEnv, limit = 30): Promise<number> {
  if (!env.SUPABASE_URL || !env.DB) return 0;
  const { results } = await env.DB.prepare(
    `SELECT id, sender, sender_email, subject, snippet, summary, type, received_at, folder
       FROM email
      WHERE embedded_at IS NULL
        AND (folder = 'sent' OR analyzed_at IS NOT NULL)
      ORDER BY received_at DESC LIMIT ?`,
  ).bind(limit).all<MemorableEmail>();
  if (results.length === 0) return 0;
  const BATCH = 20;
  let total = 0;
  for (let i = 0; i < results.length; i += BATCH) {
    const batch = results.slice(i, i + BATCH);
    const ids = await rememberEmails(env, batch);
    if (ids.length > 0) {
      const now = Date.now();
      for (const id of ids) {
        await env.DB.prepare("UPDATE email SET embedded_at = ? WHERE id = ?").bind(now, id).run();
      }
      total += ids.length;
    }
  }
  return total;
}

// Bandeja inteligente → CRM: un correo "Comercial" (oportunidad real, no Ruido)
// de un remitente que NO es ya cliente ni lead se convierte en lead automáticamente.
// Additivo y a prueba de fallos: nunca lanza (si algo falla, la sync continúa).
// El trigger analyze_on_insert clasifica/prioriza el lead recién creado solo.
async function autoCreateLeadsFromEmails(
  env: GmailEnv,
  candidates: { sender: string; sender_email: string; subject: string; snippet: string }[],
): Promise<number> {
  const db = env.DB;
  let created = 0;
  for (const c of candidates) {
    const email = (c.sender_email || "").trim().toLowerCase();
    if (!email || !email.includes("@")) continue;
    try {
      const dupLead = await db.prepare("SELECT 1 AS x FROM leads WHERE lower(email) = ? LIMIT 1").bind(email).first<{ x: number }>();
      if (dupLead) continue;
      const dupClient = await db.prepare("SELECT 1 AS x FROM clients WHERE lower(email) = ? LIMIT 1").bind(email).first<{ x: number }>();
      if (dupClient) continue;
      const mensaje = `[Detectado en la Bandeja] ${c.subject ?? ""}${c.snippet ? ` — ${c.snippet}` : ""}`.slice(0, 500);
      await db.prepare(
        "INSERT INTO leads (nombre, email, mensaje, origen_pagina, estado) VALUES (?, ?, ?, 'email', 'nuevo')",
      ).bind(c.sender?.trim() || email, email, mensaje).run();
      created++;
    } catch (e) {
      console.error(`[autoLead] ${e}`);
    }
  }
  return created;
}

// Sincroniza y analiza correos pendientes. Reutilizado por el endpoint y el cron.
async function syncAndAnalyze(env: GmailEnv & AiEnv & MemoryEnv): Promise<{ synced: number; analyzed: number; embedded: number; leads: number }> {
  const synced = await syncRecentEmails(env);
  await syncSentEmails(env);
  const db = env.DB;
  const { results: pending } = await db.prepare(
    "SELECT id, sender, sender_email, subject, snippet FROM email WHERE analyzed_at IS NULL AND (folder = 'inbox' OR folder IS NULL) LIMIT 50",
  ).all<{ id: string; sender: string; sender_email: string; subject: string; snippet: string }>();
  let analyzed = 0;
  const comercial: { sender: string; sender_email: string; subject: string; snippet: string }[] = [];

  // Fase 2 del aprendizaje: aplica las reglas APRENDIDAS (router_rules) antes de
  // gastar IA. Si una regla casa (p.ej. dominio que ya corregiste 2+ veces), clasifica
  // el correo a 0 tokens y no se vuelve a equivocar. El resto va a la IA.
  const tenantId = (env as { FUSION_TENANT_ID?: string }).FUSION_TENANT_ID;
  const aiPending: typeof pending = [];
  for (const email of pending) {
    let ruled: string | null = null;
    if (tenantId) {
      try {
        const hit = await db.prepare("SELECT (match_router_rule(?::uuid, 'classification', ?)->>'type') AS t")
          .bind(tenantId, `${email.sender ?? ""} ${email.sender_email ?? ""} ${email.subject ?? ""}`)
          .first<{ t: string | null }>();
        if (hit?.t) ruled = hit.t;
      } catch { /* sin reglas → IA */ }
    }
    if (ruled) {
      await db.prepare("UPDATE email SET type=?, summary=?, effort='quick', analyzed_at=? WHERE id=?")
        .bind(ruled, "Clasificado por regla aprendida (0 tokens).", Date.now(), email.id).run();
      analyzed++;
      if (ruled === "Comercial" && email.sender_email) {
        comercial.push({ sender: email.sender, sender_email: email.sender_email, subject: email.subject, snippet: email.snippet });
      }
    } else {
      aiPending.push(email);
    }
  }

  const BATCH = 8;
  for (let i = 0; i < aiPending.length; i += BATCH) {
    const batch = aiPending.slice(i, i + BATCH);
    const { results } = await analyzeBatch(env, batch);
    const byId = new Map(results.map((r) => [String(r.id), r]));
    for (const email of batch) {
      const r = byId.get(String(email.id));
      if (!r || !r.type || !r.summary || !r.effort) continue;
      await db.prepare(
        `UPDATE email SET type=?, summary=?, promise=?, tone_warning=?, effort=?, analyzed_at=? WHERE id=?`,
      ).bind(r.type, r.summary, r.promise ?? null, r.tone_warning ?? null, r.effort, Date.now(), email.id).run();
      analyzed++;
      if (r.type === "Comercial" && email.sender_email) {
        comercial.push({ sender: email.sender, sender_email: email.sender_email, subject: email.subject, snippet: email.snippet });
      }
    }
  }
  let leads = 0;
  try {
    leads = await autoCreateLeadsFromEmails(env, comercial);
  } catch (e) {
    console.error(`[autoLead] ${e}`);
  }
  let embedded = 0;
  try {
    embedded = await embedPending(env);
  } catch (e) {
    console.error(`[embedPending] ${e}`);
  }
  return { synced, analyzed, embedded, leads };
}

// Verifica la sesión de Supabase del CRM contra el endpoint /auth/v1/user.
// Solo bloquea cuando INBOX_REQUIRE_AUTH=true (producción). En local devuelve
// siempre true (un solo usuario en tu propio PC) → no rompe nada.
async function requireSupabaseAuth(
  request: Request,
  env: { SUPABASE_URL?: string; SUPABASE_ANON_KEY?: string; INBOX_REQUIRE_AUTH?: string },
): Promise<boolean> {
  if (env.INBOX_REQUIRE_AUTH !== "true") return true; // local: abierto
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return false;
  try {
    const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: env.SUPABASE_ANON_KEY, authorization: `Bearer ${token}` },
    });
    return r.ok;
  } catch {
    return false;
  }
}

// Enrutador de la Bandeja IA. Maneja /api/gmail/*, /api/inbox/*, /api/email/*,
// /api/waiting, /api/risks, /api/today, /api/contact, /api/documents/extract,
// /api/memory/*. Devuelve null si la ruta no le corresponde (cae al SSR).
// TODO(deploy): proteger estas rutas con la sesión de Supabase del CRM.
// Hoy (local, un solo usuario) no llevan guardia de auth — el acceso ya está
// gated por el login del CRM en la UI. Antes de publicar online: añadir verificación.
async function handleInboxApi(request: Request, env: unknown): Promise<Response | null> {
  const pathname = new URL(request.url).pathname;
  if (!pathname.startsWith("/api/")) return null;

  const combinedEnv = prepareEnv(env as GmailEnv & AiEnv & MemoryEnv & { SUPABASE_ANON_KEY?: string; INBOX_REQUIRE_AUTH?: string; INBOX_USE_ROUTER?: string; FUSION_TENANT_ID?: string });
  const db = combinedEnv.DB;

  // Login único: si INBOX_REQUIRE_AUTH=true (producción), exige la sesión de
  // Supabase del CRM. El inicio/callback de OAuth son navegaciones del navegador
  // (sin cabecera) y quedan exentos. En local (interruptor apagado) no bloquea nada.
  const isOAuthNav = pathname === "/api/gmail/start" || pathname === "/api/gmail/callback";
  // Endpoints públicos (presupuesto compartido por enlace con token secreto) — sin login.
  const isPublic = pathname.startsWith("/api/public/");
  if (!isOAuthNav && !isPublic && !(await requireSupabaseAuth(request, combinedEnv))) {
    return Response.json({ error: "No autorizado. Inicia sesión en el CRM." }, { status: 401 });
  }

  // ── Presupuesto público (enlace con token) ──────────────────────────────────
  const pubQuoteGet = pathname.match(/^\/api\/public\/quote\/([0-9a-fA-F-]{36})$/);
  if (pubQuoteGet && request.method === "GET") {
    const token = pubQuoteGet[1];
    const q = await db.prepare(
      "SELECT id, numero, estado, fecha, valido_hasta, subtotal, iva, total, accepted_at, client_id FROM quotes WHERE public_token = ? LIMIT 1",
    ).bind(token).first<any>();
    if (!q) return Response.json({ error: "Presupuesto no encontrado." }, { status: 404 });
    const { results: items } = await db.prepare(
      "SELECT descripcion, cantidad, precio_unit, iva_aplicable FROM quote_items WHERE quote_id = ? ORDER BY orden",
    ).bind(q.id).all<any>();
    const comp = await db.prepare(
      "SELECT trade_name, legal_name, tax_id, phone, email FROM company_settings LIMIT 1",
    ).first<any>();
    const cli = q.client_id
      ? await db.prepare("SELECT nombre FROM clients WHERE id = ?").bind(q.client_id).first<any>()
      : null;
    return Response.json({
      quote: { numero: q.numero, estado: q.estado, fecha: q.fecha, valido_hasta: q.valido_hasta, subtotal: q.subtotal, iva: q.iva, total: q.total, accepted_at: q.accepted_at },
      items, company: comp, cliente: cli?.nombre ?? null,
    });
  }
  const pubQuoteAccept = pathname.match(/^\/api\/public\/quote\/([0-9a-fA-F-]{36})\/accept$/);
  if (pubQuoteAccept && request.method === "POST") {
    const token = pubQuoteAccept[1];
    // Solo se puede aceptar un presupuesto en estado borrador/enviado. Registra la fecha.
    await db.prepare(
      "UPDATE quotes SET estado = 'aceptado', accepted_at = COALESCE(accepted_at, now()) WHERE public_token = ? AND estado IN ('borrador','enviado')",
    ).bind(token).run();
    return Response.json({ ok: true });
  }

  // Fase 3 del aprendizaje: registra correcciones del usuario (p.ej. ajustar el precio
  // de un presupuesto auto-generado) para que el supervisor las resuma y mejoremos.
  if (pathname === "/api/learning/log" && request.method === "POST") {
    const b = await request.json() as Record<string, unknown>;
    const tenantId = (combinedEnv as { FUSION_TENANT_ID?: string }).FUSION_TENANT_ID;
    try {
      await db.prepare(
        "INSERT INTO agent_learning (tenant_id, kind, agent, entity_type, entity_id, before_value, after_value, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      ).bind(
        tenantId ?? null, String(b.kind ?? "manual"), (b.agent as string) ?? null,
        (b.entity_type as string) ?? null, (b.entity_id as string) ?? null,
        (b.before_value as string) ?? null, (b.after_value as string) ?? null, (b.note as string) ?? null,
      ).run();
    } catch (e) { console.error("[learning/log]", e); }
    return Response.json({ ok: true });
  }

  // OAuth de Gmail (públicas — el callback viene de Google).
  if (pathname === "/api/gmail/start") return handleGmailStart(request, combinedEnv);
  if (pathname === "/api/gmail/callback") return handleGmailCallback(request, combinedEnv);
  if (pathname === "/api/gmail/status") return handleGmailStatus(request, combinedEnv);
  if (pathname === "/api/gmail/disconnect" && request.method === "POST")
    return handleGmailDisconnect(request, combinedEnv);
  if (pathname === "/api/gmail/sync" && request.method === "POST") {
    const synced = await syncRecentEmails(combinedEnv);
    await syncSentEmails(combinedEnv);
    return Response.json({ synced });
  }
  if (pathname === "/api/inbox/sent") {
    const emails = await listSent(combinedEnv);
    return Response.json({ emails });
  }
  if (pathname === "/api/inbox/list") {
    const emails = await listEmails(combinedEnv);
    return Response.json({ emails });
  }
  if (pathname === "/api/ai/status" && request.method === "GET") {
    // Misma validación real que el chat → Configuración no miente ni se contradice.
    return Response.json(await checkAiKeys(
      (combinedEnv as AiEnv).GEMINI_API_KEY,
      (combinedEnv as AiEnv).GROQ_API_KEY,
    ));
  }
  if (pathname === "/api/documents/extract" && request.method === "POST") {
    const { mimeType, dataBase64 } = await request.json() as { mimeType: string; dataBase64: string };
    const result = await extractDocument(combinedEnv as AiEnv, { mimeType, dataBase64 });
    return Response.json({ result });
  }
  if (pathname === "/api/inbox/ask" && request.method === "POST") {
    const { question, lang } = await request.json() as { question: string; lang?: string };
    const uiLang = lang === "fr" ? "fr" : "es";
    const { results } = await db.prepare(
      `SELECT id, sender, subject, summary, snippet, type, promise, tone_warning, received_at FROM email ORDER BY received_at DESC LIMIT 40`,
    ).all<{ id: string; sender: string; subject: string; summary: string | null; snippet: string; type: string | null; promise: string | null; tone_warning: string | null; received_at: number }>();
    const local = localSearch(question, results, uiLang);
    let answer = "";
    let matches: number[] = [];
    let source: "local" | "ia" = "ia";
    if (local) {
      answer = local.answer;
      matches = local.matchIds;
      source = "local";
    } else {
      // Router IA opt-in (INBOX_USE_ROUTER=true): cascada anti-coste + caché + PII.
      // Apagado por defecto → usa answerInboxQuestion (comportamiento actual). Si el
      // router falla o degrada, también cae al método directo. Riesgo cero.
      let used = false;
      if (combinedEnv.INBOX_USE_ROUTER === "true") {
        const router = getAiRouter();
        if (router) {
          try {
            const emailsText = results
              .map((e, i) => `${i + 1}. [${e.type ?? "?"}] ${e.sender}: ${e.subject} — ${e.summary || e.snippet}`)
              .join("\n");
            const sys = uiLang === "fr"
              ? "Tu es l'assistant d'une boîte mail. Réponds brièvement à la question, en te basant uniquement sur les e-mails listés."
              : "Eres el asistente de una bandeja de correo. Responde brevemente a la pregunta basándote SOLO en los correos listados.";
            const res = await router.route<string>({
              tenantId: combinedEnv.FUSION_TENANT_ID ?? "default",
              task: "summarize",
              input: `Pregunta: ${question}\n\nCorreos:\n${emailsText}`,
              system: sys,
              sensitivity: "pii", // los correos llevan datos personales → enmascarar
            });
            if (res.data && !res.degradedError) {
              answer = res.data;
              matches = [];
              source = "ia";
              used = true;
            }
          } catch {
            // cae al método directo
          }
        }
      }
      if (!used) {
        const r = await answerInboxQuestion(combinedEnv as AiEnv, question, results, uiLang);
        answer = r.answer;
        matches = r.matches;
        source = "ia";
      }
    }
    const related = matches
      .map((n) => results[n - 1])
      .filter(Boolean)
      .map((e) => ({ id: e.id, sender: e.sender, subject: e.subject, summary: e.summary || e.snippet, received_at: e.received_at }));
    return Response.json({ answer, related, source });
  }
  if (pathname === "/api/waiting") {
    const { results } = await db.prepare(
      `SELECT id, sender, sender_email, subject, summary, promise, type, received_at
       FROM email ORDER BY received_at DESC`,
    ).all<{ id: string; sender: string; sender_email: string; subject: string; summary: string | null; promise: string | null; type: string | null; received_at: number }>();
    const fromOthers = results.filter((r) => r.promise).map((r) => ({
      id: r.id, person: r.sender, email: r.sender_email, what: r.promise, received_at: r.received_at,
    }));
    const fromMe = results.filter((r) => ["Cliente", "Reclamación", "Urgente"].includes(r.type ?? "")).map((r) => ({
      id: r.id, person: r.sender, email: r.sender_email, what: r.summary || r.subject, type: r.type, received_at: r.received_at,
    }));
    return Response.json({ fromOthers, fromMe });
  }
  if (pathname === "/api/risks") {
    const { results } = await db.prepare(
      `SELECT id, sender, sender_email, subject, summary, promise, tone_warning, type, received_at
       FROM email ORDER BY received_at DESC`,
    ).all<{ id: string; sender: string; sender_email: string; subject: string; summary: string | null; promise: string | null; tone_warning: string | null; type: string | null; received_at: number }>();
    const risks = results.filter((r) => r.tone_warning || r.type === "Reclamación").map((r) => ({
      id: r.id, sender: r.sender, subject: r.subject, summary: r.summary, tone_warning: r.tone_warning, type: r.type, received_at: r.received_at,
    }));
    const opportunities = results.filter((r) => r.type === "Comercial").slice(0, 10).map((r) => ({
      id: r.id, sender: r.sender, subject: r.subject, summary: r.summary, received_at: r.received_at,
    }));
    const silences = results.filter((r) => r.type === "Cliente")
      .sort((a, b) => a.received_at - b.received_at).slice(0, 6).map((r) => ({
        id: r.id, sender: r.sender, subject: r.subject, summary: r.summary, received_at: r.received_at,
      }));
    return Response.json({ risks, opportunities, silences });
  }
  if (pathname === "/api/today") {
    const { results } = await db.prepare(
      `SELECT type, tone_warning, promise, sender, received_at, folder FROM email`,
    ).all<{ type: string | null; tone_warning: string | null; promise: string | null; sender: string; received_at: number | null; folder: string | null }>();
    const angry = results.filter((r) => r.tone_warning);
    const complaints = results.filter((r) => r.type === "Reclamación");
    const promises = results.filter((r) => r.promise);
    const opportunities = results.filter((r) => r.type === "Comercial");
    const urgent = results.filter((r) => r.type === "Urgente");
    // Correos recibidos HOY en la bandeja (para el KPI "Correos hoy").
    const startToday = new Date(); startToday.setUTCHours(0, 0, 0, 0);
    const startMs = startToday.getTime();
    const todayInbox = results.filter(
      (r) => (r.folder === "inbox" || r.folder == null) && (r.received_at ?? 0) >= startMs,
    ).length;
    return Response.json({
      total: results.length,
      angry: angry.length,
      angryWho: angry[0]?.sender ?? null,
      complaints: complaints.length,
      promises: promises.length,
      opportunities: opportunities.length,
      urgent: urgent.length,
      todayInbox,
    });
  }
  if (pathname === "/api/contact") {
    const email = new URL(request.url).searchParams.get("email") ?? "";
    const stats = await db.prepare(
      `SELECT COUNT(*) as total, MIN(received_at) as first_at, MAX(received_at) as last_at
       FROM email WHERE sender_email = ?`,
    ).bind(email).first<{ total: number; first_at: number; last_at: number }>();
    const { results: recent } = await db.prepare(
      `SELECT subject, summary, promise, tone_warning, type, received_at
       FROM email WHERE sender_email = ? ORDER BY received_at DESC LIMIT 5`,
    ).bind(email).all<{ subject: string; summary: string; promise: string; tone_warning: string; type: string; received_at: number }>();
    const promises = recent.filter((r) => r.promise).map((r) => r.promise);
    const negative = recent.some((r) => r.tone_warning);
    return Response.json({
      email,
      total: stats?.total ?? 0,
      firstAt: stats?.first_at ?? null,
      lastAt: stats?.last_at ?? null,
      recent,
      promises,
      negative,
    });
  }
  const emailMatch = pathname.match(/^\/api\/email\/([^/]+)$/);
  if (emailMatch && request.method === "GET") {
    const detail = await getEmailDetail(combinedEnv, emailMatch[1]);
    if (!detail) return new Response("Not found", { status: 404 });
    return Response.json(detail);
  }
  const attachMatch = pathname.match(/^\/api\/email\/([^/]+)\/attachment\/([^/]+)$/);
  if (attachMatch && request.method === "GET") {
    const att = await getAttachment(combinedEnv, attachMatch[1], attachMatch[2]);
    if (!att) return new Response("Not found", { status: 404 });
    const binary = Uint8Array.from(atob(att.data.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
    const filename = new URL(request.url).searchParams.get("filename") ?? "adjunto";
    const mime = new URL(request.url).searchParams.get("mime") ?? "application/octet-stream";
    return new Response(binary, {
      headers: {
        "Content-Type": mime,
        "Content-Disposition": `inline; filename="${filename}"`,
      },
    });
  }
  const actionMatch = pathname.match(/^\/api\/email\/([^/]+)\/(archive|trash|spam|read)$/);
  if (actionMatch && request.method === "POST") {
    const [, msgId, action] = actionMatch;
    let ok = false;
    if (action === "archive") ok = await archiveEmail(combinedEnv, msgId);
    else if (action === "trash") ok = await trashEmail(combinedEnv, msgId);
    else if (action === "spam") ok = await spamEmail(combinedEnv, msgId);
    else if (action === "read") ok = await markRead(combinedEnv, msgId);
    if (ok && action !== "read") {
      await db.prepare("DELETE FROM email WHERE id = ?").bind(msgId).run();
    }
    return Response.json({ ok });
  }
  if (pathname === "/api/email/bulk" && request.method === "POST") {
    const { ids, action } = await request.json() as { ids: string[]; action: string };
    let done = 0;
    for (const id of ids) {
      let ok = false;
      if (action === "archive") ok = await archiveEmail(combinedEnv, id);
      else if (action === "trash") ok = await trashEmail(combinedEnv, id);
      else if (action === "spam") ok = await spamEmail(combinedEnv, id);
      if (ok) { await db.prepare("DELETE FROM email WHERE id = ?").bind(id).run(); done++; }
    }
    return Response.json({ done });
  }
  const typeMatch = pathname.match(/^\/api\/email\/([^/]+)\/type$/);
  if (typeMatch && request.method === "POST") {
    const { type } = await request.json() as { type: string };
    const emailId = typeMatch[1];
    const prev = await db.prepare("SELECT type FROM email WHERE id = ?").bind(emailId).first<{ type: string | null }>();
    await db.prepare("UPDATE email SET type = ? WHERE id = ?").bind(type, emailId).run();
    // Aprendizaje: el usuario corrigió la clasificación del agente → lo registramos
    // para el informe del supervisor. A prueba de fallos: nunca rompe la acción.
    if (prev?.type && prev.type !== type) {
      try {
        await db.prepare(
          "INSERT INTO agent_learning (tenant_id, kind, agent, entity_type, entity_id, before_value, after_value) VALUES (?, 'email_reclassify', 'inbox-classifier', 'email', ?, ?, ?)",
        ).bind((combinedEnv as { FUSION_TENANT_ID?: string }).FUSION_TENANT_ID ?? null, emailId, prev.type, type).run();
      } catch (e) { console.error("[learning]", e); }
    }
    return Response.json({ ok: true });
  }
  const draftMatch = pathname.match(/^\/api\/email\/([^/]+)\/draft$/);
  if (draftMatch && request.method === "POST") {
    const { tone, myStyle, lang } = await request.json() as { tone: string; myStyle?: boolean; lang?: string };
    const detail = await getEmailDetail(combinedEnv, draftMatch[1]);
    if (!detail) return Response.json({ draft: null }, { status: 404 });
    let memory = "";
    try {
      const query = `${detail.from} ${detail.subject} ${detail.bodyText || detail.snippet || ""}`;
      const hits = await recall(combinedEnv, query, { topK: 5, excludeId: draftMatch[1] });
      memory = formatMemoryContext(hits, lang === "fr");
    } catch (e) {
      console.error(`[draft.recall] ${e}`);
    }
    const draft = await generateReply(combinedEnv as AiEnv, {
      subject: detail.subject,
      body: detail.bodyText || detail.snippet || "",
      from: detail.from,
      tone,
      myStyle: !!myStyle,
      memory: memory || undefined,
    });
    return Response.json({ draft, memoryUsed: memory ? memory.split("\n").length : 0 });
  }
  const replyMatch = pathname.match(/^\/api\/email\/([^/]+)\/reply$/);
  if (replyMatch && request.method === "POST") {
    const body = await request.json() as { to: string; subject: string; body: string; threadId: string; inReplyTo?: string; attachments?: { filename: string; mimeType: string; base64: string }[] };
    const ok = await sendReply(combinedEnv, body);
    return Response.json({ ok });
  }
  // Asistente IA con acceso total al CRM (tool use con Groq)
  if (pathname === "/api/crm/ai" && request.method === "POST") {
    const { messages } = await request.json() as { messages: any[] };
    const groqKey = (combinedEnv as any).GROQ_API_KEY;
    if (!groqKey) return Response.json({ error: "GROQ_API_KEY no configurada." }, { status: 500 });

    const today = new Date().toISOString().slice(0, 10);
    const systemMsg = {
      role: "system",
      content: `Eres el asistente inteligente de VaciadoDePisos.cat (ZAFIRO LANCER S.L., empresa de vaciado de pisos y servicios de limpieza en Barcelona). Tienes acceso completo al CRM de la empresa. Fecha de hoy: ${today}.\n\nPuedes buscar, crear y modificar clientes, leads, presupuestos, facturas, trabajos y agenda. Responde siempre en español, de forma concisa y profesional. Cuando el usuario pida información, usa las herramientas para obtener datos reales. Cuando pida crear o modificar algo, hazlo directamente. Si necesitas un ID y no lo tienes, primero busca el registro.`,
    };

    const msgs: any[] = [systemMsg, ...messages];
    const GROQ_MODELS = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"];
    let iterations = 0;
    let modelIdx = 0;

    while (iterations < 6) {
      iterations++;
      const model = GROQ_MODELS[modelIdx] ?? GROQ_MODELS[0];
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${groqKey}` },
        body: JSON.stringify({ model, messages: msgs, tools: CRM_TOOLS, tool_choice: "auto", temperature: 0.2, max_tokens: 1024 }),
      });
      if (res.status === 429 && modelIdx < GROQ_MODELS.length - 1) { modelIdx++; continue; }
      if (!res.ok) return Response.json({ error: `Error IA: ${res.status}. Inténtalo de nuevo.` }, { status: 500 });
      const data = await res.json() as any;
      const choice = data.choices?.[0];
      const msg = choice?.message;

      if (!msg) break;
      msgs.push(msg);

      // Si no hay tool calls, tenemos la respuesta final
      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        return Response.json({ answer: msg.content || "Sin respuesta." });
      }

      // Ejecutar todas las herramientas solicitadas
      for (const tc of msg.tool_calls) {
        const args = JSON.parse(tc.function.arguments || "{}");
        const result = await executeTool(combinedEnv, tc.function.name, args);
        msgs.push({ role: "tool", tool_call_id: tc.id, content: result });
      }
    }

    return Response.json({ answer: "No se pudo completar la solicitud." });
  }

  if (pathname === "/api/inbox/crm-context" && request.method === "POST") {
    const { senderEmail = "", senderName = "" } = await request.json() as { senderEmail?: string; senderName?: string };
    const ctx = await fetchCrmContext(combinedEnv, senderEmail, senderName);
    return Response.json({ context: formatCrmContextForAI(ctx), raw: ctx });
  }
  if (pathname === "/api/email/new" && request.method === "POST") {
    const body = await request.json() as { to: string; subject: string; body: string; attachments?: { filename: string; mimeType: string; base64: string }[] };
    const ok = await sendNewEmail(combinedEnv, body);
    return Response.json({ ok });
  }
  if (pathname === "/api/inbox/reset-analysis" && request.method === "POST") {
    await db.prepare("UPDATE email SET analyzed_at = NULL").run();
    const { results } = await db.prepare("SELECT COUNT(*) as n FROM email").all<{ n: number }>();
    return Response.json({ reset: results[0]?.n ?? 0 });
  }
  if (pathname === "/api/inbox/analyze" && request.method === "POST") {
    const { results: pending } = await db.prepare(
      "SELECT id, sender, subject, snippet FROM email WHERE analyzed_at IS NULL AND (folder = 'inbox' OR folder IS NULL) LIMIT 50",
    ).all<{ id: string; sender: string; subject: string; snippet: string }>();
    if (pending.length === 0) return Response.json({ analyzed: 0, pending: 0 });
    const BATCH = 8;
    let analyzed = 0;
    const enginesUsed = new Set<string>();
    for (let i = 0; i < pending.length; i += BATCH) {
      const batch = pending.slice(i, i + BATCH);
      const { results, engine } = await analyzeBatch(combinedEnv as AiEnv, batch);
      if (engine !== "none") enginesUsed.add(engine);
      const byId = new Map(results.map((r) => [String(r.id), r]));
      for (const email of batch) {
        const r = byId.get(String(email.id));
        if (!r || !r.type || !r.summary || !r.effort) continue;
        await db.prepare(
          `UPDATE email SET type=?, summary=?, promise=?, tone_warning=?, effort=?, analyzed_at=? WHERE id=?`,
        ).bind(r.type, r.summary, r.promise ?? null, r.tone_warning ?? null, r.effort, Date.now(), email.id).run();
        analyzed++;
      }
    }
    let embedded = 0;
    try {
      embedded = await embedPending(combinedEnv);
    } catch (e) {
      console.error(`[embedPending] ${e}`);
    }
    return Response.json({ analyzed, pending: pending.length, engines: [...enginesUsed], embedded });
  }
  if (pathname === "/api/memory/backfill" && request.method === "POST") {
    let embedded = 0;
    try {
      embedded = await embedPending(combinedEnv, 200);
    } catch (e) {
      console.error(`[memory/backfill] ${e}`);
    }
    return Response.json({ embedded });
  }
  if (pathname === "/api/memory/stats") {
    const { results } = await db.prepare(
      "SELECT COUNT(*) AS total, COUNT(embedded_at) AS embedded FROM email",
    ).all<{ total: number; embedded: number }>();
    const row = results[0] ?? { total: 0, embedded: 0 };
    return Response.json({ total: row.total, embedded: row.embedded, enabled: !!combinedEnv.SUPABASE_URL && !!combinedEnv.DB });
  }

  return null; // no es ruta de la Bandeja → cae al SSR
}

export default {
  // Cron: sincroniza y analiza correos automáticamente sin intervención.
  async scheduled(_event: unknown, env: unknown, _ctx: unknown) {
    try {
      const result = await syncAndAnalyze(prepareEnv(env as GmailEnv & AiEnv & MemoryEnv));
      console.log(`[Cron] sync=${result.synced} analyzed=${result.analyzed} embedded=${result.embedded} leads=${result.leads}`);
    } catch (e) {
      console.error(`[Cron] error: ${e}`);
    }
  },

  async fetch(request: Request, env: unknown, ctx: unknown) {
    // ── Proxy IA directo en el Worker ───────────────────────────────────────
    const url = new URL(request.url);
    if (url.pathname === "/api/ai" && request.method === "POST") {
      return handleAiProxy(request, env);
    }
    if (url.pathname === "/api/ai/status" && request.method === "POST") {
      return handleAiStatus(request, env);
    }

    // ── Bandeja IA: rutas /api/* del Inbox fusionado ────────────────────────
    try {
      const inboxResponse = await handleInboxApi(request, env);
      if (inboxResponse) return inboxResponse;
    } catch (error) {
      console.error("[inbox-api]", error);
      return Response.json({ error: String((error as Error)?.message ?? error) }, { status: 500 });
    }

    try {
      const handler    = await getServerEntry();
      const response   = await handler.fetch(request, env, ctx);
      const normalized = await normalizeCatastrophicSsrResponse(response);
      return applySecurityHeaders(normalized);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
