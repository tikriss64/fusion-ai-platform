// Proveedor Claude (Anthropic Messages API) — opción PREMIUM opt-in.
//
// Usa la API de Anthropic (clave ANTHROPIC_API_KEY, pago por tokens), NO la
// suscripción de chat. La API NO entrena con tus datos → apto para PII.
// Solo se activa si hay clave; si no, el router sigue 100% gratis.
import type { ChatMessage, GenerateOptions, GenerateResult, Provider } from "../types.js";
import { fetchWithRetry } from "./retry.js";

const ENDPOINT = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";

export function createClaudeProvider(apiKey: string | undefined): Provider {
  return {
    name: "claude",
    isReady: () => Boolean(apiKey),
    async generate(messages: ChatMessage[], opts: GenerateOptions): Promise<GenerateResult> {
      if (!apiKey) throw new Error("claude: falta API key");

      // Anthropic separa el system del resto de turnos (como Gemini).
      const system = messages.find((m) => m.role === "system")?.content;
      const turns = messages
        .filter((m) => m.role !== "system")
        .map((m) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content,
        }));

      // Anthropic no tiene response_format JSON; se pide por instrucción y el
      // orquestador ya rescata el bloque JSON de la respuesta (safeJsonParse).
      const sys = opts.json
        ? `${system ? `${system}\n\n` : ""}Responde ÚNICAMENTE con JSON válido, sin texto adicional ni markdown.`
        : system;

      // Prompt caching de Anthropic: marca el system prompt como "ephemeral"
      // para activar el caché que descuenta hasta el 90% en lecturas repetidas
      // del mismo system prompt durante 5 minutos. Solo se activa si hay system.
      const systemBlocks = sys
        ? [{ type: "text", text: sys, cache_control: { type: "ephemeral" } }]
        : undefined;

      const res = await fetchWithRetry(ENDPOINT, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": API_VERSION,
        },
        body: JSON.stringify({
          model: opts.model,
          max_tokens: opts.maxTokens ?? 2048,
          temperature: opts.temperature ?? 0.2,
          ...(systemBlocks ? { system: systemBlocks } : {}),
          messages: turns,
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`claude ${res.status}: ${body.slice(0, 300)}`);
      }

      const json = (await res.json()) as {
        content: { type: string; text?: string }[];
        usage?: { input_tokens?: number; output_tokens?: number };
      };

      const text = (json.content ?? [])
        .filter((c) => c.type === "text")
        .map((c) => c.text ?? "")
        .join("");

      return {
        text,
        tokensIn: json.usage?.input_tokens ?? 0,
        tokensOut: json.usage?.output_tokens ?? 0,
      };
    },
  };
}
