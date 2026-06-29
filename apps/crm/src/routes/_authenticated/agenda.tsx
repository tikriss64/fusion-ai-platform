import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  FileDown,
  FileText,
  Images,
  Loader2,
  MapPin,
  Mail,
  MoreHorizontal,
  Pencil,
  Plus,
  Receipt,
  Trash2,
  User,
} from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { nextInvoiceRef } from "@/lib/invoices-schema";
import { formatDate } from "@/lib/utils";
import { NewMailComposer } from "@/components/inbox/new-mail-composer";
import { EmptyState } from "@/components/EmptyState";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import type { CompanySettings } from "@/lib/company-settings-type";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { FotoUploader } from "@/components/agenda/FotoUploader";
import {
  TRABAJO_STATUSES,
  TRABAJO_STATUS_COLORS,
  TRABAJO_STATUS_LABELS,
  trabajoFormSchema,
  type TrabajoFormValues,
  type TrabajoRow,
} from "@/lib/trabajos-schema";
import { SERVICE_TYPES, SERVICE_TYPE_LABELS } from "@/lib/quotes-schema";
import type { ClientRow } from "@/lib/clients-schema";

export const Route = createFileRoute("/_authenticated/agenda")({
  head: () => ({ meta: [{ title: "Agenda — vaciadodepisos.cat" }] }),
  component: AgendaPage,
});

function getToday() { return new Date().toISOString().slice(0, 10); }
function getTomorrow() { return new Date(Date.now() + 86_400_000).toISOString().slice(0, 10); }

function formatDateLabel(fecha: string): string {
  const today = getToday();
  const tomorrow = getTomorrow();
  if (fecha === today) return "Hoy";
  if (fecha === tomorrow) return "Mañana";
  const d = new Date(fecha + "T00:00:00");
  return d.toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: d.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
  });
}

function AgendaPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [facturandoId, setFacturandoId] = useState<string | null>(null);
  const [confirmEmail, setConfirmEmail] = useState<{ to: string; subject: string; body: string } | null>(null);
  const [trabajos, setTrabajos] = useState<TrabajoRow[]>([]);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [quoteNotesMap, setQuoteNotesMap] = useState<Record<string, string>>({});
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TrabajoRow | null>(null);
  const [toDelete, setToDelete] = useState<TrabajoRow | null>(null);
  const [generatingInformeId, setGeneratingInformeId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data: tj, error: e1 }, { data: cs, error: e2 }, { data: co }] = await Promise.all([
      supabase.from("trabajos").select("*").order("fecha", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false }),
      supabase.from("clients").select("*").order("nombre"),
      supabase.from("company_settings").select("*").maybeSingle(),
    ]);
    if (e1) toast.error(e1.message);
    if (e2) toast.error(e2.message);
    setTrabajos((tj ?? []) as TrabajoRow[]);
    setClients((cs ?? []) as ClientRow[]);
    setCompany(co as CompanySettings | null);

    const quoteIds = (tj ?? []).filter((t: any) => t.quote_id).map((t: any) => t.quote_id as string);
    if (quoteIds.length) {
      const { data: qdata } = await supabase
        .from("quotes")
        .select("id, objetos_recuperables")
        .in("id", quoteIds);
      const map: Record<string, string> = {};
      for (const q of qdata ?? []) {
        if (q.objetos_recuperables) map[q.id] = q.objetos_recuperables as string;
      }
      setQuoteNotesMap(map);
    }

    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const clientNames = useMemo(
    () => Object.fromEntries(clients.map((c) => [c.id, c])),
    [clients],
  );

  const { activos, historial } = useMemo(() => {
    const activos: TrabajoRow[] = [];
    const historial: TrabajoRow[] = [];
    for (const t of trabajos) {
      if (t.estado === "completado" || t.estado === "cancelado") historial.push(t);
      else activos.push(t);
    }
    historial.sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? ""));
    return { activos, historial };
  }, [trabajos]);

  const activosByDate = useMemo(() => {
    const sinFecha = activos.filter((t) => !t.fecha);
    const conFecha = activos.filter((t) => !!t.fecha);
    const map = new Map<string, TrabajoRow[]>();
    for (const t of conFecha) {
      const key = t.fecha!;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return { sinFecha, byDate: map };
  }, [activos]);

  const openCreate = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (t: TrabajoRow) => { setEditing(t); setFormOpen(true); };
  const toggleExpand = (id: string) =>
    setExpandedId((prev) => (prev === id ? null : id));

  const handleStatusChange = async (t: TrabajoRow, estado: TrabajoRow["estado"]) => {
    const { error } = await supabase.from("trabajos").update({ estado }).eq("id", t.id);
    if (error) { toast.error(error.message); return; }
    setTrabajos((prev) => prev.map((x) => (x.id === t.id ? { ...x, estado } : x)));
  };

  const handleMarkComplete = (t: TrabajoRow) => handleStatusChange(t, "completado");

  // Enviar confirmación de la cita por email (fecha, hora, dirección).
  const handleConfirmar = (t: TrabajoRow, client: ClientRow | null) => {
    if (!client?.email) { toast.error("Este cliente no tiene email."); return; }
    const nombre = client.nombre.split(" ")[0];
    const cuando = t.fecha ? formatDate(t.fecha) : "(fecha por confirmar)";
    const hora = t.hora ? ` a las ${t.hora.slice(0, 5)}` : "";
    const dir = t.direccion || [client.direccion, client.poblacion].filter(Boolean).join(", ") || "(dirección por confirmar)";
    const tel = company?.phone ?? "688 30 41 43";
    const body = `Estimado/a ${nombre},\n\nLe confirmamos su cita:\n\nFecha: ${cuando}${hora}\nDirección: ${dir}\nContacto: ${tel}\n\nSi necesita modificar la cita, le rogamos que nos lo comunique con la mayor antelación posible.\n\nAtentamente,\nMartín`;
    setConfirmEmail({ to: client.email, subject: "Confirmación de su cita", body });
  };

  // Trabajo completado → Factura. Hereda cliente, importe y líneas del presupuesto
  // de origen (si lo tiene). Evita facturar dos veces el mismo presupuesto.
  const handleFacturar = async (t: TrabajoRow) => {
    if (!user) return;
    setFacturandoId(t.id);
    try {
      // Evitar duplicados: si el presupuesto ya tiene factura, ir a ella.
      if (t.quote_id) {
        const { data: existing } = await supabase
          .from("invoices").select("id").eq("quote_id", t.quote_id).maybeSingle();
        if (existing) {
          toast.info("Este trabajo ya estaba facturado");
          await navigate({ to: "/invoices/$id", params: { id: existing.id } });
          return;
        }
      }

      // Trabajos de agenda = vaciado/limpieza → serie L (pintura → P).
      const tipo = /pintura/i.test(t.tipo_servicio ?? "") ? "P" : "L";
      const { serie, numero } = await nextInvoiceRef(supabase, tipo);
      const today = new Date().toISOString().slice(0, 10);

      let subtotal = 0, iva = 0, total = 0;
      let quoteItems: any[] = [];
      if (t.quote_id) {
        const { data: q } = await supabase
          .from("quotes").select("subtotal, iva, total").eq("id", t.quote_id).maybeSingle();
        if (q) { subtotal = Number(q.subtotal) || 0; iva = Number(q.iva) || 0; total = Number(q.total) || 0; }
        const { data: items } = await supabase
          .from("quote_items").select("*").eq("quote_id", t.quote_id).order("orden");
        quoteItems = items ?? [];
        // Regla: si el presupuesto origen no tiene conceptos ni importe, no facturar en automático.
        if (quoteItems.length === 0 || total <= 0) {
          toast.error("El presupuesto de este trabajo no tiene importe. Edítalo o crea la factura a mano.");
          return;
        }
      }

      const { data: inv, error } = await supabase.from("invoices").insert({
        user_id: user.id,
        quote_id: t.quote_id ?? null,
        client_id: t.client_id ?? null,
        serie,
        numero,
        fecha_emision: today,
        vencimiento: null,
        estado: "pendiente",
        subtotal, iva, total,
      } as any).select("id").single();
      if (error || !inv) { toast.error(error?.message ?? "Error creando factura"); return; }

      if (quoteItems.length) {
        await supabase.from("invoice_items").insert(quoteItems.map((it: any, i: number) => ({
          invoice_id: inv.id,
          descripcion: it.descripcion,
          cantidad: it.cantidad,
          precio_unit: it.precio_unit,
          iva_aplicable: it.iva_aplicable,
          orden: i,
        })));
      }

      if (t.quote_id) await supabase.from("quotes").update({ estado: "facturado" }).eq("id", t.quote_id);

      toast.success(quoteItems.length
        ? `Factura ${serie}-${numero} creada desde el presupuesto`
        : `Factura ${serie}-${numero} creada (añade los conceptos)`);
      await navigate({ to: "/invoices/$id", params: { id: inv.id } });
    } finally {
      setFacturandoId(null);
    }
  };

  const handleFotosAntesChange = async (t: TrabajoRow, fotos_antes: string[]) => {
    const { error } = await supabase.from("trabajos").update({ fotos_antes } as any).eq("id", t.id);
    if (error) { toast.error(error.message); return; }
    setTrabajos((prev) => prev.map((x) => (x.id === t.id ? { ...x, fotos_antes } : x)));
  };

  const handleFotosDespuesChange = async (t: TrabajoRow, fotos_despues: string[]) => {
    const { error } = await supabase.from("trabajos").update({ fotos_despues } as any).eq("id", t.id);
    if (error) { toast.error(error.message); return; }
    setTrabajos((prev) => prev.map((x) => (x.id === t.id ? { ...x, fotos_despues } : x)));
  };

  const handleCarpetaUrlChange = async (t: TrabajoRow, url: string) => {
    const { error } = await supabase.from("trabajos").update({ carpeta_fotos_url: url || null }).eq("id", t.id);
    if (error) { toast.error(error.message); return; }
    setTrabajos((prev) =>
      prev.map((x) => (x.id === t.id ? { ...x, carpeta_fotos_url: url || null } : x)),
    );
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    const allFotos = [...toDelete.fotos_antes, ...toDelete.fotos_despues];
    if (allFotos.length) {
      await supabase.storage.from("trabajos-fotos").remove(allFotos);
    }
    const { error } = await supabase.from("trabajos").delete().eq("id", toDelete.id);
    if (error) { toast.error(error.message); setToDelete(null); return; }
    toast.success("Trabajo eliminado");
    setToDelete(null);
    await load();
  };

  const handleGenerarInforme = async (t: TrabajoRow) => {
    setGeneratingInformeId(t.id);
    try {
      const getPublic = (path: string) =>
        supabase.storage.from("trabajos-fotos").getPublicUrl(path).data.publicUrl;

      const fotosAntesUrls = t.fotos_antes.map(getPublic);
      const fotosDespuesUrls = t.fotos_despues.map(getPublic);
      const client = t.client_id ? (clientNames[t.client_id] ?? null) : null;

      const [{ pdf }, { InformeFinalPdfDocument }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("@/components/agenda/InformeFinalPdfDocument"),
      ]);

      const blob = await pdf(
        <InformeFinalPdfDocument
          trabajo={t}
          fotosAntesUrls={fotosAntesUrls}
          fotosDespuesUrls={fotosDespuesUrls}
          client={client}
          company={company}
        />
      ).toBlob();

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `informe-${client?.nombre ?? t.id}-${t.fecha ?? "sin-fecha"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Informe generado");
    } catch (e) {
      console.error(e);
      toast.error("No se pudo generar el informe. Inténtalo de nuevo en un momento.");
    } finally {
      setGeneratingInformeId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Agenda</h1>
          <p className="text-sm text-muted-foreground">
            {activos.length} trabajo{activos.length !== 1 ? "s" : ""} activo{activos.length !== 1 ? "s" : ""}
            {historial.length > 0 && ` · ${historial.length} completados`}
          </p>
        </div>
        <Button onClick={openCreate} className="gap-1.5">
          <Plus className="h-4 w-4" /> Nuevo trabajo
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-8">
          {/* Sin fecha */}
          {activosByDate.sinFecha.length > 0 && (
            <Section title="Sin fecha programada" variant="warning">
              {activosByDate.sinFecha.map((t) => (
                <TrabajoCard
                  key={t.id}
                  trabajo={t}
                  client={t.client_id ? (clientNames[t.client_id] ?? null) : null}
                  objetosRecuperables={t.quote_id ? quoteNotesMap[t.quote_id] : undefined}
                  expanded={expandedId === t.id}
                  generatingInforme={generatingInformeId === t.id}
                  facturando={facturandoId === t.id}
                  onToggleExpand={() => toggleExpand(t.id)}
                  onMarkComplete={() => handleMarkComplete(t)}
                  onStatusChange={(s) => handleStatusChange(t, s)}
                  onEdit={() => openEdit(t)}
                  onDelete={() => setToDelete(t)}
                  onFacturar={() => handleFacturar(t)}
                  onConfirmar={() => handleConfirmar(t, t.client_id ? clientNames[t.client_id] ?? null : null)}
                  onFotosAntesChange={(f) => handleFotosAntesChange(t, f)}
                  onFotosDespuesChange={(f) => handleFotosDespuesChange(t, f)}
                  onCarpetaUrlChange={(u) => handleCarpetaUrlChange(t, u)}
                  onGenerarInforme={() => handleGenerarInforme(t)}
                />
              ))}
            </Section>
          )}

          {/* Trabajos con fecha */}
          {Array.from(activosByDate.byDate.entries()).map(([fecha, items]) => (
            <Section
              key={fecha}
              title={formatDateLabel(fecha)}
              date={fecha}
              variant={fecha < getToday() ? "past" : fecha === getToday() ? "today" : "normal"}
            >
              {items.map((t) => (
                <TrabajoCard
                  key={t.id}
                  trabajo={t}
                  client={t.client_id ? (clientNames[t.client_id] ?? null) : null}
                  objetosRecuperables={t.quote_id ? quoteNotesMap[t.quote_id] : undefined}
                  expanded={expandedId === t.id}
                  generatingInforme={generatingInformeId === t.id}
                  facturando={facturandoId === t.id}
                  onToggleExpand={() => toggleExpand(t.id)}
                  onMarkComplete={() => handleMarkComplete(t)}
                  onStatusChange={(s) => handleStatusChange(t, s)}
                  onEdit={() => openEdit(t)}
                  onDelete={() => setToDelete(t)}
                  onFacturar={() => handleFacturar(t)}
                  onConfirmar={() => handleConfirmar(t, t.client_id ? clientNames[t.client_id] ?? null : null)}
                  onFotosAntesChange={(f) => handleFotosAntesChange(t, f)}
                  onFotosDespuesChange={(f) => handleFotosDespuesChange(t, f)}
                  onCarpetaUrlChange={(u) => handleCarpetaUrlChange(t, u)}
                  onGenerarInforme={() => handleGenerarInforme(t)}
                />
              ))}
            </Section>
          ))}

          {activos.length === 0 && (
            <EmptyState
              icon={CalendarDays}
              title="Agenda despejada ✨"
              message="No tienes trabajos activos ahora mismo. Aparecerán solos cuando aceptes un presupuesto, o puedes crear uno a mano con «Nuevo trabajo»."
            />
          )}

          {/* Historial */}
          {historial.length > 0 && (
            <Section title="Historial (completados y cancelados)" variant="muted">
              {historial.map((t) => (
                <TrabajoCard
                  key={t.id}
                  trabajo={t}
                  client={t.client_id ? (clientNames[t.client_id] ?? null) : null}
                  objetosRecuperables={t.quote_id ? quoteNotesMap[t.quote_id] : undefined}
                  expanded={expandedId === t.id}
                  generatingInforme={generatingInformeId === t.id}
                  facturando={facturandoId === t.id}
                  onToggleExpand={() => toggleExpand(t.id)}
                  onMarkComplete={() => handleMarkComplete(t)}
                  onStatusChange={(s) => handleStatusChange(t, s)}
                  onEdit={() => openEdit(t)}
                  onDelete={() => setToDelete(t)}
                  onFacturar={() => handleFacturar(t)}
                  onConfirmar={() => handleConfirmar(t, t.client_id ? clientNames[t.client_id] ?? null : null)}
                  onFotosAntesChange={(f) => handleFotosAntesChange(t, f)}
                  onFotosDespuesChange={(f) => handleFotosDespuesChange(t, f)}
                  onCarpetaUrlChange={(u) => handleCarpetaUrlChange(t, u)}
                  onGenerarInforme={() => handleGenerarInforme(t)}
                />
              ))}
            </Section>
          )}
        </div>
      )}

      {/* Form dialog */}
      {formOpen && (
        <TrabajoFormDialog
          open={formOpen}
          initial={editing}
          clients={clients}
          trabajos={trabajos}
          userId={user?.id ?? ""}
          onClose={() => { setFormOpen(false); setEditing(null); }}
          onSaved={load}
        />
      )}

      {/* Delete confirm */}
      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar trabajo</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminarán también las fotos asociadas. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {confirmEmail && (
        <NewMailComposer
          onClose={() => setConfirmEmail(null)}
          defaultTo={confirmEmail.to}
          defaultSubject={confirmEmail.subject}
          defaultBody={confirmEmail.body}
        />
      )}
    </div>
  );
}

// ─── Sección con título ────────────────────────────────────────────────────────

function Section({
  title,
  date,
  variant = "normal",
  children,
}: {
  title: string;
  date?: string;
  variant?: "normal" | "today" | "past" | "warning" | "muted";
  children: React.ReactNode;
}) {
  const accent: Record<string, string> = {
    normal: "text-foreground",
    today: "text-primary font-bold",
    past: "text-muted-foreground",
    warning: "text-amber-600 dark:text-amber-400",
    muted: "text-muted-foreground",
  };
  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <h2 className={`text-sm font-semibold uppercase tracking-wide capitalize ${accent[variant]}`}>
          {title}
        </h2>
        {date && (
          <span className="text-xs text-muted-foreground">
            {new Date(date + "T00:00:00").toLocaleDateString("es-ES", {
              day: "numeric",
              month: "short",
            })}
          </span>
        )}
        <div className="flex-1 h-px bg-border" />
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

// ─── Tarjeta de trabajo ────────────────────────────────────────────────────────

type CardProps = {
  trabajo: TrabajoRow;
  client: ClientRow | null;
  objetosRecuperables?: string;
  expanded: boolean;
  generatingInforme: boolean;
  facturando: boolean;
  onToggleExpand: () => void;
  onMarkComplete: () => void;
  onStatusChange: (s: TrabajoRow["estado"]) => void;
  onEdit: () => void;
  onDelete: () => void;
  onFacturar: () => void;
  onConfirmar: () => void;
  onFotosAntesChange: (fotos: string[]) => Promise<void>;
  onFotosDespuesChange: (fotos: string[]) => Promise<void>;
  onCarpetaUrlChange: (url: string) => Promise<void>;
  onGenerarInforme: () => void;
};

function TrabajoCard({
  trabajo: t,
  client,
  objetosRecuperables,
  expanded,
  generatingInforme,
  facturando,
  onToggleExpand,
  onMarkComplete,
  onStatusChange,
  onEdit,
  onDelete,
  onFacturar,
  onConfirmar,
  onFotosAntesChange,
  onFotosDespuesChange,
  onCarpetaUrlChange,
  onGenerarInforme,
}: CardProps) {
  const isFinished = t.estado === "completado" || t.estado === "cancelado";
  const totalFotos = t.fotos_antes.length + t.fotos_despues.length;
  const hasMedia = totalFotos > 0 || !!t.carpeta_fotos_url;

  return (
    <div className="rounded-lg border bg-card shadow-sm overflow-hidden">
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Left: info */}
          <div className="flex-1 min-w-0 space-y-1.5">
            {/* Status + time */}
            <div className="flex items-center gap-2 flex-wrap">
              <Select
                value={t.estado}
                onValueChange={(v) => onStatusChange(v as TrabajoRow["estado"])}
              >
                <SelectTrigger className="h-6 w-auto text-xs border-0 p-0 gap-1 font-medium focus:ring-0 [&>svg]:h-3 [&>svg]:w-3">
                  <Badge className={`${TRABAJO_STATUS_COLORS[t.estado]} cursor-pointer text-xs`}>
                    {TRABAJO_STATUS_LABELS[t.estado]}
                  </Badge>
                </SelectTrigger>
                <SelectContent>
                  {TRABAJO_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      <Badge className={TRABAJO_STATUS_COLORS[s]}>{TRABAJO_STATUS_LABELS[s]}</Badge>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {t.hora && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {t.hora.slice(0, 5)}h
                </span>
              )}
            </div>

            {/* Client */}
            {client && (
              <div className="flex items-center gap-1.5 text-sm font-semibold">
                <User className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                {client.nombre}
                {client.telefono && (
                  <a
                    href={`tel:${client.telefono}`}
                    className="text-muted-foreground font-normal text-xs hover:text-foreground"
                  >
                    · {client.telefono}
                  </a>
                )}
              </div>
            )}

            {/* Address */}
            {t.direccion && (
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate">{t.direccion}</span>
              </div>
            )}

            {/* Service */}
            {t.tipo_servicio && (
              <div className="text-xs text-muted-foreground">
                {SERVICE_TYPE_LABELS[t.tipo_servicio]}
              </div>
            )}

            {/* Presupuesto origen */}
            {t.quote_id && (
              <Link to="/quotes" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                <FileText className="h-3 w-3" /> Desde presupuesto
              </Link>
            )}
          </div>

          {/* Right: actions */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {t.estado === "completado" && (
              <Button
                size="sm"
                className="gap-1 h-7 text-xs"
                disabled={facturando}
                onClick={onFacturar}
                title="Crear factura desde este trabajo"
              >
                {facturando ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Receipt className="h-3.5 w-3.5" />
                )}
                {facturando ? "Facturando…" : "Facturar"}
              </Button>
            )}
            {t.estado === "completado" && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1 h-7 text-xs"
                disabled={generatingInforme}
                onClick={onGenerarInforme}
                title="Generar informe final con fotos"
              >
                {generatingInforme ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <FileDown className="h-3.5 w-3.5" />
                )}
                {generatingInforme ? "Generando…" : "Informe"}
              </Button>
            )}
            {!isFinished && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1 h-7 text-xs"
                onClick={onMarkComplete}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Completado
              </Button>
            )}
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={onToggleExpand}
              title={expanded ? "Cerrar" : "Ver fotos y notas"}
            >
              {expanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" className="h-7 w-7">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onToggleExpand}>
                  <Images className="h-4 w-4" />
                  {totalFotos > 0 ? `Fotos (${totalFotos})` : "Añadir fotos"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onEdit}>
                  <Pencil className="h-4 w-4" /> Editar
                </DropdownMenuItem>
                {!isFinished && client?.email && (
                  <DropdownMenuItem onClick={onConfirmar}>
                    <Mail className="h-4 w-4" /> Enviar confirmación
                  </DropdownMenuItem>
                )}
                {t.estado === "completado" && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={onGenerarInforme} disabled={generatingInforme}>
                      <FileDown className="h-4 w-4" /> Generar informe final
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive" onClick={onDelete}>
                  <Trash2 className="h-4 w-4" /> Eliminar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Notes preview */}
        {t.notas && !expanded && (
          <p className="mt-2 text-xs text-muted-foreground line-clamp-2 pl-5">
            {t.notas}
          </p>
        )}

        {/* Media badge */}
        {hasMedia && !expanded && (
          <button
            onClick={onToggleExpand}
            className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <Images className="h-3.5 w-3.5" />
            {totalFotos > 0 ? `${totalFotos} foto${totalFotos > 1 ? "s" : ""}` : ""}
            {totalFotos > 0 && t.carpeta_fotos_url ? " · " : ""}
            {t.carpeta_fotos_url ? "Carpeta externa" : ""}
          </button>
        )}
      </div>

      {/* Expanded panel */}
      {expanded && (
        <div className="border-t bg-muted/20 p-4 space-y-4">
          {t.notas && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Notas del trabajo</p>
              <p className="text-sm whitespace-pre-line">{t.notas}</p>
            </div>
          )}
          {objetosRecuperables && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Objetos recuperables (del presupuesto)</p>
              <p className="text-sm whitespace-pre-line">{objetosRecuperables}</p>
            </div>
          )}
          <FotoUploader
            trabajoId={t.id}
            userId={t.user_id}
            fotosAntes={t.fotos_antes}
            onFotosAntesChange={onFotosAntesChange}
            fotosDespues={t.fotos_despues}
            onFotosDespuesChange={onFotosDespuesChange}
            carpetaUrl={t.carpeta_fotos_url}
            onCarpetaUrlChange={onCarpetaUrlChange}
          />
        </div>
      )}
    </div>
  );
}

// ─── Formulario crear / editar trabajo ────────────────────────────────────────

type FormDialogProps = {
  open: boolean;
  initial: TrabajoRow | null;
  clients: ClientRow[];
  trabajos: TrabajoRow[];
  userId: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
};

function TrabajoFormDialog({
  open,
  initial,
  clients,
  trabajos,
  userId,
  onClose,
  onSaved,
}: FormDialogProps) {
  const confirm = useConfirm();
  const form = useForm<TrabajoFormValues>({
    resolver: zodResolver(trabajoFormSchema),
    defaultValues: initial
      ? {
          client_id: initial.client_id ?? undefined,
          fecha: initial.fecha ?? new Date().toISOString().slice(0, 10),
          hora: initial.hora?.slice(0, 5) ?? "",
          direccion: initial.direccion ?? "",
          tipo_servicio: initial.tipo_servicio ?? null,
          notas: initial.notas ?? "",
          carpeta_fotos_url: initial.carpeta_fotos_url ?? "",
        }
      : {
          client_id: undefined,
          fecha: new Date().toISOString().slice(0, 10),
          hora: "",
          direccion: "",
          tipo_servicio: null,
          notas: "",
          carpeta_fotos_url: "",
        },
  });

  const watchClientId = form.watch("client_id");
  useEffect(() => {
    if (!initial && watchClientId) {
      const c = clients.find((c) => c.id === watchClientId);
      if (c?.direccion) form.setValue("direccion", c.direccion);
    }
  }, [watchClientId]);

  // Trabajos del mismo día (excluyendo el que se edita) para avisar de solapamientos
  const watchFecha = form.watch("fecha");
  const mismoDia = useMemo(() => {
    if (!watchFecha) return [];
    return trabajos
      .filter((t) => t.fecha === watchFecha && t.id !== initial?.id
        && t.estado !== "completado" && t.estado !== "cancelado")
      .sort((a, b) => (a.hora ?? "").localeCompare(b.hora ?? ""));
  }, [watchFecha, trabajos, initial]);

  const handleSubmit = async (values: TrabajoFormValues) => {
    // Detección de conflicto de horario (±90 min el mismo día)
    if (values.fecha && values.hora) {
      const toMin = (h: string) => {
        const [hh, mm] = h.slice(0, 5).split(":").map(Number);
        return hh * 60 + (mm || 0);
      };
      const nueva = toMin(values.hora);
      const choque = mismoDia.find((t) => t.hora && Math.abs(toMin(t.hora) - nueva) < 90);
      if (choque) {
        const nombreChoque = choque.client_id ? clients.find((c) => c.id === choque.client_id)?.nombre : null;
        const ok = await confirm({
          title: "Posible solapamiento de horario",
          description: `Ese día ya tienes un trabajo a las ${choque.hora?.slice(0, 5)}` +
            (nombreChoque ? ` (${nombreChoque})` : "") +
            `, muy cerca de las ${values.hora}.\n\n¿Programar de todos modos?`,
          confirmText: "Programar igualmente",
        });
        if (!ok) return;
      }
    }

    const payload = {
      user_id: userId,
      client_id: values.client_id ?? null,
      fecha: values.fecha || null,
      hora: values.hora || null,
      direccion: values.direccion || null,
      tipo_servicio: values.tipo_servicio ?? null,
      notas: values.notas || null,
      carpeta_fotos_url: values.carpeta_fotos_url || null,
    };

    if (initial) {
      const { error } = await supabase.from("trabajos").update(payload as any).eq("id", initial.id);
      if (error) { toast.error(error.message); return; }
      toast.success("Trabajo actualizado");
    } else {
      const { error } = await supabase.from("trabajos").insert({ ...payload, estado: "pendiente" } as any);
      if (error) { toast.error(error.message); return; }
      toast.success("Trabajo creado");
    }
    onClose();
    await onSaved();
  };

  const NULL_VAL = "__null__";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? "Editar trabajo" : "Nuevo trabajo"}</DialogTitle>
          <DialogDescription>
            {initial ? "Modifica los datos del trabajo." : "Añade un nuevo trabajo manualmente."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            {/* Client */}
            <FormField
              control={form.control}
              name="client_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cliente</FormLabel>
                  <Select
                    value={field.value ?? NULL_VAL}
                    onValueChange={(v) => field.onChange(v === NULL_VAL ? null : v)}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar cliente…" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={NULL_VAL}>Sin cliente</SelectItem>
                      {clients.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />

            {/* Date + time */}
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="fecha"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha *</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="hora"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Hora (opcional)</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} value={field.value ?? ""} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            {/* Aviso de trabajos ya programados ese día */}
            {mismoDia.length > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 px-3 py-2 text-xs">
                <div className="font-medium text-amber-800 dark:text-amber-200 mb-1 flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  Ese día ya tienes {mismoDia.length} trabajo{mismoDia.length > 1 ? "s" : ""}:
                </div>
                <ul className="space-y-0.5 text-amber-700 dark:text-amber-300">
                  {mismoDia.map((t) => {
                    const nom = t.client_id ? clients.find((c) => c.id === t.client_id)?.nombre : null;
                    return (
                      <li key={t.id}>
                        · {t.hora ? t.hora.slice(0, 5) + "h" : "sin hora"}
                        {nom ? ` — ${nom}` : ""}
                        {t.tipo_servicio ? ` (${SERVICE_TYPE_LABELS[t.tipo_servicio]})` : ""}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* Service type */}
            <FormField
              control={form.control}
              name="tipo_servicio"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de servicio</FormLabel>
                  <Select
                    value={field.value ?? NULL_VAL}
                    onValueChange={(v) => field.onChange(v === NULL_VAL ? null : v)}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar…" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={NULL_VAL}>Sin especificar</SelectItem>
                      {SERVICE_TYPES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {SERVICE_TYPE_LABELS[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />

            {/* Address */}
            <FormField
              control={form.control}
              name="direccion"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Dirección del trabajo</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Calle, número, piso…"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Notes */}
            <FormField
              control={form.control}
              name="notas"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notas del día</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={3}
                      placeholder="Código del portal, persona de contacto…"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <div className="flex gap-2 justify-end pt-1">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Guardando…</>
                ) : initial ? "Guardar cambios" : "Crear trabajo"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
