import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Search, Download, Trash2 } from "lucide-react";
import {
  listClients,
  getClientDetail,
  upsertClient,
  exportClientData,
  deleteClientData,
} from "@/lib/admin/admin.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

export const Route = createFileRoute("/dashboard/clients")({
  component: ClientsPage,
});

function ClientsPage() {
  const fetchClients = useServerFn(listClients);
  const fetchDetail = useServerFn(getClientDetail);
  const upsert = useServerFn(upsertClient);
  const exportFn = useServerFn(exportClientData);
  const deleteFn = useServerFn(deleteClientData);
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<any | null>(null);

  const { data } = useQuery({ queryKey: ["clients"], queryFn: () => fetchClients() });
  const { data: detail } = useQuery({
    queryKey: ["client-detail", selected],
    queryFn: () => fetchDetail({ data: { id: selected! } }),
    enabled: !!selected,
  });

  const filtered = (data?.clients ?? []).filter((c: any) =>
    [c.nombre, c.email, c.telefono].filter(Boolean).join(" ").toLowerCase().includes(search.toLowerCase()),
  );

  async function save() {
    if (!editing?.nombre?.trim()) return toast.error("Nombre obligatorio");
    try {
      await upsert({
        data: {
          id: editing.id,
          nombre: editing.nombre,
          email: editing.email || null,
          telefono: editing.telefono || null,
          notas_internas: editing.notas_internas || null,
          rgpd_consent: !!editing.rgpd_consent,
        },
      });
      toast.success("Cliente guardado");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["client-detail"] });
    } catch (e: any) {
      toast.error(e.message ?? "Error");
    }
  }

  async function doExport(id: string) {
    const res = await exportFn({ data: { id } });
    const blob = new Blob([JSON.stringify(res, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cliente-${id}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Datos exportados");
  }

  async function doDelete(id: string) {
    if (!confirm("¿Eliminar todos los datos de este cliente? (Derecho al olvido)")) return;
    await deleteFn({ data: { id } });
    toast.success("Datos eliminados");
    setSelected(null);
    qc.invalidateQueries({ queryKey: ["clients"] });
  }

  return (
    <div>
      <PageHeader
        title="Clientes"
        action={<Button onClick={() => setEditing({ nombre: "", rgpd_consent: false })}>Nuevo cliente</Button>}
      />

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Buscar cliente…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <Card>
        <CardContent className="p-0">
          {!filtered.length ? (
            <p className="p-6 text-sm text-muted-foreground">No hay clientes.</p>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map((c: any) => (
                <button
                  key={c.id}
                  onClick={() => setSelected(c.id)}
                  className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-accent"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">{c.nombre}</p>
                    <p className="text-xs text-muted-foreground">{c.email ?? c.telefono ?? "Sin contacto"}</p>
                  </div>
                  {c.rgpd_consent && <Badge variant="secondary">RGPD ✓</Badge>}
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail dialog */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{detail?.client?.nombre ?? "Cliente"}</DialogTitle></DialogHeader>
          {detail?.client && (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                <p>{detail.client.email ?? "—"}</p>
                <p>{detail.client.telefono ?? "—"}</p>
                <p className="mt-1">
                  RGPD: {detail.client.rgpd_consent ? `Consentido (${detail.client.rgpd_consent_date ? new Date(detail.client.rgpd_consent_date).toLocaleDateString("es-ES") : "—"})` : "Sin consentimiento"}
                </p>
              </div>

              {detail.client.notas_internas && (
                <div>
                  <Label className="text-xs">Notas privadas</Label>
                  <p className="rounded bg-muted/40 p-2 text-sm text-foreground">{detail.client.notas_internas}</p>
                </div>
              )}

              <div>
                <Label className="text-xs">Historial de citas</Label>
                {!detail.history.length ? (
                  <p className="text-sm text-muted-foreground">Sin citas.</p>
                ) : (
                  <div className="mt-1 divide-y divide-border rounded border border-border">
                    {detail.history.map((h: any) => (
                      <div key={h.id} className="flex items-center justify-between p-2 text-sm">
                        <span>{new Date(h.hora_inicio).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" })}</span>
                        <Badge variant="secondary">{h.estado}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => setEditing(detail.client)}>Editar</Button>
                <Button variant="outline" onClick={() => doExport(detail.client!.id)}>
                  <Download className="h-4 w-4" /> Exportar datos
                </Button>
                <Button variant="ghost" className="text-destructive" onClick={() => doDelete(detail.client!.id)}>
                  <Trash2 className="h-4 w-4" /> Eliminar datos
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing?.id ? "Editar cliente" : "Nuevo cliente"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div><Label className="text-xs">Nombre</Label><Input value={editing.nombre ?? ""} onChange={(e) => setEditing({ ...editing, nombre: e.target.value })} /></div>
              <div><Label className="text-xs">Email</Label><Input value={editing.email ?? ""} onChange={(e) => setEditing({ ...editing, email: e.target.value })} /></div>
              <div><Label className="text-xs">Teléfono</Label><Input value={editing.telefono ?? ""} onChange={(e) => setEditing({ ...editing, telefono: e.target.value })} /></div>
              <div><Label className="text-xs">Notas privadas</Label><Textarea value={editing.notas_internas ?? ""} onChange={(e) => setEditing({ ...editing, notas_internas: e.target.value })} /></div>
              <div className="flex items-center justify-between">
                <Label className="text-xs">Consentimiento RGPD</Label>
                <Switch checked={!!editing.rgpd_consent} onCheckedChange={(v) => setEditing({ ...editing, rgpd_consent: v })} />
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
