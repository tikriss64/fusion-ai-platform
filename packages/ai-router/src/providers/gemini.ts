// Proveedor Gemini (API REST de Google, distinta a OpenAI).
import type { ChatMessage, GenerateOptions, GenerateResult, Provider } from "../types.js";
import { fetchWithRetry } from "./retry.js";

const BASE = "https://generativelanguage.googleapis.com/v1beta";

export function createGeminiProvider(apiKey: string | undefined): Provider {
  return {
    name: "gemini",
    isReady: () => Boolean(apiKey),
    async generate(messages: ChatMessage[], opts: GenerateOptions): Promise<GenerateResult> {
      if (!apiKey) throw new Error("gemini: falta API key");

      // Gemini separa la instrucción de sistema del resto de turnos.
      const system = messages.find((m) => m.role === "system")?.content;
      const contents = messages
        .filter((m) => m.role !== "system")
        .map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        }));

      const res = await fetchWithRetry(`${BASE}/models/${opts.model}:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents,
          ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
          generationConfig: {
            temperature: opts.temperature ?? 0.2,
            maxOutputTokens: opts.maxTokens,
            ...(opts.json ? { responseMimeType: "application/json" } : {}),
          },
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`gemini ${res.status}: ${body.slice(0, 300)}`);
      }

      const json = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
      };

      return {
        text: json.candidates?.[0]?.content?.parts?.[0]?.text ?? "",
        tokensIn: json.usageMetadata?.promptTokenCount ?? 0,
        tokensOut: json.usageMetadata?.candidatesTokenCount ?? 0,
      };
    },
  };
}
