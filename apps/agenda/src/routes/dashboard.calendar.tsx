import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  listAppointments,
  upsertAppointment,
  setAppointmentStatus,
} from "@/lib/admin/admin.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/calendar")({
  component: CalendarPage,
});

type View = "day" | "week" | "month";
const HOURS = Array.from({ length: 14 }, (_, i) => i + 8); // 08:00 - 21:00

function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Monday=0
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface ApptForm {
  id?: string;
  servicio_id: string;
  profesional_id: string;
  cliente_id: string;
  fecha: string;
  hora: string;
  notas: string;
  estado?: string;
}

function CalendarPage() {
  const fetchAppts = useServerFn(listAppointments);
  const upsert = useServerFn(upsertAppointment);
  const updateStatus = useServerFn(setAppointmentStatus);
  const qc = useQueryClient();

  const [view, setView] = useState<View>("week");
  const [cursor, setCursor] = useState(new Date());
  const [dialog, setDialog] = useState<ApptForm | null>(null);

  const range = useMemo(() => {
    if (view === "day") return { from: ymd(cursor), to: ymd(cursor) };
    if (view === "week") {
      const s = startOfWeek(cursor);
      return { from: ymd(s), to: ymd(addDays(s, 6)) };
    }
    const s = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const e = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    return { from: ymd(s), to: ymd(e) };
  }, [view, cursor]);

  const { data } = useQuery({
    queryKey: ["calendar", range],
    queryFn: () => fetchAppts({ data: { from: range.from, to: range.to } }),
  });

  const serviceMap = new Map((data?.services ?? []).map((s: any) => [s.id, s]));
  const clientMap = new Map((data?.clients ?? []).map((c: any) => [c.id, c]));
  const appts = data?.appointments ?? [];

  function shift(dir: number) {
    if (view === "day") setCursor((c) => addDays(c, dir));
    else if (view === "week") setCursor((c) => addDays(c, dir * 7));
    else setCursor((c) => new Date(c.getFullYear(), c.getMonth() + dir, 1));
  }

  function openCreate(date: Date, hour: number) {
    setDialog({
      servicio_id: "",
      profesional_id: "",
      cliente_id: "",
      fecha: ymd(date),
      hora: `${String(hour).padStart(2, "0")}:00`,
      notas: "",
    });
  }
  function openEdit(a: any) {
    const d = new Date(a.hora_inicio);
    setDialog({
      id: a.id,
      servicio_id: a.servicio_id ?? "",
      profesional_id: a.profesional_id ?? "",
      cliente_id: a.cliente_id ?? "",
      fecha: a.fecha,
      hora: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
      notas: a.notas ?? "",
      estado: a.estado,
    });
  }

  async function moveAppt(a: any, date: Date, hour: number) {
    const svc = serviceMap.get(a.servicio_id) as any;
    const dur = svc?.duracion_min ?? 60;
    const start = new Date(date);
    start.setHours(hour, 0, 0, 0);
    const end = new Date(start.getTime() + dur * 60000);
    try {
      await upsert({
        data: {
          id: a.id,
          servicio_id: a.servicio_id,
          profesional_id: a.profesional_id,
          cliente_id: a.cliente_id,
          fecha: ymd(date),
          hora_inicio: start.toISOString(),
          hora_fin: end.toISOString(),
          notas: a.notas,
          estado: a.estado,
        },
      });
      toast.success("Cita movida");
      qc.invalidateQueries({ queryKey: ["calendar"] });
    } catch (e: any) {
      toast.error(e.message ?? "Error");
    }
  }

  async function saveDialog() {
    if (!dialog) return;
    const svc = serviceMap.get(dialog.servicio_id) as any;
    const dur = svc?.duracion_min ?? 60;
    const start = new Date(`${dialog.fecha}T${dialog.hora}:00`);
    const end = new Date(start.getTime() + dur * 60000);
    try {
      await upsert({
        data: {
          id: dialog.id,
          servicio_id: dialog.servicio_id || null,
          profesional_id: dialog.profesional_id || null,
          cliente_id: dialog.cliente_id || null,
          fecha: dialog.fecha,
          hora_inicio: start.toISOString(),
          hora_fin: end.toISOString(),
          notas: dialog.notas || null,
          estado: (dialog.estado as any) || "confirmed",
        },
      });
      toast.success("Cita guardada");
      setDialog(null);
      qc.invalidateQueries({ queryKey: ["calendar"] });
    } catch (e: any) {
      toast.error(e.message ?? "Error");
    }
  }

  async function cancelDialog() {
    if (!dialog?.id) return;
    await updateStatus({ data: { id: dialog.id, estado: "cancelled" } });
    toast.success("Cita cancelada");
    setDialog(null);
    qc.invalidateQueries({ queryKey: ["calendar"] });
  }

  const days = view === "day" ? [cursor] : view === "week" ? Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(cursor), i)) : [];

  return (
    <div>
      <PageHeader
        title="Calendario"
        description="Arrastra una cita para reprogramarla. Haz clic en un hueco para crear."
        action={
          <div className="flex items-center gap-2">
            <div className="flex rounded-md border border-border p-0.5">
              {(["day", "week", "month"] as View[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`rounded px-3 py-1 text-xs font-medium ${view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                >
                  {v === "day" ? "Día" : v === "week" ? "Semana" : "Mes"}
                </button>
              ))}
            </div>
            <Button variant="outline" size="icon" onClick={() => shift(-1)}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="outline" size="sm" onClick={() => setCursor(new Date())}>Hoy</Button>
            <Button variant="outline" size="icon" onClick={() => shift(1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        }
      />

      {view === "month" ? (
        <MonthView cursor={cursor} appts={appts} serviceMap={serviceMap} onPick={openEdit} />
      ) : (
        <Card className="overflow-auto">
          <div className="min-w-[640px]">
            <div className="grid" style={{ gridTemplateColumns: `60px repeat(${days.length}, 1fr)` }}>
              <div className="border-b border-border p-2" />
              {days.map((d) => (
                <div key={d.toISOString()} className="border-b border-l border-border p-2 text-center text-xs font-medium text-foreground">
                  {d.toLocaleDateString("es-ES", { weekday: "short", day: "numeric" })}
                </div>
              ))}
              {HOURS.map((h) => (
                <FragmentRow
                  key={h}
                  hour={h}
                  days={days}
                  appts={appts}
                  serviceMap={serviceMap}
                  clientMap={clientMap}
                  onCreate={openCreate}
                  onEdit={openEdit}
                  onDrop={moveAppt}
                />
              ))}
            </div>
          </div>
        </Card>
      )}

      <ApptDialog
        dialog={dialog}
        setDialog={setDialog}
        services={data?.services ?? []}
        professionals={data?.professionals ?? []}
        clients={data?.clients ?? []}
        onSave={saveDialog}
        onCancelAppt={cancelDialog}
      />
    </div>
  );
}

function FragmentRow({ hour, days, appts, serviceMap, clientMap, onCreate, onEdit, onDrop }: any) {
  return (
    <>
      <div className="border-b border-border p-1 text-right text-xs text-muted-foreground">{String(hour).padStart(2, "0")}:00</div>
      {days.map((d: Date) => {
        const cellAppts = appts.filter((a: any) => {
          const s = new Date(a.hora_inicio);
          return a.fecha === ymd(d) && s.getHours() === hour && a.estado !== "cancelled";
        });
        return (
          <div
            key={d.toISOString() + hour}
            className="min-h-[48px] border-b border-l border-border p-1"
            onClick={() => !cellAppts.length && onCreate(d, hour)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              const id = e.dataTransfer.getData("text/plain");
              const a = appts.find((x: any) => x.id === id);
              if (a) onDrop(a, d, hour);
            }}
          >
            {cellAppts.map((a: any) => {
              const svc = serviceMap.get(a.servicio_id);
              const client = clientMap.get(a.cliente_id);
              return (
                <div
                  key={a.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", a.id)}
                  onClick={(e) => { e.stopPropagation(); onEdit(a); }}
                  className="mb-1 cursor-grab rounded px-2 py-1 text-xs text-white"
                  style={{ background: svc?.color ?? "var(--primary)" }}
                >
                  <p className="truncate font-medium">{svc?.nombre ?? "Servicio"}</p>
                  <p className="truncate opacity-90">{client?.nombre ?? ""}</p>
                </div>
              );
            })}
          </div>
        );
      })}
    </>
  );
}

function MonthView({ cursor, appts, serviceMap, onPick }: any) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const startPad = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(cursor.getFullYear(), cursor.getMonth(), d));

  return (
    <Card className="p-3">
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground">
        {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => <div key={d} className="py-1">{d}</div>)}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((c, i) => {
          if (!c) return <div key={i} className="min-h-[90px] rounded bg-muted/20" />;
          const dayAppts = appts.filter((a: any) => a.fecha === ymd(c) && a.estado !== "cancelled");
          return (
            <div key={i} className="min-h-[90px] rounded border border-border p-1">
              <p className="text-xs font-medium text-foreground">{c.getDate()}</p>
              <div className="mt-1 space-y-0.5">
                {dayAppts.slice(0, 3).map((a: any) => {
                  const svc = serviceMap.get(a.servicio_id);
                  return (
                    <button
                      key={a.id}
                      onClick={() => onPick(a)}
                      className="block w-full truncate rounded px-1 text-left text-[10px] text-white"
                      style={{ background: svc?.color ?? "var(--primary)" }}
                    >
                      {new Date(a.hora_inicio).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })} {svc?.nombre ?? ""}
                    </button>
                  );
                })}
                {dayAppts.length > 3 && <p className="text-[10px] text-muted-foreground">+{dayAppts.length - 3} más</p>}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function ApptDialog({ dialog, setDialog, services, professionals, clients, onSave, onCancelAppt }: any) {
  if (!dialog) return null;
  return (
    <Dialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{dialog.id ? "Editar cita" : "Nueva cita"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Servicio</Label>
            <Select value={dialog.servicio_id || "none"} onValueChange={(v: string) => setDialog({ ...dialog, servicio_id: v === "none" ? "" : v })}>
              <SelectTrigger><SelectValue placeholder="Servicio" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {services.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Profesional</Label>
            <Select value={dialog.profesional_id || "none"} onValueChange={(v: string) => setDialog({ ...dialog, profesional_id: v === "none" ? "" : v })}>
              <SelectTrigger><SelectValue placeholder="Profesional" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin asignar</SelectItem>
                {professionals.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Cliente</Label>
            <Select value={dialog.cliente_id || "none"} onValueChange={(v: string) => setDialog({ ...dialog, cliente_id: v === "none" ? "" : v })}>
              <SelectTrigger><SelectValue placeholder="Cliente" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin cliente</SelectItem>
                {clients.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Fecha</Label>
              <Input type="date" value={dialog.fecha} onChange={(e) => setDialog({ ...dialog, fecha: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Hora</Label>
              <Input type="time" value={dialog.hora} onChange={(e) => setDialog({ ...dialog, hora: e.target.value })} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Notas</Label>
            <Input value={dialog.notas} onChange={(e) => setDialog({ ...dialog, notas: e.target.value })} />
          </div>
        </div>
        <DialogFooter className="gap-2">
          {dialog.id && <Button variant="ghost" className="text-destructive mr-auto" onClick={onCancelAppt}>Cancelar cita</Button>}
          <Button variant="outline" onClick={() => setDialog(null)}>Cerrar</Button>
          <Button onClick={onSave}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
