import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { QuoteForm } from "@/components/quotes/QuoteForm";
import { QuoteTable } from "@/components/quotes/QuoteTable";
import { NewMailComposer } from "@/components/inbox/new-mail-composer";
import { DocumentPreviewDialog } from "@/components/documents/DocumentPreviewDialog";
import { generateQuoteHtml } from "@/components/documents/html-template";
import { ProgramarTrabajoDialog } from "@/components/agenda/ProgramarTrabajoDialog";
import type { TrabajoFormValues } from "@/lib/trabajos-schema";
import {
  computeTotals,
  nextQuoteRef,
  QUOTE_STATUSES,
  QUOTE_STATUS_LABELS,
  type QuoteFormValues,
  type QuoteRow,
  type QuoteItemRow,
} from "@/lib/quotes-schema";
import { nextInvoiceRef, INVOICE_SERIES } from "@/lib/invoices-schema";
import type { ClientRow } from "@/lib/clients-schema";
import { formatDate, formatCurrency } from "@/lib/utils";
import type { CompanySettings } from "@/lib/company-settings-type";

export const Route = createFileRoute("/_authenticated/quotes/")({
  head: () => ({ meta: [{ title: "Presupuestos — vaciadodepisos.cat" }] }),
  component: QuotesPage,
});

const ALL = "__all__";

function QuotesPage() {
  const { user } = useAuth();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"quotes" | "templates">("quotes");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>(ALL);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<(QuoteRow & { items: QuoteItemRow[] }) | null>(null);
  const [prefillQuote, setPrefillQuote] = useState<(QuoteRow & { items: QuoteItemRow[] }) | null>(null);
  const [toDelete, setToDelete] = useState<QuoteRow | null>(null);
  const [toConvert, setToConvert] = useState<QuoteRow | null>(null);
  const [convertTipo, setConvertTipo] = useState("L");
  const [toProgramar, setToProgramar] = useState<QuoteRow | null>(null);
  const [emailQuote, setEmailQuote] = useState<{ quote: QuoteRow; to: string; subject: string; body: string } | null>(null);

  type PreviewData = {
    quote: QuoteRow & { items: QuoteItemRow[] };
    client: ClientRow | null;
    htmlContent: string;
  };
  const [preview, setPreview] = useState<PreviewData | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data: qs, error: e1 }, { data: cs, error: e2 }, { data: comp }] = await Promise.all([
      supabase.from("quotes").select("*").order("fecha", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("clients").select("*").order("nombre"),
      supabase.from("company_settings").select("*").maybeSingle(),
    ]);
    if (e1) toast.error(e1.message);
    if (e2) toast.error(e2.message);
    setQuotes((qs ?? []) as QuoteRow[]);
    setClients((cs ?? []) as ClientRow[]);
    setCompany(comp as CompanySettings | null);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const { search: s, estado } = (e as CustomEvent).detail as { search?: string; estado?: string };
      if (s !== undefined) setSearch(s);
      if (estado) setStatusFilter(estado); else setStatusFilter(ALL);
    };
    window.addEventListener("assistant:filterQuotes", handler);
    return () => window.removeEventListener("assistant:filterQuotes", handler);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        cliente_nombre?: string; tipo_servicio?: string;
        descripcion?: string; precio?: number; urgencia?: string; poblacion?: string;
      };
      setEditing(null);

      // Buscar cliente por nombre (ignora acentos y mayúsculas, búsqueda amplia)
      const DIACRITICS = new RegExp("[\\u0300-\\u036f]", "g");
      const norm = (s: string) =>
        s.toLowerCase().normalize("NFD").replace(DIACRITICS, "").trim();
      let clientId: string | null = null;
      if (detail.cliente_nombre) {
        const q = norm(detail.cliente_nombre);
        const found =
          clients.find((c) => norm(c.nombre) === q) ??
          clients.find((c) => norm(c.nombre).includes(q)) ??
          clients.find((c) => q.includes(norm(c.nombre)));
        clientId = found?.id ?? null;

        // Si no está en la lista cargada, buscar en Supabase (puede ser recién creado)
        if (!clientId) {
          supabase
            .from("clients")
            .select("id, nombre")
            .ilike("nombre", `%${detail.cliente_nombre.trim()}%`)
            .limit(1)
            .then(({ data }) => {
              if (data?.[0]) {
                // Actualizar el prefill con el cliente encontrado
                setPrefillQuote((prev: any) => prev ? { ...prev, client_id: data[0].id } : prev);
              } else {
                toast.info(`Cliente "${detail.cliente_nombre}" no encontrado. Selecciónalo en el formulario o créalo primero.`);
              }
            });
        }
      }

      // Abrir siempre el formulario con los datos disponibles
      const descripcion = detail.descripcion
        ?? (detail.tipo_servicio ? detail.tipo_servicio.replace(/_/g, " ") : "");
      setPrefillQuote({
        client_id: clientId,
        tipo_servicio: (detail.tipo_servicio as any) ?? null,
        urgencia: detail.urgencia ?? "",
        items: [{
          id: "tmp",
          descripcion,
          cantidad: 1,
          precio_unit: detail.precio ?? 0,
          iva_aplicable: company?.default_vat ?? 21,
        }],
      } as any);
      setFormOpen(true);
    };
    window.addEventListener("assistant:createQuote", handler);
    return () => window.removeEventListener("assistant:createQuote", handler);
  }, [clients, company]);

  const clientNames = useMemo(
    () => Object.fromEntries(clients.map((c) => [c.id, c.nombre])),
    [clients],
  );
  const clientEmails = useMemo(
    () => Object.fromEntries(clients.filter((c) => c.email).map((c) => [c.id, c.email!])),
    [clients],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return quotes.filter((qu) => {
      if (tab === "templates" ? !qu.is_template : qu.is_template) return false;
      if (tab === "quotes" && statusFilter !== ALL && qu.estado !== statusFilter) return false;
      if (q) {
        const name = qu.client_id ? clientNames[qu.client_id] ?? "" : "";
        const hay = [qu.numero, name, qu.template_name, qu.notas_operativas, qu.tipo_vivienda]
          .filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [quotes, search, statusFilter, tab, clientNames]);

  const openCreate = () => { setEditing(null); setFormOpen(true); };

  const openEdit = async (q: QuoteRow) => {
    const { data, error } = await supabase
      .from("quote_items").select("*").eq("quote_id", q.id).order("orden");
    if (error) { toast.error(error.message); return; }
    setEditing({ ...q, items: (data ?? []) as QuoteItemRow[] });
    setFormOpen(true);
  };

  const openDocument = async (q: QuoteRow) => {
    const { data, error } = await supabase
      .from("quote_items").select("*").eq("quote_id", q.id).order("orden");
    if (error) { toast.error(error.message); return; }
    const quoteWithItems = { ...q, items: (data ?? []) as QuoteItemRow[] };
    const client = clients.find((c) => c.id === q.client_id) ?? null;
    setPreview({
      quote: quoteWithItems,
      client,
      htmlContent: generateQuoteHtml(quoteWithItems, client, company),
    });
  };

  const handleDownloadQuotePdf = async () => {
    if (!preview) return;
    const [{ pdf }, { QuotePdfDocument }] = await Promise.all([
      import("@react-pdf/renderer"),
      import("@/components/documents/QuotePdfDocument"),
    ]);
    const blob = await pdf(
      <QuotePdfDocument quote={preview.quote} client={preview.client} company={company} />
    ).toBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Presupuesto_${preview.quote.numero ?? "sin-numero"}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("PDF descargado");
  };

  const handleSubmit = async (values: QuoteFormValues) => {
    if (!user) return;
    const totals = computeTotals(values.items);
    const isTemplate = values.is_template;
    const base: Record<string, any> = {
      user_id: user.id,
      is_template: isTemplate,
      template_name: isTemplate ? (values.template_name || "Plantilla") : null,
      client_id: isTemplate ? null : (values.client_id ?? null),
      fecha: values.fecha,
      valido_hasta: values.valido_hasta || null,
      estado: values.estado,
      tipo_servicio: values.tipo_servicio ?? null,
      dificultad_acceso: values.dificultad_acceso || null,
      notas_operativas: values.notas_operativas || null,
      tipo_vivienda: values.tipo_vivienda || null,
      ascensor: values.ascensor,
      planta: values.planta || null,
      parking: values.parking,
      urgencia: values.urgencia || null,
      metros_cuadrados_estimados: values.metros_cuadrados_estimados ?? null,
      objetos_recuperables: values.objetos_recuperables || null,
      subtotal: totals.subtotal,
      iva: totals.iva,
      total: totals.total,
    };

    let quoteId: string;
    if (editing) {
      const { error } = await supabase.from("quotes").update(base as any).eq("id", editing.id);
      if (error) { toast.error(error.message); return; }
      quoteId = editing.id;
      await supabase.from("quote_items").delete().eq("quote_id", quoteId);
      // Fase 3 del aprendizaje: si ajustas el precio de un presupuesto auto-generado,
      // el sistema lo registra para que el supervisor lo resuma y afinemos las reglas.
      if (Number(editing.total) !== Number(totals.total) && /agent|autom/i.test(editing.notas_operativas ?? "")) {
        void fetch("/api/learning/log", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "quote_price", agent: "sales", entity_type: "quote", entity_id: editing.id, before_value: String(editing.total), after_value: String(totals.total), note: editing.tipo_servicio ?? "" }),
        }).catch(() => {});
      }
    } else {
      const numero = isTemplate ? null : await nextQuoteRef(supabase, values.tipo ?? "L");
      const { data, error } = await supabase.from("quotes").insert({ ...base, numero } as any).select("id").single();
      if (error || !data) { toast.error(error?.message ?? "Error"); return; }
      quoteId = data.id;
    }

    const itemsPayload = values.items.map((it, i) => ({
      quote_id: quoteId,
      descripcion: it.descripcion,
      cantidad: it.cantidad,
      precio_unit: it.precio_unit,
      iva_aplicable: it.iva_aplicable,
      orden: i,
    }));
    const { error: itemsErr } = await supabase.from("quote_items").insert(itemsPayload);
    if (itemsErr) { toast.error(itemsErr.message); return; }

    const wasAccepted = editing?.estado === "aceptado";
    const nowAccepted = values.estado === "aceptado";

    toast.success(editing ? "Presupuesto actualizado" : "Presupuesto creado");
    setFormOpen(false);

    if (nowAccepted && !wasAccepted && !isTemplate) {
      const savedQuote = (await supabase.from("quotes").select("*").eq("id", quoteId).single()).data as QuoteRow | null;
      if (savedQuote) { setToProgramar(savedQuote); }
    }

    setEditing(null);
    await load();
  };

  const handleProgramarTrabajo = async (values: TrabajoFormValues) => {
    if (!toProgramar || !user) return;

    // Detección de conflicto de horario el mismo día (±90 min)
    if (values.fecha && values.hora) {
      const { data: mismoDia } = await supabase
        .from("trabajos")
        .select("hora, client_id, estado")
        .eq("fecha", values.fecha)
        .not("estado", "in", "(completado,cancelado)");
      const toMin = (h: string) => {
        const [hh, mm] = h.slice(0, 5).split(":").map(Number);
        return hh * 60 + (mm || 0);
      };
      const nueva = toMin(values.hora);
      const choque = (mismoDia ?? []).find(
        (t: any) => t.hora && Math.abs(toMin(t.hora) - nueva) < 90,
      );
      if (choque) {
        const nom = choque.client_id ? clients.find((c) => c.id === choque.client_id)?.nombre : null;
        const ok = await confirm({
          title: "Posible solapamiento de horario",
          description: `El ${formatDate(values.fecha)} ya tienes un trabajo a las ${(choque.hora ?? "").slice(0, 5)}` +
            (nom ? ` (${nom})` : "") +
            `, muy cerca de las ${values.hora}.\n\n¿Programar de todos modos?`,
          confirmText: "Programar igualmente",
        });
        if (!ok) return;
      }
    }

    const { error } = await supabase.from("trabajos").insert({
      user_id: user.id,
      quote_id: toProgramar.id,
      client_id: toProgramar.client_id,
      fecha: values.fecha || null,
      hora: values.hora || null,
      direccion: values.direccion || null,
      tipo_servicio: toProgramar.tipo_servicio ?? null,
      notas: values.notas || null,
      estado: "confirmado",
    } as any);
    if (error) { toast.error(error.message); return; }
    toast.success("Trabajo programado en la agenda");
    setToProgramar(null);
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    const { error } = await supabase.from("quotes").delete().eq("id", toDelete.id);
    if (error) { toast.error(error.message); setToDelete(null); return; }
    toast.success("Eliminado");
    setToDelete(null);
    await load();
  };

  const handleDuplicate = async (q: QuoteRow) => {
    if (!user) return;
    const { data: items } = await supabase.from("quote_items").select("*").eq("quote_id", q.id).order("orden");
    const dupTipo = q.numero && /^[VLP]/i.test(q.numero) ? q.numero[0].toUpperCase() : "L";
    const numero = await nextQuoteRef(supabase, dupTipo);
    const { data: newQuote, error } = await supabase.from("quotes").insert({
      user_id: user.id,
      is_template: false,
      template_name: null,
      client_id: q.client_id,
      numero,
      fecha: new Date().toISOString().slice(0, 10),
      valido_hasta: null,
      estado: "borrador",
      tipo_servicio: q.tipo_servicio,
      dificultad_acceso: q.dificultad_acceso,
      notas_operativas: q.notas_operativas,
      tipo_vivienda: q.tipo_vivienda,
      ascensor: q.ascensor,
      planta: q.planta,
      parking: q.parking,
      urgencia: q.urgencia,
      metros_cuadrados_estimados: q.metros_cuadrados_estimados,
      objetos_recuperables: q.objetos_recuperables,
      subtotal: q.subtotal,
      iva: q.iva,
      total: q.total,
    } as any).select("id").single();
    if (error || !newQuote) { toast.error(error?.message ?? "Error al duplicar"); return; }
    if (items?.length) {
      await supabase.from("quote_items").insert(
        items.map((it: any, i: number) => ({
          quote_id: newQuote.id,
          descripcion: it.descripcion,
          cantidad: it.cantidad,
          precio_unit: it.precio_unit,
          iva_aplicable: it.iva_aplicable,
          orden: i,
        })),
      );
    }
    toast.success(`Presupuesto duplicado como ${numero}`);
    await load();
  };

  const handleMarkSent = async (q: QuoteRow) => {
    const { error } = await supabase.from("quotes").update({ estado: "enviado" }).eq("id", q.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Presupuesto marcado como enviado");
    await load();
  };

  // Enviar el presupuesto por email DESDE la app (Gmail conectado), con el PDF
  // adjunto automáticamente. Al enviarse, marca el presupuesto como "enviado".
  const handleSendEmail = (q: QuoteRow) => {
    if (!q.client_id) { toast.error("Este presupuesto no tiene cliente asignado."); return; }
    const to = clientEmails[q.client_id];
    if (!to) { toast.error("El cliente no tiene email. Añádelo en su ficha primero."); return; }
    const nombre = (clientNames[q.client_id] ?? "").split(" ")[0] || "cliente";
    const body = `Estimado/a ${nombre},\n\nAdjunto le enviamos el presupuesto ${q.numero ?? ""} por importe de ${formatCurrency(q.total)}.\n\nQuedamos a su disposición para cualquier consulta.\n\nUn saludo.`;
    setEmailQuote({ quote: q, to, subject: `Presupuesto ${q.numero ?? ""}`, body });
  };

  // Feature 2: copia el enlace público (token secreto) para que el cliente acepte con un clic.
  const handleCopyLink = async (q: QuoteRow) => {
    const token = (q as { public_token?: string }).public_token;
    if (!token) { toast.error("Este presupuesto aún no tiene enlace. Edítalo y guárdalo de nuevo."); return; }
    const url = `${window.location.origin}/p/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Enlace copiado. Pégaselo al cliente (email o WhatsApp).");
    } catch {
      toast.message("Enlace del presupuesto", { description: url });
    }
  };

  // Aceptar un presupuesto y, en el acto, abrir el diálogo para programar el
  // trabajo en la agenda (hereda cliente/servicio/dirección). Cierra el bucle
  // Aprobación → Trabajo sin pasos manuales.
  const handleMarkAccepted = async (q: QuoteRow) => {
    const { error } = await supabase.from("quotes").update({ estado: "aceptado" }).eq("id", q.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Presupuesto aceptado. Programa el trabajo en la agenda.");
    setToProgramar({ ...q, estado: "aceptado" });
    await load();
  };

  const handleConvert = async () => {
    if (!toConvert || !user) return;
    const q = toConvert;
    const { data: items, error: e1 } = await supabase
      .from("quote_items").select("*").eq("quote_id", q.id).order("orden");
    if (e1) { toast.error(e1.message); setToConvert(null); return; }

    // Regla: no se puede facturar un presupuesto sin conceptos ni con importe 0.
    if (!items || items.length === 0) {
      toast.error("Este presupuesto no tiene conceptos. Añade líneas antes de facturar.");
      setToConvert(null);
      return;
    }
    if (!q.total || Number(q.total) <= 0) {
      toast.error("El importe del presupuesto es 0 €. Revísalo antes de facturar.");
      setToConvert(null);
      return;
    }
    // Regla: no facturar dos veces el mismo presupuesto.
    const { data: existingInv } = await supabase
      .from("invoices").select("id, serie, numero").eq("quote_id", q.id).maybeSingle();
    if (existingInv) {
      toast.info(`Este presupuesto ya está facturado (${existingInv.serie ?? ""}-${existingInv.numero ?? ""}).`);
      setToConvert(null);
      await navigate({ to: "/invoices/$id", params: { id: existingInv.id } });
      return;
    }

    const { serie, numero } = await nextInvoiceRef(supabase, convertTipo);
    const today = new Date().toISOString().slice(0, 10);

    const { data: inv, error: e2 } = await supabase.from("invoices").insert({
      user_id: user.id,
      quote_id: q.id,
      client_id: q.client_id,
      serie,
      numero,
      fecha_emision: today,
      vencimiento: null,
      estado: "pendiente",
      subtotal: q.subtotal,
      iva: q.iva,
      total: q.total,
    }).select("id").single();
    if (e2 || !inv) { toast.error(e2?.message ?? "Error creando factura"); setToConvert(null); return; }

    if (items && items.length) {
      const payload = items.map((it: any, i: number) => ({
        invoice_id: inv.id,
        descripcion: it.descripcion,
        cantidad: it.cantidad,
        precio_unit: it.precio_unit,
        iva_aplicable: it.iva_aplicable,
        orden: i,
      }));
      await supabase.from("invoice_items").insert(payload);
    }

    await supabase.from("quotes").update({ estado: "facturado" }).eq("id", q.id);
    toast.success(`Factura ${serie}-${numero} creada`);
    setToConvert(null);
    await navigate({ to: "/invoices/$id", params: { id: inv.id } });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Presupuestos</h1>
          <p className="text-sm text-muted-foreground">{quotes.filter((q) => !q.is_template).length} presupuestos · {quotes.filter((q) => q.is_template).length} plantillas</p>
        </div>
        <Button onClick={openCreate}><Plus /> Nuevo presupuesto</Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="quotes">Presupuestos</TabsTrigger>
          <TabsTrigger value="templates">Plantillas</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por número, cliente, notas…" className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {tab === "quotes" && (
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="Estado" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos los estados</SelectItem>
              {QUOTE_STATUSES.map((s) => <SelectItem key={s} value={s}>{QUOTE_STATUS_LABELS[s]}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <QuoteTable quotes={filtered} clientNames={clientNames} clientEmails={clientEmails} onEdit={openEdit} onDelete={setToDelete} onConvert={setToConvert} onDocument={openDocument} onDuplicate={handleDuplicate} onMarkSent={handleMarkSent} onMarkAccepted={handleMarkAccepted} onSendEmail={handleSendEmail} onCopyLink={handleCopyLink} />
      )}

      <Dialog open={formOpen} onOpenChange={(o) => { setFormOpen(o); if (!o) { setEditing(null); setPrefillQuote(null); } }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar presupuesto" : "Nuevo presupuesto"}</DialogTitle>
            <DialogDescription>Completa los datos del presupuesto y sus líneas.</DialogDescription>
          </DialogHeader>
          <QuoteForm
            initial={editing ?? prefillQuote}
            clients={clients}
            defaultVat={company?.default_vat ?? 21}
            onSubmit={handleSubmit}
            onCancel={() => { setFormOpen(false); setEditing(null); setPrefillQuote(null); }}
            submitLabel={editing ? "Guardar cambios" : "Crear"}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar presupuesto</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!toConvert} onOpenChange={(o) => !o && setToConvert(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Convertir a factura</AlertDialogTitle>
            <AlertDialogDescription>
              Se creará una factura copiando el presupuesto <strong>{toConvert?.numero}</strong>. El presupuesto pasará a estado "Facturado".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-1 py-2">
            <Label className="text-sm">Tipo de factura</Label>
            <Select value={convertTipo} onValueChange={setConvertTipo}>
              <SelectTrigger className="mt-1 w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                {INVOICE_SERIES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.value} — {s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">El número se genera solo (p. ej. {convertTipo}3-26).</p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConvert}>Crear factura</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {preview && (
        <DocumentPreviewDialog
          open={!!preview}
          onClose={() => setPreview(null)}
          title={`Presupuesto ${preview.quote.numero ?? ""}`}
          htmlContent={preview.htmlContent}
          onDownloadPdf={handleDownloadQuotePdf}
        />
      )}

      {toProgramar && (
        <ProgramarTrabajoDialog
          open={!!toProgramar}
          onClose={() => setToProgramar(null)}
          quote={toProgramar}
          client={clients.find((c) => c.id === toProgramar.client_id) ?? null}
          onConfirm={handleProgramarTrabajo}
        />
      )}

      {emailQuote && (
        <NewMailComposer
          onClose={() => setEmailQuote(null)}
          defaultTo={emailQuote.to}
          defaultSubject={emailQuote.subject}
          defaultBody={emailQuote.body}
          autoAttach={{ type: "presupuesto", id: emailQuote.quote.id }}
          onSent={async () => {
            if (emailQuote.quote.estado === "borrador") {
              await supabase.from("quotes").update({ estado: "enviado" }).eq("id", emailQuote.quote.id);
            }
            await load();
          }}
        />
      )}
    </div>
  );
}