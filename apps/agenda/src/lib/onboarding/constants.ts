// Client-safe constants & helpers for the onboarding flow.

export const BUSINESS_TYPES = [
  // Servicios de campo (sector de vaciadodepisos.cat)
  { value: "vaciado_pisos", label: "Vaciado de pisos" },
  { value: "limpieza", label: "Limpieza" },
  { value: "retirada_muebles", label: "Retirada de muebles" },
  { value: "mudanzas", label: "Mudanzas" },
  { value: "reformas", label: "Reformas" },
  { value: "otros_servicios", label: "Otros servicios a domicilio" },
  // Servicios con cita previa (genéricos)
  { value: "masajista", label: "Masajista" },
  { value: "peluqueria", label: "Peluquería" },
  { value: "fisioterapeuta", label: "Fisioterapeuta" },
  { value: "entrenador_personal", label: "Entrenador personal" },
  { value: "clases_privadas", label: "Clases privadas" },
] as const;

export const CURRENCIES = [
  { value: "EUR", label: "Euro (€)" },
  { value: "USD", label: "Dólar ($)" },
  { value: "GBP", label: "Libra (£)" },
  { value: "MXN", label: "Peso mexicano ($)" },
] as const;

export const TIMEZONES = [
  "Europe/Madrid",
  "Europe/London",
  "Europe/Paris",
  "Atlantic/Canary",
  "America/Mexico_City",
  "America/New_York",
  "America/Bogota",
  "America/Argentina/Buenos_Aires",
] as const;

export const SERVICE_COLORS = [
  "#6366f1",
  "#a855f7",
  "#ec4899",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#0ea5e9",
];

export const WEEKDAYS = [
  { key: "mon", label: "Lunes" },
  { key: "tue", label: "Martes" },
  { key: "wed", label: "Miércoles" },
  { key: "thu", label: "Jueves" },
  { key: "fri", label: "Viernes" },
  { key: "sat", label: "Sábado" },
  { key: "sun", label: "Domingo" },
] as const;

export type WeekdayKey = (typeof WEEKDAYS)[number]["key"];

export interface DayHours {
  enabled: boolean;
  open: string; // "09:00"
  close: string; // "18:00"
}

export type BusinessHours = Record<WeekdayKey, DayHours>;

export interface ScheduleException {
  id: string;
  type: "holiday" | "vacation";
  label: string;
  startDate: string; // ISO date
  endDate: string; // ISO date
}

export const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  mon: { enabled: true, open: "09:00", close: "18:00" },
  tue: { enabled: true, open: "09:00", close: "18:00" },
  wed: { enabled: true, open: "09:00", close: "18:00" },
  thu: { enabled: true, open: "09:00", close: "18:00" },
  fri: { enabled: true, open: "09:00", close: "18:00" },
  sat: { enabled: false, open: "10:00", close: "14:00" },
  sun: { enabled: false, open: "10:00", close: "14:00" },
};

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}
