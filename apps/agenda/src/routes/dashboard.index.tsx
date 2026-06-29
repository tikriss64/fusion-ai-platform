import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarCheck, Euro, Activity, XCircle } from "lucide-react";
import { getDashboardOverview, setAppointmentStatus } from "@/lib/admin/admin.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/")({
  component: DashboardHome,
});

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  confirmed: "Confirmada",
  cancelled: "Cancelada",
  completed: "Completada",
  no_show: "No asistió",
};

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

function DashboardHome() {
  const fetchOverview = useServerFn(getDashboardOverview);
  const updateStatus = useServerFn(setAppointmentStatus);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-overview"],
    queryFn: () => fetchOverview(),
  });

  const serviceMap = new Map((data?.services ?? []).map((s: any) => [s.id, s]));
  const proMap = new Map((data?.professionals ?? []).map((p: any) => [p.id, p.nombre]));

  async function changeStatus(id: string, estado: any) {
    try {
      await updateStatus({ data: { id, estado } });
      toast.success("Cita actualizada");
      qc.invalidateQueries({ queryKey: ["dashboard-overview"] });
    } catch (e: any) {
      toast.error(e.message ?? "Error");
    }
  }

  const cards = [
    { label: "Citas de hoy", value: data?.totalToday ?? 0, icon: CalendarCheck },
    { label: "Ingresos del día", value: `${(data?.revenueToday ?? 0).toFixed(2)} €`, icon: Euro },
    { label: "Ocupación", value: data?.occupancy ?? 0, icon: Activity },
    { label: "Cancelaciones", value: data?.cancelledToday ?? 0, icon: XCircle },
  ];

  return (
    <div>
      <PageHeader title="Dashboard" description="Resumen de tu día" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{c.label}</CardTitle>
              <c.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-foreground">{c.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Próximas citas de hoy</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : !data?.upcoming.length ? (
            <p className="text-sm text-muted-foreground">No hay citas para hoy.</p>
          ) : (
            <div className="divide-y divide-border">
              {data.upcoming.map((a: any) => {
                const svc = serviceMap.get(a.servicio_id) as any;
                return (
                  <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="flex items-center gap-3">
                      <span
                        className="h-9 w-1 rounded-full"
                        style={{ background: svc?.color ?? "var(--primary)" }}
                      />
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {fmtTime(a.hora_inicio)} · {svc?.nombre ?? "Servicio"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {proMap.get(a.profesional_id) ?? "Sin asignar"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={a.estado === "cancelled" ? "destructive" : "secondary"}>
                        {STATUS_LABEL[a.estado] ?? a.estado}
                      </Badge>
                      {a.estado !== "confirmed" && a.estado !== "cancelled" && (
                        <Button size="sm" variant="outline" onClick={() => changeStatus(a.id, "confirmed")}>
                          Confirmar
                        </Button>
                      )}
                      {a.estado !== "completed" && a.estado !== "cancelled" && (
                        <Button size="sm" variant="ghost" onClick={() => changeStatus(a.id, "completed")}>
                          Completar
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
