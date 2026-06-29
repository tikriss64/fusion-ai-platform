// Consultas del Mission Control. Leen el esquema anti-tokens (metrics_daily,
// agent_activity, alerts, ai_usage_log). Todo agregado por la DB → 0 IA.
import { supabase } from "@/integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isOverdue } from "@/lib/invoices-schema";

// Estas tablas (esquema anti-tokens: metrics_daily, agent_activity, alerts,
// ceo_reports, ai_savings_summary) aún NO están en los tipos generados de
// Supabase. Usamos un cliente sin tipar para consultarlas hasta regenerar los
// tipos. TODO: ejecutar `supabase gen types typescript` y tipar estas tablas.
const sb = supabase as unknown as SupabaseClient;

export interface DashboardMetrics {
  correosProcesados: number;
  leadsDetectados: number;
  presupuestos: number;
  facturas: number;
  clientesEnfadados: number;
  aiCostUsd: number;
  aiCacheHits: number;
}

export interface ActivityItem {
  id: string;
  agent: string;
  action: string;
  used_ai: boolean;
  created_at: string;
}

export interface AlertItem {
  id: string;
  severity: "info" | "warning" | "critical";
  title: string;
  detail: string | null;
  created_at: string;
  entity_type: string | null;
  entity_id: string | null;
}

export interface AiSpendPoint {
  dia: string;
  cost: number;
  cacheHits: number;
}

/** KPIs agregados del rango (por defecto, hoy).
 *  Intenta metrics_daily primero (poblado por agentes IA). Si está vacío,
 *  cae a leer las tablas reales del CRM para que los KPI muestren datos útiles. */
export async function getDashboardMetrics(tenantId: string, dia?: string): Promise<DashboardMetrics> {
  const target = dia ?? new Date().toISOString().slice(0, 10);

  if (tenantId) {
    const { data } = await sb
      .from("metrics_daily")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("dia", target)
      .maybeSingle();

    const hasAiData = data && (
      (data.leads_detectados ?? 0) > 0 ||
      (data.presupuestos ?? 0) > 0 ||
      (data.facturas ?? 0) > 0 ||
      (data.correos_procesados ?? 0) > 0
    );

    if (hasAiData) {
      return {
        correosProcesados: data.correos_procesados ?? 0,
        leadsDetectados: data.leads_detectados ?? 0,
        presupuestos: data.presupuestos ?? 0,
        facturas: data.facturas ?? 0,
        clientesEnfadados: data.clientes_enfadados ?? 0,
        aiCostUsd: Number(data.ai_cost_usd ?? 0),
        aiCacheHits: data.ai_cache_hits ?? 0,
      };
    }
  }

  // Fallback: datos reales de las tablas del CRM (RLS gestiona el acceso)
  const desde = `${target}T00:00:00`;
  const hasta = `${target}T23:59:59.999`;
  const [
    { count: leadsHoy },
    { count: quotesHoy },
    { count: invoicesHoy },
    { data: invUnpaid },
  ] = await Promise.all([
    sb.from("leads").select("id", { count: "exact", head: true })
      .gte("created_at", desde).lte("created_at", hasta),
    sb.from("quotes").select("id", { count: "exact", head: true })
      .eq("is_template", false).gte("created_at", desde).lte("created_at", hasta),
    sb.from("invoices").select("id", { count: "exact", head: true })
      .gte("created_at", desde).lte("created_at", hasta),
    // Vencidas por FECHA (no solo estado guardado): no pagadas y filtradas.
    sb.from("invoices").select("estado, vencimiento").neq("estado", "pagada"),
  ]);
  const invVencidas = (invUnpaid ?? []).filter((i: any) => isOverdue(i.estado, i.vencimiento)).length;

  return {
    correosProcesados: 0,
    leadsDetectados: leadsHoy ?? 0,
    presupuestos: quotesHoy ?? 0,
    facturas: invoicesHoy ?? 0,
    clientesEnfadados: invVencidas ?? 0,
    aiCostUsd: 0,
    aiCacheHits: 0,
  };
}

/** Timeline de actividad de los agentes (tiempo real vía Supabase Realtime). */
export async function getRecentActivity(tenantId: string, limit = 30): Promise<ActivityItem[]> {
  const { data } = await sb
    .from("agent_activity")
    .select("id,agent,action,used_ai,created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data as ActivityItem[]) ?? [];
}

/** Alertas abiertas (centro de incidencias). */
export async function getOpenAlerts(tenantId: string): Promise<AlertItem[]> {
  const { data } = await sb
    .from("alerts")
    .select("id,severity,title,detail,created_at,entity_type,entity_id")
    .eq("tenant_id", tenantId)
    .eq("resolved", false)
    .order("created_at", { ascending: false });
  return (data as AlertItem[]) ?? [];
}

export interface CeoReport {
  dia: string;
  resumen: string;
  riesgos: string[];
  oportunidades: string[];
}

/** Último informe ejecutivo del CEO Agent. Defensivo si la tabla no existe aún. */
export async function getCeoReport(tenantId: string): Promise<CeoReport | null> {
  try {
    const { data, error } = await sb
      .from("ceo_reports")
      .select("dia, resumen, riesgos, oportunidades")
      .eq("tenant_id", tenantId)
      .order("dia", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return {
      dia: data.dia as string,
      resumen: (data.resumen as string) ?? "",
      riesgos: (data.riesgos as string[]) ?? [],
      oportunidades: (data.oportunidades as string[]) ?? [],
    };
  } catch {
    return null;
  }
}

export interface AiSavings {
  totalCalls: number;
  cacheHits: number;
  paidCost: number;
  savingsUsd: number;
  hitRatePct: number;
}

/**
 * Resumen de ahorro real (vista ai_savings_summary, últimos 30 días).
 * Defensivo: si la vista aún no existe (migración 0011 sin aplicar), devuelve
 * ceros en vez de romper el dashboard.
 */
export async function getAiSavings(tenantId: string): Promise<AiSavings> {
  try {
    const { data, error } = await sb
      .from("ai_savings_summary")
      .select("*")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (error || !data) return { totalCalls: 0, cacheHits: 0, paidCost: 0, savingsUsd: 0, hitRatePct: 0 };
    return {
      totalCalls: data.total_calls ?? 0,
      cacheHits: data.cache_hits ?? 0,
      paidCost: Number(data.paid_cost ?? 0),
      savingsUsd: Number(data.savings_usd ?? 0),
      hitRatePct: Number(data.hit_rate_pct ?? 0),
    };
  } catch {
    return { totalCalls: 0, cacheHits: 0, paidCost: 0, savingsUsd: 0, hitRatePct: 0 };
  }
}

/** Coste de IA y aciertos de caché de los últimos N días (observabilidad). */
export async function getAiSpend(tenantId: string, days = 14): Promise<AiSpendPoint[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const { data } = await sb
    .from("metrics_daily")
    .select("dia, ai_cost_usd, ai_cache_hits")
    .eq("tenant_id", tenantId)
    .gte("dia", since)
    .order("dia", { ascending: true });
  return (
    (data ?? []).map((r) => ({
      dia: r.dia as string,
      cost: Number(r.ai_cost_usd ?? 0),
      cacheHits: (r.ai_cache_hits as number) ?? 0,
    })) ?? []
  );
}
