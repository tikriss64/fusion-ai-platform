import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { ClientTable } from "@/components/clients/ClientTable";
import { ClientForm } from "@/components/clients/ClientForm";
import type { ClientRow, ClientFormValues } from "@/lib/clients-schema";

export const Route = createFileRoute("/_authenticated/clientes/")({
  head: () => ({ meta: [{ title: "Clientes — vaciadodepisos.cat" }] }),
  component: ClientesPage,
});

const ALL = "__all__";

function toPayload(v: ClientFormValues, userId: string) {
  const n = (s: string | null | undefined) => (s === "" || s == null ? null : s);
  return {
    user_id: userId,
    nombre: v.nombre,
    nif_cif: n(v.nif_cif),
    email: n(v.email),
    telefono: n(v.telefono),
    direccion: n(v.direccion),
    poblacion: n(v.poblacion),
    notas: n(v.notas),
    tags: v.tags,
    primera_fecha: n(v.primera_fecha),
    ultima_fecha: n(v.ultima_fecha),
    num_trabajos: v.num_trabajos,
    valoracion: v.valoracion ?? null,
    recurrente: v.recurrente,
    rgpd_consent: v.rgpd_consent,
  };
}

function ClientesPage() {
  const { user } = useAuth();
  const confirm = useConfirm();
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [poblacionFilter, setPoblacionFilter] = useState<string>(ALL);
  const [tagFilter, setTagFilter] = useState<string>(ALL);
  const [ratingFilter, setRatingFilter] = useState<string>(ALL);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ClientRow | null>(null);
  const [prefillData, setPrefillData] = useState<Partial<ClientRow> | null>(null);
  const [toDelete, setToDelete] = useState<ClientRow | null>(null);
  const [deleteWarning, setDeleteWarning] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setClients((data ?? []) as ClientRow[]);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as Partial<ClientRow>;
      setEditing(null);
      setPrefillData(detail);
      setFormOpen(true);
    };
    window.addEventListener("assistant:createClient", handler);
    return () => window.removeEventListener("assistant:createClient", handler);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const { search: s, tag } = (e as CustomEvent).detail as { search?: string; tag?: string };
      if (s !== undefined) setSearch(s);
      if (tag !== undefined) setTagFilter(tag || ALL);
    };
    window.addEventListener("assistant:filterClientes", handler);
    return () => window.removeEventListener("assistant:filterClientes", handler);
  }, []);

  const poblaciones = useMemo(
    () => Array.from(new Set(clients.map((c) => c.poblacion).filter((x): x is string => !!x))).sort(),
    [clients],
  );
  const allTags = useMemo(
    () => Array.from(new Set(clients.flatMap((c) => c.tags))).sort(),
    [clients],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clients.filter((c) => {
      if (poblacionFilter !== ALL && c.poblacion !== poblacionFilter) return false;
      if (tagFilter !== ALL && !c.tags.includes(tagFilter)) return false;
      if (ratingFilter !== ALL && c.valoracion !== Number(ratingFilter)) return false;
      if (q) {
        const hay = [c.nombre, c.email, c.telefono, c.nif_cif, c.poblacion, c.direccion, c.notas, ...c.tags]
          .filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [clients, search, poblacionFilter, tagFilter, ratingFilter]);

  const openCreate = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (c: ClientRow) => { setEditing(c); setFormOpen(true); };

  const openDelete = async (c: ClientRow) => {
    const [{ count: nQuotes }, { count: nInvoices }, { count: nTrabajos }] = await Promise.all([
      supabase.from("quotes").select("id", { count: "exact", head: true }).eq("client_id", c.id),
      supabase.from("invoices").select("id", { count: "exact", head: true }).eq("client_id", c.id),
      supabase.from("trabajos").select("id", { count: "exact", head: true }).eq("client_id", c.id),
    ]);
    const parts: string[] = [];
    if (nQuotes) parts.push(`${nQuotes} presupuesto${nQuotes !== 1 ? "s" : ""}`);
    if (nInvoices) parts.push(`${nInvoices} factura${nInvoices !== 1 ? "s" : ""}`);
    if (nTrabajos) parts.push(`${nTrabajos} trabajo${nTrabajos !== 1 ? "s" : ""}`);
    setDeleteWarning(parts.length ? `Este cliente tiene ${parts.join(", ")} asociados. Los documentos quedarán sin cliente asignado.` : null);
    setToDelete(c);
  };

  const handleSubmit = async (values: ClientFormValues) => {
    if (!user) return;
    if (editing) {
      const { error } = await supabase
        .from("clients")
        .update(toPayload(values, editing.user_id))
        .eq("id", editing.id);
      if (error) { toast.error(error.message); return; }
      toast.success("Cliente actualizado");
    } else {
      // Detección de duplicados: mismo teléfono o email ya existente
      const tel  = values.telefono?.trim();
      const mail = values.email?.trim();
      if (tel || mail) {
        const dup = clients.find(
          (c) =>
            (tel && c.telefono && c.telefono.replace(/\s/g, "") === tel.replace(/\s/g, "")) ||
            (mail && c.email && c.email.toLowerCase() === mail.toLowerCase()),
        );
        if (dup) {
          const motivo = tel && dup.telefono?.replace(/\s/g, "") === tel.replace(/\s/g, "")
            ? `teléfono ${tel}` : `email ${mail}`;
          const ok = await confirm({
            title: "Posible cliente duplicado",
            description: `Ya existe un cliente con ese ${motivo}: "${dup.nombre}".\n\n¿Crear de todos modos un cliente duplicado?`,
            confirmText: "Crear de todos modos",
          });
          if (!ok) {
            toast.info("Creación cancelada. Cliente duplicado evitado.");
            return;
          }
        }
      }
      const { error } = await supabase.from("clients").insert(toPayload(values, user.id));
      if (error) { toast.error(error.message); return; }
      toast.success("Cliente creado");
    }
    setFormOpen(false);
    setEditing(null);
    await load();
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    const { error } = await supabase.from("clients").delete().eq("id", toDelete.id);
    if (error) { toast.error(error.message); setToDelete(null); return; }
    toast.success("Cliente eliminado");
    setToDelete(null);
    await load();
  };

  const activeFilters = [poblacionFilter, tagFilter, ratingFilter].filter((f) => f !== ALL).length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clientes</h1>
          <p className="text-sm text-muted-foreground">
            {clients.length} clientes en total{activeFilters > 0 && ` · ${filtered.length} con filtros`}
          </p>
        </div>
        <Button onClick={openCreate}><Plus />Nuevo cliente</Button>
      </div>

      <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre, email, teléfono…"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={poblacionFilter} onValueChange={setPoblacionFilter}>
          <SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="Población" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas las poblaciones</SelectItem>
            {poblaciones.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={tagFilter} onValueChange={setTagFilter}>
          <SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="Etiqueta" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas las etiquetas</SelectItem>
            {allTags.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={ratingFilter} onValueChange={setRatingFilter}>
          <SelectTrigger className="w-full sm:w-[160px]"><SelectValue placeholder="Valoración" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Cualquiera</SelectItem>
            {[5, 4, 3, 2, 1].map((n) => <SelectItem key={n} value={String(n)}>{"★".repeat(n)}</SelectItem>)}
          </SelectContent>
        </Select>
        {activeFilters > 0 && (
          <Button variant="ghost" size="sm" onClick={() => { setPoblacionFilter(ALL); setTagFilter(ALL); setRatingFilter(ALL); }}>
            Limpiar filtros <Badge variant="secondary" className="ml-1">{activeFilters}</Badge>
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <ClientTable clients={filtered} onEdit={openEdit} onDelete={openDelete} />
      )}

      <Dialog open={formOpen} onOpenChange={(o) => { setFormOpen(o); if (!o) { setEditing(null); setPrefillData(null); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar cliente" : "Nuevo cliente"}</DialogTitle>
            <DialogDescription>
              {editing ? "Modifica los datos del cliente." : prefillData ? "Datos pre-rellenados desde el asistente IA. Completa el resto y guarda." : "Añade un cliente al CRM."}
            </DialogDescription>
          </DialogHeader>
          <ClientForm
            initial={editing ?? (prefillData as ClientRow | null)}
            onSubmit={handleSubmit}
            onCancel={() => { setFormOpen(false); setEditing(null); setPrefillData(null); }}
            submitLabel={editing ? "Guardar cambios" : "Crear cliente"}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => { if (!o) { setToDelete(null); setDeleteWarning(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar cliente</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Seguro que quieres eliminar a <strong>{toDelete?.nombre}</strong>? Esta acción no se puede deshacer.
            </AlertDialogDescription>
            {deleteWarning && (
              <p className="mt-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                ⚠️ {deleteWarning}
              </p>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}