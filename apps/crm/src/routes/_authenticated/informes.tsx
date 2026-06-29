import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, FileDown, ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";
import type { CompanySettings } from "@/lib/company-settings-type";
import type { MonthRow, QuarterRow } from "@/components/informes/ReportPdfDocument";

export const Route = createFileRoute("/_authenticated/informes")({
  head: () => ({ meta: [{ title: "Informes — vaciadodepisos.cat" }] }),
  component: InformesPage,
});

const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

function InformesPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [invoices, setInvoices] = useState<{ fecha_emision: string; subtotal: number; iva: number; total: number }[]>([]);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: inv, error }, { data: comp }] = await Promise.all([
        supabase.from("invoices").select("fecha_emision, subtotal, iva, total")
          .gte("fecha_emision", `${year}-01-01`).lte("fecha_emision", `${year}-12-31`),
        supabase.from("company_settings").select("*").maybeSingle(),
      ]);
      if (error) toast.error(error.message);
      setInvoices((inv ?? []) as any[]);
      setCompany((comp as unknown as CompanySettings) ?? null);
      setLoading(false);
    })();
  }, [year]);

  const months: MonthRow[] = useMemo(() => {
    const m: MonthRow[] = Array.from({ length: 12 }, (_, i) => ({ mes: i, base: 0, iva: 0, total: 0 }));
    for (const i of invoices) {
      const mes = Number(i.fecha_emision.slice(5, 7)) - 1;
      if (mes >= 0 && mes < 12) {
        m[mes].base += Number(i.subtotal) || 0;
        m[mes].iva += Number(i.iva) || 0;
        m[mes].total += Number(i.total) || 0;
      }
    }
    return m;
  }, [invoices]);

  const quarters: QuarterRow[] = useMemo(() => {
    const q: QuarterRow[] = Array.from({ length: 4 }, (_, i) => ({ trimestre: i + 1, base: 0, iva: 0, total: 0 }));
    for (const m of months) {
      const qi = Math.floor(m.mes / 3);
      q[qi].base += m.base; q[qi].iva += m.iva; q[qi].total += m.total;
    }
    return q;
  }, [months]);

  const totBase = months.reduce((a, m) => a + m.base, 0);
  const totIva = months.reduce((a, m) => a + m.iva, 0);
  const totTotal = months.reduce((a, m) => a + m.total, 0);

  const downloadPdf = async () => {
    setDownloading(true);
    try {
      const [{ pdf }, { ReportPdfDocument }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("@/components/informes/ReportPdfDocument"),
      ]);
      const blob = await pdf(<ReportPdfDocument year={year} company={company} months={months} quarters={quarters} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `Informe_fiscal_${year}.pdf`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Informe descargado");
    } catch {
      toast.error("No se pudo generar el PDF.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Informes para la gestoría</h1>
          <p className="text-sm text-muted-foreground">Facturación mensual e IVA trimestral (facturas emitidas).</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setYear((y) => y - 1)}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="w-16 text-center text-lg font-semibold tabular-nums">{year}</span>
          <Button variant="outline" size="icon" onClick={() => setYear((y) => y + 1)}><ChevronRight className="h-4 w-4" /></Button>
          <Button onClick={downloadPdf} disabled={downloading || loading} className="gap-1.5">
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />} Descargar PDF
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle className="text-base">Facturación mensual {year}</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Mes</TableHead><TableHead className="text-right">Base</TableHead><TableHead className="text-right">IVA</TableHead><TableHead className="text-right">Total</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {months.map((m) => (
                    <TableRow key={m.mes}>
                      <TableCell>{MESES[m.mes]}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(m.base)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(m.iva)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(m.total)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="font-semibold border-t-2">
                    <TableCell>TOTAL</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(totBase)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(totIva)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(totTotal)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">IVA por trimestre</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {quarters.map((q) => (
                <div key={q.trimestre} className="flex items-center justify-between rounded-md border p-3">
                  <span className="font-medium">{q.trimestre}T</span>
                  <div className="text-right">
                    <div className="text-sm font-semibold tabular-nums">{formatCurrency(q.iva)}</div>
                    <div className="text-xs text-muted-foreground">IVA repercutido</div>
                  </div>
                </div>
              ))}
              <p className="pt-1 text-xs text-muted-foreground">No incluye IVA soportado (compras). Verifícalo con tu gestoría.</p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
