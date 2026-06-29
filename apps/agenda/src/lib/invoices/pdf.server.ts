// Server-only invoice PDF generation using pdf-lib (pure JS, Worker-safe).
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export interface InvoiceData {
  numeroFactura: string;
  fecha: string; // YYYY-MM-DD
  business: { nombre: string; ciudad?: string | null; logoUrl?: string | null };
  client: { nombre?: string | null; email?: string | null };
  serviceName: string;
  importeNeto: number;
  ivaPorcentaje: number;
  importeIva: number;
  importeTotal: number;
  moneda: string;
}

function fmt(n: number, moneda: string): string {
  return `${n.toFixed(2)} ${moneda}`;
}

async function tryEmbedLogo(pdf: PDFDocument, url?: string | null) {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("png") || url.toLowerCase().endsWith(".png")) return await pdf.embedPng(bytes);
    return await pdf.embedJpg(bytes);
  } catch {
    return null;
  }
}

export async function generateInvoicePdf(data: InvoiceData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]); // A4
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.1, 0.1, 0.12);
  const muted = rgb(0.45, 0.45, 0.5);
  const left = 50;
  let y = 792;

  const logo = await tryEmbedLogo(pdf, data.business.logoUrl);
  if (logo) {
    const scale = Math.min(120 / logo.width, 48 / logo.height);
    page.drawImage(logo, { x: left, y: y - logo.height * scale, width: logo.width * scale, height: logo.height * scale });
  } else {
    page.drawText(data.business.nombre, { x: left, y: y - 8, size: 18, font: bold, color: ink });
  }

  page.drawText("FACTURA", { x: 420, y: y - 4, size: 22, font: bold, color: ink });
  y -= 70;

  page.drawText(data.business.nombre, { x: left, y, size: 11, font: bold, color: ink });
  if (data.business.ciudad) {
    y -= 14;
    page.drawText(data.business.ciudad, { x: left, y, size: 10, font, color: muted });
  }

  // Invoice meta (right)
  let my = 722;
  page.drawText(`Nº factura: ${data.numeroFactura}`, { x: 360, y: my, size: 10, font, color: ink });
  my -= 14;
  page.drawText(`Fecha: ${data.fecha}`, { x: 360, y: my, size: 10, font, color: ink });

  y -= 40;
  page.drawText("Facturar a:", { x: left, y, size: 10, font: bold, color: muted });
  y -= 16;
  page.drawText(data.client.nombre || "Cliente", { x: left, y, size: 11, font, color: ink });
  if (data.client.email) {
    y -= 14;
    page.drawText(data.client.email, { x: left, y, size: 10, font, color: muted });
  }

  // Table
  y -= 40;
  page.drawRectangle({ x: left, y: y - 4, width: 495, height: 24, color: rgb(0.95, 0.95, 0.97) });
  page.drawText("Descripción", { x: left + 10, y: y + 3, size: 10, font: bold, color: ink });
  page.drawText("Importe", { x: 470, y: y + 3, size: 10, font: bold, color: ink });
  y -= 30;
  page.drawText(data.serviceName, { x: left + 10, y, size: 10, font, color: ink });
  page.drawText(fmt(data.importeNeto, data.moneda), { x: 440, y, size: 10, font, color: ink });

  // Totals
  y -= 40;
  const totRows: [string, string][] = [
    ["Base imponible", fmt(data.importeNeto, data.moneda)],
    [`IVA (${data.ivaPorcentaje}%)`, fmt(data.importeIva, data.moneda)],
  ];
  for (const [label, val] of totRows) {
    page.drawText(label, { x: 340, y, size: 10, font, color: muted });
    page.drawText(val, { x: 440, y, size: 10, font, color: ink });
    y -= 18;
  }
  page.drawLine({ start: { x: 340, y: y + 4 }, end: { x: 545, y: y + 4 }, thickness: 1, color: rgb(0.85, 0.85, 0.88) });
  y -= 12;
  page.drawText("TOTAL", { x: 340, y, size: 12, font: bold, color: ink });
  page.drawText(fmt(data.importeTotal, data.moneda), { x: 440, y, size: 12, font: bold, color: ink });

  page.drawText("Gracias por su confianza.", { x: left, y: 60, size: 9, font, color: muted });

  return await pdf.save();
}

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
