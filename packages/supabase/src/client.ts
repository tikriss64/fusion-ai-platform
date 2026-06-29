// Fábricas de cliente Supabase compartidas por todas las apps.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types.js";

export type Db = SupabaseClient<Database>;

/** Cliente para el navegador (clave anon, sujeto a RLS). */
export function createBrowserClient(url: string, anonKey: string): Db {
  return createClient<Database>(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
}

/**
 * Cliente para el servidor (Edge Functions / SSR). Con service_role salta RLS:
 * úsalo solo en código de servidor de confianza, nunca en el navegador.
 */
export function createServerClient(url: string, serviceRoleKey: string): Db {
  return createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
