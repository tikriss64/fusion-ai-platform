import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Returns the current authenticated user's profile, role and tenant.
 * Acts as the user (RLS-scoped). Used as the foundation for all
 * tenant-aware server logic.
 */
export const getCurrentContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    if (profileError) throw profileError;

    const { data: roles, error: rolesError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (rolesError) throw rolesError;

    let tenant = null;
    if (profile?.tenant_id) {
      const { data: tenantData } = await supabase
        .from("tenants")
        .select("*")
        .eq("id", profile.tenant_id)
        .maybeSingle();
      tenant = tenantData;
    }

    return {
      userId,
      profile,
      tenant,
      roles: roles?.map((r) => r.role) ?? [],
      isAdmin: roles?.some((r) => r.role === "admin") ?? false,
    };
  });
