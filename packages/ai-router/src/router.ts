// Nivel 0 — Resolución DETERMINISTA (0 tokens).
// Combina reglas guardadas en la DB (editables) con parsers locales rápidos
// portados del command router del CRM.
import type { SupabaseClient } from "@supabase/supabase-js";

/** Consulta las reglas de la DB para un tipo dado. Devuelve el resultado o null. */
export async function matchRule(
  sb: SupabaseClient,
  tenantId: string,
  kind: "intent" | "classification" | "urgency" | "service_type" | "spam",
  text: string,
): Promise<Record<string, unknown> | null> {
  const { data } = await sb.rpc("match_router_rule", {
    _tenant: tenantId,
    _kind: kind,
    _text: text,
  });
  return (data as Record<string, unknown> | null) ?? null;
}

export interface ParsedQuote {
  tipo_servicio?: "vaciado" | "limpieza" | "retirada_muebles" | "mixto";
  precio?: number;
  poblacion?: string;
  descripcion?: string;
  metros_cuadrados?: number;
  flags: string[];
}

/**
 * Extrae datos de presupuesto de texto libre SIN IA (0 tokens).
 * Replica y amplía `parseQuoteData` del CRM original.
 */
export function parseQuoteData(original: string): ParsedQuote {
  const t = original.toLowerCase();
  const out: ParsedQuote = { flags: [] };

  // Tipo de servicio
  if (/retirada\s+de\s+muebles|retirar\s+muebles|retirada\s+muebles/.test(t))
    out.tipo_servicio = "retirada_muebles";
  else if (/vaciado/.test(t)) out.tipo_servicio = "vaciado";
  else if (/limpieza/.test(t)) out.tipo_servicio = "limpieza";
  else if (/mixto/.test(t)) out.tipo_servicio = "mixto";

  // Precio: número antes de euros/€. (?![a-z]) en vez de \b porque '€' no es
  // carácter de palabra y \b no casaría tras él; así "99,50 €" sí se detecta.
  const pre = original.match(/(\d+(?:[.,]\d+)?)\s*(?:euros?|€|eur)(?![a-z])/i);
  if (pre?.[1]) out.precio = Number.parseFloat(pre[1].replace(",", "."));

  // Metros cuadrados
  const m2 = original.match(/(\d+(?:[.,]\d+)?)\s*(?:m2|m²|metros?(?:\s+cuadrados?)?)\b/i);
  if (m2?.[1]) out.metros_cuadrados = Number.parseFloat(m2[1].replace(",", "."));

  // Ubicación: "en [Lugar]"
  const loc = original.match(
    /\ben\s+([A-ZÁÉÍÓÚÑ][\wáéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][\wáéíóúñ]+)?)/,
  );
  if (loc?.[1]) out.poblacion = loc[1].trim();

  // Descripción: "por [concepto]"
  const desc = original.match(
    /\bpor\s+(.+?)(?:\s+en\s+[A-ZÁÉÍÓÚ]|\s*,|\s+\d+\s*(?:euros?|€)|$)/i,
  );
  if (desc?.[1]) out.descripcion = desc[1].trim();

  // Flags que afectan al precio (alimentan calc_quote_price en la DB)
  if (/sin\s+ascensor|no\s+hay\s+ascensor/.test(t)) out.flags.push("sin_ascensor");
  if (/urgent|cuanto antes|hoy mismo/.test(t)) out.flags.push("urgente");
  if (/planta\s+(?:alta|[4-9]|1[0-9])/.test(t)) out.flags.push("planta_alta");

  return out;
}
