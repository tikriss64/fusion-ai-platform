// Server-only logic for the public (no-account) booking flow.
// Uses the admin client because visitors are not authenticated. All access is
// scoped explicitly by tenant slug / magic-link token in the queries below.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendConfirmationEmail, notifyWaitlist } from "@/lib/automations/automations.server";
import { getStripeSecretKey, stripeEnabled } from "@/integrations/stripe/config.server";

const SLOT_STEP_MIN = 15;
const CANCELLED = ["cancelled", "canceled", "cancelada"];

type DayHours = { enabled: boolean; open: string; close: string };
type BusinessHours = Record<string, DayHours>;
type Exception = { type: string; startDate: string; endDate: string };

const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

// ---- timezone helpers -------------------------------------------------------

function tzOffsetMs(timeZone: string, date: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(date);
  const map: Record<string, number> = {};
  for (const p of parts) if (p.type !== "literal") map[p.type] = Number(p.value);
  const asUTC = Date.UTC(map.year, map.month - 1, map.day, map.hour, map.minute, map.second);
  return asUTC - date.getTime();
}

// Wall-clock time in `tz` -> UTC instant.
function zonedToUtc(y: number, mo: number, d: number, h: number, mi: number, tz: string): Date {
  const guess = Date.UTC(y, mo - 1, d, h, mi, 0);
  const offset = tzOffsetMs(tz, new Date(guess));
  return new Date(guess - offset);
}

function parseDate(dateStr: string): { y: number; mo: number; d: number } {
  const [y, mo, d] = dateStr.split("-").map(Number);
  return { y, mo, d };
}

// Weekday index (0=Sun) of a calendar date in a given timezone.
function weekdayKeyOf(dateStr: string, tz: string): string {
  const { y, mo, d } = parseDate(dateStr);
  const noon = zonedToUtc(y, mo, d, 12, 0, tz);
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(noon);
  const idx = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd);
  return WEEKDAY_KEYS[idx];
}

function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function dateInException(dateStr: string, exceptions: Exception[]): boolean {
  return exceptions.some((ex) => ex.startDate <= dateStr && dateStr <= ex.endDate);
}

// ---- queries ----------------------------------------------------------------

export async function getBusinessBySlug(slug: string) {
  const { data: tenant } = await supabaseAdmin
    .from("tenants")
    .select("id, nombre, slug, tipo_negocio, ciudad, zona_horaria, moneda")
    .eq("slug", slug)
    .maybeSingle();
  if (!tenant) return null;

  const [settingsRes, servicesRes, prosRes] = await Promise.all([
    supabaseAdmin.from("settings").select("*").eq("tenant_id", tenant.id).maybeSingle(),
    supabaseAdmin
      .from("services")
      .select("id, nombre, duracion_min, precio, color, buffer_before_min, buffer_after_min")
      .eq("tenant_id", tenant.id)
      .order("created_at"),
    supabaseAdmin
      .from("professionals")
      .select("id, nombre, servicios_asignados, horarios, vacation_mode")
      .eq("tenant_id", tenant.id)
      .order("created_at"),
  ]);

  const settings = settingsRes.data;
  return {
    tenant,
    settings: settings
      ? {
          color_primario: settings.color_primario,
          color_secundario: settings.color_secundario,
          logo_url: settings.logo_url,
          politica_cancelacion_horas: settings.politica_cancelacion_horas,
          politica_cancelacion_penalizacion: settings.politica_cancelacion_penalizacion,
        }
      : null,
    services: servicesRes.data ?? [],
    professionals: prosRes.data ?? [],
    paymentsEnabled: stripeEnabled(),
  };
}

function businessHoursFor(settings: { business_hours?: unknown } | null): BusinessHours {
  return ((settings?.business_hours as BusinessHours) ?? {}) as BusinessHours;
}

// Returns the set of YYYY-MM-DD strings in the given month that are open.
export async function getMonthAvailability(slug: string, year: number, month: number) {
  const { data: tenant } = await supabaseAdmin
    .from("tenants")
    .select("id, zona_horaria")
    .eq("slug", slug)
    .maybeSingle();
  if (!tenant) return { availableDates: [] as string[] };

  const { data: settings } = await supabaseAdmin
    .from("settings")
    .select("business_hours, exceptions")
    .eq("tenant_id", tenant.id)
    .maybeSingle();

  const hours = businessHoursFor(settings);
  const exceptions = (settings?.exceptions as Exception[]) ?? [];
  const tz = tenant.zona_horaria || "Europe/Madrid";

  const daysInMonth = new Date(year, month, 0).getDate();
  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());

  const available: string[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (dateStr < todayStr) continue;
    const wd = weekdayKeyOf(dateStr, tz);
    if (!hours[wd]?.enabled) continue;
    if (dateInException(dateStr, exceptions)) continue;
    available.push(dateStr);
  }
  return { availableDates: available };
}

interface SlotResult {
  iso: string; // UTC instant
  professionalId: string | null;
}

export async function getDaySlots(
  slug: string,
  serviceId: string,
  professionalId: string | null,
  dateStr: string,
): Promise<{ slots: SlotResult[] }> {
  const { data: tenant } = await supabaseAdmin
    .from("tenants")
    .select("id, zona_horaria")
    .eq("slug", slug)
    .maybeSingle();
  if (!tenant) return { slots: [] };
  const tz = tenant.zona_horaria || "Europe/Madrid";

  const [{ data: settings }, { data: service }, { data: pros }] = await Promise.all([
    supabaseAdmin
      .from("settings")
      .select("business_hours, exceptions")
      .eq("tenant_id", tenant.id)
      .maybeSingle(),
    supabaseAdmin
      .from("services")
      .select("id, duracion_min, buffer_before_min, buffer_after_min")
      .eq("id", serviceId)
      .eq("tenant_id", tenant.id)
      .maybeSingle(),
    supabaseAdmin
      .from("professionals")
      .select("id, servicios_asignados, horarios, vacation_mode")
      .eq("tenant_id", tenant.id),
  ]);

  if (!service) return { slots: [] };
  const exceptions = (settings?.exceptions as Exception[]) ?? [];
  if (dateInException(dateStr, exceptions)) return { slots: [] };

  const hours = businessHoursFor(settings);
  const wd = weekdayKeyOf(dateStr, tz);
  const baseHours = hours[wd];
  if (!baseHours?.enabled) return { slots: [] };

  // Candidate professionals: assigned to this service (or all if none assigned),
  // not on vacation. If a specific one was requested, filter to it.
  let candidates = (pros ?? []).filter((p) => !p.vacation_mode);
  candidates = candidates.filter(
    (p) =>
      !Array.isArray(p.servicios_asignados) ||
      p.servicios_asignados.length === 0 ||
      p.servicios_asignados.includes(serviceId),
  );
  if (professionalId) candidates = candidates.filter((p) => p.id === professionalId);

  // If the tenant has no professionals at all, allow booking without one.
  const useNullPro = candidates.length === 0 && !professionalId;
  const considered = useNullPro ? [{ id: null as string | null, horarios: null }] : candidates;
  if (considered.length === 0) return { slots: [] };

  const { y, mo, d } = parseDate(dateStr);
  const duration = service.duracion_min;
  const bufBefore = service.buffer_before_min ?? 0;
  const bufAfter = service.buffer_after_min ?? 0;

  // Existing appointments for the day (any considered professional).
  const dayStart = zonedToUtc(y, mo, d, 0, 0, tz).toISOString();
  const dayEnd = zonedToUtc(y, mo, d, 23, 59, tz).toISOString();
  const { data: appts } = await supabaseAdmin
    .from("appointments")
    .select("profesional_id, hora_inicio, hora_fin, estado")
    .eq("tenant_id", tenant.id)
    .gte("hora_inicio", dayStart)
    .lte("hora_inicio", dayEnd);

  const busy = (appts ?? []).filter((a) => !CANCELLED.includes(a.estado));

  const nowMs = Date.now();

  // Build slots per-professional so each one's individual schedule is respected.
  // slotMap: ISO string → first free professional id (null for no-pro bookings).
  const slotMap = new Map<string, string | null>();

  for (const pro of considered) {
    // If professional has their own schedule, use it; otherwise fall back to business hours.
    const proSchedule = pro.horarios as Record<string, { open: boolean; from: string; to: string }> | null;
    const proDay = proSchedule?.[wd];

    // Professional explicitly has this weekday disabled → skip them for today.
    if (proDay !== undefined && !proDay.open) continue;

    const effectiveOpen = proDay?.open ? proDay.from : baseHours.open;
    const effectiveClose = proDay?.open ? proDay.to : baseHours.close;

    for (let mins = toMinutes(effectiveOpen); mins + duration <= toMinutes(effectiveClose); mins += SLOT_STEP_MIN) {
      const startUtc = zonedToUtc(y, mo, d, Math.floor(mins / 60), mins % 60, tz);
      const startMs = startUtc.getTime();
      if (startMs <= nowMs) continue;
      const endMs = startMs + duration * 60_000;
      const blockStart = startMs - bufBefore * 60_000;
      const blockEnd = endMs + bufAfter * 60_000;

      const conflict = busy.some((a) => {
        if (pro.id && a.profesional_id && a.profesional_id !== pro.id) return false;
        const aStart = new Date(a.hora_inicio).getTime();
        const aEnd = a.hora_fin ? new Date(a.hora_fin).getTime() : aStart + duration * 60_000;
        return blockStart < aEnd && aStart < blockEnd;
      });

      if (!conflict) {
        const iso = startUtc.toISOString();
        if (!slotMap.has(iso)) slotMap.set(iso, pro.id);
      }
    }
  }

  const slots: SlotResult[] = Array.from(slotMap.entries())
    .map(([iso, professionalId]) => ({ iso, professionalId: professionalId ?? null }))
    .sort((a, b) => a.iso.localeCompare(b.iso));

  return { slots };
}

export interface CreateBookingInput {
  slug: string;
  serviceId: string;
  professionalId: string | null;
  startIso: string;
  client: { nombre: string; email: string; telefono?: string };
  intake: Record<string, unknown>;
  rgpdConsent: boolean;
  wantsPayment: boolean;
  origin: string;
}

export async function createBooking(input: CreateBookingInput) {
  const { data: tenant } = await supabaseAdmin
    .from("tenants")
    .select("id, nombre, zona_horaria, moneda")
    .eq("slug", input.slug)
    .maybeSingle();
  if (!tenant) throw new Error("Negocio no encontrado");

  const { data: service } = await supabaseAdmin
    .from("services")
    .select("id, nombre, duracion_min, precio")
    .eq("id", input.serviceId)
    .eq("tenant_id", tenant.id)
    .maybeSingle();
  if (!service) throw new Error("Servicio no encontrado");

  const startMs = new Date(input.startIso).getTime();
  if (Number.isNaN(startMs) || startMs <= Date.now()) throw new Error("Hora no válida");
  const endIso = new Date(startMs + service.duracion_min * 60_000).toISOString();
  const fecha = new Intl.DateTimeFormat("en-CA", { timeZone: tenant.zona_horaria || "Europe/Madrid" }).format(
    new Date(startMs),
  );

  // Upsert client by email within tenant.
  const email = input.client.email.trim().toLowerCase();
  const { data: existing } = await supabaseAdmin
    .from("clients")
    .select("id")
    .eq("tenant_id", tenant.id)
    .eq("email", email)
    .maybeSingle();

  let clientId = existing?.id ?? null;
  if (clientId) {
    await supabaseAdmin
      .from("clients")
      .update({
        nombre: input.client.nombre,
        telefono: input.client.telefono ?? null,
        rgpd_consent: input.rgpdConsent,
        rgpd_consent_date: new Date().toISOString(),
      })
      .eq("id", clientId);
  } else {
    const { data: created, error } = await supabaseAdmin
      .from("clients")
      .insert({
        tenant_id: tenant.id,
        nombre: input.client.nombre,
        email,
        telefono: input.client.telefono ?? null,
        rgpd_consent: input.rgpdConsent,
        rgpd_consent_date: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    clientId = created.id;
  }

  // Build a readable notes summary from the dynamic intake fields.
  const notasLines = Object.entries(input.intake)
    .filter(([, v]) => v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0))
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`);
  const notas = notasLines.join("\n") || null;

  const paying = input.wantsPayment && stripeEnabled() && Number(service.precio) > 0;

  const { data: appointment, error: apptError } = await supabaseAdmin
    .from("appointments")
    .insert({
      tenant_id: tenant.id,
      cliente_id: clientId,
      servicio_id: service.id,
      profesional_id: input.professionalId,
      fecha,
      hora_inicio: input.startIso,
      hora_fin: endIso,
      estado: paying ? "pending" : "confirmed",
      notas,
    })
    .select("id, magic_link_token")
    .single();
  if (apptError) {
    // 23P01 = exclusion_violation -> the slot was taken between availability
    // check and confirmation. First confirmer wins.
    if (apptError.code === "23P01") {
      throw new Error("Ese hueco acaba de ocuparse. Por favor, elige otro horario.");
    }
    throw new Error(apptError.message);
  }

  // Queue notifications for client + business.
  await supabaseAdmin.from("notifications").insert([
    { tenant_id: tenant.id, appointment_id: appointment.id, tipo: "email", estado: "queued" },
    { tenant_id: tenant.id, appointment_id: appointment.id, tipo: "email", estado: "queued" },
  ]);

  let checkoutUrl: string | null = null;
  if (paying) {
    checkoutUrl = await createStripeCheckout({
      amount: Number(service.precio),
      currency: (tenant.moneda || "EUR").toLowerCase(),
      serviceName: service.nombre,
      successUrl: `${input.origin}/my-booking/${appointment.magic_link_token}?paid=1`,
      cancelUrl: `${input.origin}/book/${input.slug}`,
      customerEmail: email,
      appointmentId: appointment.id,
    });

    // 15-minute payment window; the payment-timeouts cron cancels stale ones.
    const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
    const { data: payment } = await supabaseAdmin
      .from("payments")
      .insert({
        tenant_id: tenant.id,
        appointment_id: appointment.id,
        importe: Number(service.precio),
        moneda: tenant.moneda || "EUR",
        estado: "pending",
        expires_at: expiresAt,
      } as never)
      .select("id")
      .single();
    if (payment) {
      await supabaseAdmin.from("appointments").update({ pago_id: payment.id }).eq("id", appointment.id);
    }
  }

  if (!paying) {
    // Confirmed without payment -> fire confirmation email immediately.
    await sendConfirmationEmail(appointment.id);
  }


  return { token: appointment.magic_link_token as string, checkoutUrl };
}

async function createStripeCheckout(args: {
  amount: number;
  currency: string;
  serviceName: string;
  successUrl: string;
  cancelUrl: string;
  customerEmail: string;
  appointmentId: string;
}): Promise<string | null> {
  const key = getStripeSecretKey();
  if (!key) return null;
  const body = new URLSearchParams();
  body.set("mode", "payment");
  body.set("success_url", args.successUrl);
  body.set("cancel_url", args.cancelUrl);
  body.set("customer_email", args.customerEmail);
  body.set("line_items[0][quantity]", "1");
  body.set("line_items[0][price_data][currency]", args.currency);
  body.set("line_items[0][price_data][unit_amount]", String(Math.round(args.amount * 100)));
  body.set("line_items[0][price_data][product_data][name]", args.serviceName);
  body.set("metadata[appointment_id]", args.appointmentId);
  body.set("payment_intent_data[metadata][appointment_id]", args.appointmentId);

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!res.ok) {
    console.error("Stripe checkout error", res.status, await res.text());
    return null;
  }
  const session = (await res.json()) as { url?: string };
  return session.url ?? null;
}

// ---- magic-link management --------------------------------------------------

export async function getBookingByToken(token: string) {
  const { data: appt } = await supabaseAdmin
    .from("appointments")
    .select("id, tenant_id, cliente_id, servicio_id, profesional_id, fecha, hora_inicio, hora_fin, estado, notas")
    .eq("magic_link_token", token)
    .maybeSingle();
  if (!appt) return null;

  const [{ data: tenant }, { data: service }, { data: settings }, { data: client }, { data: pro }] =
    await Promise.all([
      supabaseAdmin
        .from("tenants")
        .select("id, nombre, slug, zona_horaria, moneda, tipo_negocio")
        .eq("id", appt.tenant_id)
        .maybeSingle(),
      supabaseAdmin
        .from("services")
        .select("id, nombre, duracion_min, precio")
        .eq("id", appt.servicio_id ?? "")
        .maybeSingle(),
      supabaseAdmin
        .from("settings")
        .select("politica_cancelacion_horas, politica_cancelacion_penalizacion")
        .eq("tenant_id", appt.tenant_id)
        .maybeSingle(),
      appt.cliente_id
        ? supabaseAdmin.from("clients").select("id, nombre, email").eq("id", appt.cliente_id).maybeSingle()
        : Promise.resolve({ data: null }),
      appt.profesional_id
        ? supabaseAdmin.from("professionals").select("id, nombre").eq("id", appt.profesional_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  // Client history with this business (other appointments, by client id).
  let history: { id: string; fecha: string; hora_inicio: string; estado: string; servicio: string | null }[] = [];
  if (appt.cliente_id) {
    const { data: hist } = await supabaseAdmin
      .from("appointments")
      .select("id, fecha, hora_inicio, estado, servicio_id")
      .eq("tenant_id", appt.tenant_id)
      .eq("cliente_id", appt.cliente_id)
      .neq("id", appt.id)
      .order("hora_inicio", { ascending: false })
      .limit(20);
    const serviceMap = new Map<string, string>();
    if (service) serviceMap.set(service.id, service.nombre);
    const missing = [...new Set((hist ?? []).map((h) => h.servicio_id).filter((s): s is string => !!s))].filter(
      (s) => !serviceMap.has(s),
    );
    if (missing.length) {
      const { data: svs } = await supabaseAdmin.from("services").select("id, nombre").in("id", missing);
      for (const s of svs ?? []) serviceMap.set(s.id, s.nombre);
    }
    history = (hist ?? []).map((h) => ({
      id: h.id,
      fecha: h.fecha,
      hora_inicio: h.hora_inicio,
      estado: h.estado,
      servicio: h.servicio_id ? serviceMap.get(h.servicio_id) ?? null : null,
    }));
  }

  const cancelHours = settings?.politica_cancelacion_horas ?? 24;
  const hoursUntil = (new Date(appt.hora_inicio).getTime() - Date.now()) / 3_600_000;
  const canManage = !CANCELLED.includes(appt.estado) && hoursUntil >= cancelHours;

  return {
    appointment: {
      id: appt.id,
      fecha: appt.fecha,
      hora_inicio: appt.hora_inicio,
      hora_fin: appt.hora_fin,
      estado: appt.estado,
      notas: appt.notas,
    },
    tenant,
    service,
    professional: pro,
    client,
    history,
    policy: {
      cancelHours,
      penalizacion: settings?.politica_cancelacion_penalizacion ?? 0,
      canManage,
    },
  };
}

export async function rescheduleBooking(token: string, startIso: string) {
  const { data: appt } = await supabaseAdmin
    .from("appointments")
    .select("id, tenant_id, servicio_id, estado, hora_inicio")
    .eq("magic_link_token", token)
    .maybeSingle();
  if (!appt) throw new Error("Reserva no encontrada");
  if (CANCELLED.includes(appt.estado)) throw new Error("La reserva está cancelada");

  const { data: settings } = await supabaseAdmin
    .from("settings")
    .select("politica_cancelacion_horas")
    .eq("tenant_id", appt.tenant_id)
    .maybeSingle();
  const cancelHours = settings?.politica_cancelacion_horas ?? 24;
  const hoursUntil = (new Date(appt.hora_inicio).getTime() - Date.now()) / 3_600_000;
  if (hoursUntil < cancelHours) throw new Error("Fuera del plazo permitido para modificar");

  const { data: service } = await supabaseAdmin
    .from("services")
    .select("duracion_min")
    .eq("id", appt.servicio_id ?? "")
    .maybeSingle();
  const duration = service?.duracion_min ?? 60;
  const startMs = new Date(startIso).getTime();
  if (Number.isNaN(startMs) || startMs <= Date.now()) throw new Error("Hora no válida");
  const endIso = new Date(startMs + duration * 60_000).toISOString();

  const { data: tenant } = await supabaseAdmin
    .from("tenants")
    .select("zona_horaria")
    .eq("id", appt.tenant_id)
    .maybeSingle();
  const fecha = new Intl.DateTimeFormat("en-CA", {
    timeZone: tenant?.zona_horaria || "Europe/Madrid",
  }).format(new Date(startMs));

  const { error } = await supabaseAdmin
    .from("appointments")
    .update({ hora_inicio: startIso, hora_fin: endIso, fecha })
    .eq("id", appt.id);
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function cancelBooking(token: string) {
  const { data: appt } = await supabaseAdmin
    .from("appointments")
    .select("id, tenant_id, estado, hora_inicio, servicio_id")
    .eq("magic_link_token", token)
    .maybeSingle();
  if (!appt) throw new Error("Reserva no encontrada");
  if (CANCELLED.includes(appt.estado)) return { ok: true };

  const { data: settings } = await supabaseAdmin
    .from("settings")
    .select("politica_cancelacion_horas")
    .eq("tenant_id", appt.tenant_id)
    .maybeSingle();
  const cancelHours = settings?.politica_cancelacion_horas ?? 24;
  const hoursUntil = (new Date(appt.hora_inicio).getTime() - Date.now()) / 3_600_000;
  if (hoursUntil < cancelHours) throw new Error("Fuera del plazo permitido para cancelar");

  const { error } = await supabaseAdmin
    .from("appointments")
    .update({ estado: "cancelled" })
    .eq("id", appt.id);
  if (error) throw new Error(error.message);

  // Slot freed -> offer it to the first matching person on the waitlist.
  if (appt.servicio_id) {
    await notifyWaitlist(appt.tenant_id, appt.servicio_id).catch((e) =>
      console.error("[waitlist] notify error", e),
    );
  }
  return { ok: true };
}

