import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";

export const Route = createFileRoute("/p/$token")({
  head: () => ({
    meta: [
      { title: "Presupuesto — vaciadodepisos.cat" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PublicQuotePage,
});

type Item = { descripcion: string; cantidad: number; precio_unit: number; iva_aplicable: number };
type Data = {
  quote: { numero: string | null; estado: string; fecha: string; valido_hasta: string | null; subtotal: number; iva: number; total: number; accepted_at: string | null };
  items: Item[];
  company: { trade_name: string | null; legal_name: string | null; tax_id: string | null; phone: string | null; email: string | null } | null;
  cliente: string | null;
};

function PublicQuotePage() {
  const { token } = Route.useParams();
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [acceptError, setAcceptError] = useState(false);

  const load = async () => {
    try {
      const r = await fetch(`/api/public/quote/${token}`);
      if (!r.ok) { setNotFound(true); return; }
      const d = (await r.json()) as Data;
      setData(d);
      if (d.quote.estado === "aceptado" || d.quote.accepted_at) setAccepted(true);
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [token]);

  const accept = async () => {
    setAccepting(true);
    setAcceptError(false);
    try {
      const r = await fetch(`/api/public/quote/${token}/accept`, { method: "POST" });
      if (!r.ok) { setAcceptError(true); return; }
      setAccepted(true);
    } catch {
      setAcceptError(true);
    } finally {
      setAccepting(false);
    }
  };

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (notFound || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <p className="text-center text-muted-foreground">Este presupuesto no existe o el enlace no es válido.</p>
      </div>
    );
  }

  const { quote, items, company, cliente } = data;
  const empresa = company?.trade_name || company?.legal_name || "vaciadodepisos.cat";
  const yaCaducado = quote.valido_hasta && quote.valido_hasta < new Date().toISOString().slice(0, 10);

  return (
    <div className="min-h-screen bg-muted/30 px-4 py-8">
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="rounded-2xl border bg-background p-6 shadow-sm sm:p-8">
          <div className="flex items-start justify-between gap-4 border-b pb-4">
            <div>
              <h1 className="text-xl font-bold text-primary">{empresa}</h1>
              {company?.tax_id && <p className="text-xs text-muted-foreground">{company.tax_id}</p>}
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold">Presupuesto {quote.numero ?? ""}</p>
              <p className="text-xs text-muted-foreground">{formatDate(quote.fecha)}</p>
            </div>
          </div>

          {cliente && <p className="pt-4 text-sm">Para: <span className="font-medium">{cliente}</span></p>}

          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2">Concepto</th>
                <th className="py-2 text-right">Cant.</th>
                <th className="py-2 text-right">Precio</th>
                <th className="py-2 text-right">Importe</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i} className="border-b">
                  <td className="py-2">{it.descripcion}</td>
                  <td className="py-2 text-right tabular-nums">{Number(it.cantidad)}</td>
                  <td className="py-2 text-right tabular-nums">{formatCurrency(it.precio_unit)}</td>
                  <td className="py-2 text-right tabular-nums">{formatCurrency(Number(it.cantidad) * Number(it.precio_unit))}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-4 space-y-1 text-right text-sm">
            <div className="text-muted-foreground">Base: {formatCurrency(quote.subtotal)} · IVA: {formatCurrency(quote.iva)}</div>
            <div className="text-lg font-bold">Total: {formatCurrency(quote.total)}</div>
          </div>

          {quote.valido_hasta && (
            <p className="mt-2 text-xs text-muted-foreground">Válido hasta el {formatDate(quote.valido_hasta)}.</p>
          )}
        </div>

        {accepted ? (
          <div className="flex items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-700">
            <CheckCircle2 className="h-6 w-6" />
            <span className="font-medium">¡Presupuesto aceptado! Nos pondremos en contacto para concretar la fecha. Gracias.</span>
          </div>
        ) : yaCaducado ? (
          <div className="rounded-2xl border bg-background p-6 text-center text-sm text-muted-foreground">
            Este presupuesto ha caducado. Contáctanos {company?.phone ? `al ${company.phone}` : ""} para uno actualizado.
          </div>
        ) : (
          <div className="rounded-2xl border bg-background p-6 text-center">
            <p className="mb-3 text-sm text-muted-foreground">¿Conforme con el presupuesto? Acéptalo aquí y nos ponemos en marcha.</p>
            <button
              onClick={accept}
              disabled={accepting}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {accepting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Aceptar presupuesto
            </button>
            {acceptError && (
              <p className="mt-3 text-xs text-red-600">No se pudo registrar la aceptación. Revisa tu conexión e inténtalo de nuevo{company?.phone ? `, o llámanos al ${company.phone}` : ""}.</p>
            )}
            <p className="mt-3 text-[11px] text-muted-foreground">Al aceptar, confirmas tu conformidad con este presupuesto (firma electrónica simple, eIDAS).</p>
          </div>
        )}

        {company?.phone && (
          <p className="text-center text-xs text-muted-foreground">¿Dudas? Llámanos al {company.phone}</p>
        )}
      </div>
    </div>
  );
}
