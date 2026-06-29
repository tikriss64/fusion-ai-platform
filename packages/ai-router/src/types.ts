// Tipos compartidos del router de IA.

/** Tipo de tarea que se pide al router. */
export type TaskKind = "classify" | "extract" | "generate" | "summarize";

/**
 * Sensibilidad del dato de entrada.
 * - "anonymous": no contiene PII → puede ir a modelos gratis sin enmascarar.
 * - "pii": contiene datos personales → se enmascara antes de salir, o se usa
 *   un proveedor en modo facturado (no entrena con los datos).
 */
export type Sensitivity = "anonymous" | "pii";

/** Nivel de la cascada que resolvió la petición. */
export type ResolutionSource = "cache" | "rule" | "embedding" | "llm";

/** Nivel de coste del modelo. 0 = sin IA, 1 = barato, 2 = frontier. */
export type ModelTier = 0 | 1 | 2;

export interface RouteRequest {
  tenantId: string;
  task: TaskKind;
  /** Texto de entrada (prompt del usuario o contenido a procesar). */
  input: string;
  /** Instrucción de sistema opcional. */
  system?: string;
  sensitivity?: Sensitivity;
  /** Tipo de regla a consultar en Nivel 0 (clasificación determinista). */
  ruleKind?: "intent" | "classification" | "urgency" | "service_type" | "spam";
  /** Fuerza un modelo concreto (salta la selección automática). */
  model?: string;
  /** Nivel de modelo: 1 = barato/gratis (defecto), 2 = frontier para casos complejos. */
  tier?: ModelTier;
  /** Umbral de similitud para reutilizar respuestas por embeddings. */
  semanticThreshold?: number;
  /** Desactiva la escritura en caché (p.ej. respuestas no reutilizables). */
  noCache?: boolean;
  /** Temperatura para generación. */
  temperature?: number;
}

export interface RouteResult<T = unknown> {
  /** Resultado. Es null si todos los proveedores fallaron y degradedError está presente. */
  data: T | null;
  source: ResolutionSource;
  provider?: string;
  model?: string;
  tier: ModelTier;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  latencyMs: number;
  cacheHit: boolean;
  /**
   * Si todos los proveedores fallaron, el router degrada (no lanza): devuelve
   * `data: null` y rellena este campo con el último error. El caller decide
   * si reintentar, mostrar mensaje al usuario o continuar sin IA.
   */
  degradedError?: string;
}

/** Mensaje de chat estándar (compatible con OpenAI / Groq / OpenRouter). */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GenerateOptions {
  model: string;
  temperature?: number;
  maxTokens?: number;
  /** Pide salida JSON estricta cuando el modelo lo soporta. */
  json?: boolean;
}

export interface GenerateResult {
  text: string;
  tokensIn: number;
  tokensOut: number;
}

/** Interfaz común a todos los proveedores. Añadir uno nuevo = implementar esto. */
export interface Provider {
  readonly name: string;
  /** ¿Está configurado (tiene API key)? */
  isReady(): boolean;
  generate(messages: ChatMessage[], opts: GenerateOptions): Promise<GenerateResult>;
}

/** Definición de un modelo en el registro. */
export interface ModelSpec {
  id: string;
  provider: string;
  tier: ModelTier;
  /** Coste por millón de tokens (entrada/salida) en USD. 0 = gratis. */
  costInPerM: number;
  costOutPerM: number;
  /** ¿El proveedor entrena con los datos en este modo? (true = no apto para PII). */
  trainsOnData: boolean;
}
