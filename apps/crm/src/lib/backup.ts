import { supabase } from "@/integrations/supabase/client";

// Convierte un array de objetos a CSV (compatible con Excel, UTF-8 con BOM)
function toCSV(rows: Record<string, any>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: any): string => {
    if (v === null || v === undefined) return "";
    let s = typeof v === "object" ? JSON.stringify(v) : String(v);
    // Escapar comillas y envolver si contiene separador, comillas o saltos de línea
    if (/[";\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const lines = [
    headers.join(";"),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(";")),
  ];
  return lines.join("\r\n");
}

function downloadFile(filename: string, content: string, mime: string) {
  // BOM para que Excel reconozca UTF-8 (acentos correctos)
  const blob = new Blob(["﻿" + content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const TABLES = [
  "clients",
  "quotes",
  "quote_items",
  "invoices",
  "invoice_items",
  "invoice_payments",
  "trabajos",
  "leads",
  "company_settings",
] as const;

export type BackupFormat = "json" | "csv";

// Descarga un backup completo. JSON = un solo archivo con todo. CSV = un archivo por tabla.
export async function exportBackup(format: BackupFormat): Promise<{ ok: boolean; resumen: string }> {
  const fecha = new Date().toISOString().slice(0, 10);
  const all: Record<string, any[]> = {};
  const counts: string[] = [];

  for (const table of TABLES) {
    const { data, error } = await supabase.from(table).select("*");
    if (error) {
      return { ok: false, resumen: `Error al exportar "${table}": ${error.message}` };
    }
    all[table] = data ?? [];
    counts.push(`${table}: ${data?.length ?? 0}`);
  }

  if (format === "json") {
    const payload = {
      _backup: "vaciadodepisos.cat CRM",
      _fecha: new Date().toISOString(),
      datos: all,
    };
    downloadFile(`backup-crm-${fecha}.json`, JSON.stringify(payload, null, 2), "application/json");
  } else {
    // CSV: concatena todas las tablas en un archivo con separadores de sección
    const partes: string[] = [];
    for (const table of TABLES) {
      partes.push(`### TABLA: ${table} (${all[table].length} registros) ###`);
      partes.push(toCSV(all[table]));
      partes.push("");
    }
    downloadFile(`backup-crm-${fecha}.csv`, partes.join("\r\n"), "text/csv");
  }

  return { ok: true, resumen: counts.join(" · ") };
}
