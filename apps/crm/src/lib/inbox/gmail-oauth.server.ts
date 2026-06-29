// Manejadores OAuth de Gmail. Server-only (corren en el Worker de Cloudflare).
// Acceden a la base de datos D1 (env.DB) y a los secretos GOOGLE_* (env, vía .dev.vars
// en local / wrangler secrets en producción). El redirect_uri se deriva del origen del
// request, así funciona igual en localhost:8787 y en el dominio de producción.

interface D1Prepared {
  bind(...values: unknown[]): D1Prepared;
  run(): Promise<unknown>;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<{ results: T[] }>;
}
export interface D1Like {
  prepare(query: string): D1Prepared;
}

export interface GmailEnv {
  DB: D1Like;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  [key: string]: unknown;
}

const SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.send",
].join(" ");

function redirectUri(request: Request): string {
  return `${new URL(request.url).origin}/api/gmail/callback`;
}

function redirectTo(origin: string, path: string, extraHeaders?: HeadersInit): Response {
  const headers = new Headers(extraHeaders);
  headers.set("Location", `${origin}${path}`);
  return new Response(null, { status: 302, headers });
}

function randomState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function readCookie(request: Request, name: string): string | undefined {
  const cookie = request.headers.get("Cookie") ?? "";
  return new RegExp(`(?:^|;\\s*)${name}=([^;]+)`).exec(cookie)?.[1];
}

// GET /api/gmail/start → redirige a la pantalla de consentimiento de Google.
export function handleGmailStart(request: Request, env: GmailEnv): Response {
  if (!env.GOOGLE_CLIENT_ID) {
    return new Response("Falta GOOGLE_CLIENT_ID en el servidor.", { status: 500 });
  }
  const state = randomState();
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(request),
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return new Response(null, {
    status: 302,
    headers: {
      Location: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
      "Set-Cookie": `gmail_oauth_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${secure}`,
    },
  });
}

// GET /api/gmail/callback → intercambia el código por tokens y los guarda en D1.
export async function handleGmailCallback(request: Request, env: GmailEnv): Promise<Response> {
  const url = new URL(request.url);
  const origin = url.origin;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (url.searchParams.get("error")) {
    console.error(`[gmail callback] Google devolvió error: ${url.searchParams.get("error")}`);
    return redirectTo(origin, "/settings?gmail=error");
  }
  const savedState = readCookie(request, "gmail_oauth_state");
  if (!code || !state || !savedState || state !== savedState) {
    console.error(`[gmail callback] fallo de state/cookie: code=${!!code} state=${!!state} cookieGuardada=${!!savedState} coinciden=${state === savedState}`);
    return redirectTo(origin, "/settings?gmail=error");
  }
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    console.error("[gmail callback] faltan GOOGLE_CLIENT_ID/SECRET en el servidor");
    return new Response("Faltan credenciales de Google en el servidor.", { status: 500 });
  }
  // Diagnóstico: detecta espacios/BOM invisibles en los secretos de Google (causa
  // conocida de invalid_client) sin exponer el valor — solo longitud y si hay recorte.
  const cid = env.GOOGLE_CLIENT_ID;
  const csec = env.GOOGLE_CLIENT_SECRET;
  console.error(`[gmail callback] redirect_uri=${redirectUri(request)} | client_id len=${cid.length} trimDif=${cid.length - cid.trim().length} | secret len=${csec.length} trimDif=${csec.length - csec.trim().length}`);

  // 1) Código → tokens
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID.trim(),
      client_secret: env.GOOGLE_CLIENT_SECRET.trim(),
      redirect_uri: redirectUri(request),
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) {
    console.error(`[gmail callback] intercambio de token falló HTTP ${tokenRes.status}: ${await tokenRes.text().catch(() => "")}`);
    return redirectTo(origin, "/settings?gmail=error");
  }
  const tokens = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };

  // 2) Email de la cuenta conectada
  let email = "";
  try {
    const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (profileRes.ok) {
      email = ((await profileRes.json()) as { email?: string }).email ?? "";
    }
  } catch {
    /* el email es opcional */
  }

  // 3) Guardar en D1 (fila única id=1). Conserva el refresh_token previo si Google no devuelve uno nuevo.
  const now = Date.now();
  const expiry = now + (tokens.expires_in ?? 3600) * 1000;
  await env.DB.prepare(
    `INSERT INTO mail_account (id, provider, email, access_token, refresh_token, token_expiry, connected_at)
     VALUES (1, 'gmail', ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       provider='gmail',
       email=excluded.email,
       access_token=excluded.access_token,
       refresh_token=COALESCE(excluded.refresh_token, mail_account.refresh_token),
       token_expiry=excluded.token_expiry,
       connected_at=excluded.connected_at`,
  )
    .bind(email, tokens.access_token, tokens.refresh_token ?? null, expiry, now)
    .run();

  return redirectTo(origin, "/settings?gmail=connected", {
    "Set-Cookie": "gmail_oauth_state=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
  });
}

// GET /api/gmail/status → { connected, email, provider }
export async function handleGmailStatus(_request: Request, env: GmailEnv): Promise<Response> {
  const row = await env.DB.prepare(
    "SELECT provider, email FROM mail_account WHERE id = 1",
  ).first<{ provider: string; email: string }>();
  return Response.json({
    connected: !!row,
    provider: row?.provider ?? null,
    email: row?.email ?? null,
  });
}

// POST /api/gmail/disconnect → borra la conexión.
export async function handleGmailDisconnect(_request: Request, env: GmailEnv): Promise<Response> {
  await env.DB.prepare("DELETE FROM mail_account WHERE id = 1").run();
  return Response.json({ connected: false });
}
