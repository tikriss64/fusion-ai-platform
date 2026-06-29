import { getAccessToken } from "./gmail-api.server";
import type { GmailEnv } from "./gmail-oauth.server";

interface GmailPart {
  mimeType: string;
  filename?: string;
  body?: { data?: string; size?: number; attachmentId?: string };
  parts?: GmailPart[];
  headers?: { name: string; value: string }[];
}

interface GmailMessage {
  id: string;
  threadId: string;
  snippet?: string;
  internalDate?: string;
  payload?: GmailPart;
}

export interface Attachment {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface EmailDetail {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  fromEmail: string;
  to: string;
  date: string;
  bodyHtml: string | null;
  bodyText: string | null;
  snippet: string;
  attachments: Attachment[];
}

function decodeBase64Url(data: string): string {
  try {
    const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    return "";
  }
}

function getHeader(headers: { name: string; value: string }[] | undefined, name: string): string {
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function extractBody(part: GmailPart): { html: string | null; text: string | null; attachments: Attachment[] } {
  const attachments: Attachment[] = [];

  if (part.mimeType === "text/html" && part.body?.data) {
    return { html: decodeBase64Url(part.body.data), text: null, attachments };
  }
  if (part.mimeType === "text/plain" && part.body?.data) {
    return { html: null, text: decodeBase64Url(part.body.data), attachments };
  }
  // Adjunto real (tiene attachmentId y nombre de archivo)
  if (part.body?.attachmentId && part.filename) {
    attachments.push({
      attachmentId: part.body.attachmentId,
      filename: part.filename,
      mimeType: part.mimeType,
      size: part.body.size ?? 0,
    });
    return { html: null, text: null, attachments };
  }
  if (part.parts && part.parts.length > 0) {
    let html: string | null = null;
    let text: string | null = null;
    for (const subPart of part.parts) {
      const sub = extractBody(subPart);
      if (sub.html && !html) html = sub.html;
      if (sub.text && !text) text = sub.text;
      attachments.push(...sub.attachments);
    }
    return { html, text, attachments };
  }
  return { html: null, text: null, attachments };
}

export async function getEmailDetail(env: GmailEnv, messageId: string): Promise<EmailDetail | null> {
  const token = await getAccessToken(env);
  if (!token) { console.error("[Gmail] sin access_token (getAccessToken devolvió null)"); return null; }

  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) {
    console.error(`[Gmail message] HTTP ${res.status}: ${await res.text().catch(() => "")}`);
    return null;
  }

  const msg = (await res.json()) as GmailMessage;
  const headers = msg.payload?.headers ?? [];
  const { html, text, attachments } = msg.payload
    ? extractBody(msg.payload)
    : { html: null, text: null, attachments: [] };

  const from = getHeader(headers, "From");
  const fromMatch = /^"?([^"<]*?)"?\s*<?([^>]*)>?$/.exec(from.trim());

  return {
    id: msg.id,
    threadId: msg.threadId,
    subject: getHeader(headers, "Subject") || "(sin asunto)",
    from: fromMatch?.[1]?.trim() || from,
    fromEmail: fromMatch?.[2]?.trim() || from,
    to: getHeader(headers, "To"),
    date: getHeader(headers, "Date"),
    bodyHtml: html,
    bodyText: text,
    snippet: msg.snippet ?? "",
    attachments,
  };
}

export async function getAttachment(env: GmailEnv, messageId: string, attachmentId: string): Promise<{ data: string; size: number } | null> {
  const token = await getAccessToken(env);
  if (!token) { console.error("[Gmail] sin access_token (getAccessToken devolvió null)"); return null; }
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachmentId}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return null;
  const json = await res.json() as { data: string; size: number };
  return json;
}
