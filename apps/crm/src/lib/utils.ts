import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  // Acepta tanto fechas sin hora ("2026-06-11") como timestamps completos
  // ("2026-06-11T14:30:00Z" o "2026-06-11 14:30:00+00"). A las fechas sin hora
  // les añadimos la hora local para no desfasar el día por zona horaria.
  const hasTime = dateStr.includes("T") || dateStr.includes(" ");
  const d = new Date(hasTime ? dateStr : `${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

/** Formatea un importe en euros, formato español: 1.234,56 € */
export function formatCurrency(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? Number(value) : (value ?? 0);
  if (!Number.isFinite(n)) return "0,00 €";
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(n as number);
}

/** Formatea un número con separadores españoles: 1.234 */
export function formatNumber(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? Number(value) : (value ?? 0);
  if (!Number.isFinite(n)) return "0";
  return new Intl.NumberFormat("es-ES").format(n as number);
}
