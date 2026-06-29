// Cliente de la API de Gmail (server-only). Refresca el token cuando caduca,
// trae los correos recientes de la bandeja y los guarda en D1.

import type { GmailEnv } from "./gmail-oauth.server";

interface MailAccountRow {
  email: string;
  access_token: string;
  refresh_token: string;
  token_expiry: number;
}

// Devuelve un access_token válido, refrescándolo con el refresh_token si hace falta.
export async function getAccessToken(env: GmailEnv): Promise<string | null> {
  const row = await env.DB.prepare(
    "SELECT email, access_token, refresh_token, token_expiry FROM mail_account WHERE id = 1",
  ).first<MailAccountRow>();
  if (!row) return null;

  const now = Date.now();
  // Aún válido (más de 1 min de margen)
  if (row.token_expiry && row.token_expiry > now + 60_000) {
    return row.access_token;
  }
  // Refrescar
  if (!row.refresh_token || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return row.access_token ?? null;
  }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: row.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { access_token: string; expires_in?: number };
  const expiry = now + (data.expires_in ?? 3600) * 1000;
  await env.DB.prepare("UPDATE mail_account SET access_token = ?, token_expiry = ? WHERE id = 1")
    .bind(data.access_token, expiry)
    .run();
  return data.access_token;
}

interface GmailHeader {
  name: string;
  value: string;
}
interface GmailMessageMeta {
  id: string;
  threadId: string;
  snippet?: string;
  internalDate?: string;
  payload?: { headers?: GmailHeader[] };
}

function header(headers: GmailHeader[] | undefined, name: string): string {
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function parseFrom(from: string): { name: string; email: string } {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(from);
  if (m) return { name: (m[1].trim() || m[2].trim()), email: m[2].trim() };
  const t = from.trim();
  return { name: t, email: t };
}

// Trae los N correos más recientes de la bandeja y los guarda/actualiza en D1.
// Devuelve cuántos se procesaron.
export async function syncRecentEmails(env: GmailEnv, maxResults = 20): Promise<number> {
  const token = await getAccessToken(env);
  if (!token) return 0;
  const auth = { Authorization: `Bearer ${token}` };

  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}&labelIds=INBOX`,
    { headers: auth },
  );
  if (!listRes.ok) return 0;
  const list = (await listRes.json()) as { messages?: { id: string }[] };
  const ids = (list.messages ?? []).map((m) => m.id);
  if (ids.length === 0) return 0;

  const metas = await Promise.all(
    ids.map(async (id) => {
      const r = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
        { headers: auth },
      );
      return r.ok ? ((await r.json()) as GmailMessageMeta) : null;
    }),
  );

  let count = 0;
  for (const meta of metas) {
    if (!meta) continue;
    const from = parseFrom(header(meta.payload?.headers, "From"));
    const subject = header(meta.payload?.headers, "Subject");
    const received = meta.internalDate ? Number(meta.internalDate) : Date.now();
    await env.DB.prepare(
      `INSERT INTO email (id, thread_id, sender, sender_email, subject, snippet, received_at, folder)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'inbox')
       ON CONFLICT(id) DO UPDATE SET
         thread_id=excluded.thread_id,
         sender=excluded.sender,
         sender_email=excluded.sender_email,
         subject=excluded.subject,
         snippet=excluded.snippet,
         received_at=excluded.received_at`,
    )
      .bind(meta.id, meta.threadId, from.name, from.email, subject, meta.snippet ?? "", received)
      .run();
    count++;
  }
  return count;
}

// Sincroniza los correos ENVIADOS (label SENT). Guarda al destinatario (To) como "sender" para mostrarlo.
export async function syncSentEmails(env: GmailEnv, maxResults = 20): Promise<number> {
  const token = await getAccessToken(env);
  if (!token) return 0;
  const auth = { Authorization: `Bearer ${token}` };

  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}&labelIds=SENT`,
    { headers: auth },
  );
  if (!listRes.ok) return 0;
  const list = (await listRes.json()) as { messages?: { id: string }[] };
  const ids = (list.messages ?? []).map((m) => m.id);
  if (ids.length === 0) return 0;

  const metas = await Promise.all(
    ids.map(async (id) => {
      const r = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
        { headers: auth },
      );
      return r.ok ? ((await r.json()) as GmailMessageMeta) : null;
    }),
  );

  let count = 0;
  for (const meta of metas) {
    if (!meta) continue;
    const to = parseFrom(header(meta.payload?.headers, "To"));
    const subject = header(meta.payload?.headers, "Subject");
    const received = meta.internalDate ? Number(meta.internalDate) : Date.now();
    await env.DB.prepare(
      `INSERT INTO email (id, thread_id, sender, sender_email, subject, snippet, received_at, folder, analyzed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'sent', ?)
       ON CONFLICT(id) DO UPDATE SET
         sender=excluded.sender, sender_email=excluded.sender_email,
         subject=excluded.subject, snippet=excluded.snippet, received_at=excluded.received_at, folder='sent'`,
    )
      .bind(meta.id, meta.threadId, to.name, to.email, subject, meta.snippet ?? "", received, Date.now())
      .run();
    count++;
  }
  return count;
}

export interface StoredEmail {
  id: string;
  thread_id: string;
  sender: string;
  sender_email: string;
  subject: string;
  snippet: string;
  received_at: number;
  type: string | null;
  summary: string | null;
  promise: string | null;
  tone_warning: string | null;
  effort: string | null;
  analyzed_at: number | null;
}

export async function listEmails(env: GmailEnv, limit = 50): Promise<StoredEmail[]> {
  const res = await env.DB.prepare(
    `SELECT id, thread_id, sender, sender_email, subject, snippet, received_at,
            type, summary, promise, tone_warning, effort, analyzed_at
     FROM email WHERE folder = 'inbox' OR folder IS NULL ORDER BY received_at DESC LIMIT ?`,
  )
    .bind(limit)
    .all<StoredEmail>();
  return res.results ?? [];
}

export async function listSent(env: GmailEnv, limit = 50): Promise<StoredEmail[]> {
  const res = await env.DB.prepare(
    `SELECT id, thread_id, sender, sender_email, subject, snippet, received_at,
            type, summary, promise, tone_warning, effort, analyzed_at
     FROM email WHERE folder = 'sent' ORDER BY received_at DESC LIMIT ?`,
  )
    .bind(limit)
    .all<StoredEmail>();
  return res.results ?? [];
}
