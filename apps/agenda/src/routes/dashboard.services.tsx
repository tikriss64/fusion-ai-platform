import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { listServices, upsertService, deleteService } from "@/lib/admin/admin.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/services")({
  component: ServicesPage,
});

const EMPTY = { nombre: "", duracion_min: 60, precio: 0, color: "#6366f1", categoria: "", buffer_before_min: 0, buffer_after_min: 0 };

function ServicesPage() {
  const fetchServices = useServerFn(listServices);
  const upsert = useServerFn(upsertService);
  const del = useServerFn(deleteService);
  const qc = useQueryClient();
  const [editing, setEditing] = useState<any | null>(null);

  const { data } = useQuery({ queryKey: ["services"], queryFn: () => fetchServices() });

  async function save() {
    if (!editing.nombre?.trim()) return toast.error("Nombre obligatorio");
    try {
      await upsert({
        data: {
          id: editing.id,
          nombre: editing.nombre,
          duracion_min: Number(editing.duracion_min),
          precio: Number(editing.precio),
          color: editing.color || "#6366f1",
          categoria: editing.categoria || null,
          buffer_before_min: Number(editing.buffer_before_min) || 0,
          buffer_after_min: Number(editing.buffer_after_min) || 0,
        },
      });
      toast.success("Servicio guardado");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["services"] });
    } catch (e: any) {
      toast.error(e.message ?? "Error");
    }
  }

  async function remove(id: string) {
    if (!confirm("¿Eliminar este servicio?")) return;
    await del({ data: { id } });
    qc.invalidateQueries({ queryKey: ["services"] });
  }

  return (
    <div>
      <PageHeader title="Servicios" action={<Button onClick={() => setEditing({ ...EMPTY })}>Nuevo servicio</Button>} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(data?.services ?? []).map((s: any) => (
          <Card key={s.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-4 w-4 rounded-full" style={{ background: s.color }} />
                  <p className="font-medium text-foreground">{s.nombre}</p>
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => setEditing(s)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" className="text-destructive" onClick={() => remove(s.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{s.duracion_min} min · {Number(s.precio).toFixed(2)} €</p>
              <p className="text-xs text-muted-foreground">Buffer: {s.buffer_before_min}min antes / {s.buffer_after_min}min después</p>
            </CardContent>
          </Card>
        ))}
        {!data?.services.length && <p className="text-sm text-muted-foreground">Aún no hay servicios.</p>}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing?.id ? "Editar servicio" : "Nuevo servicio"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div><Label className="text-xs">Nombre</Label><Input value={editing.nombre} onChange={(e) => setEditing({ ...editing, nombre: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">Duración (min)</Label><Input type="number" value={editing.duracion_min} onChange={(e) => setEditing({ ...editing, duracion_min: e.target.value })} /></div>
                <div><Label className="text-xs">Precio (€)</Label><Input type="number" step="0.01" value={editing.precio} onChange={(e) => setEditing({ ...editing, precio: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">Categoría</Label><Input value={editing.categoria ?? ""} onChange={(e) => setEditing({ ...editing, categoria: e.target.value })} /></div>
                <div><Label className="text-xs">Color</Label><Input type="color" value={editing.color ?? "#6366f1"} onChange={(e) => setEditing({ ...editing, color: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">Buffer antes (min)</Label><Input type="number" value={editing.buffer_before_min} onChange={(e) => setEditing({ ...editing, buffer_before_min: e.target.value })} /></div>
                <div><Label className="text-xs">Buffer después (min)</Label><Input type="number" value={editing.buffer_after_min} onChange={(e) => setEditing({ ...editing, buffer_after_min: e.target.value })} /></div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={save}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
