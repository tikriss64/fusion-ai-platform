// Client-safe definitions of the dynamic intake form per business type.

export type FieldType = "text" | "email" | "tel" | "textarea" | "select" | "checkbox-group";

export interface FieldDef {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: string[]; // for select / checkbox-group
}

// Fields shared by every business type.
const BASE_FIELDS: FieldDef[] = [
  { name: "nombre", label: "Nombre completo", type: "text", required: true },
  { name: "email", label: "Email", type: "email", required: true },
  { name: "telefono", label: "Teléfono", type: "tel", required: true },
];

export const INTAKE_FIELDS: Record<string, FieldDef[]> = {
  masajista: [
    ...BASE_FIELDS,
    { name: "tipo_masaje", label: "Tipo de masaje", type: "text" },
    { name: "notas", label: "Notas", type: "textarea" },
    {
      name: "contraindicaciones",
      label: "Contraindicaciones",
      type: "checkbox-group",
      options: ["Embarazo", "Lesiones", "Problemas circulatorios"],
    },
  ],
  peluqueria: [
    ...BASE_FIELDS,
    { name: "tipo_servicio", label: "Tipo de servicio", type: "text" },
    { name: "tipo_cabello", label: "Tipo de cabello", type: "text" },
    { name: "notas", label: "Notas", type: "textarea" },
  ],
  fisioterapeuta: [
    ...BASE_FIELDS,
    { name: "motivo_consulta", label: "Motivo de consulta", type: "textarea", required: true },
    { name: "historial", label: "Historial breve", type: "textarea" },
  ],
  entrenador_personal: [
    ...BASE_FIELDS,
    {
      name: "nivel",
      label: "Nivel",
      type: "select",
      options: ["Principiante", "Intermedio", "Avanzado"],
    },
    { name: "objetivo", label: "Objetivo", type: "text" },
    {
      name: "lugar",
      label: "Lugar",
      type: "select",
      options: ["Gimnasio", "Domicilio", "Online"],
    },
  ],
  clases_privadas: [
    ...BASE_FIELDS,
    { name: "nivel_alumno", label: "Nivel del alumno", type: "text" },
    {
      name: "modalidad",
      label: "Modalidad",
      type: "select",
      options: ["Presencial", "Online"],
    },
    { name: "material", label: "Material necesario", type: "textarea" },
  ],
};

export function getIntakeFields(tipoNegocio: string | null | undefined): FieldDef[] {
  if (tipoNegocio && INTAKE_FIELDS[tipoNegocio]) return INTAKE_FIELDS[tipoNegocio];
  return BASE_FIELDS;
}

export const FIELD_LABELS: Record<string, string> = Object.values(INTAKE_FIELDS)
  .flat()
  .reduce((acc, f) => {
    acc[f.name] = f.label;
    return acc;
  }, {} as Record<string, string>);
