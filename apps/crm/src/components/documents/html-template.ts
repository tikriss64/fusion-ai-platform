import type { InvoiceRow, InvoiceItemRow } from "@/lib/invoices-schema";
import type { QuoteRow, QuoteItemRow } from "@/lib/quotes-schema";
import type { ClientRow } from "@/lib/clients-schema";
import type { CompanySettings } from "@/lib/company-settings-type";
import { SERVICE_TYPE_LABELS } from "@/lib/quotes-schema";
import { formatCurrency } from "@/lib/utils";

function esc(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#222;padding:40px;max-width:820px;margin:auto}
.hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px}
.hdr-logo img{max-height:72px;max-width:180px;object-fit:contain}
.hdr-logo .company-name{font-size:18px;font-weight:700;color:#111}
.hdr-right{text-align:right}
.doc-type{font-size:22px;font-weight:700;color:#111;letter-spacing:-0.5px}
.doc-num{font-family:Courier New,monospace;font-size:13px;color:#555;margin-top:3px}
.doc-meta{font-size:11px;color:#777;margin-top:6px;line-height:1.7}
.badge{display:inline-block;padding:2px 9px;border-radius:99px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;margin-top:4px}
.b-pending{background:#fef3c7;color:#92400e}
.b-paid{background:#d1fae5;color:#065f46}
.b-partial{background:#dbeafe;color:#1e40af}
.b-expired{background:#fee2e2;color:#991b1b}
.b-draft{background:#f3f4f6;color:#6b7280}
.b-sent{background:#dbeafe;color:#1e40af}
.b-accepted{background:#d1fae5;color:#065f46}
.b-rejected{background:#fee2e2;color:#991b1b}
.b-invoiced{background:#ede9fe;color:#5b21b6}
.addrs{display:flex;gap:24px;margin-bottom:24px}
.addr{flex:1;padding:14px 16px;background:#f9fafb;border-radius:6px;border:1px solid #eee}
.addr h3{font-size:9px;text-transform:uppercase;letter-spacing:.6px;color:#9ca3af;margin-bottom:7px;font-weight:700}
.addr p{font-size:12px;line-height:1.8;color:#333}
table{width:100%;border-collapse:collapse;margin-bottom:20px;font-size:12px}
thead th{background:#f3f4f6;padding:8px 10px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.4px;color:#6b7280;font-weight:700;border-bottom:2px solid #e5e7eb}
thead th.r{text-align:right}
tbody td{padding:8px 10px;border-bottom:1px solid #f3f4f6;color:#333;vertical-align:top}
tbody td.r{text-align:right;font-variant-numeric:tabular-nums}
tbody tr:last-child td{border-bottom:none}
.totals{margin-left:auto;width:260px;margin-bottom:20px}
.tot-row{display:flex;justify-content:space-between;padding:4px 0;font-size:13px;color:#555}
.tot-final{border-top:2px solid #111;margin-top:6px;padding-top:8px;font-weight:700;font-size:15px;color:#111}
.bank{background:#eff6ff;border-left:3px solid #3b82f6;padding:10px 14px;border-radius:0 4px 4px 0;font-size:12px;color:#1e40af;margin-bottom:16px}
.bank strong{display:block;margin-bottom:2px;font-size:11px;text-transform:uppercase;letter-spacing:.3px}
.notes{background:#f9fafb;border:1px solid #e5e7eb;border-radius:4px;padding:10px 14px;font-size:12px;color:#6b7280;margin-bottom:16px}
.notes strong{color:#374151}
.svc{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:4px;padding:10px 14px;font-size:12px;color:#166534;margin-bottom:16px}
.footer{margin-top:36px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:10px;color:#9ca3af;text-align:center;line-height:1.8}
.footer .legal{font-weight:700;color:#6b7280;margin-bottom:2px}
`;

function htmlHead(title: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(title)}</title>
<style>${CSS}</style>
</head>
<body>`;
}

function companyBlock(c: CompanySettings | null): string {
  const name = esc(c?.legal_name ?? c?.trade_name ?? "");
  const lines = [
    name ? `<strong>${name}</strong>` : "",
    c?.tax_id ? `NIF/CIF: ${esc(c.tax_id)}` : "",
    esc(c?.address ?? ""),
    [c?.postal_code, c?.city, c?.province].filter(Boolean).map(esc).join(", "),
    esc(c?.country ?? ""),
    c?.phone ? `Tel: ${esc(c.phone)}` : "",
    c?.email ? esc(c.email) : "",
    c?.website ? `<a href="${esc(c.website)}" style="color:#3b82f6">${esc(c.website)}</a>` : "",
  ].filter(Boolean);
  return `<div class="addr"><h3>Emisor</h3><p>${lines.join("<br/>")}</p></div>`;
}

function clientBlock(cl: ClientRow | null): string {
  if (!cl) return `<div class="addr"><h3>Cliente</h3><p style="color:#9ca3af">Sin cliente asignado</p></div>`;
  const lines = [
    `<strong>${esc(cl.nombre)}</strong>`,
    cl.nif_cif ? `NIF/CIF: ${esc(cl.nif_cif)}` : "",
    esc(cl.direccion ?? ""),
    esc(cl.poblacion ?? ""),
    cl.email ? esc(cl.email) : "",
    cl.telefono ? `Tel: ${esc(cl.telefono)}` : "",
  ].filter(Boolean);
  return `<div class="addr"><h3>Cliente</h3><p>${lines.join("<br/>")}</p></div>`;
}

function itemsTable(items: { descripcion: string; cantidad: number; precio_unit: number; iva_aplicable: number }[]): string {
  const rows = items
    .map((it) => {
      const base = Number(it.cantidad) * Number(it.precio_unit);
      return `<tr>
        <td>${esc(it.descripcion)}</td>
        <td class="r">${it.cantidad}</td>
        <td class="r">${formatCurrency(it.precio_unit)}</td>
        <td class="r">${it.iva_aplicable}%</td>
        <td class="r">${formatCurrency(base)}</td>
      </tr>`;
    })
    .join("");
  return `<table>
    <thead><tr>
      <th>Descripción</th>
      <th class="r">Cant.</th>
      <th class="r">P. unit.</th>
      <th class="r">IVA</th>
      <th class="r">Importe</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function totalsBlock(subtotal: number, iva: number, total: number): string {
  return `<div class="totals">
    <div class="tot-row"><span>Subtotal</span><span>${formatCurrency(subtotal)}</span></div>
    <div class="tot-row"><span>IVA</span><span>${formatCurrency(iva)}</span></div>
    <div class="tot-row tot-final"><span>TOTAL</span><span>${formatCurrency(total)}</span></div>
  </div>`;
}

export function generateInvoiceHtml(
  invoice: InvoiceRow & { items: InvoiceItemRow[] },
  client: ClientRow | null,
  company: CompanySettings | null,
): string {
  const title = `Factura ${invoice.serie}-${invoice.numero}`;
  const badgeClass: Record<string, string> = {
    pendiente: "b-pending",
    pagada: "b-paid",
    parcial: "b-partial",
    vencida: "b-expired",
  };
  const statusLabel: Record<string, string> = {
    pendiente: "Pendiente",
    pagada: "Pagada",
    parcial: "Parcial",
    vencida: "Vencida",
  };

  const logoHtml = company?.logo_url
    ? `<div class="hdr-logo"><img src="${esc(company.logo_url)}" alt="Logo"/></div>`
    : `<div class="hdr-logo"><div class="company-name">${esc(company?.trade_name ?? "")}</div></div>`;

  const bankHtml = company?.iban
    ? `<div class="bank">
        <strong>Datos bancarios para el pago</strong>
        ${company.bank_name ? esc(company.bank_name) + " — " : ""}IBAN: ${esc(company.iban)}
      </div>`
    : "";

  const notesHtml = invoice.notas_legales
    ? `<div class="notes"><strong>Notas:</strong> ${esc(invoice.notas_legales)}</div>`
    : "";

  const companyFooter = company
    ? [company.trade_name, company.tax_id, company.email].filter(Boolean).map(esc).join(" · ")
    : "";

  return (
    htmlHead(title) +
    `
<div class="hdr">
  ${logoHtml}
  <div class="hdr-right">
    <div class="doc-type">FACTURA</div>
    <div class="doc-num">${esc(invoice.serie)}-${esc(invoice.numero)}</div>
    <div class="doc-meta">
      Emisión: ${esc(invoice.fecha_emision)}
      ${invoice.vencimiento ? `<br/>Vencimiento: ${esc(invoice.vencimiento)}` : ""}
      <br/><span class="badge ${badgeClass[invoice.estado] ?? ""}">${statusLabel[invoice.estado] ?? invoice.estado}</span>
    </div>
  </div>
</div>

<div class="addrs">${companyBlock(company)}${clientBlock(client)}</div>

${itemsTable(invoice.items)}
${totalsBlock(invoice.subtotal, invoice.iva, invoice.total)}
${bankHtml}
${notesHtml}

<div class="footer">
  <div class="legal">Conservar este documento durante 4 años.</div>
  ${companyFooter ? `<div>${companyFooter}</div>` : ""}
</div>
` +
    `</body></html>`
  );
}

export function generateQuoteHtml(
  quote: QuoteRow & { items: QuoteItemRow[] },
  client: ClientRow | null,
  company: CompanySettings | null,
): string {
  const title = `Presupuesto ${quote.numero ?? ""}`;
  const badgeClass: Record<string, string> = {
    borrador: "b-draft",
    enviado: "b-sent",
    aceptado: "b-accepted",
    rechazado: "b-rejected",
    facturado: "b-invoiced",
  };
  const statusLabel: Record<string, string> = {
    borrador: "Borrador",
    enviado: "Enviado",
    aceptado: "Aceptado",
    rechazado: "Rechazado",
    facturado: "Facturado",
  };

  const logoHtml = company?.logo_url
    ? `<div class="hdr-logo"><img src="${esc(company.logo_url)}" alt="Logo"/></div>`
    : `<div class="hdr-logo"><div class="company-name">${esc(company?.trade_name ?? "")}</div></div>`;

  const svcParts: string[] = [];
  if (quote.tipo_servicio) svcParts.push(`Servicio: <strong>${esc(SERVICE_TYPE_LABELS[quote.tipo_servicio])}</strong>`);
  const propParts = [
    quote.tipo_vivienda ? `Tipo: ${esc(quote.tipo_vivienda)}` : "",
    quote.planta ? `Planta: ${esc(quote.planta)}` : "",
    `Ascensor: ${quote.ascensor ? "Sí" : "No"}`,
    quote.parking ? "Parking: Sí" : "",
    quote.metros_cuadrados_estimados ? `${quote.metros_cuadrados_estimados} m²` : "",
    quote.urgencia ? `Urgencia: ${esc(quote.urgencia)}` : "",
  ].filter(Boolean);
  if (propParts.length) svcParts.push(propParts.join(" · "));
  if (quote.notas_operativas) svcParts.push(esc(quote.notas_operativas));
  const svcHtml = svcParts.length
    ? `<div class="svc">${svcParts.join("<br/>")}</div>`
    : "";

  const companyFooter = company
    ? [company.trade_name, company.tax_id, company.email].filter(Boolean).map(esc).join(" · ")
    : "";

  const legalPhotoNote = `<p style="font-size:11px;color:#9ca3af;margin-top:4px">El prestador podrá tomar fotografías del inmueble antes y después del servicio para documentación interna.</p>`;

  return (
    htmlHead(title) +
    `
<div class="hdr">
  ${logoHtml}
  <div class="hdr-right">
    <div class="doc-type">PRESUPUESTO</div>
    <div class="doc-num">${esc(quote.numero ?? "—")}</div>
    <div class="doc-meta">
      Fecha: ${esc(quote.fecha)}
      ${quote.valido_hasta ? `<br/>Válido hasta: ${esc(quote.valido_hasta)}` : ""}
      <br/><span class="badge ${badgeClass[quote.estado] ?? ""}">${statusLabel[quote.estado] ?? quote.estado}</span>
    </div>
  </div>
</div>

<div class="addrs">${companyBlock(company)}${clientBlock(client)}</div>

${svcHtml}
${itemsTable(quote.items)}
${totalsBlock(quote.subtotal, quote.iva, quote.total)}

<div class="footer">
  ${companyFooter ? `<div>${companyFooter}</div>` : ""}
  ${legalPhotoNote}
</div>
` +
    `</body></html>`
  );
}
