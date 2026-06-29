// Base para proveedores con API compatible OpenAI (Groq y OpenRouter).
import type { ChatMessage, GenerateOptions, GenerateResult, Provider } from "../types.js";
import { fetchWithRetry } from "./retry.js";

export interface OpenAICompatConfig {
  name: string;
  baseUrl: string;
  apiKey: string | undefined;
  /** Cabeceras extra (p.ej. OpenRouter pide Referer/Title). */
  extraHeaders?: Record<string, string>;
}

export function createOpenAICompatProvider(cfg: OpenAICompatConfig): Provider {
  return {
    name: cfg.name,
    isReady: () => Boolean(cfg.apiKey),
    async generate(messages: ChatMessage[], opts: GenerateOptions): Promise<GenerateResult> {
      if (!cfg.apiKey) throw new Error(`${cfg.name}: falta API key`);

      const res = await fetchWithRetry(`${cfg.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cfg.apiKey}`,
          ...cfg.extraHeaders,
        },
        body: JSON.stringify({
          model: opts.model,
          messages,
          temperature: opts.temperature ?? 0.2,
          max_tokens: opts.maxTokens,
          ...(opts.json ? { response_format: { type: "json_object" } } : {}),
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`${cfg.name} ${res.status}: ${body.slice(0, 300)}`);
      }

      const json = (await res.json()) as {
        choices: { message: { content: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };

      return {
        text: json.choices[0]?.message?.content ?? "",
        tokensIn: json.usage?.prompt_tokens ?? 0,
        tokensOut: json.usage?.completion_tokens ?? 0,
      };
    },
  };
}
