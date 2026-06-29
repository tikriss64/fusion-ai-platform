import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { listResources, upsertResource, deleteResource } from "@/lib/admin/admin.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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

export const Route = createFileRoute("/dashboard/resources")({
  component: ResourcesPage,
});

const EMPTY = { nombre: "", tipo: "sala" as "sala" | "equipo", capacidad: 1 };

function ResourcesPage() {
  const fetchResources = useServerFn(listResources);
  const upsert = useServerFn(upsertResource);
  const del = useServerFn(deleteResource);
  const qc = useQueryClient();
  const [editing, setEditing] = useState<any | null>(null);

  const { data } = useQuery({ queryKey: ["resources"], queryFn: () => fetchResources() });

  async function save() {
    if (!editing.nombre?.trim()) return toast.error("Nombre obligatorio");
    try {
      await upsert({
        data: {
          id: editing.id,
          nombre: editing.nombre,
          tipo: editing.tipo,
          capacidad: Number(editing.capacidad) || 1,
        },
      });
      toast.success("Recurso guardado");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["resources"] });
    } catch (e: any) {
      toast.error(e.message ?? "Error");
    }
  }

  async function remove(id: string) {
    if (!confirm("¿Eliminar este recurso?")) return;
    await del({ data: { id } });
    qc.invalidateQueries({ queryKey: ["resources"] });
  }

  return (
    <div>
      <PageHeader title="Salas y recursos" description="Gestiona salas y equipos compartidos" action={<Button onClick={() => setEditing({ ...EMPTY })}>Nuevo recurso</Button>} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(data?.resources ?? []).map((r: any) => (
          <Card key={r.id}>
            <CardContent className="flex items-start justify-between p-4">
              <div>
                <p className="font-medium text-foreground">{r.nombre}</p>
                <p className="text-sm text-muted-foreground capitalize">{r.tipo} · capacidad {r.capacidad}</p>
              </div>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" onClick={() => setEditing(r)}><Pencil className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" className="text-destructive" onClick={() => remove(r.id)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {!data?.resources.length && <p className="text-sm text-muted-foreground">Aún no hay recursos.</p>}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing?.id ? "Editar recurso" : "Nuevo recurso"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div><Label className="text-xs">Nombre</Label><Input value={editing.nombre} onChange={(e) => setEditing({ ...editing, nombre: e.target.value })} /></div>
              <div>
                <Label className="text-xs">Tipo</Label>
                <Select value={editing.tipo} onValueChange={(v) => setEditing({ ...editing, tipo: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sala">Sala</SelectItem>
                    <SelectItem value="equipo">Equipo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">Capacidad</Label><Input type="number" value={editing.capacidad} onChange={(e) => setEditing({ ...editing, capacidad: e.target.value })} /></div>
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
