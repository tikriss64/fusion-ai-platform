import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  listAppointments,
  setAppointmentStatus,
  listWaitlist,
  addWaitlist,
  removeWaitlist,
  listServices,
} from "@/lib/admin/admin.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/appointments")({
  component: AppointmentsPage,
});

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  confirmed: "Confirmada",
  cancelled: "Cancelada",
  completed: "Completada",
  no_show: "No asistió",
};

function AppointmentsPage() {
  return (
    <div>
      <PageHeader title="Citas" description="Gestiona reservas y lista de espera" />
      <Tabs defaultValue="list">
        <TabsList>
          <TabsTrigger value="list">Listado</TabsTrigger>
          <TabsTrigger value="waitlist">Lista de espera</TabsTrigger>
        </TabsList>
        <TabsContent value="list" className="mt-4">
          <AppointmentList />
        </TabsContent>
        <TabsContent value="waitlist" className="mt-4">
          <WaitlistPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AppointmentList() {
  const fetchAppts = useServerFn(listAppointments);
  const updateStatus = useServerFn(setAppointmentStatus);
  const qc = useQueryClient();

  const [filters, setFilters] = useState<{ estado?: string; profesionalId?: string; servicioId?: string; from?: string; to?: string }>({});

  const { data, isLoading } = useQuery({
    queryKey: ["appointments", filters],
    queryFn: () =>
      fetchAppts({
        data: {
          estado: filters.estado || undefined,
          profesionalId: filters.profesionalId || undefined,
          servicioId: filters.servicioId || undefined,
          from: filters.from || undefined,
          to: filters.to || undefined,
        },
      }),
  });

  const clientMap = new Map((data?.clients ?? []).map((c: any) => [c.id, c]));
  const serviceMap = new Map((data?.services ?? []).map((s: any) => [s.id, s]));
  const proMap = new Map((data?.professionals ?? []).map((p: any) => [p.id, p.nombre]));

  async function changeStatus(id: string, estado: any) {
    try {
      await updateStatus({ data: { id, estado } });
      toast.success("Cita actualizada");
      qc.invalidateQueries({ queryKey: ["appointments"] });
    } catch (e: any) {
      toast.error(e.message ?? "Error");
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <Label className="text-xs">Estado</Label>
            <Select value={filters.estado ?? "all"} onValueChange={(v) => setFilters((f) => ({ ...f, estado: v === "all" ? undefined : v }))}>
              <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {Object.entries(STATUS_LABEL).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Profesional</Label>
            <Select value={filters.profesionalId ?? "all"} onValueChange={(v) => setFilters((f) => ({ ...f, profesionalId: v === "all" ? undefined : v }))}>
              <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {(data?.professionals ?? []).map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Servicio</Label>
            <Select value={filters.servicioId ?? "all"} onValueChange={(v) => setFilters((f) => ({ ...f, servicioId: v === "all" ? undefined : v }))}>
              <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {(data?.services ?? []).map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Desde</Label>
            <Input type="date" value={filters.from ?? ""} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs">Hasta</Label>
            <Input type="date" value={filters.to ?? ""} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="p-6 text-sm text-muted-foreground">Cargando…</p>
          ) : !data?.appointments.length ? (
            <p className="p-6 text-sm text-muted-foreground">No hay citas con estos filtros.</p>
          ) : (
            <div className="divide-y divide-border">
              {data.appointments.map((a: any) => {
                const svc = serviceMap.get(a.servicio_id) as any;
                const client = clientMap.get(a.cliente_id) as any;
                return (
                  <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div className="flex items-center gap-3">
                      <span className="h-10 w-1 rounded-full" style={{ background: svc?.color ?? "var(--primary)" }} />
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {client?.nombre ?? "Cliente"} · {svc?.nombre ?? "Servicio"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(a.hora_inicio).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" })}
                          {" · "}{proMap.get(a.profesional_id) ?? "Sin asignar"}
                        </p>
                        {a.notas && <p className="mt-1 text-xs text-muted-foreground">{a.notas}</p>}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={a.estado === "cancelled" ? "destructive" : "secondary"}>
                        {STATUS_LABEL[a.estado] ?? a.estado}
                      </Badge>
                      <Button size="sm" variant="outline" onClick={() => changeStatus(a.id, "confirmed")}>Confirmar</Button>
                      <Button size="sm" variant="ghost" onClick={() => changeStatus(a.id, "completed")}>Completar</Button>
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => changeStatus(a.id, "cancelled")}>Cancelar</Button>
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

function WaitlistPanel() {
  const fetchWaitlist = useServerFn(listWaitlist);
  const fetchServices = useServerFn(listServices);
  const add = useServerFn(addWaitlist);
  const remove = useServerFn(removeWaitlist);
  const qc = useQueryClient();

  const [form, setForm] = useState({ cliente_nombre: "", cliente_email: "", cliente_telefono: "", servicio_id: "", notas: "" });

  const { data } = useQuery({ queryKey: ["waitlist"], queryFn: () => fetchWaitlist() });
  const { data: svcData } = useQuery({ queryKey: ["services-min"], queryFn: () => fetchServices() });
  const serviceMap = new Map((svcData?.services ?? []).map((s: any) => [s.id, s.nombre]));

  async function submit() {
    if (!form.cliente_nombre.trim()) return toast.error("Indica el nombre");
    try {
      await add({
        data: {
          cliente_nombre: form.cliente_nombre,
          cliente_email: form.cliente_email || null,
          cliente_telefono: form.cliente_telefono || null,
          servicio_id: form.servicio_id || null,
          notas: form.notas || null,
        },
      });
      toast.success("Añadido a la lista");
      setForm({ cliente_nombre: "", cliente_email: "", cliente_telefono: "", servicio_id: "", notas: "" });
      qc.invalidateQueries({ queryKey: ["waitlist"] });
    } catch (e: any) {
      toast.error(e.message ?? "Error");
    }
  }

  async function del(id: string) {
    await remove({ data: { id } });
    qc.invalidateQueries({ queryKey: ["waitlist"] });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-1">
        <CardHeader><CardTitle className="text-base">Añadir a la lista</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Input placeholder="Nombre" value={form.cliente_nombre} onChange={(e) => setForm({ ...form, cliente_nombre: e.target.value })} />
          <Input placeholder="Email" value={form.cliente_email} onChange={(e) => setForm({ ...form, cliente_email: e.target.value })} />
          <Input placeholder="Teléfono" value={form.cliente_telefono} onChange={(e) => setForm({ ...form, cliente_telefono: e.target.value })} />
          <Select value={form.servicio_id || "none"} onValueChange={(v) => setForm({ ...form, servicio_id: v === "none" ? "" : v })}>
            <SelectTrigger><SelectValue placeholder="Servicio" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Cualquier servicio</SelectItem>
              {(svcData?.services ?? []).map((s: any) => (
                <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input placeholder="Notas" value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
          <Button className="w-full" onClick={submit}>Añadir</Button>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader><CardTitle className="text-base">En espera</CardTitle></CardHeader>
        <CardContent className="p-0">
          {!data?.waitlist.length ? (
            <p className="p-6 text-sm text-muted-foreground">No hay nadie en espera.</p>
          ) : (
            <div className="divide-y divide-border">
              {data.waitlist.map((w: any) => (
                <div key={w.id} className="flex items-center justify-between gap-3 p-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">{w.cliente_nombre}</p>
                    <p className="text-xs text-muted-foreground">
                      {serviceMap.get(w.servicio_id) ?? "Cualquier servicio"}
                      {w.cliente_telefono ? ` · ${w.cliente_telefono}` : ""}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => del(w.id)}>Quitar</Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
