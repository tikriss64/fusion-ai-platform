// Auth server-only. Contraseña en D1 (cambiable) + APP_PASSWORD como respaldo permanente.
// Sesión stateless: cookie httpOnly con token HMAC-SHA256 firmado con APP_PASSWORD.
// ANTI-BLOQUEO: la APP_PASSWORD del servidor SIEMPRE es válida, así el usuario nunca
// puede quedarse fuera aunque cambie/olvide el PIN.

import type { D1Like } from "./gmail-oauth.server";

export interface AuthEnv {
  APP_PASSWORD?: string;
  DB?: D1Like;
  [key: string]: unknown;
}

const COOKIE = "ai_inbox_session";
const MAX_AGE = 7 * 24 * 60 * 60; // 7 días en segundos
const PW_SALT = "ai-inbox::pw::v1::";

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hashPw(pw: string): Promise<string> {
  const data = new TextEncoder().encode(PW_SALT + pw);
  return toHex(await crypto.subtle.digest("SHA-256", data));
}

function hexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function getConfig(env: AuthEnv, key: string): Promise<string | null> {
  if (!env.DB) return null;
  try {
    const row = await env.DB.prepare("SELECT value FROM app_config WHERE key = ?").bind(key).first<{ value: string }>();
    return row?.value ?? null;
  } catch {
    return null;
  }
}

async function setConfig(env: AuthEnv, key: string, value: string): Promise<void> {
  if (!env.DB) return;
  await env.DB.prepare(
    "INSERT INTO app_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).bind(key, value).run();
}

// Valida una contraseña: acepta la PIN guardada en D1, el código de recuperación,
// o la APP_PASSWORD del servidor (respaldo permanente anti-bloqueo).
export async function checkPassword(env: AuthEnv, input: string): Promise<boolean> {
  if (!input) return false;
  if (env.APP_PASSWORD && input === env.APP_PASSWORD) return true;
  const h = await hashPw(input);
  const pw = await getConfig(env, "password_hash");
  if (pw && hexEqual(h, pw)) return true;
  const rec = await getConfig(env, "recovery_hash");
  if (rec && hexEqual(h, rec)) return true;
  return false;
}

export async function changePassword(env: AuthEnv, oldPw: string, newPw: string): Promise<{ ok: boolean; error?: string }> {
  if (!(await checkPassword(env, oldPw))) return { ok: false, error: "wrong_old" };
  if (!newPw || newPw.length < 4) return { ok: false, error: "too_short" };
  await setConfig(env, "password_hash", await hashPw(newPw));
  return { ok: true };
}

export async function hasCustomPassword(env: AuthEnv): Promise<boolean> {
  return !!(await getConfig(env, "password_hash"));
}

// Genera un nuevo código de recuperación, guarda su hash y devuelve el código en claro (una vez).
export async function generateRecovery(env: AuthEnv): Promise<string> {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = new Uint32Array(16);
  crypto.getRandomValues(bytes);
  const code = Array.from({ length: 4 }, (_, g) =>
    Array.from({ length: 4 }, (_, i) => alphabet[bytes[g * 4 + i] % alphabet.length]).join(""),
  ).join("-");
  await setConfig(env, "recovery_hash", await hashPw(code));
  return code;
}

async function sign(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false, ["sign"],
  );
  const buf = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function makeToken(password: string): Promise<string> {
  const ts = Date.now().toString();
  return `${ts}.${await sign(ts, password)}`;
}

async function verifyToken(token: string, password: string): Promise<boolean> {
  try {
    const dot = token.indexOf(".");
    if (dot < 1) return false;
    const ts = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    if (Date.now() - Number(ts) > MAX_AGE * 1000) return false;
    const expected = await sign(ts, password);
    if (expected.length !== sig.length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
    return diff === 0;
  } catch { return false; }
}

function getCookie(request: Request): string | null {
  const header = request.headers.get("Cookie") ?? "";
  return new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`).exec(header)?.[1] ?? null;
}

function isHttps(request: Request): boolean {
  return new URL(request.url).protocol === "https:";
}

// Si APP_PASSWORD no está configurada (dev sin .dev.vars), deja pasar todo.
export async function isAuthenticated(request: Request, env: AuthEnv): Promise<boolean> {
  if (!env.APP_PASSWORD) return true;
  const token = getCookie(request);
  if (!token) return false;
  return verifyToken(token, env.APP_PASSWORD);
}

export async function handleLogin(request: Request, env: AuthEnv): Promise<Response> {
  if (!env.APP_PASSWORD) {
    return Response.json({ ok: false, error: "APP_PASSWORD no configurada." }, { status: 500 });
  }
  let password = "";
  try { password = ((await request.json()) as { password?: string }).password ?? ""; }
  catch { return Response.json({ ok: false }, { status: 400 }); }

  if (!(await checkPassword(env, password))) {
    await new Promise((r) => setTimeout(r, 400)); // frena brute-force
    return Response.json({ ok: false, error: "Contraseña incorrecta." }, { status: 401 });
  }
  const token = await makeToken(env.APP_PASSWORD);
  const sec = isHttps(request) ? "; Secure" : "";
  return Response.json({ ok: true }, {
    headers: { "Set-Cookie": `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${MAX_AGE}${sec}` },
  });
}

export function handleLogout(request: Request): Response {
  const sec = isHttps(request) ? "; Secure" : "";
  return Response.json({ ok: true }, {
    headers: { "Set-Cookie": `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${sec}` },
  });
}

export function unauthorized(): Response {
  return new Response(JSON.stringify({ error: "No autorizado" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}
