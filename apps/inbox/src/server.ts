import "./lib/error-capture";

import { createD1, type D1Like } from "./lib/d1-compat.server";
import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import {
  handleGmailStart,
  handleGmailCallback,
  handleGmailStatus,
  handleGmailDisconnect,
  type GmailEnv,
} from "./lib/gmail-oauth.server";
import { syncRecentEmails, syncSentEmails, listEmails, listSent } from "./lib/gmail-api.server";
import { getEmailDetail } from "./lib/gmail-message.server";
import { archiveEmail, trashEmail, spamEmail, markRead, sendReply } from "./lib/gmail-actions.server";
import { extractDocument } from "./lib/doc-extract.server";
import { analyzeBatch, generateReply, answerInboxQuestion, type AiEnv } from "./lib/ai-analyze.server";
import { localSearch } from "./lib/local-search.server";
import { rememberEmails, recall, formatMemoryContext, type MemoryEnv, type MemorableEmail } from "./lib/memory.server";
import {
  isAuthenticated,
  handleLogin,
  handleLogout,
  unauthorized,
  changePassword,
  hasCustomPassword,
  generateRecovery,
  type AuthEnv,
} from "./lib/auth.server";

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

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
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

// Augmenta el env con un cliente DB Postgres compatible con D1 (a partir de
// SUPABASE_DB_URL) y propaga las credenciales Supabase desde process.env. Esto
// reemplaza los bindings de Cloudflare (D1/Vectorize) sin tocar el resto del código.
// Idempotente: si env.DB ya existe (runtime Workers con binding), no hace nada.
function prepareEnv<T extends Record<string, unknown>>(env: T): T & { DB: D1Like } {
  const penv =
    (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
  // En dev (Vite SSR / Node) env puede ser undefined; en Workers viene poblado.
  // Tratamos un env vacío como `{}` para que las asignaciones funcionen siempre.
  const e = (env ?? {}) as Record<string, unknown>;
  for (const k of [
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_DB_URL",
    "FUSION_TENANT_ID",
  ]) {
    if (e[k] == null && penv[k] != null) e[k] = penv[k];
  }
  if (!e.DB && typeof e.SUPABASE_DB_URL === "string") {
    e.DB = createD1(e.SUPABASE_DB_URL, e.FUSION_TENANT_ID as string | undefined);
  }
  return e as T & { DB: D1Like };
}

// Indexa en la memoria (pgvector) los correos que aún no estén indexados:
// correos de bandeja ya analizados + correos enviados. Marca embedded_at al terminar.
// Devuelve cuántos se indexaron. Nunca lanza: si no hay bindings o falla, devuelve 0.
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
      // Marca como indexados SOLO los que obtuvieron vector válido.
      for (const id of ids) {
        await env.DB.prepare("UPDATE email SET embedded_at = ? WHERE id = ?").bind(now, id).run();
      }
      total += ids.length;
    }
  }
  return total;
}

// Sincroniza y analiza correos pendientes. Reutilizado por el endpoint y por el cron.
async function syncAndAnalyze(env: GmailEnv & AiEnv & MemoryEnv): Promise<{ synced: number; analyzed: number; embedded: number }> {
  const synced = await syncRecentEmails(env);
  await syncSentEmails(env);
  const db = env.DB;
  const { results: pending } = await db.prepare(
    "SELECT id, sender, subject, snippet FROM email WHERE analyzed_at IS NULL AND (folder = 'inbox' OR folder IS NULL) LIMIT 50",
  ).all<{ id: string; sender: string; subject: string; snippet: string }>();
  let analyzed = 0;
  const BATCH = 8;
  for (let i = 0; i < pending.length; i += BATCH) {
    const batch = pending.slice(i, i + BATCH);
    const { results } = await analyzeBatch(env, batch);
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
  // Alimenta el cerebro de memoria con lo nuevo (analizados + enviados).
  let embedded = 0;
  try {
    embedded = await embedPending(env);
  } catch (e) {
    console.error(`[embedPending] ${e}`);
  }
  return { synced, analyzed, embedded };
}

export default {
  // Cron: sincroniza y analiza automáticamente sin intervención del usuario.
  async scheduled(_event: unknown, env: unknown, _ctx: unknown) {
    try {
      const result = await syncAndAnalyze(prepareEnv(env as GmailEnv & AiEnv & MemoryEnv));
      console.log(`[Cron] sync=${result.synced} analyzed=${result.analyzed} embedded=${result.embedded}`);
    } catch (e) {
      console.error(`[Cron] error: ${e}`);
    }
  },

  async fetch(request: Request, env: unknown, ctx: unknown) {
    // Rutas API propias (OAuth de Gmail), manejadas antes del renderizado SSR.
    const pathname = new URL(request.url).pathname;
    const combinedEnv = prepareEnv(env as GmailEnv & AuthEnv);

    // Rutas de auth — siempre públicas (sin cookie todavía).
    if (pathname === "/api/auth/login" && request.method === "POST")
      return handleLogin(request, combinedEnv);
    if (pathname === "/api/auth/logout" && request.method === "POST")
      return handleLogout(request);

    // OAuth de Gmail — el callback debe ser accesible sin sesión (viene de Google).
    if (pathname === "/api/gmail/start") return handleGmailStart(request, combinedEnv);
    if (pathname === "/api/gmail/callback") return handleGmailCallback(request, combinedEnv);

    // Todas las demás rutas /api/* requieren sesión válida.
    if (pathname.startsWith("/api/")) {
      if (!(await isAuthenticated(request, combinedEnv))) return unauthorized();

      // Auth gestionada (cambiar PIN / recuperación / estado)
      if (pathname === "/api/auth/has-password") {
        return Response.json({ hasCustom: await hasCustomPassword(combinedEnv) });
      }
      if (pathname === "/api/auth/change-password" && request.method === "POST") {
        const { oldPassword, newPassword } = await request.json() as { oldPassword: string; newPassword: string };
        const res = await changePassword(combinedEnv, oldPassword, newPassword);
        return Response.json(res, { status: res.ok ? 200 : 400 });
      }
      if (pathname === "/api/auth/recovery" && request.method === "POST") {
        const code = await generateRecovery(combinedEnv);
        return Response.json({ code });
      }
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
      // GET /api/ai/status — estado real de las claves IA (configuradas en el servidor)
      if (pathname === "/api/ai/status") {
        const aiEnv = env as AiEnv;
        return Response.json({
          gemini: !!aiEnv.GEMINI_API_KEY,
          groq: !!aiEnv.GROQ_API_KEY,
        });
      }
      // POST /api/documents/extract — extrae datos de un PDF/imagen con IA multimodal
      if (pathname === "/api/documents/extract" && request.method === "POST") {
        const { mimeType, dataBase64 } = await request.json() as { mimeType: string; dataBase64: string };
        const result = await extractDocument(env as AiEnv, { mimeType, dataBase64 });
        return Response.json({ result });
      }
      // POST /api/inbox/ask — pregunta en lenguaje natural sobre la bandeja
      if (pathname === "/api/inbox/ask" && request.method === "POST") {
        const { question, lang } = await request.json() as { question: string; lang?: string };
        const uiLang = lang === "fr" ? "fr" : "es";
        const db = combinedEnv.DB as GmailEnv["DB"];
        const { results } = await db.prepare(
          `SELECT id, sender, subject, summary, snippet, type, promise, tone_warning, received_at FROM email ORDER BY received_at DESC LIMIT 40`,
        ).all<{ id: string; sender: string; subject: string; summary: string | null; snippet: string; type: string | null; promise: string | null; tone_warning: string | null; received_at: number }>();

        // Local-first: intenta resolver sin IA. Solo llama a la IA si es semántico.
        const local = localSearch(question, results, uiLang);
        let answer: string;
        let matches: number[];
        let source: "local" | "ia";
        if (local) {
          answer = local.answer;
          matches = local.matchIds;
          source = "local";
        } else {
          const r = await answerInboxQuestion(env as AiEnv, question, results, uiLang);
          answer = r.answer;
          matches = r.matches;
          source = "ia";
        }
        const related = matches
          .map((n) => results[n - 1])
          .filter(Boolean)
          .map((e) => ({ id: e.id, sender: e.sender, subject: e.subject, summary: e.summary || e.snippet, received_at: e.received_at }));
        return Response.json({ answer, related, source });
      }
      // GET /api/waiting — compromisos reales (espero de otros / esperan de mí)
      if (pathname === "/api/waiting") {
        const db = combinedEnv.DB as GmailEnv["DB"];
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
      // GET /api/risks — radar real (riesgos / oportunidades / silencios)
      if (pathname === "/api/risks") {
        const db = combinedEnv.DB as GmailEnv["DB"];
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
        // Silencios: correos de Cliente más antiguos aún en bandeja
        const silences = results.filter((r) => r.type === "Cliente")
          .sort((a, b) => a.received_at - b.received_at).slice(0, 6).map((r) => ({
            id: r.id, sender: r.sender, subject: r.subject, summary: r.summary, received_at: r.received_at,
          }));
        return Response.json({ risks, opportunities, silences });
      }
      // GET /api/agenda — eventos reales (promesas, urgentes, reclamaciones) con su fecha
      if (pathname === "/api/agenda") {
        const db = combinedEnv.DB as GmailEnv["DB"];
        const { results } = await db.prepare(
          `SELECT id, sender, subject, summary, promise, type, received_at FROM email
           WHERE promise IS NOT NULL OR type IN ('Urgente','Reclamación') ORDER BY received_at DESC LIMIT 40`,
        ).all<{ id: string; sender: string; subject: string; summary: string | null; promise: string | null; type: string | null; received_at: number }>();
        const events = results.map((r) => {
          if (r.promise) {
            return { id: r.id, type: "promise", status: "warn", title: r.promise, source: r.sender, dateMs: r.received_at };
          }
          if (r.type === "Reclamación") {
            return { id: r.id, type: "followup", status: "danger", title: r.summary || r.subject, source: r.sender, dateMs: r.received_at };
          }
          return { id: r.id, type: "followup", status: "warn", title: r.summary || r.subject, source: r.sender, dateMs: r.received_at };
        });
        return Response.json({ events });
      }
      // GET /api/today — briefing real agregado desde D1
      if (pathname === "/api/today") {
        const db = combinedEnv.DB as GmailEnv["DB"];
        const { results } = await db.prepare(
          `SELECT type, tone_warning, promise, sender FROM email`,
        ).all<{ type: string | null; tone_warning: string | null; promise: string | null; sender: string }>();
        const angry = results.filter((r) => r.tone_warning);
        const complaints = results.filter((r) => r.type === "Reclamación");
        const promises = results.filter((r) => r.promise);
        const opportunities = results.filter((r) => r.type === "Comercial");
        const urgent = results.filter((r) => r.type === "Urgente");
        return Response.json({
          total: results.length,
          angry: angry.length,
          angryWho: angry[0]?.sender ?? null,
          complaints: complaints.length,
          promises: promises.length,
          opportunities: opportunities.length,
          urgent: urgent.length,
        });
      }
      // GET /api/contact?email=... — contexto real del remitente desde D1
      if (pathname === "/api/contact") {
        const email = new URL(request.url).searchParams.get("email") ?? "";
        const db = combinedEnv.DB as GmailEnv["DB"];
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
      // GET /api/email/:id — contenido completo
      const emailMatch = pathname.match(/^\/api\/email\/([^/]+)$/);
      if (emailMatch && request.method === "GET") {
        const detail = await getEmailDetail(combinedEnv as GmailEnv, emailMatch[1]);
        if (!detail) return new Response("Not found", { status: 404 });
        return Response.json(detail);
      }

      // POST /api/email/:id/archive|trash|spam|read — acciones individuales
      const actionMatch = pathname.match(/^\/api\/email\/([^/]+)\/(archive|trash|spam|read)$/);
      if (actionMatch && request.method === "POST") {
        const [, msgId, action] = actionMatch;
        const db = combinedEnv.DB as GmailEnv["DB"];
        let ok = false;
        if (action === "archive") ok = await archiveEmail(combinedEnv as GmailEnv, msgId);
        else if (action === "trash") ok = await trashEmail(combinedEnv as GmailEnv, msgId);
        else if (action === "spam") ok = await spamEmail(combinedEnv as GmailEnv, msgId);
        else if (action === "read") ok = await markRead(combinedEnv as GmailEnv, msgId);
        // Elimina de D1 si la acción fue correcta (ya no está en la bandeja)
        if (ok && action !== "read") {
          await db.prepare("DELETE FROM email WHERE id = ?").bind(msgId).run();
        }
        return Response.json({ ok });
      }

      // POST /api/email/bulk — acción en lote sobre varios correos
      if (pathname === "/api/email/bulk" && request.method === "POST") {
        const { ids, action } = await request.json() as { ids: string[]; action: string };
        const db = combinedEnv.DB as GmailEnv["DB"];
        let done = 0;
        for (const id of ids) {
          let ok = false;
          if (action === "archive") ok = await archiveEmail(combinedEnv as GmailEnv, id);
          else if (action === "trash") ok = await trashEmail(combinedEnv as GmailEnv, id);
          else if (action === "spam") ok = await spamEmail(combinedEnv as GmailEnv, id);
          if (ok) { await db.prepare("DELETE FROM email WHERE id = ?").bind(id).run(); done++; }
        }
        return Response.json({ done });
      }

      // POST /api/email/:id/type — corrige manualmente la clasificación
      const typeMatch = pathname.match(/^\/api\/email\/([^/]+)\/type$/);
      if (typeMatch && request.method === "POST") {
        const { type } = await request.json() as { type: string };
        const db = combinedEnv.DB as GmailEnv["DB"];
        await db.prepare("UPDATE email SET type = ? WHERE id = ?").bind(type, typeMatch[1]).run();
        return Response.json({ ok: true });
      }

      // POST /api/email/:id/draft — genera borrador de respuesta con IA
      const draftMatch = pathname.match(/^\/api\/email\/([^/]+)\/draft$/);
      if (draftMatch && request.method === "POST") {
        const { tone, myStyle, lang } = await request.json() as { tone: string; myStyle?: boolean; lang?: string };
        const detail = await getEmailDetail(combinedEnv as GmailEnv, draftMatch[1]);
        if (!detail) return Response.json({ draft: null }, { status: 404 });
        // Cerebro de memoria: recupera historial relevante con este contacto/tema.
        let memory = "";
        try {
          const query = `${detail.from} ${detail.subject} ${detail.bodyText || detail.snippet || ""}`;
          const hits = await recall(combinedEnv as MemoryEnv, query, { topK: 5, excludeId: draftMatch[1] });
          memory = formatMemoryContext(hits, lang === "fr");
        } catch (e) {
          console.error(`[draft.recall] ${e}`);
        }
        const draft = await generateReply(env as AiEnv, {
          subject: detail.subject,
          body: detail.bodyText || detail.snippet || "",
          from: detail.from,
          tone,
          myStyle: !!myStyle,
          memory: memory || undefined,
        });
        return Response.json({ draft, memoryUsed: memory ? memory.split("\n").length : 0 });
      }

      // POST /api/email/:id/reply — enviar respuesta
      const replyMatch = pathname.match(/^\/api\/email\/([^/]+)\/reply$/);
      if (replyMatch && request.method === "POST") {
        const body = await request.json() as { to: string; subject: string; body: string; threadId: string; inReplyTo?: string };
        const ok = await sendReply(combinedEnv as GmailEnv, body);
        return Response.json({ ok });
      }
      if (pathname === "/api/inbox/diagnose" && request.method === "POST") {
        const aiEnv = env as AiEnv;
        const hasKey = !!aiEnv.GEMINI_API_KEY;
        const keyPrefix = aiEnv.GEMINI_API_KEY?.substring(0, 8) ?? "none";
        // Prueba real a Gemini
        let geminiStatus = "not_tested";
        let geminiError = "";
        if (aiEnv.GEMINI_API_KEY) {
          try {
            const r = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent`,
              { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": aiEnv.GEMINI_API_KEY ?? "" },
                body: JSON.stringify({ contents: [{ parts: [{ text: "Di solo: OK" }] }], generationConfig: { maxOutputTokens: 10 } }) }
            );
            geminiStatus = r.ok ? "ok" : `error_${r.status}`;
            if (!r.ok) geminiError = await r.text();
          } catch (e) { geminiStatus = "exception"; geminiError = String(e); }
        }
        // Correos pendientes
        const { results: pending } = await (combinedEnv as GmailEnv).DB.prepare(
          "SELECT COUNT(*) as n FROM email WHERE analyzed_at IS NULL"
        ).all<{ n: number }>();
        return Response.json({ hasKey, keyPrefix, geminiStatus, geminiError, pendingEmails: pending[0]?.n ?? 0 });
      }
      // POST /api/inbox/reset-analysis — marca todos como sin analizar (para re-analizar)
      if (pathname === "/api/inbox/reset-analysis" && request.method === "POST") {
        const db = combinedEnv.DB as GmailEnv["DB"];
        await db.prepare("UPDATE email SET analyzed_at = NULL").run();
        const { results } = await db.prepare("SELECT COUNT(*) as n FROM email").all<{ n: number }>();
        return Response.json({ reset: results[0]?.n ?? 0 });
      }
      if (pathname === "/api/inbox/analyze" && request.method === "POST") {
        const aiEnv = env as AiEnv;
        const db = (combinedEnv as GmailEnv).DB;

        // Trae correos de la BANDEJA sin analizar (los enviados no se analizan)
        const { results: pending } = await db.prepare(
          "SELECT id, sender, subject, snippet FROM email WHERE analyzed_at IS NULL AND (folder = 'inbox' OR folder IS NULL) LIMIT 50",
        ).all<{ id: string; sender: string; subject: string; snippet: string }>();

        if (pending.length === 0) return Response.json({ analyzed: 0, pending: 0 });

        // Procesa en lotes de 8 y guarda cada lote (éxito parcial persiste).
        const BATCH = 8;
        let analyzed = 0;
        const enginesUsed = new Set<string>();
        for (let i = 0; i < pending.length; i += BATCH) {
          const batch = pending.slice(i, i + BATCH);
          const { results, engine } = await analyzeBatch(aiEnv, batch);
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
        // Alimenta la memoria con lo recién analizado (+ enviados pendientes).
        let embedded = 0;
        try {
          embedded = await embedPending(combinedEnv as GmailEnv & MemoryEnv);
        } catch (e) {
          console.error(`[embedPending] ${e}`);
        }
        return Response.json({ analyzed, pending: pending.length, engines: [...enginesUsed], embedded });
      }
      // POST /api/memory/backfill — indexa en la memoria todo el histórico pendiente (manual)
      if (pathname === "/api/memory/backfill" && request.method === "POST") {
        let embedded = 0;
        try {
          embedded = await embedPending(combinedEnv as GmailEnv & MemoryEnv, 200);
        } catch (e) {
          console.error(`[memory/backfill] ${e}`);
        }
        return Response.json({ embedded });
      }
      // GET /api/memory/stats — cuántos correos hay y cuántos ya están en la memoria
      if (pathname === "/api/memory/stats") {
        const db = combinedEnv.DB as GmailEnv["DB"];
        const { results } = await db.prepare(
          "SELECT COUNT(*) AS total, COUNT(embedded_at) AS embedded FROM email",
        ).all<{ total: number; embedded: number }>();
        const row = results[0] ?? { total: 0, embedded: 0 };
        const memEnv = combinedEnv as unknown as MemoryEnv;
        return Response.json({ total: row.total, embedded: row.embedded, enabled: !!memEnv.SUPABASE_URL && !!memEnv.DB });
      }
      return new Response("Not found", { status: 404 });
    }

    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
