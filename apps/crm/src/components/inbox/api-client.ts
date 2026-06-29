import { supabase } from "@/integrations/supabase/client";

/**
 * fetch para las rutas `/api/*` de la Bandeja IA que adjunta el token de sesión
 * de Supabase (Authorization: Bearer …) cuando hay usuario logueado.
 *
 * - En local el servidor ignora el token (INBOX_REQUIRE_AUTH apagado), así que
 *   adjuntarlo es inofensivo.
 * - Al publicar online (INBOX_REQUIRE_AUTH=true) el servidor exige este token,
 *   de modo que solo el usuario logueado en el CRM puede usar la Bandeja.
 *
 * Nunca lanza por culpa del token: si no hay sesión, hace un fetch normal.
 */
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) {
      const headers = new Headers(init.headers);
      headers.set("Authorization", `Bearer ${token}`);
      init = { ...init, headers };
    }
  } catch {
    // sin sesión disponible → fetch normal
  }
  return fetch(input, init);
}
