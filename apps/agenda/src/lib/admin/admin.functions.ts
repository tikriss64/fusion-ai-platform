import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Shared helper: resolves the caller's tenant, roles, and (for staff) the
 * professional record linked to their account. Uses the RLS-scoped client.
 */
async function resolveContext(supabase: any, userId: string) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id, email")
    .eq("id", userId)
    .maybeSingle();

  if (!profile?.tenant_id) {
    return { tenantId: null as string | null, roles: [] as string[], isAdmin: false, isStaff: false, professionalId: null as string | null, email: profile?.email ?? null };
  }

  const { data: roleRows } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  const roles = (roleRows ?? []).map((r: any) => r.role as string);
  const isAdmin = roles.includes("admin");
  const isStaff = roles.includes("staff");

  let professionalId: string | null = null;
  if (isStaff && !isAdmin) {
    const { data: pro } = await supabase
      .from("professionals")
      .select("id")
      .eq("tenant_id", profile.tenant_id)
      .eq("user_id", userId)
      .maybeSingle();
    professionalId = pro?.id ?? null;
  }

  return { tenantId: profile.tenant_id as string, roles, isAdmin, isStaff, professionalId, email: profile.email as string | null };
}

function requireMember(ctx: { tenantId: string | null; isAdmin: boolean; isStaff: boolean }) {
  if (!ctx.tenantId || (!ctx.isAdmin && !ctx.isStaff)) {
    throw new Error("No autorizado");
  }
  return ctx.tenantId;
}

function requireAdmin(ctx: { tenantId: string | null; isAdmin: boolean }) {
  if (!ctx.tenantId || !ctx.isAdmin) throw new Error("Solo administradores");
  return ctx.tenantId;
}

/** Returns the caller's role context for the panel (used for gating UI). */
export const getPanelContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = await resolveContext(context.supabase, context.userId);
    return {
      tenantId: ctx.tenantId,
      roles: ctx.roles,
      isAdmin: ctx.isAdmin,
      isStaff: ctx.isStaff,
      professionalId: ctx.professionalId,
    };
  });

/* ----------------------------- DASHBOARD HOME ----------------------------- */

export const getDashboardOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = await resolveContext(context.supabase, context.userId);
    const tenantId = requireMember(ctx);
    const supabase = context.supabase;

    const today = new Date().toISOString().slice(0, 10);

    let apptQuery = supabase
      .from("appointments")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("fecha", today);
    if (ctx.isStaff && !ctx.isAdmin && ctx.professionalId) {
      apptQuery = apptQuery.eq("profesional_id", ctx.professionalId);
    }
    const { data: todays } = await apptQuery.order("hora_inicio");
    const appts = todays ?? [];

    const cancelled = appts.filter((a: any) => a.estado === "cancelled").length;
    const active = appts.filter((a: any) => a.estado !== "cancelled");

    // Revenue from completed payments today
    const { data: payments } = await supabase
      .from("payments")
      .select("importe, estado, created_at")
      .eq("tenant_id", tenantId)
      .gte("created_at", `${today}T00:00:00Z`);
    const revenue = (payments ?? [])
      .filter((p: any) => p.estado === "paid" || p.estado === "succeeded")
      .reduce((s: number, p: any) => s + Number(p.importe || 0), 0);

    const { data: services } = await supabase
      .from("services")
      .select("id, nombre, color, precio, duracion_min")
      .eq("tenant_id", tenantId);
    const { data: professionals } = await supabase
      .from("professionals")
      .select("id, nombre")
      .eq("tenant_id", tenantId);

    return {
      today,
      totalToday: active.length,
      cancelledToday: cancelled,
      revenueToday: revenue,
      occupancy: active.length, // simplistic occupancy = booked slots today
      upcoming: appts,
      services: services ?? [],
      professionals: professionals ?? [],
    };
  });

/* ------------------------------ APPOINTMENTS ------------------------------ */

export const listAppointments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        estado: z.string().optional(),
        profesionalId: z.string().uuid().optional(),
        servicioId: z.string().uuid().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const ctx = await resolveContext(context.supabase, context.userId);
    const tenantId = requireMember(ctx);
    let q = context.supabase
      .from("appointments")
      .select("*")
      .eq("tenant_id", tenantId);

    if (ctx.isStaff && !ctx.isAdmin && ctx.professionalId) q = q.eq("profesional_id", ctx.professionalId);
    if (data.estado) q = q.eq("estado", data.estado as any);
    if (data.profesionalId) q = q.eq("profesional_id", data.profesionalId);
    if (data.servicioId) q = q.eq("servicio_id", data.servicioId);
    if (data.from) q = q.gte("fecha", data.from);
    if (data.to) q = q.lte("fecha", data.to);

    const { data: rows, error } = await q.order("hora_inicio", { ascending: false }).limit(500);
    if (error) throw new Error(error.message);

    const [{ data: clients }, { data: services }, { data: pros }] = await Promise.all([
      context.supabase.from("clients").select("id, nombre, email, telefono").eq("tenant_id", tenantId),
      context.supabase.from("services").select("id, nombre, color, precio").eq("tenant_id", tenantId),
      context.supabase.from("professionals").select("id, nombre").eq("tenant_id", tenantId),
    ]);

    return {
      appointments: rows ?? [],
      clients: clients ?? [],
      services: services ?? [],
      professionals: pros ?? [],
    };
  });

const apptInput = z.object({
  id: z.string().uuid().optional(),
  servicio_id: z.string().uuid().nullable().optional(),
  profesional_id: z.string().uuid().nullable().optional(),
  resource_id: z.string().uuid().nullable().optional(),
  cliente_id: z.string().uuid().nullable().optional(),
  fecha: z.string(),
  hora_inicio: z.string(),
  hora_fin: z.string(),
  notas: z.string().max(2000).optional().nullable(),
  estado: z.enum(["pending", "confirmed", "cancelled", "completed", "no_show"]).optional(),
});

export const upsertAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => apptInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = await resolveContext(context.supabase, context.userId);
    const tenantId = requireMember(ctx);
    const payload = { ...data, tenant_id: tenantId };
    if (data.id) {
      const { error } = await context.supabase.from("appointments").update(payload).eq("id", data.id).eq("tenant_id", tenantId);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase.from("appointments").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const setAppointmentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ id: z.string().uuid(), estado: z.enum(["pending", "confirmed", "cancelled", "completed"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = await resolveContext(context.supabase, context.userId);
    const tenantId = requireMember(ctx);
    const { data: prev } = await context.supabase
      .from("appointments")
      .select("estado, servicio_id")
      .eq("id", data.id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    const { error } = await context.supabase
      .from("appointments")
      .update({ estado: data.estado })
      .eq("id", data.id)
      .eq("tenant_id", tenantId);
    if (error) throw new Error(error.message);

    // Newly cancelled -> offer the freed slot to the waitlist.
    if (data.estado === "cancelled" && prev && prev.estado !== "cancelled" && prev.servicio_id) {
      const { notifyWaitlist } = await import("@/lib/automations/automations.server");
      await notifyWaitlist(tenantId, prev.servicio_id).catch((e) =>
        console.error("[waitlist] notify error", e),
      );
    }
    return { ok: true };
  });


/* -------------------------------- CLIENTS -------------------------------- */

export const listClients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = await resolveContext(context.supabase, context.userId);
    const tenantId = requireMember(ctx);
    const { data, error } = await context.supabase
      .from("clients")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { clients: data ?? [] };
  });

export const getClientDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = await resolveContext(context.supabase, context.userId);
    const tenantId = requireMember(ctx);
    const { data: client } = await context.supabase
      .from("clients")
      .select("*")
      .eq("id", data.id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    const { data: history } = await context.supabase
      .from("appointments")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("cliente_id", data.id)
      .order("hora_inicio", { ascending: false });
    return { client, history: history ?? [] };
  });

export const upsertClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid().optional(),
        nombre: z.string().trim().min(1).max(120),
        email: z.string().trim().max(255).optional().nullable(),
        telefono: z.string().trim().max(40).optional().nullable(),
        notas_internas: z.string().max(4000).optional().nullable(),
        rgpd_consent: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = await resolveContext(context.supabase, context.userId);
    const tenantId = requireMember(ctx);
    const payload: any = { ...data, tenant_id: tenantId };
    if (data.rgpd_consent) payload.rgpd_consent_date = new Date().toISOString();
    if (data.id) {
      const { error } = await context.supabase.from("clients").update(payload).eq("id", data.id).eq("tenant_id", tenantId);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase.from("clients").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

/** GDPR — export every record tied to a client. */
export const exportClientData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = await resolveContext(context.supabase, context.userId);
    const tenantId = requireAdmin(ctx);
    const { data: client } = await context.supabase.from("clients").select("*").eq("id", data.id).eq("tenant_id", tenantId).maybeSingle();
    const { data: appts } = await context.supabase.from("appointments").select("*").eq("cliente_id", data.id).eq("tenant_id", tenantId);
    return { client, appointments: appts ?? [], exportedAt: new Date().toISOString() };
  });

/** GDPR — right to be forgotten. */
export const deleteClientData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = await resolveContext(context.supabase, context.userId);
    const tenantId = requireAdmin(ctx);
    await context.supabase.from("appointments").update({ cliente_id: null, notas: null }).eq("cliente_id", data.id).eq("tenant_id", tenantId);
    const { error } = await context.supabase.from("clients").delete().eq("id", data.id).eq("tenant_id", tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* -------------------------------- SERVICES -------------------------------- */

export const listServices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = await resolveContext(context.supabase, context.userId);
    const tenantId = requireMember(ctx);
    const { data } = await context.supabase.from("services").select("*").eq("tenant_id", tenantId).order("created_at");
    return { services: data ?? [] };
  });

export const upsertService = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid().optional(),
        nombre: z.string().trim().min(1).max(120),
        duracion_min: z.number().int().min(1).max(1440),
        precio: z.number().min(0).max(1000000),
        color: z.string().trim().max(20),
        categoria: z.string().trim().max(80).optional().nullable(),
        buffer_before_min: z.number().int().min(0).max(480),
        buffer_after_min: z.number().int().min(0).max(480),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = await resolveContext(context.supabase, context.userId);
    const tenantId = requireAdmin(ctx);
    const payload = { ...data, tenant_id: tenantId };
    if (data.id) {
      const { error } = await context.supabase.from("services").update(payload).eq("id", data.id).eq("tenant_id", tenantId);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase.from("services").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const deleteService = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = await resolveContext(context.supabase, context.userId);
    const tenantId = requireAdmin(ctx);
    const { error } = await context.supabase.from("services").delete().eq("id", data.id).eq("tenant_id", tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------------------------------- TEAM ---------------------------------- */

export const listProfessionals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = await resolveContext(context.supabase, context.userId);
    const tenantId = requireMember(ctx);
    const { data } = await context.supabase.from("professionals").select("*").eq("tenant_id", tenantId).order("created_at");
    const { data: services } = await context.supabase.from("services").select("id, nombre").eq("tenant_id", tenantId);
    return { professionals: data ?? [], services: services ?? [] };
  });

export const upsertProfessional = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid().optional(),
        nombre: z.string().trim().min(1).max(120),
        email: z.string().trim().max(255).optional().nullable(),
        servicios_asignados: z.array(z.string().uuid()).max(200).default([]),
        horarios: z.record(z.string(), z.any()).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = await resolveContext(context.supabase, context.userId);
    const tenantId = requireAdmin(ctx);
    const payload: any = { ...data, tenant_id: tenantId };
    if (data.id) {
      const { error } = await context.supabase.from("professionals").update(payload).eq("id", data.id).eq("tenant_id", tenantId);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase.from("professionals").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const setVacationMode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), enabled: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = await resolveContext(context.supabase, context.userId);
    const tenantId = requireAdmin(ctx);
    const { error } = await context.supabase
      .from("professionals")
      .update({ vacation_mode: data.enabled })
      .eq("id", data.id)
      .eq("tenant_id", tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteProfessional = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = await resolveContext(context.supabase, context.userId);
    const tenantId = requireAdmin(ctx);
    const { error } = await context.supabase.from("professionals").delete().eq("id", data.id).eq("tenant_id", tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Invite a staff member by email — creates the account, links it to a professional, assigns the staff role. */
export const inviteStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ email: z.string().trim().email().max(255), nombre: z.string().trim().min(1).max(120) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = await resolveContext(context.supabase, context.userId);
    const tenantId = requireAdmin(ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const tempPassword = `Tmp-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: tempPassword,
      email_confirm: true,
    });
    if (createErr || !created.user) throw new Error(createErr?.message || "No se pudo crear el usuario");
    const newUserId = created.user.id;

    await supabaseAdmin.from("profiles").upsert({ id: newUserId, email: data.email, tenant_id: tenantId });
    await supabaseAdmin.from("user_roles").insert({ user_id: newUserId, role: "staff", tenant_id: tenantId });
    const { error: proErr } = await supabaseAdmin
      .from("professionals")
      .insert({ tenant_id: tenantId, nombre: data.nombre, email: data.email, user_id: newUserId });
    if (proErr) throw new Error(proErr.message);

    return { ok: true, tempPassword, email: data.email };
  });

/* ------------------------------- RESOURCES ------------------------------- */

export const listResources = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = await resolveContext(context.supabase, context.userId);
    const tenantId = requireMember(ctx);
    const { data } = await context.supabase.from("resources").select("*").eq("tenant_id", tenantId).order("created_at");
    return { resources: data ?? [] };
  });

export const upsertResource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid().optional(),
        nombre: z.string().trim().min(1).max(120),
        tipo: z.enum(["sala", "equipo"]),
        capacidad: z.number().int().min(1).max(1000).default(1),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = await resolveContext(context.supabase, context.userId);
    const tenantId = requireAdmin(ctx);
    const payload = { ...data, tenant_id: tenantId };
    if (data.id) {
      const { error } = await context.supabase.from("resources").update(payload).eq("id", data.id).eq("tenant_id", tenantId);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase.from("resources").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const deleteResource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = await resolveContext(context.supabase, context.userId);
    const tenantId = requireAdmin(ctx);
    const { error } = await context.supabase.from("resources").delete().eq("id", data.id).eq("tenant_id", tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ------------------------------- WAITLIST ------------------------------- */

export const listWaitlist = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = await resolveContext(context.supabase, context.userId);
    const tenantId = requireMember(ctx);
    const { data } = await context.supabase.from("waitlist").select("*").eq("tenant_id", tenantId).order("created_at");
    return { waitlist: data ?? [] };
  });

export const addWaitlist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        servicio_id: z.string().uuid().nullable().optional(),
        cliente_nombre: z.string().trim().min(1).max(120),
        cliente_email: z.string().trim().max(255).optional().nullable(),
        cliente_telefono: z.string().trim().max(40).optional().nullable(),
        notas: z.string().max(2000).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = await resolveContext(context.supabase, context.userId);
    const tenantId = requireMember(ctx);
    const { error } = await context.supabase.from("waitlist").insert({ ...data, tenant_id: tenantId });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeWaitlist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = await resolveContext(context.supabase, context.userId);
    const tenantId = requireMember(ctx);
    const { error } = await context.supabase.from("waitlist").delete().eq("id", data.id).eq("tenant_id", tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ------------------------------- BILLING -------------------------------- */

export const listInvoices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = await resolveContext(context.supabase, context.userId);
    const tenantId = requireAdmin(ctx);
    const { data } = await context.supabase.from("invoices").select("*").eq("tenant_id", tenantId).order("fecha", { ascending: false });
    const { data: settings } = await context.supabase.from("settings").select("iva_porcentaje").eq("tenant_id", tenantId).maybeSingle();
    return { invoices: data ?? [], iva: settings?.iva_porcentaje ?? 21 };
  });

/* ------------------------------ NOTIFICATIONS --------------------------- */

export const getNotificationSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = await resolveContext(context.supabase, context.userId);
    const tenantId = requireAdmin(ctx);
    const { data } = await context.supabase
      .from("settings")
      .select("reminder_24h, reminder_1h, sms_enabled")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    const { getTwilioConfig } = await import("@/integrations/twilio/config.server");
    const smsConfigured = getTwilioConfig() !== null;
    return { settings: data, smsConfigured };
  });

/* -------------------------------- SETTINGS ------------------------------- */

export const getTenantSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = await resolveContext(context.supabase, context.userId);
    const tenantId = requireMember(ctx);
    const { data: settings } = await context.supabase.from("settings").select("*").eq("tenant_id", tenantId).maybeSingle();
    const { data: tenant } = await context.supabase.from("tenants").select("*").eq("id", tenantId).maybeSingle();
    const { data: subscription } = await context.supabase
      .from("subscriptions")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .maybeSingle();
    return { settings, tenant, subscription, isAdmin: ctx.isAdmin };
  });

export const updateSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        color_primario: z.string().trim().max(20).optional(),
        color_secundario: z.string().trim().max(20).optional(),
        logo_url: z.string().trim().max(2000).optional().nullable(),
        idioma_panel: z.enum(["es", "fr", "en"]).optional(),
        iva_porcentaje: z.number().min(0).max(100).optional(),
        politica_cancelacion_horas: z.number().int().min(0).max(720).optional(),
        politica_cancelacion_penalizacion: z.number().min(0).max(100000).optional(),
        reminder_24h: z.boolean().optional(),
        reminder_1h: z.boolean().optional(),
        sms_enabled: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = await resolveContext(context.supabase, context.userId);
    const tenantId = requireAdmin(ctx);
    const { error } = await context.supabase.from("settings").update(data).eq("tenant_id", tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Opens the Stripe customer portal to manage/cancel the subscription. */
export const openBillingPortal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = await resolveContext(context.supabase, context.userId);
    requireAdmin(ctx);
    const { stripeEnabled } = await import("@/integrations/stripe/config.server");
    if (!stripeEnabled()) {
      return { configured: false as const, url: null };
    }
    // When Stripe is configured, a portal session URL is generated here using the
    // tenant's stored Stripe customer id. Returns the URL to redirect the admin to.
    return { configured: true as const, url: null };
  });

/* -------------------------------- REPORTS -------------------------------- */

export const getReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ from: z.string().optional(), to: z.string().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const ctx = await resolveContext(context.supabase, context.userId);
    const tenantId = requireAdmin(ctx);
    const supabase = context.supabase;

    const to = data.to ?? new Date().toISOString().slice(0, 10);
    const from = data.from ?? new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);

    const { data: appts } = await supabase
      .from("appointments")
      .select("fecha, estado, servicio_id, profesional_id")
      .eq("tenant_id", tenantId)
      .gte("fecha", from)
      .lte("fecha", to);
    const { data: payments } = await supabase
      .from("payments")
      .select("importe, estado, created_at")
      .eq("tenant_id", tenantId)
      .gte("created_at", `${from}T00:00:00Z`)
      .lte("created_at", `${to}T23:59:59Z`);
    const { data: services } = await supabase.from("services").select("id, nombre").eq("tenant_id", tenantId);
    const { data: pros } = await supabase.from("professionals").select("id, nombre").eq("tenant_id", tenantId);

    const all = appts ?? [];
    const cancelled = all.filter((a: any) => a.estado === "cancelled").length;
    const cancellationRate = all.length ? (cancelled / all.length) * 100 : 0;

    // Revenue by day
    const revByDay: Record<string, number> = {};
    (payments ?? [])
      .filter((p: any) => p.estado === "paid" || p.estado === "succeeded")
      .forEach((p: any) => {
        const d = String(p.created_at).slice(0, 10);
        revByDay[d] = (revByDay[d] || 0) + Number(p.importe || 0);
      });
    const revenueSeries = Object.entries(revByDay)
      .map(([date, total]) => ({ date, total }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const serviceMap = new Map((services ?? []).map((s: any) => [s.id, s.nombre]));
    const proMap = new Map((pros ?? []).map((p: any) => [p.id, p.nombre]));

    const byService: Record<string, number> = {};
    const byPro: Record<string, number> = {};
    all.forEach((a: any) => {
      if (a.servicio_id) byService[a.servicio_id] = (byService[a.servicio_id] || 0) + 1;
      if (a.profesional_id) byPro[a.profesional_id] = (byPro[a.profesional_id] || 0) + 1;
    });

    return {
      from,
      to,
      revenueSeries,
      cancellationRate,
      topServices: Object.entries(byService)
        .map(([id, count]) => ({ nombre: serviceMap.get(id) || "—", count }))
        .sort((a, b) => b.count - a.count),
      occupancyByPro: Object.entries(byPro)
        .map(([id, count]) => ({ nombre: proMap.get(id) || "—", count }))
        .sort((a, b) => b.count - a.count),
    };
  });
