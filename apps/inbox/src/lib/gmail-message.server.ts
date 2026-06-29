// Obtiene y parsea el contenido completo de un correo de Gmail.
// Maneja mensajes simples y multipart (la mayoría de correos reales).

import { getAccessToken } from "./gmail-api.server";
import type { GmailEnv } from "./gmail-oauth.server";

interface GmailPart {
  mimeType: string;
  body?: { data?: string; size?: number };
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
}

function decodeBase64Url(data: string): string {
  try {
    const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(base64);
    // Decodifica UTF-8 correctamente
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

// Busca recursivamente el mejor contenido en partes multipart.
function extractBody(part: GmailPart): { html: string | null; text: string | null } {
  // Parte simple con contenido
  if (part.mimeType === "text/html" && part.body?.data) {
    return { html: decodeBase64Url(part.body.data), text: null };
  }
  if (part.mimeType === "text/plain" && part.body?.data) {
    return { html: null, text: decodeBase64Url(part.body.data) };
  }
  // Multipart: buscar en las sub-partes
  if (part.parts && part.parts.length > 0) {
    let html: string | null = null;
    let text: string | null = null;
    for (const subPart of part.parts) {
      const sub = extractBody(subPart);
      if (sub.html && !html) html = sub.html;
      if (sub.text && !text) text = sub.text;
    }
    return { html, text };
  }
  return { html: null, text: null };
}

export async function getEmailDetail(env: GmailEnv, messageId: string): Promise<EmailDetail | null> {
  const token = await getAccessToken(env);
  if (!token) return null;

  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) {
    console.error(`[Gmail message] ${res.status}`);
    return null;
  }

  const msg = (await res.json()) as GmailMessage;
  const headers = msg.payload?.headers ?? [];
  const { html, text } = msg.payload ? extractBody(msg.payload) : { html: null, text: null };

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
  };
}
