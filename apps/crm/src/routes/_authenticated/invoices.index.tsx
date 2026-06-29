import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Search, AlertTriangle, Mail } from "lucide-react";
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
import { InvoiceTable } from "@/components/invoices/InvoiceTable";
import { NewMailComposer } from "@/components/inbox/new-mail-composer";
import { InvoiceForm } from "@/components/invoices/InvoiceForm";
import { DocumentPreviewDialog } from "@/components/documents/DocumentPreviewDialog";
import { generateInvoiceHtml } from "@/components/documents/html-template";
import {
  INVOICE_STATUSES,
  INVOICE_STATUS_LABELS,
  isOverdue,
  nextInvoiceRef,
  type InvoiceFormValues,
  type InvoiceRow,
  type InvoiceItemRow,
} from "@/lib/invoices-schema";
import { computeTotals } from "@/lib/quotes-schema";
import { formatCurrency } from "@/lib/utils";
import type { ClientRow } from "@/lib/clients-schema";
import type { CompanySettings } from "@/lib/company-settings-type";

export const Route = createFileRoute("/_authenticated/invoices/")({
  head: () => ({ meta: [{ title: "Facturas — vaciadodepisos.cat" }] }),
  component: InvoicesPage,
});

const ALL = "__all__";

function InvoicesPage() {
  const { user } = useAuth();
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [paidMap, setPaidMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>(ALL);
  const [clientFilter, setClientFilter] = useState<string>(ALL);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<(InvoiceRow & { items: InvoiceItemRow[] }) | null>(null);
  const [prefillInvoice, setPrefillInvoice] = useState<(InvoiceRow & { items: InvoiceItemRow[] }) | null>(null);
  const [emailInvoice, setEmailInvoice] = useState<{ to: string; subject: string; body: string } | null>(null);

  // Abrir el compositor con los datos reales de la factura (cuerpo + asunto).
  // El usuario puede adjuntar el PDF desde el propio compositor.
  const handleSendEmail = (i: InvoiceRow) => {
    if (!i.client_id) return;
    const to = clientEmails[i.client_id];
    if (!to) return;
    const nombre = (clientNames[i.client_id] ?? "").split(" ")[0] || "cliente";
    const ref = `${i.serie}-${i.numero}`;
    const venc = i.estado === "vencida" || i.estado === "pendiente" || i.estado === "parcial";
    const tel = company?.phone ?? "688 30 41 43";
    const body = venc
      ? `Estimado/a ${nombre},\n\nLe recordamos que tiene pendiente el pago de la factura ${ref} por importe de ${formatCurrency(i.total)}${i.vencimiento ? ` (vencimiento: ${i.vencimiento})` : ""}.\n\nPuede realizar el pago mediante transferencia o Bizum al ${tel}. Si ya lo ha abonado, ignore este mensaje.\n\nAtentamente,\nMartín`
      : `Estimado/a ${nombre},\n\nAdjunto le enviamos la factura ${ref} por importe de ${formatCurrency(i.total)}.\n\nGracias por su confianza.\n\nAtentamente,\nMartín`;
    setEmailInvoice({ to, subject: `Factura ${ref}`, body });
  };
  const [toDelete, setToDelete] = useState<InvoiceRow | null>(null);

  type PreviewData = {
    invoice: InvoiceRow & { items: InvoiceItemRow[] };
    client: ClientRow | null;
    htmlContent: string;
  };
  const [preview, setPreview] = useState<PreviewData | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data: inv, error: e1 }, { data: cs, error: e2 }, { data: comp }, { data: pays }] = await Promise.all([
      supabase.from("invoices").select("*").order("fecha_emision", { ascending: false }).order("numero", { ascending: false }),
      supabase.from("clients").select("*").order("nombre"),
      supabase.from("company_settings").select("*").maybeSingle(),
      supabase.from("invoice_payments").select("invoice_id, importe"),
    ]);
    if (e1) toast.error(e1.message);
    if (e2) toast.error(e2.message);
    setInvoices((inv ?? []) as InvoiceRow[]);
    setClients((cs ?? []) as ClientRow[]);
    setCompany(comp as CompanySettings | null);
    const pm: Record<string, number> = {};
    for (const p of pays ?? []) {
      pm[p.invoice_id] = (pm[p.invoice_id] ?? 0) + Number(p.importe);
    }
    setPaidMap(pm);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const { search: s, estado } = (e as CustomEvent).detail as { search?: string; estado?: string };
      if (s !== undefined) setSearch(s);
      if (estado) setStatusFilter(estado); else setStatusFilter(ALL);
    };
    window.addEventListener("assistant:filterInvoices", handler);
    return () => window.removeEventListener("assistant:filterInvoices", handler);
  }, []);

  // Crear factura con datos pre-rellenados (p.ej. desde un documento escaneado).
  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent).detail as { cliente_nombre?: string; concepto?: string; importe?: number };
      setEditing(null);
      let clientId: string | null = null;
      if (d.cliente_nombre) {
        const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
        const q = norm(d.cliente_nombre);
        const found = clients.find((c) => norm(c.nombre) === q) ?? clients.find((c) => norm(c.nombre).includes(q));
        clientId = found?.id ?? null;
      }
      setPrefillInvoice({
        client_id: clientId,
        items: [{
          id: "tmp",
          descripcion: d.concepto || "Documento importado",
          cantidad: 1,
          precio_unit: d.importe ?? 0,
          iva_aplicable: company?.default_vat ?? 21,
        }],
      } as unknown as InvoiceRow & { items: InvoiceItemRow[] });
      setFormOpen(true);
    };
    window.addEventListener("assistant:createInvoice", handler);
    return () => window.removeEventListener("assistant:createInvoice", handler);
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
    return invoices.filter((i) => {
      if (statusFilter !== ALL && i.estado !== statusFilter) return false;
      if (clientFilter !== ALL && i.client_id !== clientFilter) return false;
      if (q) {
        const name = i.client_id ? clientNames[i.client_id] ?? "" : "";
        // Incluye la referencia con guion ("V6-24") para que la búsqueda coincida con
        // el formato que se muestra en la tabla, no solo serie/número por separado.
        const hay = [i.serie, i.numero, `${i.serie}-${i.numero}`, name].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [invoices, search, statusFilter, clientFilter, clientNames]);

  // Feature 1: facturas vencidas (por fecha) para preparar recordatorios de cobro.
  const overdue = useMemo(
    () => invoices.filter((i) => isOverdue(i.estado, i.vencimiento)),
    [invoices],
  );

  const openCreate = () => { setEditing(null); setFormOpen(true); };

  const openEdit = async (i: InvoiceRow) => {
    const { data, error } = await supabase
      .from("invoice_items").select("*").eq("invoice_id", i.id).order("orden");
    if (error) { toast.error(error.message); return; }
    setEditing({ ...i, items: (data ?? []) as InvoiceItemRow[] });
    setFormOpen(true);
  };

  const openDocument = async (i: InvoiceRow) => {
    const { data, error } = await supabase
      .from("invoice_items").select("*").eq("invoice_id", i.id).order("orden");
    if (error) { toast.error(error.message); return; }
    const invoiceWithItems = { ...i, items: (data ?? []) as InvoiceItemRow[] };
    const client = clients.find((c) => c.id === i.client_id) ?? null;
    setPreview({
      invoice: invoiceWithItems,
      client,
      htmlContent: generateInvoiceHtml(invoiceWithItems, client, company),
    });
  };

  const handleDownloadInvoicePdf = async () => {
    if (!preview) return;
    const [{ pdf }, { InvoicePdfDocument }] = await Promise.all([
      import("@react-pdf/renderer"),
      import("@/components/documents/InvoicePdfDocument"),
    ]);
    const blob = await pdf(
      <InvoicePdfDocument invoice={preview.invoice} client={preview.client} company={company} />
    ).toBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Factura_${preview.invoice.serie}-${preview.invoice.numero}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("PDF descargado");
  };

  const handleSubmit = async (values: InvoiceFormValues) => {
    if (!user) return;
    const totals = computeTotals(values.items);
    const base: Record<string, any> = {
      user_id: user.id,
      client_id: values.client_id ?? null,
      fecha_emision: values.fecha_emision,
      vencimiento: values.vencimiento || null,
      estado: values.estado,
      subtotal: totals.subtotal,
      iva: totals.iva,
      total: totals.total,
      notas_legales: values.notas_legales || null,
    };

    let invoiceId: string;
    if (editing) {
      // Al editar NO se renumera: se conserva la serie/número original.
      const { error } = await supabase.from("invoices").update(base as any).eq("id", editing.id);
      if (error) { toast.error(error.message); return; }
      invoiceId = editing.id;
      await supabase.from("invoice_items").delete().eq("invoice_id", invoiceId);
    } else {
      // values.serie trae el TIPO (V/L/P) → calculamos serie+número (V2-26…).
      const { serie, numero } = await nextInvoiceRef(supabase, values.serie);
      const { data, error } = await supabase.from("invoices").insert({ ...base, serie, numero } as any).select("id").single();
      if (error || !data) { toast.error(error?.message ?? "Error"); return; }
      invoiceId = data.id;
    }

    const itemsPayload = values.items.map((it, i) => ({
      invoice_id: invoiceId,
      descripcion: it.descripcion,
      cantidad: it.cantidad,
      precio_unit: it.precio_unit,
      iva_aplicable: it.iva_aplicable,
      orden: i,
    }));
    const { error: itemsErr } = await supabase.from("invoice_items").insert(itemsPayload);
    if (itemsErr) { toast.error(itemsErr.message); return; }

    toast.success(editing ? "Factura actualizada" : "Factura creada");
    setFormOpen(false);
    setEditing(null);
    await load();
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    const { error } = await supabase.from("invoices").delete().eq("id", toDelete.id);
    if (error) { toast.error(error.message); setToDelete(null); return; }
    toast.success("Factura eliminada");
    setToDelete(null);
    await load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Facturas</h1>
          <p className="text-sm text-muted-foreground">{invoices.length} facturas en total</p>
        </div>
        <Button onClick={openCreate}><Plus /> Nueva factura</Button>
      </div>

      {overdue.length > 0 && (
        <div className="rounded-lg border border-amber-300/50 bg-amber-50 p-3 dark:bg-amber-950/20">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4" />
            {overdue.length} factura{overdue.length > 1 ? "s" : ""} vencida{overdue.length > 1 ? "s" : ""} sin cobrar — prepara un recordatorio (lo revisas antes de enviar):
          </div>
          <div className="flex flex-wrap gap-2">
            {overdue.slice(0, 8).map((i) => (
              <Button key={i.id} size="sm" variant="outline" onClick={() => handleSendEmail(i)} className="gap-1.5"
                disabled={!i.client_id || !clientEmails[i.client_id]}
                title={i.client_id && clientEmails[i.client_id] ? "Preparar recordatorio" : "El cliente no tiene email"}>
                <Mail className="h-3.5 w-3.5" /> {i.serie}-{i.numero} · {formatCurrency(i.total)}
              </Button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por número, serie, cliente…" className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="Estado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos los estados</SelectItem>
            {INVOICE_STATUSES.map((s) => <SelectItem key={s} value={s}>{INVOICE_STATUS_LABELS[s]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={clientFilter} onValueChange={setClientFilter}>
          <SelectTrigger className="w-full sm:w-[200px]"><SelectValue placeholder="Cliente" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos los clientes</SelectItem>
            {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <InvoiceTable invoices={filtered} clientNames={clientNames} clientEmails={clientEmails} paidMap={paidMap} onEdit={openEdit} onDelete={setToDelete} onDocument={openDocument} onSendEmail={handleSendEmail} />
      )}

      <Dialog open={formOpen} onOpenChange={(o) => { setFormOpen(o); if (!o) { setEditing(null); setPrefillInvoice(null); } }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar factura" : "Nueva factura"}</DialogTitle>
            <DialogDescription>Completa los datos y las líneas de la factura.</DialogDescription>
          </DialogHeader>
          <InvoiceForm
            initial={editing ?? prefillInvoice}
            clients={clients}
            defaultVat={company?.default_vat ?? 21}
            onSubmit={handleSubmit}
            onCancel={() => { setFormOpen(false); setEditing(null); setPrefillInvoice(null); }}
            submitLabel={editing ? "Guardar cambios" : "Crear"}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar factura</AlertDialogTitle>
            <AlertDialogDescription>Se eliminarán también sus líneas y pagos. Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {preview && (
        <DocumentPreviewDialog
          open={!!preview}
          onClose={() => setPreview(null)}
          title={`Factura ${preview.invoice.serie}-${preview.invoice.numero}`}
          htmlContent={preview.htmlContent}
          onDownloadPdf={handleDownloadInvoicePdf}
        />
      )}

      {emailInvoice && (
        <NewMailComposer
          onClose={() => setEmailInvoice(null)}
          defaultTo={emailInvoice.to}
          defaultSubject={emailInvoice.subject}
          defaultBody={emailInvoice.body}
        />
      )}
    </div>
  );
}