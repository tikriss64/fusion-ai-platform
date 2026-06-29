// Acciones reales sobre Gmail: archivar, papelera, spam, enviar respuesta.
// Usa gmail.modify (ya concedido en el OAuth) y gmail.send.

import { getAccessToken } from "./gmail-api.server";
import type { GmailEnv } from "./gmail-oauth.server";

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

export async function sendReply(
  env: GmailEnv,
  opts: {
    to: string;
    subject: string;
    body: string;
    threadId: string;
    inReplyTo?: string;
  },
): Promise<boolean> {
  const token = await getAccessToken(env);
  if (!token) return false;

  const subject = opts.subject.startsWith("Re:") ? opts.subject : `Re: ${opts.subject}`;
  const headers = [
    `To: ${opts.to}`,
    `Subject: ${encodeSubject(subject)}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset="UTF-8"`,
    `Content-Transfer-Encoding: 8bit`,
    opts.inReplyTo ? `In-Reply-To: ${opts.inReplyTo}` : "",
    opts.inReplyTo ? `References: ${opts.inReplyTo}` : "",
  ]
    .filter(Boolean)
    .join("\r\n");

  const raw = `${headers}\r\n\r\n${opts.body}`;
  const encoded = base64Url(raw);

  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: encoded, threadId: opts.threadId }),
  });
  if (!res.ok) console.error(`[Gmail action] send: ${res.status} ${await res.text()}`);
  return res.ok;
}
