import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Pencil, Mail, Phone, MessageCircle, FileText, Receipt, CalendarDays, Paperclip, Download, Trash2, type LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ClientDetail } from "@/components/clients/ClientDetail";
import { ClientForm } from "@/components/clients/ClientForm";
import { NewMailComposer } from "@/components/inbox/new-mail-composer";
import type { ClientRow, ClientFormValues } from "@/lib/clients-schema";
import { QUOTE_STATUS_LABELS } from "@/lib/quotes-schema";
import { INVOICE_STATUS_LABELS } from "@/lib/invoices-schema";
import { TRABAJO_STATUS_LABELS } from "@/lib/trabajos-schema";
import { formatCurrency, formatDate } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/clientes/$id")({
  head: () => ({ meta: [{ title: "Cliente — vaciadodepisos.cat" }] }),
  component: ClientDetailPage,
});

function ClientDetailPage() {
  const { id } = Route.useParams();
  const [client, setClient] = useState<ClientRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [quotes, setQuotes] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [trabajos, setTrabajos] = useState<any[]>([]);
  const [docs, setDocs] = useState<{ name: string; label: string }[]>([]);

  // Documentos adjuntos del cliente (Supabase Storage, bucket client-docs).
  const loadDocs = async () => {
    const { data } = await supabase.storage.from("client-docs").list(id, { sortBy: { column: "created_at", order: "desc" } });
    setDocs((data ?? [])
      .filter((f) => f.name && f.name !== ".emptyFolderPlaceholder")
      .map((f) => ({ name: f.name, label: f.name.replace(/^\d+__/, "") })));
  };

  const descargarDoc = async (name: string) => {
    const { data } = await supabase.storage.from("client-docs").createSignedUrl(`${id}/${name}`, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
    else toast.error("No se pudo abrir el documento.");
  };

  const borrarDoc = async (name: string) => {
    const { error } = await supabase.storage.from("client-docs").remove([`${id}/${name}`]);
    if (error) { toast.error(error.message); return; }
    toast.success("Documento eliminado");
    void loadDocs();
  };

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("clients").select("*").eq("id", id).maybeSingle();
    if (error) toast.error(error.message);
    setClient((data as ClientRow | null) ?? null);
    // Vista 360°: todo lo del cliente en un sitio (contexto global).
    const [{ data: qs }, { data: invs }, { data: tjs }] = await Promise.all([
      supabase.from("quotes").select("id, numero, estado, total, fecha").eq("client_id", id).eq("is_template", false).order("created_at", { ascending: false }),
      supabase.from("invoices").select("id, serie, numero, estado, total, fecha_emision").eq("client_id", id).order("created_at", { ascending: false }),
      supabase.from("trabajos").select("id, fecha, estado, tipo_servicio").eq("client_id", id).order("fecha", { ascending: false }),
    ]);
    setQuotes(qs ?? []);
    setInvoices(invs ?? []);
    setTrabajos(tjs ?? []);
    setLoading(false);
  };

  useEffect(() => { void load(); void loadDocs(); }, [id]);

  const handleSubmit = async (values: ClientFormValues) => {
    if (!client) return;
    const n = (s: string | null | undefined) => (s === "" || s == null ? null : s);
    const { error } = await supabase.from("clients").update({
      nombre: values.nombre,
      nif_cif: n(values.nif_cif),
      email: n(values.email),
      telefono: n(values.telefono),
      direccion: n(values.direccion),
      poblacion: n(values.poblacion),
      notas: n(values.notas),
      tags: values.tags,
      primera_fecha: n(values.primera_fecha),
      ultima_fecha: n(values.ultima_fecha),
      num_trabajos: values.num_trabajos,
      valoracion: values.valoracion ?? null,
      recurrente: values.recurrente,
      rgpd_consent: values.rgpd_consent,
    }).eq("id", client.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Cliente actualizado");
    setEditing(false);
    await load();
  };

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (!client) {
    return (
      <div className="space-y-4">
        <Button asChild variant="ghost" size="sm"><Link to="/clientes"><ArrowLeft />Volver</Link></Button>
        <div className="rounded-md border p-10 text-center text-sm text-muted-foreground">
          Cliente no encontrado.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/clientes"><ArrowLeft />Volver</Link>
        </Button>
        <Button onClick={() => setEditing(true)}><Pencil />Editar</Button>
      </div>

      {/* Acciones rápidas (universales) */}
      <div className="flex flex-wrap gap-2">
        {client.email && (
          <Button onClick={() => setEmailOpen(true)} className="gap-1.5"><Mail className="h-4 w-4" /> Enviar email</Button>
        )}
        {client.telefono && (
          <Button asChild variant="outline" className="gap-1.5">
            <a href={`tel:${client.telefono}`}><Phone className="h-4 w-4" /> Llamar</a>
          </Button>
        )}
        {client.telefono && (
          <Button asChild variant="outline" className="gap-1.5">
            <a href={`https://wa.me/${client.telefono.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">
              <MessageCircle className="h-4 w-4" /> WhatsApp
            </a>
          </Button>
        )}
      </div>

      <ClientDetail client={client} />

      {/* Vista 360°: todo lo relacionado con este cliente */}
      <div className="grid gap-4 lg:grid-cols-3">
        <RelatedCard
          title="Presupuestos" icon={FileText} count={quotes.length} emptyText="Sin presupuestos." to="/quotes"
          rows={quotes.slice(0, 5).map((q) => ({
            key: q.id, left: q.numero ?? "—", badge: QUOTE_STATUS_LABELS[q.estado as keyof typeof QUOTE_STATUS_LABELS] ?? q.estado,
            right: formatCurrency(q.total), sub: formatDate(q.fecha),
          }))}
        />
        <RelatedCard
          title="Facturas" icon={Receipt} count={invoices.length} emptyText="Sin facturas." to="/invoices"
          rows={invoices.slice(0, 5).map((i) => ({
            key: i.id, left: `${i.serie ?? ""}-${i.numero ?? ""}`, badge: INVOICE_STATUS_LABELS[i.estado as keyof typeof INVOICE_STATUS_LABELS] ?? i.estado,
            right: formatCurrency(i.total), sub: formatDate(i.fecha_emision), to: `/invoices/${i.id}`,
          }))}
        />
        <RelatedCard
          title="Trabajos" icon={CalendarDays} count={trabajos.length} emptyText="Sin trabajos." to="/agenda"
          rows={trabajos.slice(0, 5).map((t) => ({
            key: t.id, left: formatDate(t.fecha), badge: TRABAJO_STATUS_LABELS[t.estado as keyof typeof TRABAJO_STATUS_LABELS] ?? t.estado,
            right: "", sub: t.tipo_servicio ?? "",
          }))}
        />
      </div>

      {/* Documentos adjuntos (subidos desde la sección Documentos) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-1.5 text-sm">
            <Paperclip className="h-4 w-4 text-muted-foreground" /> Documentos adjuntos
            <Badge variant="secondary" className="ml-1">{docs.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {docs.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">
              Sin documentos. Adjunta facturas, contratos o cualquier archivo desde la sección <span className="font-medium">Documentos</span>.
            </p>
          ) : (
            docs.map((d) => (
              <div key={d.name} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50 transition-colors">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate text-sm">{d.label}</span>
                <button onClick={() => descargarDoc(d.name)} title="Descargar" className="size-7 grid place-items-center rounded-md text-muted-foreground hover:bg-muted">
                  <Download className="h-4 w-4" />
                </button>
                <button onClick={() => borrarDoc(d.name)} title="Eliminar" className="size-7 grid place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {emailOpen && client.email && (
        <NewMailComposer
          onClose={() => setEmailOpen(false)}
          defaultTo={client.email}
          defaultBody={`Estimado/a ${client.nombre.split(" ")[0]},\n\n`}
        />
      )}

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Editar cliente</DialogTitle></DialogHeader>
          <ClientForm
            initial={client}
            onSubmit={handleSubmit}
            onCancel={() => setEditing(false)}
            submitLabel="Guardar cambios"
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

type RelatedRow = { key: string; left: string; badge: string; right: string; sub: string; to?: string };

function RelatedCard({
  title, icon: Icon, count, rows, emptyText, to,
}: {
  title: string;
  icon: LucideIcon;
  count: number;
  rows: RelatedRow[];
  emptyText: string;
  to: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-1.5"><Icon className="h-4 w-4 text-muted-foreground" /> {title}</span>
          <Badge variant="secondary">{count}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {rows.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          rows.map((r) => {
            const inner = (
              <div className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50 transition-colors">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-xs truncate">{r.left}</span>
                    <Badge variant="outline" className="text-[10px]">{r.badge}</Badge>
                  </div>
                  {r.sub && <div className="truncate text-xs text-muted-foreground">{r.sub}</div>}
                </div>
                {r.right && <span className="whitespace-nowrap text-sm tabular-nums">{r.right}</span>}
              </div>
            );
            return r.to
              ? <Link key={r.key} to={r.to as any}>{inner}</Link>
              : <div key={r.key}>{inner}</div>;
          })
        )}
        {count > 0 && (
          <Link to={to as any} className="block pt-1 text-xs font-medium text-primary underline underline-offset-2">
            Ver todos →
          </Link>
        )}
      </CardContent>
    </Card>
  );
}