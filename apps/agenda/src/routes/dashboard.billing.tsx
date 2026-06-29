import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { FileText } from "lucide-react";
import { listInvoices, updateSettings } from "@/lib/admin/admin.functions";
import { getInvoiceSignedUrl } from "@/lib/invoices/invoices.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/billing")({
  component: BillingPage,
});

function BillingPage() {
  const fetchInvoices = useServerFn(listInvoices);
  const update = useServerFn(updateSettings);
  const signUrl = useServerFn(getInvoiceSignedUrl);
  const qc = useQueryClient();
  const [iva, setIva] = useState<string>("");

  const { data } = useQuery({ queryKey: ["invoices"], queryFn: () => fetchInvoices() });

  async function saveIva() {
    const val = Number(iva);
    if (isNaN(val)) return toast.error("Valor inválido");
    await update({ data: { iva_porcentaje: val } });
    toast.success("IVA actualizado");
    qc.invalidateQueries({ queryKey: ["invoices"] });
    setIva("");
  }

  async function openInvoice(invoiceId: string) {
    try {
      const { url } = await signUrl({ data: { invoiceId } });
      if (url) window.open(url, "_blank", "noopener");
      else toast.error("PDF no disponible");
    } catch {
      toast.error("No se pudo abrir el PDF");
    }
  }

  return (
    <div>
      <PageHeader title="Facturación" description="Historial de facturas e IVA del negocio" />

      <Card className="mb-6 max-w-md">
        <CardHeader><CardTitle className="text-base">Porcentaje de IVA</CardTitle></CardHeader>
        <CardContent className="flex items-end gap-3">
          <div className="flex-1">
            <Label className="text-xs">IVA actual: {data?.iva ?? 21}%</Label>
            <Input type="number" placeholder="Nuevo %" value={iva} onChange={(e) => setIva(e.target.value)} />
          </div>
          <Button onClick={saveIva}>Guardar</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Historial de facturas</CardTitle></CardHeader>
        <CardContent className="p-0">
          {!data?.invoices.length ? (
            <p className="p-6 text-sm text-muted-foreground">Aún no hay facturas.</p>
          ) : (
            <div className="divide-y divide-border">
              {data.invoices.map((inv: any) => (
                <div key={inv.id} className="flex items-center justify-between gap-3 p-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">{inv.numero_factura}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(inv.fecha).toLocaleDateString("es-ES")} · {inv.cliente_nombre ?? "—"} · {Number(inv.importe_total).toFixed(2)} €
                    </p>
                  </div>
                  {inv.pdf_url ? (
                    <Button variant="outline" size="sm" onClick={() => openInvoice(inv.id)}>
                      <FileText className="h-4 w-4" /> PDF
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">PDF no disponible</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
