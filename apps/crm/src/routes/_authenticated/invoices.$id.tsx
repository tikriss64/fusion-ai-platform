import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Plus, Trash2, FileText, Mail, Phone, MessageCircle, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { formatDate, formatCurrency } from "@/lib/utils";
import { NewMailComposer } from "@/components/inbox/new-mail-composer";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import {
  paymentSchema,
  INVOICE_STATUS_LABELS,
  computeStatus,
  type InvoiceRow,
  type InvoiceItemRow,
  type PaymentRow,
  type PaymentFormValues,
} from "@/lib/invoices-schema";

export const Route = createFileRoute("/_authenticated/invoices/$id")({
  head: () => ({ meta: [{ title: "Factura — vaciadodepisos.cat" }] }),
  component: InvoiceDetailPage,
});

function InvoiceDetailPage() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const confirm = useConfirm();
  const [invoice, setInvoice] = useState<InvoiceRow | null>(null);
  const [items, setItems] = useState<InvoiceItemRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [clientName, setClientName] = useState<string>("");
  const [client, setClient] = useState<{ id: string; nombre: string; email: string | null; telefono: string | null } | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentSchema),
    defaultValues: { fecha: new Date().toISOString().slice(0, 10), importe: 0, notas: "" },
  });

  const load = async () => {
    setLoading(true);
    const [{ data: inv }, { data: its }, { data: pays }] = await Promise.all([
      supabase.from("invoices").select("*").eq("id", id).single(),
      supabase.from("invoice_items").select("*").eq("invoice_id", id).order("orden"),
      supabase.from("invoice_payments").select("*").eq("invoice_id", id).order("fecha", { ascending: false }),
    ]);
    setInvoice((inv as InvoiceRow) ?? null);
    setItems((its ?? []) as InvoiceItemRow[]);
    setPayments((pays ?? []) as PaymentRow[]);
    if (inv?.client_id) {
      const { data: c } = await supabase.from("clients").select("id, nombre, email, telefono").eq("id", inv.client_id).single();
      setClientName((c?.nombre as string) ?? "");
      setClient((c as any) ?? null);
    } else {
      setClient(null);
    }
    setLoading(false);
  };

  useEffect(() => { void load(); }, [id]);

  const totalPaid = payments.reduce((s, p) => s + Number(p.importe), 0);
  const pendiente = invoice ? Math.max(Number(invoice.total) - totalPaid, 0) : 0;

  const recalcStatus = async (inv: InvoiceRow, paid: number) => {
    const newStatus = computeStatus(Number(inv.total), paid, inv.vencimiento, inv.estado);
    if (newStatus !== inv.estado) {
      await supabase.from("invoices").update({ estado: newStatus } as any).eq("id", inv.id);
    }
  };

  const onAddPayment = async (values: PaymentFormValues) => {
    if (!user || !invoice) return;
    const { error } = await supabase.from("invoice_payments").insert({
      invoice_id: invoice.id,
      user_id: user.id,
      fecha: values.fecha,
      importe: values.importe,
      notas: values.notas || null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Pago registrado");
    const newPaid = totalPaid + Number(values.importe);
    await recalcStatus(invoice, newPaid);
    form.reset({ fecha: new Date().toISOString().slice(0, 10), importe: 0, notas: "" });
    await load();
  };

  const onDeletePayment = async (p: PaymentRow) => {
    const ok = await confirm({
      title: "Eliminar pago",
      description: `¿Eliminar el pago de ${formatCurrency(p.importe)} del ${formatDate(p.fecha)}?\n\nEsta acción no se puede deshacer.`,
      confirmText: "Eliminar",
      destructive: true,
    });
    if (!ok) return;
    const { error } = await supabase.from("invoice_payments").delete().eq("id", p.id);
    if (error) { toast.error(error.message); return; }
    if (invoice) await recalcStatus(invoice, totalPaid - Number(p.importe));
    await load();
  };

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (!invoice) {
    return <div className="text-sm text-muted-foreground">Factura no encontrada.</div>;
  }

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm"><Link to="/invoices"><ArrowLeft className="h-4 w-4" /> Volver</Link></Button>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight font-mono">{invoice.serie}-{invoice.numero}</h1>
          <p className="text-sm text-muted-foreground">
          {clientName || "Sin cliente"} · Emitida {formatDate(invoice.fecha_emision)}
          {invoice.vencimiento ? ` · Vence ${formatDate(invoice.vencimiento)}` : ""}
        </p>
        {invoice.quote_id && (
          <Link to="/quotes" className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <FileText className="h-3 w-3" /> Generada desde presupuesto
          </Link>
        )}
        </div>
        <Badge variant="secondary">{INVOICE_STATUS_LABELS[invoice.estado]}</Badge>
      </div>

      {/* Acciones rápidas (universales) */}
      <div className="flex flex-wrap gap-2">
        {client?.email && (
          <Button size="sm" onClick={() => setEmailOpen(true)} className="gap-1.5"><Mail className="h-4 w-4" /> Enviar por email</Button>
        )}
        {client && (
          <Button asChild size="sm" variant="outline" className="gap-1.5"><Link to="/clientes/$id" params={{ id: client.id }}><User className="h-4 w-4" /> Ver cliente</Link></Button>
        )}
        {client?.telefono && (
          <Button asChild size="sm" variant="outline" className="gap-1.5"><a href={`tel:${client.telefono}`}><Phone className="h-4 w-4" /> Llamar</a></Button>
        )}
        {client?.telefono && (
          <Button asChild size="sm" variant="outline" className="gap-1.5"><a href={`https://wa.me/${client.telefono.replace(/\D/g, "")}`} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4" /> WhatsApp</a></Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardHeader><CardTitle className="text-xs text-muted-foreground">Total</CardTitle></CardHeader><CardContent className="text-xl font-semibold">{formatCurrency(invoice.total)}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-xs text-muted-foreground">Pagado</CardTitle></CardHeader><CardContent className="text-xl font-semibold">{formatCurrency(totalPaid)}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-xs text-muted-foreground">Pendiente</CardTitle></CardHeader><CardContent className="text-xl font-semibold">{formatCurrency(pendiente)}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-xs text-muted-foreground">Subtotal / IVA</CardTitle></CardHeader><CardContent className="text-sm">{formatCurrency(invoice.subtotal)} / {formatCurrency(invoice.iva)}</CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">Líneas</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Descripción</TableHead>
                <TableHead className="text-right">Cantidad</TableHead>
                <TableHead className="text-right">Precio</TableHead>
                <TableHead className="text-right">IVA %</TableHead>
                <TableHead className="text-right">Subtotal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((it) => (
                <TableRow key={it.id}>
                  <TableCell>{it.descripcion}</TableCell>
                  <TableCell className="text-right tabular-nums">{Number(it.cantidad)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(it.precio_unit)}</TableCell>
                  <TableCell className="text-right tabular-nums">{Number(it.iva_aplicable)}%</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(Number(it.cantidad) * Number(it.precio_unit))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Pagos</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onAddPayment)} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
              <div className="md:col-span-3">
                <FormField control={form.control} name="fecha" render={({ field }) => (
                  <FormItem><FormLabel>Fecha</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <div className="md:col-span-3">
                <FormField control={form.control} name="importe" render={({ field }) => (
                  <FormItem><FormLabel>Importe (€)</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <div className="md:col-span-4">
                <FormField control={form.control} name="notas" render={({ field }) => (
                  <FormItem><FormLabel>Notas</FormLabel><FormControl><Input {...field} placeholder="Transferencia, efectivo…" /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <div className="md:col-span-2">
                <Button type="submit" className="w-full"><Plus className="h-4 w-4" /> Añadir pago</Button>
              </div>
            </form>
          </Form>

          {payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin pagos registrados.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Notas</TableHead>
                  <TableHead className="text-right">Importe</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{formatDate(p.fecha)}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{p.notas ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(p.importe)}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => onDeletePayment(p)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {invoice.notas_legales && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Notas legales</CardTitle></CardHeader>
          <CardContent className="text-sm whitespace-pre-wrap">{invoice.notas_legales}</CardContent>
        </Card>
      )}

      {emailOpen && client?.email && (
        <NewMailComposer
          onClose={() => setEmailOpen(false)}
          defaultTo={client.email}
          defaultSubject={`Factura ${invoice.serie}-${invoice.numero}`}
          defaultBody={`Estimado/a ${client.nombre.split(" ")[0]},\n\nAdjunto le enviamos la factura ${invoice.serie}-${invoice.numero} por importe de ${formatCurrency(invoice.total)}.\n\nGracias por su confianza.\n\nAtentamente,\nMartín`}
          autoAttach={{ type: "factura", id: invoice.id }}
        />
      )}
    </div>
  );
}