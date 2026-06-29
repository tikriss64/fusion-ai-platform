// Redacción de PII (RGPD) — 100% local, sin coste, antes de enviar a cualquier IA.
// Modo token-replace: cada dato se sustituye por un marcador estable ([EMAIL_1]…)
// y se guarda un mapa para restaurar la respuesta del modelo si hace falta.
//
// Cobertura: email, teléfono ES, DNI/NIE, NIF/CIF, IBAN, código postal, nombres
// etiquetados. Para detección NER avanzada se puede sustituir por OpenRedaction
// (mismo contrato redact/restore) sin tocar el resto del router.

export interface RedactionResult {
  masked: string;
  /** marcador → valor original. Para restaurar tras la respuesta del modelo. */
  map: Record<string, string>;
  /** ¿Se encontró algún dato personal? */
  hasPii: boolean;
}

interface Detector {
  label: string;
  re: RegExp;
}

// El orden importa: lo más específico primero (IBAN antes que números sueltos).
const DETECTORS: Detector[] = [
  { label: "EMAIL", re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  { label: "IBAN", re: /\bES\d{2}[ ]?(?:\d{4}[ ]?){5}\b/g },
  // NIF/CIF de empresa: letra + 8 dígitos, o 8 dígitos + letra (DNI), o NIE (X/Y/Z).
  { label: "DNI", re: /\b(?:[XYZ]\d{7}[A-Z]|\d{8}[A-Z]|[A-HJ-NP-SUVW]\d{7}[0-9A-J])\b/gi },
  // Teléfono español: 9 dígitos empezando por 6,7,8,9, con prefijo +34 opcional.
  { label: "TEL", re: /\b(?:\+?34[ -]?)?[6789]\d{2}[ -]?\d{3}[ -]?\d{3}\b/g },
  { label: "CP", re: /\b(?:0[1-9]|[1-4]\d|5[0-2])\d{3}\b/g },
  // Nombre etiquetado: "para/cliente/clienta/Sr./Sra. Nombre Apellido".
  {
    label: "NOMBRE",
    re: /\b(?:para|cliente|clienta|sr\.?|sra\.?|don|doña)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,2})/g,
  },
];

/** Sustituye PII por marcadores estables y devuelve el mapa de restauración. */
export function redact(text: string): RedactionResult {
  const map: Record<string, string> = {};
  const counters: Record<string, number> = {};
  let masked = text;

  for (const { label, re } of DETECTORS) {
    masked = masked.replace(re, (...args: unknown[]) => {
      const match = args[0] as string;
      // OJO: si el detector NO tiene grupo de captura, el 2º arg de replace es el
      // OFFSET (number), no un grupo. Solo es grupo si es string (caso NOMBRE).
      const group1 = typeof args[1] === "string" ? (args[1] as string) : undefined;
      // Para NOMBRE solo enmascaramos el nombre capturado, no la palabra clave.
      const value = group1 ?? match;
      const prefix = group1 ? match.slice(0, match.length - value.length) : "";
      counters[label] = (counters[label] ?? 0) + 1;
      const token = `[${label}_${counters[label]}]`;
      map[token] = value;
      return prefix + token;
    });
  }

  return { masked, map, hasPii: Object.keys(map).length > 0 };
}

/** Restaura los valores originales en un texto producido por el modelo. */
export function restore(text: string, map: Record<string, string>): string {
  let out = text;
  for (const [token, value] of Object.entries(map)) {
    out = out.split(token).join(value);
  }
  return out;
}
