// Análisis de correos con cadena de fallback resiliente.
// Orden: Gemini 3.5 Flash → Gemini 2.5 Flash → Groq (llama-3.3-70b).
// Fuerza JSON a nivel de API (responseMimeType en Gemini, json_object en Groq).
// Datos verificados 07/06/2026 contra las APIs reales.

export interface AiEnv {
  GEMINI_API_KEY?: string;
  GROQ_API_KEY?: string;
  [key: string]: unknown;
}

export interface AnalysisResult {
  id: string;
  type: "Cliente" | "Proveedor" | "Reclamación" | "Comercial" | "Urgente" | "Info";
  summary: string;
  promise: string | null;
  tone_warning: string | null;
  effort: "quick" | "medium" | "long";
}

// Modelos Gemini a probar en orden (cada uno tiene cuota independiente).
const GEMINI_MODELS = ["gemini-3.5-flash", "gemini-3.1-flash-lite"];

// Limpieza sin IA — gratis, en el Worker.
function cleanText(text: string, maxChars: number): string {
  return (text || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .substring(0, maxChars);
}

function buildPrompt(emails: { id: string; sender: string; subject: string; snippet: string }[]): string {
  return `Eres un clasificador de correos electrónicos. Analiza cada correo y devuelve un JSON array.
Un objeto por correo, con EXACTAMENTE estos campos:
- "id": el mismo ID que te doy (cópialo tal cual)
- "type": uno de "Cliente","Proveedor","Reclamación","Comercial","Urgente","Info"
- "summary": resumen en máximo 10 palabras de qué trata, ESCRITO EN EL MISMO IDIOMA QUE EL CORREO (si el correo está en francés, resumen en francés; si en español, en español)
- "promise": una frase si el remitente promete algo concreto, o null
- "tone_warning": breve descripción si el tono es negativo/enfadado/insatisfecho, o null
- "effort": "quick" (<2min), "medium" (2-10min) o "long" (>10min)

Correos:
${emails.map((e) => `ID:${e.id} | De:${cleanText(e.sender, 40)} | Asunto:${cleanText(e.subject, 60)} | Texto:${cleanText(e.snippet, 90)}`).join("\n")}

Devuelve SOLO el JSON array, un objeto por cada correo de arriba.`;
}

async function callGemini(env: AiEnv, model: string, prompt: string): Promise<string | null> {
  if (!env.GEMINI_API_KEY) return null;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 2048,
            responseMimeType: "application/json",
          },
        }),
      },
    );
    if (!res.ok) {
      console.error(`[Gemini ${model}] HTTP ${res.status}: ${(await res.text()).substring(0, 150)}`);
      return null;
    }
    const data = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    return parts.map((p) => p.text ?? "").join("");
  } catch (e) {
    console.error(`[Gemini ${model}] exception: ${e}`);
    return null;
  }
}

async function callGroq(env: AiEnv, prompt: string): Promise<string | null> {
  if (!env.GROQ_API_KEY) return null;
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: "Responde ÚNICAMENTE con JSON válido. Nada de explicaciones ni razonamiento ni markdown." },
          { role: "user", content: `${prompt}\n\nDevuelve un objeto JSON con la forma {"results":[...]} donde results es el array de correos analizados.` },
        ],
        temperature: 0,
        max_tokens: 2048,
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      console.error(`[Groq] HTTP ${res.status}: ${(await res.text()).substring(0, 150)}`);
      return null;
    }
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content ?? null;
  } catch (e) {
    console.error(`[Groq] exception: ${e}`);
    return null;
  }
}

function extractArray(value: unknown): AnalysisResult[] | null {
  if (Array.isArray(value)) return value as AnalysisResult[];
  if (value && typeof value === "object") {
    // Busca la primera propiedad que sea un array de objetos
    for (const v of Object.values(value as Record<string, unknown>)) {
      if (Array.isArray(v) && v.length > 0 && typeof v[0] === "object") {
        return v as AnalysisResult[];
      }
    }
  }
  return null;
}

function parseResults(raw: string | null): AnalysisResult[] {
  if (!raw) return [];
  const trimmed = raw.trim();
  // 1) Parseo directo (responseMimeType garantiza JSON válido)
  try {
    const direct = extractArray(JSON.parse(trimmed));
    if (direct) return direct;
  } catch {
    /* sigue con extracción por regex */
  }
  // 2) Fallback: extrae el primer bloque JSON (array u objeto) del texto
  try {
    const match = trimmed.match(/[[{][\s\S]*[\]}]/);
    if (match) {
      const arr = extractArray(JSON.parse(match[0]));
      if (arr) return arr;
    }
  } catch (e) {
    console.error(`[parse] ${e}`);
  }
  return [];
}

const TONE_INSTRUCTIONS: Record<string, string> = {
  neutro: "profesional y neutro",
  calido: "cálido, cercano y amable",
  firme: "firme y claro pero educado, poniendo límites con respeto",
  ironico: "con un toque sutil de ironía y humor, sin ser ofensivo",
  cortante: "directo y escueto, breve pero correcto",
};

// Genera un borrador de respuesta a un correo, en el tono elegido.
export async function generateReply(
  env: AiEnv,
  opts: { subject: string; body: string; from: string; tone: string; myStyle: boolean; memory?: string },
): Promise<string | null> {
  const toneDesc = TONE_INSTRUCTIONS[opts.tone] ?? "profesional y neutro";
  const memoryBlock = opts.memory
    ? `\n--- HISTORIAL RELEVANTE (memoria del asistente; correos anteriores con este contacto o sobre este tema) ---
${opts.memory}
Usa este historial SOLO para dar contexto y coherencia (no contradigas lo ya dicho, retoma compromisos previos). NO lo cites textualmente ni inventes a partir de él.
--- FIN DEL HISTORIAL ---\n`
    : "";
  const prompt = `Eres un asistente que redacta respuestas a correos electrónicos.

⚠️ REGLA NÚMERO 1, OBLIGATORIA: Responde EXACTAMENTE en el mismo idioma en que está escrito el correo de abajo. Si el correo está en español, responde en español. Si está en francés, en francés. Si está en inglés, en inglés. IGNORA el idioma de estas instrucciones. Detecta el idioma del cuerpo del correo y úsalo.

Otros requisitos:
- Tono: ${toneDesc}.
- Natural, como lo escribiría una persona. ${opts.myStyle ? "Estilo personal, cercano y poco formal." : ""}
- NO inventes datos concretos (fechas, precios, nombres) que no estén en el correo. Si falta un dato, déjalo entre [corchetes].
- Devuelve SOLO el texto de la respuesta, sin asunto ni explicaciones.
${memoryBlock}
--- CORREO RECIBIDO (responde en SU idioma) ---
De: ${opts.from}
Asunto: ${opts.subject}
${cleanText(opts.body, 1500)}
--- FIN DEL CORREO ---`;

  // Gemini primero, Groq de fallback
  for (const model of GEMINI_MODELS) {
    const raw = await callGeminiText(env, model, prompt);
    if (raw && raw.trim().length > 10) return raw.trim();
  }
  const groq = await callGroqText(env, prompt);
  return groq && groq.trim().length > 10 ? groq.trim() : null;
}

export interface InboxAnswer {
  answer: string;
  matches: number[]; // índices (1-based) de los correos relevantes
}

// Responde una pregunta sobre la bandeja: devuelve una respuesta breve + la LISTA de
// correos que cumplen lo pedido (por índice), para mostrarlos como tarjetas.
export async function answerInboxQuestion(
  env: AiEnv,
  question: string,
  emails: { sender: string; subject: string; summary: string | null; snippet: string; received_at: number }[],
  lang: string = "es",
): Promise<InboxAnswer> {
  const langName = lang === "fr" ? "francés (français)" : "español";
  const ctx = emails
    .slice(0, 40)
    .map((e, i) => `${i + 1}. De:${cleanText(e.sender, 45)} | Asunto:${cleanText(e.subject, 90)} | ${cleanText(e.summary || e.snippet, 90)}`)
    .join("\n");
  const prompt = `Eres un asistente de bandeja de correo. El usuario te hace una pregunta y debes identificar qué correos cumplen lo que pide.

Devuelve SOLO un JSON con esta forma exacta:
{"answer": "respuesta MUY breve (1 frase)", "matches": [números de los correos relevantes]}

Reglas:
- ⚠️ El texto de "answer" DEBE estar escrito en ${langName}. Obligatorio, sin excepción.
- "matches": los NÚMEROS (de la lista de abajo) de los correos que cumplen lo que pide el usuario. Si ninguno, [].
- NO describas los correos en "answer" (van en "matches"). "answer" solo es un resumen corto, ej. ${lang === "fr" ? '"J\'ai trouvé 3 e-mails suspects"' : '"He encontrado 3 correos sospechosos"'}.

Correos:
${ctx}

Pregunta del usuario: ${question}`;

  const parse = (raw: string | null): InboxAnswer | null => {
    if (!raw) return null;
    try {
      const m = raw.match(/\{[\s\S]*\}/);
      if (!m) return null;
      const obj = JSON.parse(m[0]) as { answer?: string; matches?: unknown[] };
      const matches = Array.isArray(obj.matches)
        ? obj.matches.map((n) => Number(n)).filter((n) => Number.isFinite(n))
        : [];
      return { answer: String(obj.answer ?? ""), matches };
    } catch {
      return null;
    }
  };

  for (const model of GEMINI_MODELS) {
    const parsed = parse(await callGemini(env, model, prompt));
    if (parsed) return parsed;
  }
  return parse(await callGroq(env, prompt)) ?? { answer: "", matches: [] };
}

// Variante de Gemini que devuelve texto libre (sin responseMimeType JSON).
async function callGeminiText(env: AiEnv, model: string, prompt: string): Promise<string | null> {
  if (!env.GEMINI_API_KEY) return null;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 1024 },
        }),
      },
    );
    if (!res.ok) {
      console.error(`[GeminiText ${model}] ${res.status}`);
      return null;
    }
    const data = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    return parts.map((p) => p.text ?? "").join("");
  } catch {
    return null;
  }
}

// Variante de Groq que devuelve texto libre (no JSON).
async function callGroqText(env: AiEnv, prompt: string): Promise<string | null> {
  if (!env.GROQ_API_KEY) return null;
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.4,
        max_tokens: 1024,
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content ?? null;
  } catch {
    return null;
  }
}

export interface BatchOutcome {
  results: AnalysisResult[];
  engine: string; // "gemini-3.5-flash" | "gemini-3.1-flash-lite" | "groq" | "none"
}

// Analiza un lote de correos en UNA llamada, con fallback automático entre modelos.
export async function analyzeBatch(
  env: AiEnv,
  emails: { id: string; sender: string; subject: string; snippet: string }[],
): Promise<BatchOutcome> {
  if (emails.length === 0) return { results: [], engine: "none" };
  const prompt = buildPrompt(emails);

  // 1) Probar cada modelo de Gemini en orden
  for (const model of GEMINI_MODELS) {
    const results = parseResults(await callGemini(env, model, prompt));
    if (results.length > 0) {
      console.log(`[AI] ${model}: ${results.length}/${emails.length} OK`);
      return { results, engine: model };
    }
  }

  // 2) Fallback a Groq
  const groqResults = parseResults(await callGroq(env, prompt));
  console.log(`[AI] Groq fallback: ${groqResults.length}/${emails.length} OK`);
  return { results: groqResults, engine: groqResults.length > 0 ? "groq" : "none" };
}
