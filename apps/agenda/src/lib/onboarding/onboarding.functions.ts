import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const TRIAL_DAYS = 14;

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

async function uniqueSlug(base: string): Promise<string> {
  const root = slugify(base) || "negocio";
  let candidate = root;
  for (let i = 0; i < 50; i++) {
    const { data } = await supabaseAdmin
      .from("tenants")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();
    if (!data) return candidate;
    candidate = `${root}-${Math.random().toString(36).slice(2, 6)}`;
  }
  return `${root}-${Date.now().toString(36)}`;
}

/** Reads the current user's tenant + all onboarding-related data. */
export const getOnboardingState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    if (!profile?.tenant_id) {
      return { tenant: null, settings: null, services: [], professionals: [], resources: [] };
    }

    const tenantId = profile.tenant_id;
    const [tenant, settings, services, professionals, resources] = await Promise.all([
      supabase.from("tenants").select("*").eq("id", tenantId).maybeSingle(),
      supabase.from("settings").select("*").eq("tenant_id", tenantId).maybeSingle(),
      supabase.from("services").select("*").eq("tenant_id", tenantId).order("created_at"),
      supabase.from("professionals").select("*").eq("tenant_id", tenantId).order("created_at"),
      supabase.from("resources").select("*").eq("tenant_id", tenantId).order("created_at"),
    ]);

    return {
      tenant: tenant.data,
      settings: settings.data,
      services: services.data ?? [],
      professionals: professionals.data ?? [],
      resources: resources.data ?? [],
    };
  });

const businessSchema = z.object({
  fullName: z.string().trim().max(120).optional(),
  tipoNegocio: z.string().trim().min(1).max(60),
  nombreNegocio: z.string().trim().min(1).max(120),
  ciudad: z.string().trim().max(120).optional().default(""),
  zonaHoraria: z.string().trim().min(1).max(60),
  moneda: z.string().trim().min(1).max(10),
});

/** Step 2 — create (or update) the tenant, settings, admin role and profile link. */
export const saveBusiness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => businessSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("tenant_id")
      .eq("id", userId)
      .maybeSingle();

    let tenantId = profile?.tenant_id ?? null;

    if (tenantId) {
      const { error } = await supabaseAdmin
        .from("tenants")
        .update({
          nombre: data.nombreNegocio,
          tipo_negocio: data.tipoNegocio,
          ciudad: data.ciudad,
          zona_horaria: data.zonaHoraria,
          moneda: data.moneda,
          onboarding_step: 3,
        })
        .eq("id", tenantId);
      if (error) throw new Error(error.message);
    } else {
      const slug = await uniqueSlug(data.nombreNegocio);
      const trialEnds = new Date();
      trialEnds.setDate(trialEnds.getDate() + TRIAL_DAYS);

      const { data: tenant, error } = await supabaseAdmin
        .from("tenants")
        .insert({
          nombre: data.nombreNegocio,
          slug,
          tipo_negocio: data.tipoNegocio,
          ciudad: data.ciudad,
          zona_horaria: data.zonaHoraria,
          moneda: data.moneda,
          plan: "trial",
          trial_ends_at: trialEnds.toISOString(),
          onboarding_step: 3,
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      tenantId = tenant.id;

      await supabaseAdmin.from("profiles").update({ tenant_id: tenantId }).eq("id", userId);
      await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: userId, role: "admin", tenant_id: tenantId });
      await supabaseAdmin.from("settings").insert({ tenant_id: tenantId, idioma: "es" });
    }




    const { data: tenant } = await supabaseAdmin
      .from("tenants")
      .select("*")
      .eq("id", tenantId)
      .single();

    return { tenant };
  });

async function getTenantId(userId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("tenant_id")
    .eq("id", userId)
    .maybeSingle();
  if (!data?.tenant_id) throw new Error("No tenant found for user");
  return data.tenant_id;
}

const servicesSchema = z.object({
  services: z
    .array(
      z.object({
        nombre: z.string().trim().min(1).max(120),
        duracion_min: z.number().int().min(1).max(1440),
        precio: z.number().min(0).max(1000000),
        color: z.string().trim().max(20),
        buffer_before_min: z.number().int().min(0).max(480),
        buffer_after_min: z.number().int().min(0).max(480),
      }),
    )
    .max(100),
});

/** Step 3 — replace tenant services. */
export const saveServices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => servicesSchema.parse(d))
  .handler(async ({ data, context }) => {
    const tenantId = await getTenantId(context.userId);
    await supabaseAdmin.from("services").delete().eq("tenant_id", tenantId);
    if (data.services.length) {
      const { error } = await supabaseAdmin
        .from("services")
        .insert(data.services.map((s) => ({ ...s, tenant_id: tenantId })));
      if (error) throw new Error(error.message);
    }
    await supabaseAdmin.from("tenants").update({ onboarding_step: 4 }).eq("id", tenantId);
    return { ok: true };
  });

const scheduleSchema = z.object({
  businessHours: z.record(z.string(), z.any()),
  exceptions: z.array(z.any()).max(200),
});

/** Step 4 — store business hours and exceptions on settings. */
export const saveSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => scheduleSchema.parse(d))
  .handler(async ({ data, context }) => {
    const tenantId = await getTenantId(context.userId);
    const { error } = await supabaseAdmin
      .from("settings")
      .update({ business_hours: data.businessHours, exceptions: data.exceptions })
      .eq("tenant_id", tenantId);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("tenants").update({ onboarding_step: 5 }).eq("id", tenantId);
    return { ok: true };
  });

const teamSchema = z.object({
  professionals: z
    .array(
      z.object({
        nombre: z.string().trim().min(1).max(120),
        email: z.string().trim().max(255).optional().default(""),
        servicios_asignados: z.array(z.string().uuid()).max(100).default([]),
      }),
    )
    .max(100),
  resources: z
    .array(
      z.object({
        nombre: z.string().trim().min(1).max(120),
        tipo: z.enum(["sala", "equipo"]),
        capacidad: z.number().int().min(1).max(1000).default(1),
      }),
    )
    .max(100),
  complete: z.boolean().default(false),
});

/** Step 5 — replace professionals & resources, optionally finish onboarding. */
export const saveTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => teamSchema.parse(d))
  .handler(async ({ data, context }) => {
    const tenantId = await getTenantId(context.userId);

    await supabaseAdmin.from("professionals").delete().eq("tenant_id", tenantId);
    if (data.professionals.length) {
      const { error } = await supabaseAdmin.from("professionals").insert(
        data.professionals.map((p) => ({
          tenant_id: tenantId,
          nombre: p.nombre,
          email: p.email || null,
          servicios_asignados: p.servicios_asignados,
        })),
      );
      if (error) throw new Error(error.message);
    }

    await supabaseAdmin.from("resources").delete().eq("tenant_id", tenantId);
    if (data.resources.length) {
      const { error } = await supabaseAdmin
        .from("resources")
        .insert(data.resources.map((r) => ({ ...r, tenant_id: tenantId })));
      if (error) throw new Error(error.message);
    }

    if (data.complete) {
      await supabaseAdmin
        .from("tenants")
        .update({ onboarding_completed: true, onboarding_step: 5 })
        .eq("id", tenantId);
    }
    return { ok: true };
  });
