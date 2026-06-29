// Inicialización del router IA (@fusion/ai-router) en el servidor del CRM.
//
// Cascada anti-coste: regla DB (0 tok) → caché exacta (0 tok) → caché semántica
// (0 tok) → proveedor gratis con fallback. Enmascara PII antes de salir a la IA
// y registra el uso (ai_usage_log). Singleton.
//
// Devuelve null si falta la config mínima de Supabase → el llamador cae a su
// lógica directa (nunca rompe). Las claves de proveedor (GEMINI/GROQ/…) y de
// Supabase se leen del entorno del servidor (process.env / .env).
import { createRouter, type Router } from "@fusion/ai-router";

let _router: Router | null = null;

export function getAiRouter(): Router | null {
  if (_router) return _router;
  const e =
    (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
  // Necesita Supabase para reglas/caché/log. Sin esto no hay router (cae a directo).
  if (!e.SUPABASE_URL || !(e.SUPABASE_SERVICE_ROLE_KEY || e.SUPABASE_ANON_KEY)) return null;
  try {
    _router = createRouter({ env: e as NodeJS.ProcessEnv });
    return _router;
  } catch {
    return null;
  }
}
