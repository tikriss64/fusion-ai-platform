// Reintento con backoff para llamadas a proveedores de IA.
// Los tiers gratuitos devuelven 429 (rate limit) de forma transitoria; reintentar
// el MISMO proveedor unas pocas veces suele resolverlo antes de hacer fallback al
// siguiente. Respeta la cabecera `Retry-After` si el proveedor la envía.

const RETRYABLE = new Set([429, 500, 502, 503, 504]);

export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  opts: RetryOptions = {},
): Promise<Response> {
  const retries = opts.retries ?? 3;
  const base = opts.baseDelayMs ?? 500;
  const max = opts.maxDelayMs ?? 4000;

  let attempt = 0;
  for (;;) {
    let res: Response;
    try {
      res = await fetch(url, init);
    } catch (err) {
      // Error de red: reintentar también, hasta agotar intentos.
      if (attempt >= retries) throw err;
      await sleep(Math.min(base * 2 ** attempt, max) + Math.random() * 100);
      attempt++;
      continue;
    }

    if (!RETRYABLE.has(res.status) || attempt >= retries) return res;

    // Prioriza Retry-After (segundos); si no, backoff exponencial con jitter.
    const retryAfter = Number(res.headers.get("retry-after"));
    const delay =
      Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, max)
        : Math.min(base * 2 ** attempt, max) + Math.random() * 100;

    await sleep(delay);
    attempt++;
  }
}
