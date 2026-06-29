// Shim de compatibilidad D1 → Postgres (Supabase).
//
// Presenta la MISMA interfaz que Cloudflare D1 (prepare().bind().all/first/run),
// de modo que todo el SQL existente del Inbox corre sin cambios. Solo traduce los
// placeholders posicionales `?` → `$1,$2,...` y ejecuta sobre Postgres con el
// driver `postgres` (porsager). Fija el tenant activo por conexión.
//
// Requiere SUPABASE_DB_URL (cadena de conexión directa del proyecto Supabase).
import postgres from "postgres";
import { toPg } from "./sql-placeholders.js";

export interface D1Result<T> {
  results: T[];
  success: boolean;
}
export interface D1Prepared {
  bind(...values: unknown[]): D1Prepared;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<{ success: boolean }>;
}
export interface D1Like {
  prepare(query: string): D1Prepared;
}

let pool: ReturnType<typeof postgres> | null = null;

function getPool(dbUrl: string): ReturnType<typeof postgres> {
  if (!pool) {
    // idle_timeout: cierra conexiones ociosas (evita fugas en serverless).
    // max_lifetime: recicla conexiones periódicamente.
    pool = postgres(dbUrl, {
      max: 5,
      prepare: false,
      idle_timeout: 20,
      max_lifetime: 60 * 30,
    });
  }
  return pool;
}

/** Cierra el pool (para apagado limpio / tests). Idempotente. */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end({ timeout: 5 });
    pool = null;
  }
}

/**
 * Crea un cliente D1-compatible sobre Postgres.
 * @param dbUrl  SUPABASE_DB_URL
 * @param tenantId tenant activo (se fija como GUC app.fusion_tenant)
 */
export function createD1(dbUrl: string, tenantId?: string): D1Like {
  const sql = getPool(dbUrl);

  async function exec<T>(query: string, params: unknown[]): Promise<T[]> {
    const pg = toPg(query);
    // El tenant DEBE fijarse en la MISMA conexión que la consulta. Con un pool
    // (y el pooler de Supabase en modo transacción), `set_config(..., false)` a
    // nivel sesión podría caer en otra conexión. Por eso se usa una transacción
    // con `set_config(..., true)` (LOCAL, scope de transacción): garantiza misma
    // conexión y que el contexto se limpia solo al terminar. (Confirmado como
    // patrón correcto para RLS multi-tenant con PgBouncer/Supavisor.)
    if (tenantId) {
      return (await sql.begin(async (tx) => {
        await tx.unsafe("select set_config('app.fusion_tenant', $1, true)", [tenantId]);
        return tx.unsafe(pg, params as never[]);
      })) as unknown as T[];
    }
    return (await sql.unsafe(pg, params as never[])) as unknown as T[];
  }

  function prepared(query: string, params: unknown[] = []): D1Prepared {
    return {
      bind(...values: unknown[]) {
        return prepared(query, values);
      },
      async all<T = Record<string, unknown>>() {
        const rows = await exec<T>(query, params);
        return { results: rows, success: true };
      },
      async first<T = Record<string, unknown>>() {
        const rows = await exec<T>(query, params);
        return rows[0] ?? null;
      },
      async run() {
        await exec(query, params);
        return { success: true };
      },
    };
  }

  return { prepare: (query: string) => prepared(query) };
}
