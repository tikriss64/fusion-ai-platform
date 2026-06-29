// Mission Control — dashboard unificado del AI Operations Center.
// Muestra KPIs, alertas, timeline de agentes y observabilidad de coste de IA.
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  Bot,
  Briefcase,
  CheckCircle2,
  ChevronRight,
  FileText,
  Inbox,
  Lightbulb,
  PiggyBank,
  Receipt,
  ShieldAlert,
  Zap,
} from "lucide-react";
import type { AlertItem } from "./queries";
import { apiFetch } from "@/components/inbox/api-client";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const AGENT_COLORS = [
  "#3b82f6", "#8b5cf6", "#22c55e", "#f97316",
  "#ec4899", "#06b6d4", "#a855f7", "#f59e0b",
];
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  getAiSavings,
  getAiSpend,
  getCeoReport,
  getDashboardMetrics,
  getOpenAlerts,
  getRecentActivity,
} from "./queries";
import { useMissionControlRealtime } from "./useRealtime";

function Kpi({ icon: Icon, label, value, hint, accent = false }: {
  icon: typeof Inbox;
  label: string;
  value: string | number;
  hint?: string;
  /** Si true, el KPI usa el color de acento (naranja) en vez del primario. */
  accent?: boolean;
}) {
  return (
    <Card className="group relative overflow-hidden p-4 flex items-center gap-3 transition-all duration-300 ease-out hover:-translate-y-0.5 hover:shadow-xl hover:shadow-primary/10 hover:border-primary/30">
      {/* Gradient sutil que se enciende al hover */}
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100 ${
          accent ? "bg-gradient-to-br from-accent/10 via-transparent to-transparent" : "bg-gradient-to-br from-primary/8 via-transparent to-transparent"
        }`}
      />
      <div className={`relative rounded-xl p-2.5 transition-transform duration-300 group-hover:scale-110 ${
        accent ? "bg-accent/15 text-accent" : "bg-primary/10 text-primary"
      }`}>
        <Icon className="size-5" />
      </div>
      <div className="relative min-w-0">
        <div className="text-2xl font-bold tabular-nums leading-none">{value}</div>
        <div className="mt-1 text-xs text-muted-foreground truncate">{label}</div>
        {hint && <div className="mt-0.5 text-[11px] font-medium text-emerald-600">{hint}</div>}
      </div>
    </Card>
  );
}

export function MissionControl({ tenantId }: { tenantId: string }) {
  // Actualización instantánea vía Supabase Realtime (push). Los refetchInterval
  // de abajo son solo un respaldo largo por si Realtime no estuviera disponible.
  useMissionControlRealtime(tenantId);
  const navigate = useNavigate();

  // Al pulsar una alerta, lleva a la entidad que la causó.
  function goToAlert(a: AlertItem) {
    const id = a.entity_id ?? undefined;
    switch (a.entity_type) {
      case "invoice":
        return id ? navigate({ to: "/invoices/$id", params: { id } }) : navigate({ to: "/invoices" });
      case "client":
        return id ? navigate({ to: "/clientes/$id", params: { id } }) : navigate({ to: "/clientes" });
      case "quote":
        return navigate({ to: "/quotes" });
      case "lead":
        return navigate({ to: "/leads" });
      case "trabajo":
        return navigate({ to: "/agenda" });
      default:
        // Alertas de configuración (sin entidad) → Ajustes.
        return navigate({ to: "/settings" });
    }
  }

  const metrics = useQuery({
    queryKey: ["mc-metrics", tenantId],
    queryFn: () => getDashboardMetrics(tenantId),
    refetchInterval: 120_000,
  });
  // Correos recibidos hoy en la Bandeja (la tabla email solo es accesible desde
  // el servidor, así que se cuenta vía /api/today, no por Supabase directo).
  const today = useQuery({
    queryKey: ["mc-today"],
    queryFn: async () => {
      const r = await apiFetch("/api/today");
      return (await r.json()) as { todayInbox?: number };
    },
    refetchInterval: 120_000,
  });
  const alerts = useQuery({
    queryKey: ["mc-alerts", tenantId],
    queryFn: () => getOpenAlerts(tenantId),
    refetchInterval: 120_000,
  });
  const activity = useQuery({
    queryKey: ["mc-activity", tenantId],
    queryFn: () => getRecentActivity(tenantId),
    refetchInterval: 120_000,
  });
  const spend = useQuery({
    queryKey: ["mc-spend", tenantId],
    queryFn: () => getAiSpend(tenantId),
  });
  const savings = useQuery({
    queryKey: ["mc-savings", tenantId],
    queryFn: () => getAiSavings(tenantId),
  });
  const ceo = useQuery({
    queryKey: ["mc-ceo", tenantId],
    queryFn: () => getCeoReport(tenantId),
  });

  const m = metrics.data;
  const sv = savings.data;
  const report = ceo.data;
  const totalCacheHits = (spend.data ?? []).reduce((s, p) => s + p.cacheHits, 0);

  const agentActivity = useMemo(() => {
    const counts: Record<string, { total: number; withAi: number }> = {};
    for (const it of activity.data ?? []) {
      const c = counts[it.agent] ?? { total: 0, withAi: 0 };
      c.total++;
      if (it.used_ai) c.withAi++;
      counts[it.agent] = c;
    }
    return Object.entries(counts)
      .map(([agent, { total, withAi }]) => ({ agent, total, withAi }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [activity.data]);

  return (
    <div className="relative space-y-6 p-6">
      {/* Fondo sutil con puntos estilo Vercel, recortado a la zona del título */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-48 opacity-[0.25]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, var(--muted-foreground) 1px, transparent 0)",
          backgroundSize: "22px 22px",
          maskImage: "linear-gradient(to bottom, black, transparent)",
        }}
      />

      <div className="relative flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Mission <span className="text-accent">Control</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            Centro de operaciones IA — todo en una pantalla
          </p>
        </div>
        {totalCacheHits > 0 && (
          <Badge
            variant="outline"
            className="gap-1.5 border-accent/40 bg-accent/10 text-accent transition-all duration-300 hover:bg-accent/20 hover:shadow-md hover:shadow-accent/20"
          >
            <Zap className="size-3 fill-accent" />
            <span className="font-semibold tabular-nums">{totalCacheHits}</span>
            <span className="text-foreground/70">llamadas IA ahorradas</span>
          </Badge>
        )}
      </div>

      {/* Informe ejecutivo del CEO Agent */}
      {report && (
        <Card className="relative overflow-hidden border-primary/20 bg-gradient-to-br from-primary/[0.06] via-card to-card p-5">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-primary/10 p-2.5 text-primary shrink-0">
              <Briefcase className="size-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-semibold">Informe del CEO Agent</h2>
                <Badge variant="outline" className="text-[10px]">
                  {new Date(report.dia).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{report.resumen}</p>

              {(report.riesgos.length > 0 || report.oportunidades.length > 0) && (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {report.riesgos.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-red-600">
                        <ShieldAlert className="size-3.5" /> Riesgos
                      </div>
                      <ul className="mt-1 space-y-0.5">
                        {report.riesgos.map((r) => (
                          <li key={r} className="text-xs text-muted-foreground">• {r}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {report.oportunidades.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
                        <Lightbulb className="size-3.5" /> Oportunidades
                      </div>
                      <ul className="mt-1 space-y-0.5">
                        {report.oportunidades.map((o) => (
                          <li key={o} className="text-xs text-muted-foreground">• {o}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Banner de ahorro real — se actualiza automáticamente conforme la IA trabaja */}
      <Card className="relative overflow-hidden border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-card to-card p-5">
        <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-emerald-500/15 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="rounded-2xl bg-emerald-500/15 p-3 text-emerald-600">
              <PiggyBank className="size-7" />
            </div>
            <div>
              <div className="text-3xl font-bold tabular-nums text-emerald-600">
                ${(sv?.savingsUsd ?? 0).toFixed(2)}
              </div>
              <div className="text-sm text-muted-foreground">
                ahorrado en IA (últimos 30 días) ·{" "}
                <span className="font-semibold text-foreground">{sv?.hitRatePct ?? 0}%</span> de aciertos de caché
              </div>
            </div>
          </div>
          <div className="flex gap-6 text-right">
            <div>
              <div className="text-lg font-semibold tabular-nums">{sv?.totalCalls ?? 0}</div>
              <div className="text-xs text-muted-foreground">llamadas totales</div>
            </div>
            <div>
              <div className="text-lg font-semibold tabular-nums">{sv?.cacheHits ?? 0}</div>
              <div className="text-xs text-muted-foreground">llamadas evitadas</div>
            </div>
            <div>
              <div className="text-lg font-semibold tabular-nums">${(sv?.paidCost ?? 0).toFixed(2)}</div>
              <div className="text-xs text-muted-foreground">coste real pagado</div>
            </div>
          </div>
        </div>
      </Card>

      {/* KPIs — datos de metrics_daily si hay agentes corriendo, si no de tablas reales */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Kpi icon={Inbox} label="Correos hoy" value={today.data?.todayInbox ?? m?.correosProcesados ?? "—"} />
        <Kpi icon={Bot} label="Leads hoy" value={m?.leadsDetectados ?? "—"} />
        <Kpi icon={FileText} label="Presupuestos hoy" value={m?.presupuestos ?? "—"} />
        <Kpi icon={Receipt} label="Facturas hoy" value={m?.facturas ?? "—"} />
        <Kpi icon={AlertTriangle} label={m?.aiCostUsd ? "Clientes enfadados" : "Facturas vencidas"} value={m?.clientesEnfadados ?? "—"} />
        {m?.aiCostUsd ? (
          <Kpi
            icon={PiggyBank}
            label="Coste IA hoy"
            value={`$${m.aiCostUsd.toFixed(4)}`}
            hint={`${m.aiCacheHits ?? 0} de caché`}
            accent
          />
        ) : (
          <Kpi icon={PiggyBank} label="Coste IA hoy" value="—" hint="Sin datos aún" accent />
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Actividad por agente */}
        <Card className="p-4 lg:col-span-2 transition-all duration-300 hover:shadow-lg hover:border-primary/20">
          <h2 className="text-sm font-medium mb-3">Actividad por agente (últimas acciones)</h2>
          {agentActivity.length === 0 ? (
            <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
              <Bot className="size-5 mr-2 opacity-40" /> Sin actividad registrada aún.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={agentActivity} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="agent" fontSize={10} tick={{ fill: "var(--muted-foreground)" }} />
                <YAxis fontSize={11} width={32} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v: number, name: string) => [v, name === "total" ? "Total" : "Con IA"]} />
                <Bar dataKey="total" name="Total acciones" radius={[4, 4, 0, 0]} maxBarSize={48}>
                  {agentActivity.map((_, i) => (
                    <Cell key={i} fill={AGENT_COLORS[i % AGENT_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Centro de alertas */}
        <Card className="p-4">
          <h2 className="text-sm font-medium mb-3">Alertas abiertas</h2>
          <ScrollArea className="h-[220px] pr-3">
            <div className="space-y-2">
              {(alerts.data ?? []).length === 0 && (
                <div className="flex flex-col items-center gap-1.5 py-8 text-center">
                  <CheckCircle2 className="size-7 text-emerald-500" />
                  <p className="text-sm font-medium text-foreground">Todo en orden 🎉</p>
                  <p className="text-xs text-muted-foreground">
                    No hay nada que requiera tu atención ahora mismo.
                  </p>
                </div>
              )}
              {(alerts.data ?? []).map((a) => (
                <button
                  type="button"
                  key={a.id}
                  onClick={() => goToAlert(a)}
                  className="group/alert flex w-full items-start gap-2 rounded-md p-1.5 -mx-1.5 text-left text-sm transition-colors hover:bg-accent/10"
                  title="Ir al origen del aviso"
                >
                  <span className="mt-0.5">
                    {a.severity === "critical" ? "🔴" : a.severity === "warning" ? "🟡" : "🟢"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{a.title}</div>
                    {a.detail && <div className="text-xs text-muted-foreground">{a.detail}</div>}
                  </div>
                  <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground/40 transition-all group-hover/alert:text-accent group-hover/alert:translate-x-0.5" />
                </button>
              ))}
            </div>
          </ScrollArea>
        </Card>
      </div>

      {/* Timeline de actividad de agentes */}
      <Card className="p-4">
        <h2 className="text-sm font-medium mb-3">Actividad de agentes</h2>
        <ScrollArea className="h-[260px] pr-3">
          <div className="space-y-1.5">
            {(activity.data ?? []).length === 0 && (
              <div className="flex flex-col items-center gap-1.5 py-10 text-center">
                <Bot className="size-7 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  Tus ayudantes aún no han hecho nada hoy.
                </p>
                <p className="text-xs text-muted-foreground/70">
                  En cuanto entren leads o muevas presupuestos, su actividad aparecerá aquí.
                </p>
              </div>
            )}
            {(activity.data ?? []).map((it) => (
              <div key={it.id} className="flex items-center gap-3 text-sm">
                <span className="text-xs text-muted-foreground tabular-nums w-16 shrink-0">
                  {new Date(it.created_at).toLocaleTimeString("es-ES", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <Badge variant="secondary" className="shrink-0">{it.agent}</Badge>
                <span className="truncate">{it.action}</span>
                {it.used_ai ? (
                  <Zap className="size-3 text-amber-500 shrink-0" />
                ) : (
                  <span className="text-[10px] text-emerald-600 shrink-0">0 tok</span>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </Card>
    </div>
  );
}
