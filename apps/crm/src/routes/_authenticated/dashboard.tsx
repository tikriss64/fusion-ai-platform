import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Users, FileText, Receipt, TrendingUp, CalendarDays,
  AlertTriangle, AlertCircle, Loader2, Inbox, Euro, ChevronDown, ChevronUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, formatCurrency } from "@/lib/utils";
import type { TrabajoRow } from "@/lib/trabajos-schema";
import { TRABAJO_STATUS_LABELS, TRABAJO_STATUS_COLORS } from "@/lib/trabajos-schema";
import { isOverdue } from "@/lib/invoices-schema";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — vaciadodepisos.cat" }] }),
  component: DashboardPage,
});

type DashStats = {
  clientes: number;
  presupuestosPendientes: number;
  presupuestosSinRespuesta: number;
  facturadoTotal: number;
  pendienteCobro: number;
  factVencidas: number;
  factVencidasImporte: number;
  leadsNuevos: number;
  leadsFrios: number;
  ticketMedio: number;
};

type MonthPoint = { mes: string; total: number };
type PiePoint  = { name: string; value: number; color: string };

const QUOTE_STATUS_COLORS: Record<string, string> = {
  borrador:  "#94a3b8",
  enviado:   "#3b82f6",
  aceptado:  "#22c55e",
  rechazado: "#ef4444",
  facturado: "#8b5cf6",
};
const QUOTE_STATUS_LABELS: Record<string, string> = {
  borrador: "Borrador", enviado: "Enviado", aceptado: "Aceptado",
  rechazado: "Rechazado", facturado: "Facturado",
};
const SERVICE_COLORS: Record<string, string> = {
  vaciado:          "#3b82f6",
  limpieza:         "#22c55e",
  retirada_muebles: "#f97316",
  mixto:            "#8b5cf6",
};
const SERVICE_LABELS: Record<string, string> = {
  vaciado: "Vaciado", limpieza: "Limpieza",
  retirada_muebles: "Retirada muebles", mixto: "Mixto",
};
const LEAD_COLORS: Record<string, string> = {
  nuevo: "#3b82f6", contactado: "#eab308",
  convertido: "#22c55e", descartado: "#94a3b8",
};
const LEAD_LABELS: Record<string, string> = {
  nuevo: "Nuevo", contactado: "Contactado",
  convertido: "Convertido", descartado: "Descartado",
};

function buildMonthlyChart(invoices: Array<{ fecha_emision: string; total: number }>): MonthPoint[] {
  const map: Record<string, number> = {};
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    map[key] = 0;
  }
  for (const inv of invoices) {
    const key = inv.fecha_emision.slice(0, 7);
    if (key in map) map[key] = (map[key] ?? 0) + Number(inv.total);
  }
  return Object.entries(map).map(([k, total]) => ({
    mes: new Date(k + "-01").toLocaleDateString("es-ES", { month: "short", year: "2-digit" }),
    total: Math.round(total * 100) / 100,
  }));
}

function buildPie(data: Record<string, number>, labels: Record<string, string>, colors: Record<string, string>): PiePoint[] {
  return Object.entries(data)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ name: labels[k] ?? k, value: v, color: colors[k] ?? "#94a3b8" }));
}

function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [showAlertas, setShowAlertas] = useState(false);
  const [stats, setStats] = useState<DashStats>({
    clientes: 0, presupuestosPendientes: 0, presupuestosSinRespuesta: 0, facturadoTotal: 0,
    pendienteCobro: 0, factVencidas: 0, factVencidasImporte: 0, leadsNuevos: 0, leadsFrios: 0, ticketMedio: 0,
  });
  const [proximosTrabajos, setProximosTrabajos] = useState<Array<TrabajoRow & { clientNombre?: string }>>([]);
  const [incoherencias, setIncoherencias] = useState<Array<{ text: string; to: string }>>([]);
  const [chartIngresos, setChartIngresos]       = useState<MonthPoint[]>([]);
  const [chartQuoteStatus, setChartQuoteStatus] = useState<PiePoint[]>([]);
  const [chartServicio, setChartServicio]       = useState<PiePoint[]>([]);
  const [chartLeads, setChartLeads]             = useState<PiePoint[]>([]);

  useEffect(() => { void load(); }, []);

  const load = async () => {
    setLoading(true);
    const hoy        = new Date().toISOString().slice(0, 10);
    const en7dias    = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
    const hace6meses = new Date(); hace6meses.setMonth(hace6meses.getMonth() - 5); hace6meses.setDate(1);
    const fechaChart = hace6meses.toISOString().slice(0, 10);

    const [
      { count: nClientes },
      { data: quotes },
      { data: invoices },
      { data: trabajos },
      { data: clients },
      { data: payments },
      { data: invoicesChart },
      { count: leadsNuevos },
      { data: leadsAll },
      { data: trabajosAll },
    ] = await Promise.all([
      supabase.from("clients").select("id", { count: "exact", head: true }),
      supabase.from("quotes").select("id, estado, tipo_servicio, fecha").eq("is_template", false),
      supabase.from("invoices").select("id, total, estado, vencimiento, quote_id"),
      supabase.from("trabajos").select("*")
        .gte("fecha", hoy).lte("fecha", en7dias)
        .not("estado", "in", "(completado,cancelado)")
        .order("fecha").order("hora"),
      supabase.from("clients").select("id, nombre, email, telefono"),
      supabase.from("invoice_payments").select("invoice_id, importe"),
      supabase.from("invoices").select("fecha_emision, total").gte("fecha_emision", fechaChart),
      supabase.from("leads").select("id", { count: "exact", head: true }).eq("estado", "nuevo"),
      supabase.from("leads").select("estado, created_at"),
      supabase.from("trabajos").select("quote_id, estado"),
    ]);

    const clientMap: Record<string, string> = Object.fromEntries(
      (clients ?? []).map((c: any) => [c.id, c.nombre]),
    );
    const paidByInvoice: Record<string, number> = {};
    for (const p of payments ?? []) {
      paidByInvoice[p.invoice_id] = (paidByInvoice[p.invoice_id] ?? 0) + Number(p.importe);
    }

    const invList        = invoices ?? [];
    const facturadoTotal = invList.reduce((s, i) => s + Number(i.total), 0);
    const pendienteCobro = invList
      .filter((i) => ["pendiente", "parcial", "vencida"].includes(i.estado))
      .reduce((s, i) => s + Math.max(0, Number(i.total) - (paidByInvoice[i.id] ?? 0)), 0);
    // Vencida = por FECHA (no solo el estado guardado), para coincidir con Riesgos.
    const vencidasList   = invList.filter((i) => isOverdue(i.estado, (i as any).vencimiento, hoy));
    const factVencidas   = vencidasList.length;
    const factVencidasImporte = vencidasList.reduce((s, i) => s + Math.max(0, Number(i.total) - (paidByInvoice[i.id] ?? 0)), 0);
    // Presupuestos enviados hace más de 7 días sin respuesta (necesitan seguimiento).
    const hace7 = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
    const presupuestosSinRespuesta = (quotes ?? [])
      .filter((q: any) => q.estado === "enviado" && q.fecha && q.fecha < hace7).length;
    const pagadas        = invList.filter((i) => i.estado === "pagada");
    const ticketMedio    = pagadas.length > 0
      ? pagadas.reduce((s, i) => s + Number(i.total), 0) / pagadas.length : 0;

    // Chart: ingresos mensuales
    setChartIngresos(buildMonthlyChart(invoicesChart ?? []));

    // Chart: estado presupuestos
    const qStatus: Record<string, number> = {};
    for (const q of quotes ?? []) { qStatus[q.estado] = (qStatus[q.estado] ?? 0) + 1; }
    setChartQuoteStatus(buildPie(qStatus, QUOTE_STATUS_LABELS, QUOTE_STATUS_COLORS));

    // Chart: tipos de servicio
    const sType: Record<string, number> = {};
    for (const q of quotes ?? []) {
      if (q.tipo_servicio) sType[q.tipo_servicio] = (sType[q.tipo_servicio] ?? 0) + 1;
    }
    setChartServicio(buildPie(sType, SERVICE_LABELS, SERVICE_COLORS));

    // Chart: estado leads
    const lStatus: Record<string, number> = {};
    for (const l of leadsAll ?? []) { lStatus[l.estado] = (lStatus[l.estado] ?? 0) + 1; }
    setChartLeads(buildPie(lStatus, LEAD_LABELS, LEAD_COLORS));

    // Leads fríos: nuevos sin contactar desde hace +3 días (necesitan acción ya).
    const tresDias = Date.now() - 3 * 86_400_000;
    const leadsFrios = (leadsAll ?? []).filter(
      (l: any) => l.estado === "nuevo" && l.created_at && new Date(l.created_at).getTime() < tresDias,
    ).length;

    // ── Detección automática de incoherencias de datos ──────────────────────
    const inc: Array<{ text: string; to: string }> = [];
    // 1) Facturas pendientes de cobro sin fecha de vencimiento (no se pueden seguir).
    const sinVenc = invList.filter((i: any) => ["pendiente", "parcial"].includes(i.estado) && !i.vencimiento).length;
    if (sinVenc > 0) inc.push({ text: `${sinVenc} factura${sinVenc > 1 ? "s" : ""} sin fecha de vencimiento`, to: "/invoices" });
    // 2) Clientes sin ningún medio de contacto (ni email ni teléfono).
    const sinContacto = (clients ?? []).filter((c: any) => !c.email && !c.telefono).length;
    if (sinContacto > 0) inc.push({ text: `${sinContacto} cliente${sinContacto > 1 ? "s" : ""} sin email ni teléfono`, to: "/clientes" });
    // 3) Presupuestos aceptados sin trabajo programado (bucle sin cerrar).
    const quoteIdsConTrabajo = new Set((trabajosAll ?? []).map((t: any) => t.quote_id).filter(Boolean));
    const aceptadosSinTrabajo = (quotes ?? []).filter((q: any) => q.estado === "aceptado" && !quoteIdsConTrabajo.has(q.id)).length;
    if (aceptadosSinTrabajo > 0) inc.push({ text: `${aceptadosSinTrabajo} presupuesto${aceptadosSinTrabajo > 1 ? "s" : ""} aceptado${aceptadosSinTrabajo > 1 ? "s" : ""} sin trabajo programado`, to: "/quotes" });
    // 4) Trabajos completados con presupuesto pero sin facturar (dinero sin cobrar).
    const quoteIdsFacturados = new Set((invoices ?? []).map((i: any) => i.quote_id).filter(Boolean));
    const completadosSinFacturar = (trabajosAll ?? []).filter((t: any) => t.estado === "completado" && t.quote_id && !quoteIdsFacturados.has(t.quote_id)).length;
    if (completadosSinFacturar > 0) inc.push({ text: `${completadosSinFacturar} trabajo${completadosSinFacturar > 1 ? "s" : ""} completado${completadosSinFacturar > 1 ? "s" : ""} sin facturar`, to: "/agenda" });
    setIncoherencias(inc);

    setStats({
      clientes: nClientes ?? 0,
      presupuestosPendientes: (quotes ?? []).filter((q) => q.estado === "enviado").length,
      presupuestosSinRespuesta,
      facturadoTotal, pendienteCobro, factVencidas, factVencidasImporte,
      leadsNuevos: leadsNuevos ?? 0,
      leadsFrios,
      ticketMedio,
    });

    setProximosTrabajos(
      (trabajos ?? []).map((t: any) => ({
        ...(t as TrabajoRow),
        clientNombre: t.client_id ? clientMap[t.client_id] : undefined,
      })),
    );

    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const hoyStr = new Date().toISOString().slice(0, 10);
  const trabajosHoy = proximosTrabajos.filter((t) => t.fecha === hoyStr).length;

  // Acciones pendientes que requieren atención, agregadas de todos los módulos.
  const acciones = [
    stats.factVencidas > 0 && {
      icon: AlertTriangle,
      tone: "danger" as const,
      text: stats.factVencidas === 1
        ? `1 factura vencida sin cobrar (${formatCurrency(stats.factVencidasImporte)})`
        : `${stats.factVencidas} facturas vencidas sin cobrar (${formatCurrency(stats.factVencidasImporte)})`,
      cta: "Cobrar", to: "/riesgos",
    },
    stats.leadsFrios > 0 && {
      icon: Inbox,
      tone: "danger" as const,
      text: stats.leadsFrios === 1
        ? "1 lead frío sin contactar (+3 días)"
        : `${stats.leadsFrios} leads fríos sin contactar (+3 días)`,
      cta: "Contactar ya", to: "/leads",
    },
    stats.leadsNuevos - stats.leadsFrios > 0 && {
      icon: Inbox,
      tone: "warn" as const,
      text: stats.leadsNuevos - stats.leadsFrios === 1 ? "1 lead nuevo sin contactar" : `${stats.leadsNuevos - stats.leadsFrios} leads nuevos sin contactar`,
      cta: "Contactar", to: "/leads",
    },
    stats.presupuestosSinRespuesta > 0 && {
      icon: FileText,
      tone: "warn" as const,
      text: stats.presupuestosSinRespuesta === 1
        ? "1 presupuesto sin respuesta hace +7 días"
        : `${stats.presupuestosSinRespuesta} presupuestos sin respuesta hace +7 días`,
      cta: "Seguimiento", to: "/esperando",
    },
    trabajosHoy > 0 && {
      icon: CalendarDays,
      tone: "info" as const,
      text: trabajosHoy === 1 ? "1 trabajo programado para hoy" : `${trabajosHoy} trabajos programados para hoy`,
      cta: "Ver agenda", to: "/agenda",
    },
  ].filter(Boolean) as Array<{ icon: React.ElementType; tone: "danger" | "warn" | "info"; text: string; cta: string; to: string }>;

  const toneStyles = {
    danger: "border-destructive/40 bg-destructive/8 text-destructive",
    warn: "border-amber-400/40 bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400",
    info: "border-primary/30 bg-primary/8 text-primary",
  };

  const hasDanger = acciones.some((a) => a.tone === "danger");

  return (
    <div className="space-y-6">
      {/* Cabecera limpia: título a la izquierda y un único botón de alertas a la derecha. */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Vista general del negocio.</p>
        </div>
        {acciones.length > 0 && (
          <button
            type="button"
            onClick={() => setShowAlertas((v) => !v)}
            className="shrink-0 inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
          >
            <AlertTriangle className={`h-4 w-4 ${hasDanger ? "text-destructive" : "text-amber-500"}`} />
            <span className="hidden sm:inline">Detalle alertas</span>
            <span className="sm:hidden">Alertas</span>
            <span className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-bold text-white ${hasDanger ? "bg-destructive" : "bg-amber-500"}`}>
              {acciones.length}
            </span>
            {showAlertas ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        )}
      </div>

      {/* Panel desplegable de alertas: ancho completo, una alerta por fila con espacio. */}
      {showAlertas && acciones.length > 0 && (
        <Card>
          <CardContent className="space-y-2 p-2 sm:p-3">
            {acciones.map((a, i) => {
              const Icon = a.icon;
              return (
                <Link
                  key={i}
                  to={a.to as any}
                  className={`flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors hover:brightness-95 ${toneStyles[a.tone]}`}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  <span className="flex-1 text-sm font-medium">{a.text}</span>
                  <span className="shrink-0 whitespace-nowrap text-xs font-semibold underline underline-offset-2">{a.cta} →</span>
                </Link>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Incoherencias detectadas — el sistema avisa solo de datos a revisar */}
      {incoherencias.length > 0 && (
        <Card className="border-amber-300/40">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-amber-500" /> Datos a revisar
            </CardTitle>
            <p className="text-xs text-muted-foreground">El sistema ha detectado información incompleta o incoherente.</p>
          </CardHeader>
          <CardContent className="space-y-2">
            {incoherencias.map((inc, i) => (
              <Link
                key={i}
                to={inc.to as any}
                className="flex items-center gap-3 rounded-lg border border-amber-200/60 dark:border-amber-900/40 bg-amber-50/50 dark:bg-amber-950/10 px-4 py-2.5 text-sm text-amber-800 dark:text-amber-300 transition-colors hover:brightness-95"
              >
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span className="flex-1 font-medium">{inc.text}</span>
                <span className="text-xs font-semibold underline underline-offset-2 whitespace-nowrap">Revisar →</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {/* KPIs fila 1 */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Clientes" value={stats.clientes} icon={Users} to="/clientes" />
        <StatCard
          label="Presupuestos"
          value={stats.presupuestosPendientes}
          icon={FileText}
          to="/quotes"
          subtitle="pendientes de respuesta"
          highlight={stats.presupuestosPendientes > 0}
        />
        <StatCard
          label="Pendiente cobro"
          value={formatCurrency(stats.pendienteCobro)}
          icon={Receipt}
          to="/invoices"
          highlight={stats.pendienteCobro > 0}
        />
        <StatCard
          label="Total facturado"
          value={formatCurrency(stats.facturadoTotal)}
          icon={TrendingUp}
          subtitle="histórico acumulado"
        />
        <StatCard
          label="Leads nuevos"
          value={stats.leadsNuevos}
          icon={Inbox}
          to="/leads"
          highlight={stats.leadsNuevos > 0}
          subtitle="sin gestionar"
        />
        <StatCard
          label="Ticket medio"
          value={stats.ticketMedio > 0 ? formatCurrency(stats.ticketMedio) : "—"}
          icon={Euro}
          subtitle="facturas pagadas"
        />
      </div>

      {/* Gráficos fila 1 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Facturación mensual</CardTitle>
            <p className="text-xs text-muted-foreground">Últimos 6 meses</p>
          </CardHeader>
          <CardContent>
            {chartIngresos.every((p) => p.total === 0) ? (
              <EmptyChart text="Sin facturas en los últimos 6 meses." />
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartIngresos} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} width={50}
                    tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
                  <Tooltip formatter={(v: number) => [formatCurrency(v), "Facturado"]} />
                  <Bar dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Estado de presupuestos</CardTitle>
          </CardHeader>
          <CardContent>
            {chartQuoteStatus.length === 0 ? (
              <EmptyChart text="Sin presupuestos registrados." />
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={chartQuoteStatus} cx="50%" cy="50%"
                    innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value">
                    {chartQuoteStatus.map((e, i) => (
                      <Cell key={i} fill={e.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number, name: string) => [v, name]} />
                  <Legend iconType="circle" iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Gráficos fila 2 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Leads por estado</CardTitle>
          </CardHeader>
          <CardContent>
            {chartLeads.length === 0 ? (
              <EmptyChart text="Sin leads registrados todavía." />
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={chartLeads} cx="50%" cy="50%"
                    innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value">
                    {chartLeads.map((e, i) => (
                      <Cell key={i} fill={e.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number, name: string) => [v, name]} />
                  <Legend iconType="circle" iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tipos de servicio</CardTitle>
            <p className="text-xs text-muted-foreground">Por presupuestos</p>
          </CardHeader>
          <CardContent>
            {chartServicio.length === 0 ? (
              <EmptyChart text="Sin tipos de servicio registrados." />
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={chartServicio} cx="50%" cy="50%"
                    innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value">
                    {chartServicio.map((e, i) => (
                      <Cell key={i} fill={e.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number, name: string) => [v, name]} />
                  <Legend iconType="circle" iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Próximos 7 días */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="h-4 w-4" /> Próximos 7 días
          </CardTitle>
        </CardHeader>
        <CardContent>
          {proximosTrabajos.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Sin trabajos programados para esta semana.{" "}
              <Link to="/agenda" className="underline underline-offset-2">Ir a la agenda →</Link>
            </p>
          ) : (
            <div className="space-y-2">
              {proximosTrabajos.map((t) => (
                <Link
                  key={t.id}
                  to="/agenda"
                  className="flex items-center gap-3 rounded-md border p-3 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{formatDate(t.fecha)}</span>
                      {t.hora && (
                        <span className="text-xs text-muted-foreground">{t.hora.slice(0, 5)}h</span>
                      )}
                      <Badge className={`text-xs ${TRABAJO_STATUS_COLORS[t.estado]}`}>
                        {TRABAJO_STATUS_LABELS[t.estado]}
                      </Badge>
                    </div>
                    {t.clientNombre && (
                      <p className="text-sm text-muted-foreground truncate">{t.clientNombre}</p>
                    )}
                    {t.direccion && (
                      <p className="text-xs text-muted-foreground truncate">{t.direccion}</p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function EmptyChart({ text }: { text: string }) {
  return (
    <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function StatCard({
  label, value, icon: Icon, subtitle, to, highlight,
}: {
  label: string; value: string | number; icon: React.ElementType;
  subtitle?: string; to?: string; highlight?: boolean;
}) {
  const card = (
    <Card className={`group card-lift h-full ${highlight ? "border-primary/40" : "hover:border-primary/30"}`}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className={`h-4 w-4 transition-all duration-300 group-hover:scale-110 ${highlight ? "text-accent" : "text-muted-foreground group-hover:text-primary"}`} />
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-semibold tabular-nums ${highlight ? "text-primary" : ""}`}>{value}</div>
        {subtitle && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
      </CardContent>
    </Card>
  );
  if (to) return <Link to={to as any} className="block">{card}</Link>;
  return card;
}
