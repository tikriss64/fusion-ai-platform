import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import type { QuoteRow, QuoteItemRow } from "@/lib/quotes-schema";
import { SERVICE_TYPE_LABELS } from "@/lib/quotes-schema";
import type { ClientRow } from "@/lib/clients-schema";
import type { CompanySettings } from "@/lib/company-settings-type";

const S = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#222222", backgroundColor: "#ffffff" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 },
  logo: { width: 130, height: 55, objectFit: "contain" },
  companyNameText: { fontSize: 15, fontFamily: "Helvetica-Bold", color: "#111111" },
  headerRight: { alignItems: "flex-end" },
  docType: { fontSize: 22, fontFamily: "Helvetica-Bold", color: "#111111" },
  docNum: { fontSize: 11, color: "#555555", marginTop: 3, fontFamily: "Courier" },
  docMeta: { fontSize: 9, color: "#777777", marginTop: 4, textAlign: "right" },
  badgeView: { marginTop: 5, paddingVertical: 2, paddingHorizontal: 8, borderRadius: 99, alignSelf: "flex-end" },
  badgeText: { fontSize: 8, fontFamily: "Helvetica-Bold", textTransform: "uppercase" },
  addresses: { flexDirection: "row", marginBottom: 20, gap: 12 },
  addrBlock: { flex: 1, padding: 10, backgroundColor: "#f9fafb", borderRadius: 4, borderWidth: 1, borderColor: "#eeeeee" },
  addrTitle: { fontSize: 7, textTransform: "uppercase", color: "#9ca3af", marginBottom: 5, letterSpacing: 0.5, fontFamily: "Helvetica-Bold" },
  addrLine: { fontSize: 10, color: "#333333", marginBottom: 1.5, lineHeight: 1.4 },
  addrBold: { fontFamily: "Helvetica-Bold" },
  svcBox: { marginBottom: 14, padding: 10, backgroundColor: "#f0fdf4", borderLeftWidth: 3, borderLeftColor: "#22c55e" },
  svcLabel: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#166534", textTransform: "uppercase", marginBottom: 3 },
  svcText: { fontSize: 10, color: "#166534", marginBottom: 2 },
  tableHead: { flexDirection: "row", backgroundColor: "#f3f4f6", paddingVertical: 6, paddingHorizontal: 8, borderBottomWidth: 2, borderBottomColor: "#e5e7eb" },
  tableRow: { flexDirection: "row", paddingVertical: 5, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
  colDesc: { flex: 3 },
  colRight: { flex: 1, textAlign: "right" },
  thText: { fontSize: 8, color: "#6b7280", textTransform: "uppercase", fontFamily: "Helvetica-Bold" },
  tdText: { fontSize: 10, color: "#333333" },
  table: { marginBottom: 16 },
  totalsWrapper: { alignItems: "flex-end", marginBottom: 16 },
  totRow: { flexDirection: "row", justifyContent: "space-between", width: 220, paddingVertical: 3 },
  totLabel: { fontSize: 10, color: "#555555" },
  totValue: { fontSize: 10, color: "#333333" },
  totFinalRow: { flexDirection: "row", justifyContent: "space-between", width: 220, paddingVertical: 6, borderTopWidth: 2, borderTopColor: "#111111", marginTop: 4 },
  totFinalLabel: { fontSize: 13, fontFamily: "Helvetica-Bold", color: "#111111" },
  totFinalValue: { fontSize: 13, fontFamily: "Helvetica-Bold", color: "#111111" },
  footer: { position: "absolute", bottom: 24, left: 40, right: 40, paddingTop: 8, borderTopWidth: 1, borderTopColor: "#e5e7eb" },
  footerInfo: { fontSize: 8, color: "#9ca3af", textAlign: "center" },
});

const BADGE_COLORS: Record<string, { bg: string; text: string }> = {
  borrador: { bg: "#f3f4f6", text: "#374151" },
  enviado: { bg: "#dbeafe", text: "#1e40af" },
  aceptado: { bg: "#d1fae5", text: "#065f46" },
  rechazado: { bg: "#fee2e2", text: "#991b1b" },
  facturado: { bg: "#ede9fe", text: "#5b21b6" },
};
const STATUS_LABELS: Record<string, string> = {
  borrador: "BORRADOR",
  enviado: "ENVIADO",
  aceptado: "ACEPTADO",
  rechazado: "RECHAZADO",
  facturado: "FACTURADO",
};

type Props = {
  quote: QuoteRow & { items: QuoteItemRow[] };
  client: ClientRow | null;
  company: CompanySettings | null;
};

export function QuotePdfDocument({ quote, client, company }: Props) {
  const badge = BADGE_COLORS[quote.estado] ?? { bg: "#f3f4f6", text: "#374151" };

  const companyLines = [
    company?.legal_name ?? company?.trade_name,
    company?.tax_id ? `NIF/CIF: ${company.tax_id}` : null,
    company?.address,
    [company?.postal_code, company?.city, company?.province].filter(Boolean).join(", ") || null,
    company?.phone ? `Tel: ${company.phone}` : null,
    company?.email,
  ].filter(Boolean) as string[];

  const clientLines = client
    ? [
        client.nombre,
        client.nif_cif ? `NIF/CIF: ${client.nif_cif}` : null,
        client.direccion,
        client.poblacion,
        client.email,
        client.telefono ? `Tel: ${client.telefono}` : null,
      ].filter(Boolean) as string[]
    : ["Sin cliente asignado"];

  const svcLines: string[] = [];
  if (quote.tipo_servicio) svcLines.push(`Servicio: ${SERVICE_TYPE_LABELS[quote.tipo_servicio]}`);
  const propParts = [
    quote.tipo_vivienda ? `Tipo: ${quote.tipo_vivienda}` : "",
    quote.planta ? `Planta: ${quote.planta}` : "",
    `Ascensor: ${quote.ascensor ? "Sí" : "No"}`,
    quote.parking ? "Parking: Sí" : "",
    quote.metros_cuadrados_estimados ? `${quote.metros_cuadrados_estimados} m²` : "",
    quote.urgencia ? `Urgencia: ${quote.urgencia}` : "",
  ].filter(Boolean);
  if (propParts.length) svcLines.push(propParts.join(" · "));
  if (quote.notas_operativas) svcLines.push(quote.notas_operativas);

  const footerCompany = [company?.trade_name, company?.tax_id, company?.email].filter(Boolean).join(" · ");

  return (
    <Document title={`Presupuesto ${quote.numero ?? ""}`} author={company?.trade_name ?? undefined}>
      <Page size="A4" style={S.page}>
        {/* Header */}
        <View style={S.header}>
          <View>
            {company?.logo_url ? (
              <Image src={company.logo_url} style={S.logo} />
            ) : (
              <Text style={S.companyNameText}>{company?.trade_name ?? ""}</Text>
            )}
          </View>
          <View style={S.headerRight}>
            <Text style={S.docType}>PRESUPUESTO</Text>
            <Text style={S.docNum}>{quote.numero ?? "—"}</Text>
            <Text style={S.docMeta}>Fecha: {quote.fecha}</Text>
            {quote.valido_hasta && <Text style={S.docMeta}>Válido hasta: {quote.valido_hasta}</Text>}
            <View style={[S.badgeView, { backgroundColor: badge.bg }]}>
              <Text style={[S.badgeText, { color: badge.text }]}>{STATUS_LABELS[quote.estado] ?? quote.estado}</Text>
            </View>
          </View>
        </View>

        {/* Addresses */}
        <View style={S.addresses}>
          <View style={S.addrBlock}>
            <Text style={S.addrTitle}>Emisor</Text>
            {companyLines.map((line, i) => (
              <Text key={i} style={[S.addrLine, i === 0 ? S.addrBold : {}]}>{line}</Text>
            ))}
          </View>
          <View style={S.addrBlock}>
            <Text style={S.addrTitle}>Cliente</Text>
            {clientLines.map((line, i) => (
              <Text key={i} style={[S.addrLine, i === 0 ? S.addrBold : {}]}>{line}</Text>
            ))}
          </View>
        </View>

        {/* Service info */}
        {svcLines.length > 0 && (
          <View style={S.svcBox}>
            <Text style={S.svcLabel}>Detalles del servicio</Text>
            {svcLines.map((line, i) => <Text key={i} style={S.svcText}>{line}</Text>)}
          </View>
        )}

        {/* Items table */}
        <View style={S.table}>
          <View style={S.tableHead}>
            <Text style={[S.thText, S.colDesc]}>Descripción</Text>
            <Text style={[S.thText, S.colRight]}>Cant.</Text>
            <Text style={[S.thText, S.colRight]}>P. unit.</Text>
            <Text style={[S.thText, S.colRight]}>IVA</Text>
            <Text style={[S.thText, S.colRight]}>Importe</Text>
          </View>
          {quote.items.map((it, i) => {
            const base = Number(it.cantidad) * Number(it.precio_unit);
            return (
              <View key={i} style={S.tableRow} wrap={false}>
                <Text style={[S.tdText, S.colDesc]}>{it.descripcion}</Text>
                <Text style={[S.tdText, S.colRight]}>{it.cantidad}</Text>
                <Text style={[S.tdText, S.colRight]}>{Number(it.precio_unit).toFixed(2)} €</Text>
                <Text style={[S.tdText, S.colRight]}>{it.iva_aplicable}%</Text>
                <Text style={[S.tdText, S.colRight]}>{base.toFixed(2)} €</Text>
              </View>
            );
          })}
        </View>

        {/* Totals */}
        <View style={S.totalsWrapper}>
          <View style={S.totRow}>
            <Text style={S.totLabel}>Subtotal</Text>
            <Text style={S.totValue}>{Number(quote.subtotal).toFixed(2)} €</Text>
          </View>
          <View style={S.totRow}>
            <Text style={S.totLabel}>IVA</Text>
            <Text style={S.totValue}>{Number(quote.iva).toFixed(2)} €</Text>
          </View>
          <View style={S.totFinalRow}>
            <Text style={S.totFinalLabel}>TOTAL</Text>
            <Text style={S.totFinalValue}>{Number(quote.total).toFixed(2)} €</Text>
          </View>
        </View>

        {/* Footer */}
        <View style={S.footer} fixed>
          {footerCompany ? <Text style={S.footerInfo}>{footerCompany}</Text> : null}
        </View>
      </Page>
    </Document>
  );
}
