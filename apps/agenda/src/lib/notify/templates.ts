// Pure email/SMS body builders. No server-only imports so this is safe anywhere,
// but it is only used from server code.

export interface BrandInfo {
  nombre: string;
  logoUrl?: string | null;
  colorPrimario?: string | null;
}

function wrap(brand: BrandInfo, title: string, bodyHtml: string): string {
  const color = brand.colorPrimario || "#6366f1";
  const logo = brand.logoUrl
    ? `<img src="${brand.logoUrl}" alt="${escapeHtml(brand.nombre)}" style="max-height:48px;margin-bottom:8px" />`
    : `<div style="font-size:20px;font-weight:700;color:${color}">${escapeHtml(brand.nombre)}</div>`;
  return `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#18181b">
    <div style="max-width:560px;margin:0 auto;padding:24px">
      <div style="text-align:center;padding:16px 0">${logo}</div>
      <div style="background:#ffffff;border-radius:12px;padding:28px;border:1px solid #e4e4e7">
        <h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(title)}</h1>
        ${bodyHtml}
      </div>
      <p style="text-align:center;color:#a1a1aa;font-size:12px;margin-top:20px">${escapeHtml(brand.nombre)}</p>
    </div>
  </body></html>`;
}

function button(url: string, label: string, color: string): string {
  return `<a href="${url}" style="display:inline-block;background:${color};color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;margin-top:8px">${escapeHtml(label)}</a>`;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

export interface ApptDetails {
  serviceName: string;
  whenText: string; // already formatted in tenant tz
  professional?: string | null;
  manageUrl: string;
}

export function tplConfirmation(brand: BrandInfo, a: ApptDetails) {
  const color = brand.colorPrimario || "#6366f1";
  return {
    subject: `Reserva confirmada — ${brand.nombre}`,
    html: wrap(
      brand,
      "Tu reserva está confirmada",
      `<p>Hemos confirmado tu cita:</p>
       <ul style="line-height:1.7;padding-left:18px">
         <li><b>Servicio:</b> ${escapeHtml(a.serviceName)}</li>
         <li><b>Fecha y hora:</b> ${escapeHtml(a.whenText)}</li>
         ${a.professional ? `<li><b>Profesional:</b> ${escapeHtml(a.professional)}</li>` : ""}
       </ul>
       <p>Puedes ver o modificar tu reserva aquí:</p>
       ${button(a.manageUrl, "Gestionar mi reserva", color)}`,
    ),
  };
}

export function tplReminder(brand: BrandInfo, a: ApptDetails, hours: number) {
  const color = brand.colorPrimario || "#6366f1";
  return {
    subject: `Recordatorio: tu cita ${hours === 24 ? "mañana" : "en 1 hora"} — ${brand.nombre}`,
    html: wrap(
      brand,
      hours === 24 ? "Tu cita es mañana" : "Tu cita es en 1 hora",
      `<p>Te recordamos tu próxima cita:</p>
       <ul style="line-height:1.7;padding-left:18px">
         <li><b>Servicio:</b> ${escapeHtml(a.serviceName)}</li>
         <li><b>Fecha y hora:</b> ${escapeHtml(a.whenText)}</li>
         ${a.professional ? `<li><b>Profesional:</b> ${escapeHtml(a.professional)}</li>` : ""}
       </ul>
       ${button(a.manageUrl, "Ver mi reserva", color)}`,
    ),
  };
}

export function smsReminder(brand: BrandInfo, a: ApptDetails, hours: number): string {
  return `${brand.nombre}: recordatorio de tu cita de ${a.serviceName} ${
    hours === 24 ? "mañana" : "en 1 hora"
  } (${a.whenText}). Gestiona: ${a.manageUrl}`;
}

export function tplPaymentFailed(brand: BrandInfo, a: ApptDetails) {
  const color = brand.colorPrimario || "#6366f1";
  return {
    subject: `Problema con el pago — ${brand.nombre}`,
    html: wrap(
      brand,
      "No pudimos procesar tu pago",
      `<p>El pago de tu cita de <b>${escapeHtml(a.serviceName)}</b> (${escapeHtml(a.whenText)}) no se completó.</p>
       <p>Puedes intentarlo de nuevo desde tu reserva:</p>
       ${button(a.manageUrl, "Reintentar", color)}`,
    ),
  };
}

export function tplBookingCancelledTimeout(brand: BrandInfo, a: ApptDetails) {
  const color = brand.colorPrimario || "#6366f1";
  return {
    subject: `Reserva cancelada por falta de pago — ${brand.nombre}`,
    html: wrap(
      brand,
      "Tu reserva ha sido cancelada",
      `<p>No recibimos el pago de tu cita de <b>${escapeHtml(a.serviceName)}</b> (${escapeHtml(
        a.whenText,
      )}) a tiempo, por lo que hemos liberado el hueco.</p>
       <p>Si lo deseas, puedes volver a reservar:</p>
       ${button(a.manageUrl, "Reservar de nuevo", color)}`,
    ),
  };
}

export function tplWaitlist(brand: BrandInfo, serviceName: string, confirmUrl: string) {
  const color = brand.colorPrimario || "#6366f1";
  return {
    subject: `¡Hay un hueco disponible! — ${brand.nombre}`,
    html: wrap(
      brand,
      "Se ha liberado un hueco",
      `<p>Estabas en lista de espera para <b>${escapeHtml(serviceName)}</b> y acaba de quedar un hueco libre.</p>
       <p>Resérvalo antes de que otra persona lo haga:</p>
       ${button(confirmUrl, "Reservar ahora", color)}`,
    ),
  };
}

export function tplTrialEnding(brand: BrandInfo, daysLeft: number, plansUrl: string) {
  const color = brand.colorPrimario || "#6366f1";
  return {
    subject: `Tu prueba gratuita termina en ${daysLeft} días — ${brand.nombre}`,
    html: wrap(
      brand,
      "Tu prueba gratuita está por terminar",
      `<p>Tu periodo de prueba de <b>${escapeHtml(brand.nombre)}</b> finaliza en <b>${daysLeft} días</b>.</p>
       <p>Elige un plan para seguir aceptando reservas sin interrupciones:</p>
       ${button(plansUrl, "Elegir un plan", color)}`,
    ),
  };
}
