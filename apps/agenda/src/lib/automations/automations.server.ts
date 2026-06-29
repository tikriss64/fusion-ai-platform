// Central server-only automation logic: Stripe event handling, invoice
// creation, reminders, payment timeouts, trial-ending notices and waitlist.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// The generated Supabase types can lag behind freshly-applied migrations
// (new columns/RPCs). This server-only module uses a loosely-typed handle so
// it keeps compiling while types catch up.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db: any = supabaseAdmin;
import { sendEmail, sendSms, smsConfigured } from "@/lib/notify/send.server";
import {
  tplConfirmation,
  tplReminder,
  smsReminder,
  tplPaymentFailed,
  tplBookingCancelledTimeout,
  tplWaitlist,
  tplTrialEnding,
  type BrandInfo,
  type ApptDetails,
} from "@/lib/notify/templates";
import { generateInvoicePdf, toBase64 } from "@/lib/invoices/pdf.server";

const CANCELLED = ["cancelled", "canceled", "cancelada"];

export function appBaseUrl(): string {
  return (
    process.env.APP_BASE_URL ||
    "https://project--c2d1cdae-4be0-45fe-a835-bdfa6b5bf478.lovable.app"
  );
}

function formatWhen(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: tz,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

interface ApptContext {
  appt: { id: string; tenant_id: string; hora_inicio: string; estado: string; magic_link_token: string; cliente_id: string | null; servicio_id: string | null; profesional_id: string | null };
  tenant: { id: string; nombre: string; slug: string; zona_horaria: string; moneda: string; ciudad: string | null };
  settings: { logo_url: string | null; color_primario: string | null; iva_porcentaje: number } | null;
  client: { nombre: string | null; email: string | null } | null;
  service: { nombre: string; precio: number } | null;
  professional: { nombre: string } | null;
}

async function loadApptContext(appointmentId: string): Promise<ApptContext | null> {
  const { data: appt } = await db
    .from("appointments")
    .select("id, tenant_id, hora_inicio, estado, magic_link_token, cliente_id, servicio_id, profesional_id")
    .eq("id", appointmentId)
    .maybeSingle();
  if (!appt) return null;

  const [{ data: tenant }, { data: settings }, { data: client }, { data: service }, { data: professional }] =
    await Promise.all([
      db.from("tenants").select("id, nombre, slug, zona_horaria, moneda, ciudad").eq("id", appt.tenant_id).maybeSingle(),
      db.from("settings").select("logo_url, color_primario, iva_porcentaje").eq("tenant_id", appt.tenant_id).maybeSingle(),
      appt.cliente_id ? db.from("clients").select("nombre, email").eq("id", appt.cliente_id).maybeSingle() : Promise.resolve({ data: null }),
      appt.servicio_id ? db.from("services").select("nombre, precio").eq("id", appt.servicio_id).maybeSingle() : Promise.resolve({ data: null }),
      appt.profesional_id ? db.from("professionals").select("nombre").eq("id", appt.profesional_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
  if (!tenant) return null;
  return { appt, tenant, settings: settings ?? null, client, service, professional };
}

function brandOf(c: ApptContext): BrandInfo {
  return { nombre: c.tenant.nombre, logoUrl: c.settings?.logo_url, colorPrimario: c.settings?.color_primario };
}

function apptDetails(c: ApptContext): ApptDetails {
  return {
    serviceName: c.service?.nombre ?? "Servicio",
    whenText: formatWhen(c.appt.hora_inicio, c.tenant.zona_horaria),
    professional: c.professional?.nombre ?? null,
    manageUrl: `${appBaseUrl()}/my-booking/${c.appt.magic_link_token}`,
  };
}

async function recordNotification(tenantId: string, appointmentId: string | null, kind: string, tipo: "email" | "sms", res: { sent: boolean; error?: string }) {
  await db.from("notifications").insert({
    tenant_id: tenantId,
    appointment_id: appointmentId,
    tipo,
    kind,
    estado: res.sent ? "sent" : "failed",
    sent_at: res.sent ? new Date().toISOString() : null,
    error: res.error ?? null,
  });
}

// ---- Invoice ----------------------------------------------------------------

async function createInvoiceForPayment(paymentId: string): Promise<string | null> {
  const { data: payment } = await db
    .from("payments")
    .select("id, tenant_id, appointment_id, importe, moneda, invoice_pdf_url")
    .eq("id", paymentId)
    .maybeSingle();
  if (!payment) return null;
  if (payment.invoice_pdf_url) return payment.invoice_pdf_url; // already generated

  const ctx = payment.appointment_id ? await loadApptContext(payment.appointment_id) : null;
  const { data: settings } = await db
    .from("settings")
    .select("iva_porcentaje, logo_url")
    .eq("tenant_id", payment.tenant_id)
    .maybeSingle();
  const { data: tenant } = await db
    .from("tenants")
    .select("nombre, ciudad, moneda")
    .eq("id", payment.tenant_id)
    .maybeSingle();
  if (!tenant) return null;

  const iva = Number(settings?.iva_porcentaje ?? 21);
  const total = Number(payment.importe);
  const neto = +(total / (1 + iva / 100)).toFixed(2);
  const importeIva = +(total - neto).toFixed(2);

  const { data: numero } = await db.rpc("next_invoice_number", { _tenant_id: payment.tenant_id });
  const numeroFactura = (numero as string) ?? `${new Date().getFullYear()}-0001`;
  const fecha = new Date().toISOString().slice(0, 10);

  const pdfBytes = await generateInvoicePdf({
    numeroFactura,
    fecha,
    business: { nombre: tenant.nombre, ciudad: tenant.ciudad, logoUrl: settings?.logo_url },
    client: { nombre: ctx?.client?.nombre, email: ctx?.client?.email },
    serviceName: ctx?.service?.nombre ?? "Servicio",
    importeNeto: neto,
    ivaPorcentaje: iva,
    importeIva,
    importeTotal: total,
    moneda: payment.moneda || tenant.moneda || "EUR",
  });

  const path = `${payment.tenant_id}/${numeroFactura.replace(/[^0-9A-Za-z-]/g, "_")}.pdf`;
  const { error: upErr } = await db.storage
    .from("invoices")
    .upload(path, pdfBytes, { contentType: "application/pdf", upsert: true });
  if (upErr) console.error("[invoice] upload error", upErr.message);

  await db.from("invoices").insert({
    tenant_id: payment.tenant_id,
    payment_id: payment.id,
    numero_factura: numeroFactura,
    fecha,
    cliente_nombre: ctx?.client?.nombre ?? null,
    cliente_email: ctx?.client?.email ?? null,
    importe_neto: neto,
    iva_porcentaje: iva,
    importe_iva: importeIva,
    importe_total: total,
    pdf_url: path,
  });
  await db.from("payments").update({ invoice_pdf_url: path }).eq("id", payment.id);

  // Email client with invoice attached.
  if (ctx && ctx.client?.email) {
    const tpl = tplConfirmation(brandOf(ctx), apptDetails(ctx));
    const res = await sendEmail({
      to: ctx.client.email,
      subject: tpl.subject,
      html: tpl.html,
      attachments: [{ filename: `factura-${numeroFactura}.pdf`, content: toBase64(pdfBytes) }],
    });
    await recordNotification(ctx.tenant.id, ctx.appt.id, "confirmation", "email", res);
  }
  return path;
}

// Confirmation email without an invoice (used for free / no-payment bookings).
export async function sendConfirmationEmail(appointmentId: string) {
  const ctx = await loadApptContext(appointmentId);
  if (!ctx || !ctx.client?.email) return;
  if (await alreadySent(appointmentId, "confirmation")) return;
  const tpl = tplConfirmation(brandOf(ctx), apptDetails(ctx));
  const res = await sendEmail({ to: ctx.client.email, subject: tpl.subject, html: tpl.html });
  await recordNotification(ctx.tenant.id, ctx.appt.id, "confirmation", "email", res);
}



export async function handlePaymentSucceeded(intentId: string, appointmentId?: string) {
  // Locate the payment row by intent id, or by appointment id metadata fallback.
  let { data: payment } = await db
    .from("payments")
    .select("id, appointment_id")
    .eq("stripe_payment_intent_id", intentId)
    .maybeSingle();

  if (!payment && appointmentId) {
    const { data: byAppt } = await db
      .from("payments")
      .select("id, appointment_id")
      .eq("appointment_id", appointmentId)
      .maybeSingle();
    payment = byAppt;
    if (payment) await db.from("payments").update({ stripe_payment_intent_id: intentId }).eq("id", payment.id);
  }
  if (!payment) {
    console.warn("[stripe] payment_intent.succeeded with no matching payment", intentId);
    return;
  }

  await db.from("payments").update({ estado: "paid" }).eq("id", payment.id);
  if (payment.appointment_id) {
    await db.from("appointments").update({ estado: "confirmed" }).eq("id", payment.appointment_id);
  }
  await createInvoiceForPayment(payment.id);
}

export async function handlePaymentFailed(intentId: string, appointmentId?: string) {
  let { data: payment } = await db
    .from("payments")
    .select("id, appointment_id, tenant_id")
    .eq("stripe_payment_intent_id", intentId)
    .maybeSingle();
  if (!payment && appointmentId) {
    const { data: byAppt } = await db
      .from("payments")
      .select("id, appointment_id, tenant_id")
      .eq("appointment_id", appointmentId)
      .maybeSingle();
    payment = byAppt;
  }
  if (!payment) return;
  await db.from("payments").update({ estado: "failed" }).eq("id", payment.id);

  if (payment.appointment_id) {
    const ctx = await loadApptContext(payment.appointment_id);
    if (ctx && ctx.client?.email) {
      const tpl = tplPaymentFailed(brandOf(ctx), apptDetails(ctx));
      const res = await sendEmail({ to: ctx.client.email, subject: tpl.subject, html: tpl.html });
      await recordNotification(ctx.tenant.id, ctx.appt.id, "payment_failed", "email", res);
    }
  }
}

const PLAN_BY_AMOUNT: Record<string, "starter" | "pro" | "business"> = {};

export async function handleSubscriptionUpdated(sub: {
  id: string;
  status: string;
  current_period_end?: number;
  metadata?: Record<string, string>;
}) {
  const tenantId = sub.metadata?.tenant_id;
  if (!tenantId) {
    console.warn("[stripe] subscription.updated without tenant_id metadata", sub.id);
    return;
  }
  const plan = (sub.metadata?.plan as "starter" | "pro" | "business") || PLAN_BY_AMOUNT[sub.id] || "starter";
  const statusMap: Record<string, string> = {
    active: "active",
    trialing: "trialing",
    past_due: "past_due",
    canceled: "canceled",
    incomplete: "incomplete",
    unpaid: "past_due",
  };
  const estado = statusMap[sub.status] ?? "active";
  const renewal = sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null;

  const { data: existing } = await db
    .from("subscriptions")
    .select("id")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (existing) {
    await db
      .from("subscriptions")
      .update({ stripe_subscription_id: sub.id, plan, estado, renewal_date: renewal })
      .eq("id", existing.id);
  } else {
    await db
      .from("subscriptions")
      .insert({ tenant_id: tenantId, stripe_subscription_id: sub.id, plan, estado, renewal_date: renewal });
  }
  if (estado === "active" || estado === "trialing") {
    await db.from("tenants").update({ plan }).eq("id", tenantId);
  }
}

export async function handleSubscriptionDeleted(sub: { id: string; metadata?: Record<string, string> }) {
  const { data: row } = await db
    .from("subscriptions")
    .select("id, tenant_id")
    .eq("stripe_subscription_id", sub.id)
    .maybeSingle();
  const tenantId = row?.tenant_id ?? sub.metadata?.tenant_id;
  if (!tenantId) return;
  if (row) {
    await db.from("subscriptions").update({ estado: "canceled", plan: "starter" }).eq("id", row.id);
  }
  // Downgrade to the basic plan (starter) so access is restricted.
  await db.from("tenants").update({ plan: "starter" }).eq("id", tenantId);
}

// ---- Cron: reminders --------------------------------------------------------

async function alreadySent(appointmentId: string, kind: string): Promise<boolean> {
  const { data } = await db
    .from("notifications")
    .select("id")
    .eq("appointment_id", appointmentId)
    .eq("kind", kind)
    .eq("estado", "sent")
    .limit(1);
  return !!data?.length;
}

async function sendReminderFor(appointmentId: string, hours: 24 | 1, smsAllowed: boolean) {
  const kind = hours === 24 ? "reminder_24h" : "reminder_1h";
  if (await alreadySent(appointmentId, kind)) return;
  const ctx = await loadApptContext(appointmentId);
  if (!ctx || CANCELLED.includes(ctx.appt.estado) || ctx.appt.estado === "pending") return;
  if (!ctx.client?.email) return;

  const details = apptDetails(ctx);
  const tpl = tplReminder(brandOf(ctx), details, hours);
  const res = await sendEmail({ to: ctx.client.email, subject: tpl.subject, html: tpl.html });
  await recordNotification(ctx.tenant.id, ctx.appt.id, kind, "email", res);

  if (smsAllowed && smsConfigured()) {
    const { data: client } = await db.from("clients").select("telefono").eq("id", ctx.appt.cliente_id ?? "").maybeSingle();
    if (client?.telefono) {
      const sres = await sendSms(client.telefono, smsReminder(brandOf(ctx), details, hours));
      await recordNotification(ctx.tenant.id, ctx.appt.id, kind, "sms", sres);
    }
  }
}

export async function runReminders(): Promise<{ processed: number }> {
  const now = Date.now();
  // tenants with reminder settings
  const { data: settings } = await db
    .from("settings")
    .select("tenant_id, reminder_24h, reminder_1h, sms_enabled");
  const cfg = new Map<string, { reminder_24h: boolean; reminder_1h: boolean; sms_enabled: boolean }>(
    (settings ?? []).map((s: { tenant_id: string; reminder_24h: boolean; reminder_1h: boolean; sms_enabled: boolean }) => [
      s.tenant_id,
      s,
    ]),
  );

  // Window helper: appointments whose start falls inside [target-7.5m, target+7.5m]
  async function within(targetMs: number) {
    const lo = new Date(targetMs - 7.5 * 60_000).toISOString();
    const hi = new Date(targetMs + 7.5 * 60_000).toISOString();
    const { data } = await db
      .from("appointments")
      .select("id, tenant_id, estado")
      .gte("hora_inicio", lo)
      .lte("hora_inicio", hi)
      .eq("estado", "confirmed");
    return data ?? [];
  }

  let processed = 0;
  const appts24 = await within(now + 24 * 3_600_000);
  for (const a of appts24) {
    const s = cfg.get(a.tenant_id);
    if (!s?.reminder_24h) continue;
    await sendReminderFor(a.id, 24, !!s.sms_enabled);
    processed++;
  }
  const appts1 = await within(now + 1 * 3_600_000);
  for (const a of appts1) {
    const s = cfg.get(a.tenant_id);
    if (!s?.reminder_1h) continue;
    await sendReminderFor(a.id, 1, !!s.sms_enabled);
    processed++;
  }
  return { processed };
}

// ---- Cron: payment timeouts -------------------------------------------------

export async function runPaymentTimeouts(): Promise<{ cancelled: number }> {
  const nowIso = new Date().toISOString();
  const { data: stale } = await db
    .from("payments")
    .select("id, appointment_id, tenant_id")
    .eq("estado", "pending")
    .not("expires_at", "is", null)
    .lt("expires_at", nowIso);

  let cancelled = 0;
  for (const p of stale ?? []) {
    await db.from("payments").update({ estado: "failed" }).eq("id", p.id);
    if (!p.appointment_id) continue;
    const ctx = await loadApptContext(p.appointment_id);
    if (!ctx || CANCELLED.includes(ctx.appt.estado)) continue;
    if (ctx.appt.estado !== "pending") continue; // already confirmed elsewhere

    await db.from("appointments").update({ estado: "cancelled" }).eq("id", p.appointment_id);
    cancelled++;

    if (ctx.client?.email) {
      const tpl = tplBookingCancelledTimeout(brandOf(ctx), {
        ...apptDetails(ctx),
        manageUrl: `${appBaseUrl()}/book/${ctx.tenant.slug}`,
      });
      const res = await sendEmail({ to: ctx.client.email, subject: tpl.subject, html: tpl.html });
      await recordNotification(ctx.tenant.id, ctx.appt.id, "payment_timeout", "email", res);
    }
    // Free slot => offer to waitlist.
    if (ctx.appt.servicio_id) await notifyWaitlist(ctx.tenant.id, ctx.appt.servicio_id);
  }
  return { cancelled };
}

// ---- Cron: trial ending -----------------------------------------------------

export async function runTrialEnding(): Promise<{ notified: number }> {
  const now = Date.now();
  const lo = new Date(now + 3 * 86_400_000 - 12 * 3_600_000).toISOString();
  const hi = new Date(now + 3 * 86_400_000 + 12 * 3_600_000).toISOString();
  const { data: tenants } = await db
    .from("tenants")
    .select("id, nombre, plan, trial_ends_at")
    .eq("plan", "trial")
    .gte("trial_ends_at", lo)
    .lte("trial_ends_at", hi);

  let notified = 0;
  for (const t of tenants ?? []) {
    // dedupe via a notification row (appointment_id null, kind trial_ending)
    const { data: prev } = await db
      .from("notifications")
      .select("id")
      .eq("tenant_id", t.id)
      .eq("kind", "trial_ending")
      .eq("estado", "sent")
      .limit(1);
    if (prev?.length) continue;

    // owner = admin role user's profile email
    const { data: admins } = await db
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");
    const adminIds = (admins ?? []).map((a: { user_id: string }) => a.user_id);
    const { data: owner } = await db
      .from("profiles")
      .select("email")
      .eq("tenant_id", t.id)
      .in("id", adminIds.length ? adminIds : ["00000000-0000-0000-0000-000000000000"])
      .maybeSingle();
    if (!owner?.email) continue;

    const { data: settings } = await db
      .from("settings")
      .select("logo_url, color_primario")
      .eq("tenant_id", t.id)
      .maybeSingle();
    const brand: BrandInfo = { nombre: t.nombre, logoUrl: settings?.logo_url, colorPrimario: settings?.color_primario };
    const daysLeft = Math.max(1, Math.round((new Date(t.trial_ends_at).getTime() - now) / 86_400_000));
    const tpl = tplTrialEnding(brand, daysLeft, `${appBaseUrl()}/dashboard/billing`);
    const res = await sendEmail({ to: owner.email, subject: tpl.subject, html: tpl.html });
    await recordNotification(t.id, null, "trial_ending", "email", res);
    notified++;
  }
  return { notified };
}

// ---- Waitlist ---------------------------------------------------------------

export async function notifyWaitlist(tenantId: string, serviceId: string): Promise<boolean> {
  const { data: entry } = await db
    .from("waitlist")
    .select("id, cliente_email, servicio_id, confirm_token")
    .eq("tenant_id", tenantId)
    .eq("estado", "waiting")
    .or(`servicio_id.eq.${serviceId},servicio_id.is.null`)
    .is("notified_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!entry || !entry.cliente_email) return false;

  const { data: tenant } = await db.from("tenants").select("nombre, slug").eq("id", tenantId).maybeSingle();
  const { data: settings } = await db.from("settings").select("logo_url, color_primario").eq("tenant_id", tenantId).maybeSingle();
  const { data: service } = await db.from("services").select("nombre").eq("id", entry.servicio_id ?? serviceId).maybeSingle();
  if (!tenant) return false;

  const brand: BrandInfo = { nombre: tenant.nombre, logoUrl: settings?.logo_url, colorPrimario: settings?.color_primario };
  const confirmUrl = `${appBaseUrl()}/book/${tenant.slug}?waitlist=${entry.confirm_token}&service=${entry.servicio_id ?? serviceId}`;
  const tpl = tplWaitlist(brand, service?.nombre ?? "tu servicio", confirmUrl);
  const res = await sendEmail({ to: entry.cliente_email, subject: tpl.subject, html: tpl.html });
  await db.from("waitlist").update({ notified_at: new Date().toISOString(), estado: "notified" }).eq("id", entry.id);
  await recordNotification(tenantId, null, "waitlist", "email", res);
  return res.sent;
}
