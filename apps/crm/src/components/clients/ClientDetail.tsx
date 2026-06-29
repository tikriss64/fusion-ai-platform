import { useEffect, useState } from "react";
import { Star, Mail, Phone, MapPin, FileText, CheckCircle2, XCircle, Receipt, CalendarDays, Loader2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { NewMailComposer } from "@/components/inbox/new-mail-composer";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, formatCurrency } from "@/lib/utils";
import type { ClientRow } from "@/lib/clients-schema";
import type { QuoteRow } from "@/lib/quotes-schema";
import type { InvoiceRow } from "@/lib/invoices-schema";
import type { TrabajoRow } from "@/lib/trabajos-schema";
import { QUOTE_STATUS_LABELS } from "@/lib/quotes-schema";
import { INVOICE_STATUS_LABELS } from "@/lib/invoices-schema";
import { TRABAJO_STATUS_LABELS, TRABAJO_STATUS_COLORS } from "@/lib/trabajos-schema";

const invoiceStatusColor: Record<string, string> = {
  pendiente: "bg-amber-100 text-amber-800",
  pagada: "bg-green-100 text-green-800",
  parcial: "bg-blue-100 text-blue-800",
  vencida: "bg-red-100 text-red-800",
};

export function ClientDetail({ client }: { client: ClientRow }) {
  const stars = client.valoracion ?? 0;

  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [trabajos, setTrabajos] = useState<TrabajoRow[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [composing, setComposing] = useState(false);

  useEffect(() => {
    void (async () => {
      setLoadingHistory(true);
      const [{ data: qs }, { data: invs }, { data: tjs }] = await Promise.all([
        supabase.from("quotes").select("*").eq("client_id", client.id).eq("is_template", false).order("created_at", { ascending: false }).limit(10),
        supabase.from("invoices").select("*").eq("client_id", client.id).order("created_at", { ascending: false }).limit(10),
        supabase.from("trabajos").select("*").eq("client_id", client.id).order("fecha", { ascending: false }).limit(10),
      ]);
      setQuotes((qs ?? []) as QuoteRow[]);
      setInvoices((invs ?? []) as InvoiceRow[]);
      setTrabajos((tjs ?? []) as TrabajoRow[]);
      setLoadingHistory(false);
    })();
  }, [client.id]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-xl">{client.nombre}</CardTitle>
            {client.nif_cif && <CardDescription>NIF/CIF: {client.nif_cif}</CardDescription>}
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {client.email && (
              <div className="flex items-center gap-2 flex-wrap">
                <a href={`mailto:${client.email}`} className="flex items-center gap-2 hover:text-primary transition-colors">
                  <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  {client.email}
                </a>
                <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => setComposing(true)}>
                  <Mail className="h-3.5 w-3.5" /> Enviar email
                </Button>
              </div>
            )}
            {client.telefono && (
              <a href={`tel:${client.telefono}`} className="flex items-center gap-2 hover:text-primary transition-colors">
                <Phone className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                {client.telefono}
              </a>
            )}
            {(client.direccion || client.poblacion) && (
              <div className="flex items-start gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                <div>
                  {client.direccion && <div>{client.direccion}</div>}
                  {client.poblacion && <div className="text-muted-foreground">{client.poblacion}</div>}
                </div>
              </div>
            )}
            {client.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-2">
                {client.tags.map((t) => <Badge key={t} variant="secondary">{t}</Badge>)}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Métricas</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Trabajos</span><span className="font-medium">{client.num_trabajos}</span></div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Valoración</span>
              <div className="flex">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className={`h-4 w-4 ${i < stars ? "fill-primary text-primary" : "text-muted-foreground/40"}`} />
                ))}
              </div>
            </div>
            <div className="flex justify-between"><span className="text-muted-foreground">Primera fecha</span><span>{formatDate(client.primera_fecha)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Última fecha</span><span>{formatDate(client.ultima_fecha)}</span></div>
            <div className="flex justify-between items-center"><span className="text-muted-foreground">Recurrente</span>{client.recurrente ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <XCircle className="h-4 w-4 text-muted-foreground" />}</div>
            <div className="flex justify-between items-center"><span className="text-muted-foreground">RGPD</span>{client.rgpd_consent ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <XCircle className="h-4 w-4 text-muted-foreground" />}</div>
          </CardContent>
        </Card>
      </div>

      {client.notas && (
        <Card>
          <CardHeader><CardTitle className="text-base">Notas</CardTitle></CardHeader>
          <CardContent className="whitespace-pre-wrap text-sm">{client.notas}</CardContent>
        </Card>
      )}

      {loadingHistory ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {/* Trabajos */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <CalendarDays className="h-4 w-4" /> Trabajos
              </CardTitle>
              {trabajos.length === 0 && <CardDescription>Sin trabajos registrados.</CardDescription>}
            </CardHeader>
            {trabajos.length > 0 && (
              <CardContent className="space-y-2">
                {trabajos.map((t) => (
                  <Link key={t.id} to="/agenda" className="flex items-center justify-between rounded-md border px-3 py-2 text-sm hover:bg-muted/50 transition-colors gap-2">
                    <span className="text-muted-foreground">{formatDate(t.fecha)}</span>
                    <Badge className={`text-xs ${TRABAJO_STATUS_COLORS[t.estado]}`}>{TRABAJO_STATUS_LABELS[t.estado]}</Badge>
                  </Link>
                ))}
              </CardContent>
            )}
          </Card>

          {/* Presupuestos */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4" /> Presupuestos
              </CardTitle>
              {quotes.length === 0 && <CardDescription>Sin presupuestos.</CardDescription>}
            </CardHeader>
            {quotes.length > 0 && (
              <CardContent className="space-y-2">
                {quotes.map((q) => (
                  <Link key={q.id} to="/quotes" className="flex items-center justify-between rounded-md border px-3 py-2 text-sm hover:bg-muted/50 transition-colors gap-2">
                    <span className="font-mono text-xs">{q.numero ?? "—"}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">{formatCurrency(q.total)}</span>
                      <span className="text-xs text-muted-foreground">{QUOTE_STATUS_LABELS[q.estado]}</span>
                    </div>
                  </Link>
                ))}
              </CardContent>
            )}
          </Card>

          {/* Facturas */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Receipt className="h-4 w-4" /> Facturas
              </CardTitle>
              {invoices.length === 0 && <CardDescription>Sin facturas.</CardDescription>}
            </CardHeader>
            {invoices.length > 0 && (
              <CardContent className="space-y-2">
                {invoices.map((i) => (
                  <Link key={i.id} to="/invoices/$id" params={{ id: i.id }} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm hover:bg-muted/50 transition-colors gap-2">
                    <span className="font-mono text-xs">{i.serie}-{i.numero}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">{formatCurrency(i.total)}</span>
                      <Badge className={`text-xs ${invoiceStatusColor[i.estado] ?? ""}`} variant="secondary">{INVOICE_STATUS_LABELS[i.estado]}</Badge>
                    </div>
                  </Link>
                ))}
              </CardContent>
            )}
          </Card>
        </div>
      )}

      {composing && client.email && (
        <NewMailComposer
          onClose={() => setComposing(false)}
          defaultTo={client.email}
          defaultBody={`Estimado/a ${client.nombre.split(" ")[0]},\n\n`}
        />
      )}
    </div>
  );
}
