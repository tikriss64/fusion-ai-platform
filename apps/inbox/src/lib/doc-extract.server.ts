// Extracción de datos de documentos (PDF/imagen) con Gemini multimodal.
// El frontend manda el fichero en base64; aquí se envía a Gemini con inlineData.

import type { AiEnv } from "./ai-analyze.server";

const GEMINI_MODELS = ["gemini-3.5-flash", "gemini-3.1-flash-lite"];

export interface DocExtractResult {
  docType: string; // Factura | Contrato | Presupuesto | CV | Recibo | Otro
  summary: string;
  fields: Record<string, string>; // datos clave extraídos
}

const PROMPT = `Analiza este documento y extrae sus datos estructurados.
Devuelve SOLO un objeto JSON con esta forma exacta:
{
  "docType": "uno de: Factura, Contrato, Presupuesto, CV, Recibo, Otro",
  "summary": "una frase describiendo el documento",
  "fields": { "campo": "valor", ... }
}
En "fields" incluye los datos clave que encuentres según el tipo: emisor, receptor, número, fecha, fecha de vencimiento, importe total, base imponible, IVA, conceptos, nombre, email, teléfono, etc. Usa los nombres de campo en el idioma del documento. No inventes datos que no estén.`;

export async function extractDocument(
  env: AiEnv,
  doc: { mimeType: string; dataBase64: string },
): Promise<DocExtractResult | null> {
  if (!env.GEMINI_API_KEY) return null;

  for (const model of GEMINI_MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: PROMPT },
                  { inlineData: { mimeType: doc.mimeType, data: doc.dataBase64 } },
                ],
              },
            ],
            generationConfig: { temperature: 0.1, maxOutputTokens: 2048, responseMimeType: "application/json" },
          }),
        },
      );
      if (!res.ok) {
        console.error(`[DocExtract ${model}] ${res.status}: ${(await res.text()).substring(0, 150)}`);
        continue;
      }
      const data = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
      const raw = (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) continue;
      const parsed = JSON.parse(match[0]) as DocExtractResult;
      if (parsed.docType) return parsed;
    } catch (e) {
      console.error(`[DocExtract ${model}] exception: ${e}`);
    }
  }
  return null;
}
