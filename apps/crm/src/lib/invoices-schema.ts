import { z } from "zod";

export const INVOICE_STATUSES = ["pendiente", "pagada", "parcial", "vencida"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  pendiente: "Pendiente",
  pagada: "Pagada",
  parcial: "Parcial",
  vencida: "Vencida",
};

const optStr = z.string().trim().max(2000).optional().or(z.literal(""));

export const invoiceItemSchema = z.object({
  id: z.string().optional(),
  descripcion: z.string().trim().min(1, "Requerido").max(500),
  cantidad: z.coerce.number().min(0),
  precio_unit: z.coerce.number().min(0),
  iva_aplicable: z.coerce.number().min(0).max(100),
});

export const invoiceSchema = z
  .object({
    client_id: z.string().uuid().nullable().optional(),
    serie: z.string().trim().min(1, "Requerido").max(10),
    fecha_emision: z.string().min(1, "Requerido"),
    vencimiento: z.string().optional().or(z.literal("")),
    estado: z.enum(INVOICE_STATUSES),
    notas_legales: optStr,
    items: z.array(invoiceItemSchema).min(1, "Añade al menos una línea"),
  })
  .refine(
    (d) => !d.vencimiento || !d.fecha_emision || d.vencimiento >= d.fecha_emision,
    { message: "El vencimiento no puede ser anterior a la fecha de emisión", path: ["vencimiento"] },
  );

export type InvoiceFormValues = z.infer<typeof invoiceSchema>;
export type InvoiceItemFormValues = z.infer<typeof invoiceItemSchema>;

export type InvoiceRow = {
  id: string;
  user_id: string;
  quote_id: string | null;
  client_id: string | null;
  serie: string;
  numero: string;
  fecha_emision: string;
  vencimiento: string | null;
  estado: InvoiceStatus;
  subtotal: number;
  iva: number;
  total: number;
  notas_legales: string | null;
  created_at: string;
  updated_at: string;
};

export type InvoiceItemRow = {
  id: string;
  invoice_id: string;
  descripcion: string;
  cantidad: number;
  precio_unit: number;
  iva_aplicable: number;
  orden: number;
};

export type PaymentRow = {
  id: string;
  invoice_id: string;
  user_id: string;
  fecha: string;
  importe: number;
  notas: string | null;
  created_at: string;
};

export const paymentSchema = z.object({
  fecha: z.string().min(1, "Requerido"),
  importe: z.coerce.number().positive("Importe inválido"),
  notas: z.string().trim().max(500).optional().or(z.literal("")),
});
export type PaymentFormValues = z.infer<typeof paymentSchema>;

// Tipos de serie de la empresa (numeración V/L/P + año, estilo "V6-24").
export const INVOICE_SERIES = [
  { value: "V", label: "Venta" },
  { value: "L", label: "Limpieza / Vaciado" },
  { value: "P", label: "Pintura" },
] as const;
export const INVOICE_SERIE_LABELS: Record<string, string> = { V: "Venta", L: "Limpieza / Vaciado", P: "Pintura" };

// Devuelve {serie, numero} para una factura NUEVA continuando la secuencia del
// tipo (V/L/P) en el año actual. Ej.: si existe V1-26, la próxima venta = V2-26.
// Se guarda serie="V2" numero="26" (se muestra "V2-26" con el formato actual).
export async function nextInvoiceRef(supabase: any, tipo: string): Promise<{ serie: string; numero: string }> {
  const yy = String(new Date().getFullYear()).slice(2); // "26"
  const { data } = await supabase
    .from("invoices")
    .select("serie")
    .ilike("serie", `${tipo}%`)
    .eq("numero", yy);
  let max = 0;
  for (const r of (data ?? []) as { serie: string }[]) {
    const n = parseInt(String(r.serie).replace(/^[A-Za-z]+/, ""), 10);
    if (!isNaN(n) && n > max) max = n;
  }
  return { serie: `${tipo}${max + 1}`, numero: yy };
}

export async function nextInvoiceNumber(supabase: any, serie: string): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `${year}-`;
  const { data } = await supabase
    .from("invoices")
    .select("numero")
    .eq("serie", serie)
    .like("numero", `${prefix}%`)
    .order("numero", { ascending: false })
    .limit(1);
  const last = data?.[0]?.numero as string | undefined;
  const seq = last ? parseInt(last.split("-")[1] ?? "0", 10) + 1 : 1;
  return `${prefix}${String(seq).padStart(4, "0")}`;
}

export function computeStatus(total: number, paid: number, vencimiento: string | null, current: InvoiceStatus): InvoiceStatus {
  if (paid >= total - 0.005) return "pagada";
  if (paid > 0) return "parcial";
  if (vencimiento && new Date(vencimiento) < new Date(new Date().toDateString())) return "vencida";
  return current === "pagada" || current === "parcial" ? "pendiente" : current;
}

/**
 * Fuente única de verdad para "factura vencida": no está pagada y o bien ya estaba
 * marcada como vencida, o su fecha de vencimiento ya pasó. Se calcula por FECHA para
 * que todas las pantallas coincidan, sin depender de que un agente actualice el estado.
 */
export function isOverdue(
  estado: string,
  vencimiento: string | null,
  today: string = new Date().toISOString().slice(0, 10),
): boolean {
  if (estado === "pagada") return false;
  if (estado === "vencida") return true;
  return !!vencimiento && vencimiento < today;
}