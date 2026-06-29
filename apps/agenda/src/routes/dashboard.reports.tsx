import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { getReports } from "@/lib/admin/admin.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/dashboard/PageHeader";

export const Route = createFileRoute("/dashboard/reports")({
  component: ReportsPage,
});

function ReportsPage() {
  const fetchReports = useServerFn(getReports);
  const [range, setRange] = useState<{ from?: string; to?: string }>({});

  const { data } = useQuery({
    queryKey: ["reports", range],
    queryFn: () => fetchReports({ data: { from: range.from || undefined, to: range.to || undefined } }),
  });

  return (
    <div>
      <PageHeader title="Informes" description="Métricas de tu negocio" />

      <Card className="mb-6 max-w-md">
        <CardContent className="grid grid-cols-2 gap-3 p-4">
          <div><Label className="text-xs">Desde</Label><Input type="date" value={range.from ?? ""} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} /></div>
          <div><Label className="text-xs">Hasta</Label><Input type="date" value={range.to ?? ""} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} /></div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Ingresos por período</CardTitle></CardHeader>
          <CardContent className="h-64">
            {data?.revenueSeries?.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.revenueSeries}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="total" stroke="var(--primary)" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground">Sin datos de ingresos.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Servicios más reservados</CardTitle></CardHeader>
          <CardContent className="h-64">
            {data?.topServices?.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.topServices.slice(0, 8)}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="nombre" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground">Sin reservas.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Ocupación por profesional</CardTitle></CardHeader>
          <CardContent className="h-64">
            {data?.occupancyByPro?.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.occupancyByPro.slice(0, 8)}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="nombre" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="var(--secondary)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground">Sin datos.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Tasa de cancelación</CardTitle></CardHeader>
          <CardContent className="flex h-64 flex-col items-center justify-center">
            <p className="text-5xl font-bold text-foreground">{(data?.cancellationRate ?? 0).toFixed(1)}%</p>
            <p className="mt-2 text-sm text-muted-foreground">de las citas en el período</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
