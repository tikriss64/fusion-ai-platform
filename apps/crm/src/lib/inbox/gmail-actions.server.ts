// Acciones reales sobre Gmail: archivar, papelera, spam, enviar respuesta.
// Usa gmail.modify (ya concedido en el OAuth) y gmail.send.

import { getAccessToken } from "./gmail-api.server";
import type { GmailEnv } from "./gmail-oauth.server";

// Datos de respaldo (si company_settings está vacío o no se puede leer).
const FALLBACK = {
  trade_name: "VaciadoDePisos.cat",
  legal_name: "ZAFIRO LANCER S.L.",
  tax_id: "B13704903",
  address: "C/ Torreta 8, local 7",
  postal_code: "08810",
  city: "Sant Pere de Ribes",
  province: "Barcelona",
  phone: "688 30 41 43",
  email: "vaciarpisos1978@gmail.com",
  website: "https://vaciadodepisos.cat",
  logo_url: "https://vaciadodepisos.cat/imagenes/logo/logo-vaciadodepisos.jpg",
};

interface CompanySettings {
  trade_name?: string | null; legal_name?: string | null; tax_id?: string | null;
  address?: string | null; postal_code?: string | null; city?: string | null; province?: string | null;
  phone?: string | null; email?: string | null; website?: string | null; logo_url?: string | null;
}

// Lee company_settings una vez por envío (con caché en memoria de 60s).
let _settingsCache: { data: typeof FALLBACK; at: number } | null = null;

async function getCompanySettings(env: GmailEnv & { SUPABASE_URL?: string; SUPABASE_SERVICE_ROLE_KEY?: string }): Promise<typeof FALLBACK> {
  if (_settingsCache && Date.now() - _settingsCache.at < 60_000) return _settingsCache.data;
  let merged = { ...FALLBACK };
  try {
    if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
      const res = await fetch(`${env.SUPABASE_URL}/rest/v1/company_settings?select=*&limit=1`, {
        headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
      });
      if (res.ok) {
        const rows = await res.json() as CompanySettings[];
        const s = rows[0];
        if (s) {
          // Solo sobrescribe los campos que tienen valor real (no vacíos).
          for (const k of Object.keys(FALLBACK) as (keyof typeof FALLBACK)[]) {
            const v = (s as any)[k];
            if (v != null && String(v).trim() !== "") (merged as any)[k] = v;
          }
        }
      }
    }
  } catch { /* usa FALLBACK */ }
  _settingsCache = { data: merged, at: Date.now() };
  return merged;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildSignatureHtml(c: typeof FALLBACK): string {
  const dir = [c.address, [c.postal_code, c.city].filter(Boolean).join(" "), c.province].filter(Boolean).join(", ");
  const web = c.website.replace(/^https?:\/\//, "");
  const logo = c.logo_url
    ? `<td style="padding-right:16px;vertical-align:top;"><img src="${esc(c.logo_url)}" alt="${esc(c.trade_name)}" width="60" height="60" style="border-radius:6px;display:block;"></td>`
    : "";
  return `<br><br><table style="border-top:1px solid #e0e0e0;padding-top:16px;font-family:Arial,sans-serif;font-size:12px;color:#555;max-width:480px;"><tr>${logo}<td style="vertical-align:top;"><div style="font-weight:700;font-size:14px;color:#2B638D;">${esc(c.trade_name)}</div><div style="color:#444;margin:2px 0;">${esc(c.legal_name)}${c.tax_id ? ` &mdash; CIF: ${esc(c.tax_id)}` : ""}</div><div style="color:#666;">${esc(dir)}</div><div style="margin-top:4px;">${c.phone ? `Tel: ${esc(c.phone)}` : ""}${c.email ? ` &nbsp;|&nbsp; <a href="mailto:${esc(c.email)}" style="color:#2B638D;">${esc(c.email)}</a>` : ""}${c.website ? ` &nbsp;|&nbsp; <a href="${esc(c.website)}" style="color:#2B638D;">${esc(web)}</a>` : ""}</div><div style="margin-top:8px;font-size:10px;color:#999;border-top:1px solid #eee;padding-top:6px;">Este mensaje es confidencial y está dirigido exclusivamente a su destinatario. ${esc(c.legal_name)} está inscrita en el Registro Mercantil de Barcelona.</div></td></tr></table>`;
}

function textToHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
}

async function buildHtmlEmail(env: GmailEnv, body: string): Promise<string> {
  const settings = await getCompanySettings(env as any);
  const sig = buildSignatureHtml(settings);
  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;font-size:14px;color:#333;">${textToHtml(body)}${sig}</body></html>`;
}

async function modifyLabels(
  env: GmailEnv,
  messageId: string,
  add: string[],
  remove: string[],
): Promise<boolean> {
  const token = await getAccessToken(env);
  if (!token) return false;
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ addLabelIds: add, removeLabelIds: remove }),
    },
  );
  if (!res.ok) console.error(`[Gmail action] modify ${messageId}: ${res.status}`);
  return res.ok;
}

// Quita de la bandeja (sin borrar).
export async function archiveEmail(env: GmailEnv, messageId: string): Promise<boolean> {
  return modifyLabels(env, messageId, [], ["INBOX"]);
}

// Mueve a la papelera (recuperable 30 días).
export async function trashEmail(env: GmailEnv, messageId: string): Promise<boolean> {
  const token = await getAccessToken(env);
  if (!token) return false;
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/trash`,
    { method: "POST", headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) console.error(`[Gmail action] trash ${messageId}: ${res.status}`);
  return res.ok;
}

// Marca como spam.
export async function spamEmail(env: GmailEnv, messageId: string): Promise<boolean> {
  return modifyLabels(env, messageId, ["SPAM"], ["INBOX"]);
}

// Marca como leído.
export async function markRead(env: GmailEnv, messageId: string): Promise<boolean> {
  return modifyLabels(env, messageId, [], ["UNREAD"]);
}

// Envía una respuesta. threadId y inReplyTo para threading correcto.
// UTF-8 → base64 robusto (sin `unescape`, que no es fiable en Workers).
function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
function base64Url(str: string): string {
  return utf8ToBase64(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
// Codifica el asunto en encoded-word (RFC 2047) si tiene caracteres no ASCII (acentos, etc.).
function encodeSubject(subject: string): string {
  if (/^[\x00-\x7F]*$/.test(subject)) return subject;
  return `=?UTF-8?B?${utf8ToBase64(subject)}?=`;
}

export interface EmailAttachment {
  filename: string;
  mimeType: string;
  base64: string; // contenido del archivo ya en base64 (estándar, no url-safe)
}

// Construye el cuerpo MIME. Si hay adjuntos → multipart/mixed; si no → text/html simple.
function buildMimeBody(headerLines: string[], htmlBody: string, attachments?: EmailAttachment[]): string {
  if (!attachments || attachments.length === 0) {
    const headers = [...headerLines, `MIME-Version: 1.0`, `Content-Type: text/html; charset="UTF-8"`, `Content-Transfer-Encoding: 8bit`]
      .filter(Boolean).join("\r\n");
    return `${headers}\r\n\r\n${htmlBody}`;
  }
  const boundary = `b_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
  const headers = [...headerLines, `MIME-Version: 1.0`, `Content-Type: multipart/mixed; boundary="${boundary}"`]
    .filter(Boolean).join("\r\n");
  let out = `${headers}\r\n\r\n`;
  // Parte 1: cuerpo HTML
  out += `--${boundary}\r\n`;
  out += `Content-Type: text/html; charset="UTF-8"\r\n`;
  out += `Content-Transfer-Encoding: 8bit\r\n\r\n`;
  out += `${htmlBody}\r\n\r\n`;
  // Partes: adjuntos
  for (const att of attachments) {
    const b64 = att.base64.replace(/\s+/g, "");
    const wrapped = b64.replace(/(.{76})/g, "$1\r\n"); // líneas de 76 chars (RFC 2045)
    out += `--${boundary}\r\n`;
    out += `Content-Type: ${att.mimeType}; name="${att.filename}"\r\n`;
    out += `Content-Transfer-Encoding: base64\r\n`;
    out += `Content-Disposition: attachment; filename="${att.filename}"\r\n\r\n`;
    out += `${wrapped}\r\n`;
  }
  out += `--${boundary}--`;
  return out;
}

export async function sendReply(
  env: GmailEnv,
  opts: {
    to: string;
    subject: string;
    body: string;
    threadId: string;
    inReplyTo?: string;
    attachments?: EmailAttachment[];
  },
): Promise<boolean> {
  const token = await getAccessToken(env);
  if (!token) return false;

  const subject = opts.subject.startsWith("Re:") ? opts.subject : `Re: ${opts.subject}`;
  const htmlBody = await buildHtmlEmail(env, opts.body);
  const headerLines = [
    `To: ${opts.to}`,
    `Subject: ${encodeSubject(subject)}`,
    opts.inReplyTo ? `In-Reply-To: ${opts.inReplyTo}` : "",
    opts.inReplyTo ? `References: ${opts.inReplyTo}` : "",
  ];
  const raw = buildMimeBody(headerLines, htmlBody, opts.attachments);
  const encoded = base64Url(raw);

  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: encoded, threadId: opts.threadId }),
  });
  if (!res.ok) console.error(`[Gmail action] send: ${res.status} ${await res.text()}`);
  return res.ok;
}

export async function sendNewEmail(
  env: GmailEnv,
  opts: { to: string; subject: string; body: string; attachments?: EmailAttachment[] },
): Promise<boolean> {
  const token = await getAccessToken(env);
  if (!token) return false;
  const htmlBody = await buildHtmlEmail(env, opts.body);
  const headerLines = [`To: ${opts.to}`, `Subject: ${encodeSubject(opts.subject)}`];
  const raw = buildMimeBody(headerLines, htmlBody, opts.attachments);
  const encoded = base64Url(raw);
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: encoded }),
  });
  if (!res.ok) console.error(`[Gmail action] sendNew: ${res.status} ${await res.text()}`);
  return res.ok;
}
