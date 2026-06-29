import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pencil, Trash2, Plane, UserPlus } from "lucide-react";
import {
  listProfessionals,
  upsertProfessional,
  setVacationMode,
  deleteProfessional,
  inviteStaff,
} from "@/lib/admin/admin.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/team")({
  component: TeamPage,
});

const DAYS = [
  { key: "mon", label: "Lunes" },
  { key: "tue", label: "Martes" },
  { key: "wed", label: "Miércoles" },
  { key: "thu", label: "Jueves" },
  { key: "fri", label: "Viernes" },
  { key: "sat", label: "Sábado" },
  { key: "sun", label: "Domingo" },
];

function TeamPage() {
  const fetchPros = useServerFn(listProfessionals);
  const upsert = useServerFn(upsertProfessional);
  const vacation = useServerFn(setVacationMode);
  const del = useServerFn(deleteProfessional);
  const invite = useServerFn(inviteStaff);
  const qc = useQueryClient();

  const [editing, setEditing] = useState<any | null>(null);
  const [inviting, setInviting] = useState<{ email: string; nombre: string } | null>(null);

  const { data } = useQuery({ queryKey: ["professionals"], queryFn: () => fetchPros() });
  const services = data?.services ?? [];

  async function save() {
    if (!editing.nombre?.trim()) return toast.error("Nombre obligatorio");
    try {
      await upsert({
        data: {
          id: editing.id,
          nombre: editing.nombre,
          email: editing.email || null,
          servicios_asignados: editing.servicios_asignados ?? [],
          horarios: editing.horarios ?? {},
        },
      });
      toast.success("Profesional guardado");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["professionals"] });
    } catch (e: any) {
      toast.error(e.message ?? "Error");
    }
  }

  async function toggleVacation(p: any) {
    await vacation({ data: { id: p.id, enabled: !p.vacation_mode } });
    toast.success(!p.vacation_mode ? "Modo vacaciones activado" : "Modo vacaciones desactivado");
    qc.invalidateQueries({ queryKey: ["professionals"] });
  }

  async function remove(id: string) {
    if (!confirm("¿Eliminar este profesional?")) return;
    await del({ data: { id } });
    qc.invalidateQueries({ queryKey: ["professionals"] });
  }

  async function sendInvite() {
    if (!inviting?.email || !inviting?.nombre) return toast.error("Completa nombre y email");
    try {
      const res = await invite({ data: { email: inviting.email, nombre: inviting.nombre } });
      toast.success(`Invitación creada. Contraseña temporal: ${res.tempPassword}`, { duration: 12000 });
      setInviting(null);
      qc.invalidateQueries({ queryKey: ["professionals"] });
    } catch (e: any) {
      toast.error(e.message ?? "Error");
    }
  }

  function toggleService(id: string) {
    const list: string[] = editing.servicios_asignados ?? [];
    setEditing({
      ...editing,
      servicios_asignados: list.includes(id) ? list.filter((x) => x !== id) : [...list, id],
    });
  }

  function updateDay(key: string, field: "open" | "from" | "to", value: any) {
    const horarios = { ...(editing.horarios ?? {}) };
    horarios[key] = { ...(horarios[key] ?? { from: "09:00", to: "18:00", open: false }), [field]: value };
    setEditing({ ...editing, horarios });
  }

  return (
    <div>
      <PageHeader
        title="Equipo"
        description="Profesionales, horarios y acceso del personal"
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setInviting({ email: "", nombre: "" })}><UserPlus className="h-4 w-4" /> Invitar staff</Button>
            <Button onClick={() => setEditing({ nombre: "", servicios_asignados: [], horarios: {} })}>Nuevo profesional</Button>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(data?.professionals ?? []).map((p: any) => (
          <Card key={p.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-foreground">{p.nombre}</p>
                  <p className="text-xs text-muted-foreground">{p.email ?? "Sin email"}</p>
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => setEditing(p)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" className="text-destructive" onClick={() => remove(p.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{(p.servicios_asignados ?? []).length} servicios</Badge>
                {p.vacation_mode && <Badge variant="destructive">Vacaciones</Badge>}
                {p.user_id && <Badge variant="outline">Staff</Badge>}
              </div>
              <Button
                variant={p.vacation_mode ? "default" : "outline"}
                size="sm"
                className="mt-3 w-full"
                onClick={() => toggleVacation(p)}
              >
                <Plane className="h-4 w-4" /> {p.vacation_mode ? "Desactivar vacaciones" : "Modo vacaciones"}
              </Button>
            </CardContent>
          </Card>
        ))}
        {!data?.professionals.length && <p className="text-sm text-muted-foreground">Aún no hay profesionales.</p>}
      </div>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing?.id ? "Editar profesional" : "Nuevo profesional"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div><Label className="text-xs">Nombre</Label><Input value={editing.nombre} onChange={(e) => setEditing({ ...editing, nombre: e.target.value })} /></div>
              <div><Label className="text-xs">Email</Label><Input value={editing.email ?? ""} onChange={(e) => setEditing({ ...editing, email: e.target.value })} /></div>

              <div>
                <Label className="text-xs">Servicios que realiza</Label>
                <div className="mt-1 space-y-2">
                  {services.map((s: any) => (
                    <label key={s.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={(editing.servicios_asignados ?? []).includes(s.id)}
                        onCheckedChange={() => toggleService(s.id)}
                      />
                      {s.nombre}
                    </label>
                  ))}
                  {!services.length && <p className="text-xs text-muted-foreground">Crea servicios primero.</p>}
                </div>
              </div>

              <div>
                <Label className="text-xs">Horario semanal</Label>
                <div className="mt-1 space-y-2">
                  {DAYS.map((d) => {
                    const h = editing.horarios?.[d.key] ?? { open: false, from: "09:00", to: "18:00" };
                    return (
                      <div key={d.key} className="flex items-center gap-2">
                        <Switch checked={!!h.open} onCheckedChange={(v) => updateDay(d.key, "open", v)} />
                        <span className="w-24 text-sm">{d.label}</span>
                        <Input type="time" className="h-8" value={h.from} disabled={!h.open} onChange={(e) => updateDay(d.key, "from", e.target.value)} />
                        <Input type="time" className="h-8" value={h.to} disabled={!h.open} onChange={(e) => updateDay(d.key, "to", e.target.value)} />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={save}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invite dialog */}
      <Dialog open={!!inviting} onOpenChange={(o) => !o && setInviting(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Invitar miembro del staff</DialogTitle></DialogHeader>
          {inviting && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">El staff solo verá su propia agenda.</p>
              <div><Label className="text-xs">Nombre</Label><Input value={inviting.nombre} onChange={(e) => setInviting({ ...inviting, nombre: e.target.value })} /></div>
              <div><Label className="text-xs">Email</Label><Input value={inviting.email} onChange={(e) => setInviting({ ...inviting, email: e.target.value })} /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviting(null)}>Cancelar</Button>
            <Button onClick={sendInvite}>Invitar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
