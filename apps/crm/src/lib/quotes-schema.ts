import { z } from "zod";

export const QUOTE_STATUSES = ["borrador", "enviado", "aceptado", "rechazado", "facturado"] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const SERVICE_TYPES = ["vaciado", "limpieza", "retirada_muebles", "mixto"] as const;
export type ServiceType = (typeof SERVICE_TYPES)[number];

export const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  vaciado: "Vaciado",
  limpieza: "Limpieza",
  retirada_muebles: "Retirada de muebles",
  mixto: "Mixto",
};

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  borrador: "Borrador",
  enviado: "Enviado",
  aceptado: "Aceptado",
  rechazado: "Rechazado",
  facturado: "Facturado",
};

const optStr = z.string().trim().max(2000).optional().or(z.literal(""));

export const quoteItemSchema = z.object({
  id: z.string().optional(),
  descripcion: z.string().trim().min(1, "Requerido").max(500),
  cantidad: z.coerce.number().min(0),
  precio_unit: z.coerce.number().min(0),
  iva_aplicable: z.coerce.number().min(0).max(100),
});

export const quoteSchema = z.object({
  is_template: z.boolean(),
  template_name: optStr,
  // Tipo/serie del presupuesto (V/L/P). No es columna de BD: solo sirve para
  // generar el número (V2-26). Se guarda dentro de `numero`.
  tipo: z.enum(["V", "L", "P"]).optional(),
  client_id: z.string().uuid().nullable().optional(),
  fecha: z.string().min(1, "Requerido"),
  valido_hasta: z.string().optional().or(z.literal("")),
  estado: z.enum(QUOTE_STATUSES),
  tipo_servicio: z.enum(SERVICE_TYPES).optional().nullable(),
  dificultad_acceso: optStr,
  notas_operativas: optStr,
  tipo_vivienda: optStr,
  ascensor: z.boolean(),
  planta: optStr,
  parking: z.boolean(),
  urgencia: optStr,
  metros_cuadrados_estimados: z.coerce.number().min(0).optional().nullable(),
  objetos_recuperables: optStr,
  items: z.array(quoteItemSchema).min(1, "Añade al menos una línea"),
}).refine(
  (d) => !d.valido_hasta || !d.fecha || d.valido_hasta >= d.fecha,
  { message: "La fecha de validez no puede ser anterior a la fecha del presupuesto", path: ["valido_hasta"] },
);

export type QuoteFormValues = z.infer<typeof quoteSchema>;
export type QuoteItemFormValues = z.infer<typeof quoteItemSchema>;

export type QuoteRow = {
  id: string;
  user_id: string;
  client_id: string | null;
  numero: string | null;
  is_template: boolean;
  template_name: string | null;
  fecha: string;
  valido_hasta: string | null;
  estado: QuoteStatus;
  subtotal: number;
  iva: number;
  total: number;
  tipo_servicio: ServiceType | null;
  dificultad_acceso: string | null;
  notas_operativas: string | null;
  tipo_vivienda: string | null;
  ascensor: boolean;
  planta: string | null;
  parking: boolean;
  urgencia: string | null;
  metros_cuadrados_estimados: number | null;
  objetos_recuperables: string | null;
  created_at: string;
  updated_at: string;
};

export type QuoteItemRow = {
  id: string;
  quote_id: string;
  descripcion: string;
  cantidad: number;
  precio_unit: number;
  iva_aplicable: number;
  orden: number;
};

export function computeTotals(items: { cantidad: number; precio_unit: number; iva_aplicable: number }[]) {
  let subtotal = 0;
  let iva = 0;
  for (const it of items) {
    const base = Number(it.cantidad) * Number(it.precio_unit);
    subtotal += base;
    iva += base * (Number(it.iva_aplicable) / 100);
  }
  return {
    subtotal: Math.round(subtotal * 100) / 100,
    iva: Math.round(iva * 100) / 100,
    total: Math.round((subtotal + iva) * 100) / 100,
  };
}

// Número de presupuesto con el sistema V/L/P + año (ej. "V2-26"). Como los
// presupuestos no tienen columna serie, se guarda la referencia entera en numero.
export async function nextQuoteRef(supabase: any, tipo: string): Promise<string> {
  const yy = String(new Date().getFullYear()).slice(2);
  const { data } = await supabase
    .from("quotes")
    .select("numero")
    .ilike("numero", `${tipo}%-${yy}`);
  let max = 0;
  for (const r of (data ?? []) as { numero: string | null }[]) {
    const m = /^[A-Za-z]+(\d+)-/.exec(r.numero ?? "");
    if (m) { const n = parseInt(m[1], 10); if (n > max) max = n; }
  }
  return `${tipo}${max + 1}-${yy}`;
}

export async function nextQuoteNumber(supabase: any): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `PRES-${year}-`;
  const { data } = await supabase
    .from("quotes")
    .select("numero")
    .like("numero", `${prefix}%`)
    .order("numero", { ascending: false })
    .limit(1);
  const last = data?.[0]?.numero as string | undefined;
  const seq = last ? parseInt(last.split("-")[2] ?? "0", 10) + 1 : 1;
  return `${prefix}${String(seq).padStart(4, "0")}`;
}