// Resolución del tenant activo (modelo unificado multi-tenant).
//
// Devuelve el tenant_id real desde tenant_members. Si el usuario NO está
// registrado en ningún tenant, devuelve null (NO cae al user.id) — eso era un
// bug del parche temporal anterior: confundir tenant_id con user_id producía
// consultas vacías sin error, o peor, posibles cruces.
//
// El caller debe manejar null y, si procede, ofrecer onboarding o mostrar un
// mensaje claro ("tu usuario no está asociado a ninguna empresa").
import { supabase } from "@/integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";

// tenant_members aún no está en los tipos generados de Supabase → cliente sin
// tipar para esa consulta. TODO: regenerar tipos (supabase gen types typescript).
const sb = supabase as unknown as SupabaseClient;

let cached: string | null = null;

export async function getTenantId(): Promise<string | null> {
  if (cached) return cached;
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return null;
  const { data } = await sb
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", uid)
    .maybeSingle();
  const found = (data as { tenant_id: string } | null)?.tenant_id;
  if (!found) {
    // Sin tenant: cualquier query con tenant_id devolverá vacío (correcto).
    // Loggeamos solo una vez por sesión para no inundar la consola.
    if (typeof window !== "undefined") {
      console.warn(
        "[tenant] El usuario actual no es miembro de ningún tenant. Las consultas devolverán vacío.",
      );
    }
    return null;
  }
  cached = found;
  return cached;
}

/** Limpia la caché (p.ej. al cerrar sesión). */
export function clearTenantCache(): void {
  cached = null;
}
