import { z } from "zod";
import type { ServiceType } from "./quotes-schema";

export const TRABAJO_STATUSES = [
  "pendiente",
  "confirmado",
  "en_curso",
  "completado",
  "cancelado",
] as const;
export type TrabajoStatus = (typeof TRABAJO_STATUSES)[number];

export const TRABAJO_STATUS_LABELS: Record<TrabajoStatus, string> = {
  pendiente: "Pendiente",
  confirmado: "Confirmado",
  en_curso: "En curso",
  completado: "Completado",
  cancelado: "Cancelado",
};

export const TRABAJO_STATUS_COLORS: Record<TrabajoStatus, string> = {
  pendiente: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  confirmado: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  en_curso: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200",
  completado: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200",
  cancelado: "bg-muted text-muted-foreground",
};

export type TrabajoRow = {
  id: string;
  user_id: string;
  quote_id: string | null;
  client_id: string | null;
  fecha: string | null;
  hora: string | null;
  direccion: string | null;
  tipo_servicio: ServiceType | null;
  notas: string | null;
  estado: TrabajoStatus;
  fotos_antes: string[];
  fotos_despues: string[];
  carpeta_fotos_url: string | null;
  created_at: string;
  updated_at: string;
};

const optStr = z.string().trim().max(2000).optional().or(z.literal(""));

export const trabajoFormSchema = z.object({
  client_id: z.string().uuid().nullable().optional(),
  fecha: z.string().min(1, "La fecha es obligatoria"),
  hora: optStr,
  direccion: z.string().trim().max(500).optional().or(z.literal("")),
  tipo_servicio: z
    .enum(["vaciado", "limpieza", "retirada_muebles", "mixto"])
    .nullable()
    .optional(),
  notas: optStr,
  carpeta_fotos_url: z
    .string()
    .url("URL inválida")
    .optional()
    .or(z.literal("")),
});

export type TrabajoFormValues = z.infer<typeof trabajoFormSchema>;
