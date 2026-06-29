import { z } from "zod";

export const SUGGESTED_TAGS = [
  "VIP",
  "Rápido pagando",
  "Difícil",
  "Recomendado",
  "Urgente",
  "Empresa",
  "Particular",
] as const;

const optStr = z.string().trim().max(255).optional().or(z.literal(""));

export const clientSchema = z
  .object({
    nombre: z.string().trim().min(1, "Requerido").max(255),
    nif_cif: optStr,
    email: z.string().trim().email("Email inválido").max(255).optional().or(z.literal("")),
    telefono: optStr,
    direccion: z.string().trim().max(500).optional().or(z.literal("")),
    poblacion: optStr,
    notas: z.string().trim().max(5000).optional().or(z.literal("")),
    tags: z.array(z.string().trim().min(1).max(50)).max(20),
    primera_fecha: z.string().optional().or(z.literal("")),
    ultima_fecha: z.string().optional().or(z.literal("")),
    num_trabajos: z.coerce.number().int().min(0),
    valoracion: z.coerce.number().int().min(1).max(5).optional().nullable(),
    recurrente: z.boolean(),
    rgpd_consent: z.boolean(),
  })
  .refine(
    (d) => !d.ultima_fecha || !d.primera_fecha || d.ultima_fecha >= d.primera_fecha,
    { message: "La última fecha no puede ser anterior a la primera", path: ["ultima_fecha"] },
  );

export type ClientFormValues = z.infer<typeof clientSchema>;

export type ClientRow = {
  id: string;
  user_id: string;
  nombre: string;
  nif_cif: string | null;
  email: string | null;
  telefono: string | null;
  direccion: string | null;
  poblacion: string | null;
  notas: string | null;
  tags: string[];
  primera_fecha: string | null;
  ultima_fecha: string | null;
  num_trabajos: number;
  valoracion: number | null;
  recurrente: boolean;
  rgpd_consent: boolean;
  created_at: string;
  updated_at: string;
};