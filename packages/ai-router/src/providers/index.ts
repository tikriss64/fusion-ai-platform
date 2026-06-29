// Registro de proveedores disponibles. Añadir uno nuevo = una línea aquí.
import type { Provider } from "../types.js";
import { createClaudeProvider } from "./claude.js";
import { createGeminiProvider } from "./gemini.js";
import { createOpenAICompatProvider } from "./openai-compatible.js";

export function buildProviders(env: NodeJS.ProcessEnv = process.env): Map<string, Provider> {
  const providers: Provider[] = [
    createOpenAICompatProvider({
      name: "groq",
      baseUrl: "https://api.groq.com/openai/v1",
      apiKey: env.GROQ_API_KEY,
    }),
    createOpenAICompatProvider({
      name: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: env.OPENROUTER_API_KEY,
      extraHeaders: {
        "HTTP-Referer": env.OPENROUTER_SITE ?? "https://vaciadodepisos.cat",
        "X-Title": "FUSION",
      },
    }),
    createGeminiProvider(env.GEMINI_API_KEY),
    // Premium opt-in: solo se activa si hay ANTHROPIC_API_KEY.
    createClaudeProvider(env.ANTHROPIC_API_KEY),
  ];

  return new Map(providers.map((p) => [p.name, p]));
}

/** Conjunto de nombres de proveedor que tienen API key configurada. */
export function readyProviderNames(providers: Map<string, Provider>): Set<string> {
  const names = new Set<string>();
  for (const [name, p] of providers) if (p.isReady()) names.add(name);
  return names;
}
