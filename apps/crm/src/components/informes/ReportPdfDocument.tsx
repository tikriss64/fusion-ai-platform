import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import type { CompanySettings } from "@/lib/company-settings-type";

const s = StyleSheet.create({
  page: { padding: 36, fontSize: 10, fontFamily: "Helvetica", color: "#222" },
  h1: { fontSize: 16, fontWeight: 700, marginBottom: 2 },
  muted: { color: "#666", fontSize: 9 },
  section: { marginTop: 18 },
  sectionTitle: { fontSize: 12, fontWeight: 700, marginBottom: 6, color: "#2B638D" },
  row: { flexDirection: "row", borderBottom: "1px solid #eee", paddingVertical: 4 },
  rowHead: { flexDirection: "row", borderBottom: "1px solid #999", paddingVertical: 4, fontWeight: 700 },
  rowTotal: { flexDirection: "row", borderTop: "1px solid #999", paddingVertical: 4, fontWeight: 700 },
  c1: { flex: 2 },
  c2: { flex: 1, textAlign: "right" },
  c3: { flex: 1, textAlign: "right" },
});

const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const eur = (n: number) => `${(n || 0).toFixed(2)} €`;

export type MonthRow = { mes: number; base: number; iva: number; total: number };
export type QuarterRow = { trimestre: number; base: number; iva: number; total: number };

export function ReportPdfDocument({
  year, company, months, quarters,
}: {
  year: number;
  company: CompanySettings | null;
  months: MonthRow[];
  quarters: QuarterRow[];
}) {
  const totBase = months.reduce((a, m) => a + m.base, 0);
  const totIva = months.reduce((a, m) => a + m.iva, 0);
  const totTotal = months.reduce((a, m) => a + m.total, 0);
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.h1}>Informe fiscal {year}</Text>
        <Text style={s.muted}>
          {company?.trade_name || company?.legal_name || "—"}
          {company?.tax_id ? ` · ${company.tax_id}` : ""}
        </Text>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Facturación mensual (facturas emitidas)</Text>
          <View style={s.rowHead}>
            <Text style={s.c1}>Mes</Text><Text style={s.c2}>Base imponible</Text><Text style={s.c3}>IVA</Text><Text style={s.c3}>Total</Text>
          </View>
          {months.map((m) => (
            <View key={m.mes} style={s.row}>
              <Text style={s.c1}>{MESES[m.mes]}</Text>
              <Text style={s.c2}>{eur(m.base)}</Text>
              <Text style={s.c3}>{eur(m.iva)}</Text>
              <Text style={s.c3}>{eur(m.total)}</Text>
            </View>
          ))}
          <View style={s.rowTotal}>
            <Text style={s.c1}>TOTAL {year}</Text>
            <Text style={s.c2}>{eur(totBase)}</Text>
            <Text style={s.c3}>{eur(totIva)}</Text>
            <Text style={s.c3}>{eur(totTotal)}</Text>
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>IVA repercutido por trimestre</Text>
          <View style={s.rowHead}>
            <Text style={s.c1}>Trimestre</Text><Text style={s.c2}>Base</Text><Text style={s.c3}>IVA repercutido</Text><Text style={s.c3}>Total</Text>
          </View>
          {quarters.map((q) => (
            <View key={q.trimestre} style={s.row}>
              <Text style={s.c1}>{q.trimestre}T {year}</Text>
              <Text style={s.c2}>{eur(q.base)}</Text>
              <Text style={s.c3}>{eur(q.iva)}</Text>
              <Text style={s.c3}>{eur(q.total)}</Text>
            </View>
          ))}
        </View>

        <Text style={[s.muted, { marginTop: 24 }]}>
          Documento orientativo generado por el CRM. El IVA mostrado es el repercutido en facturas
          emitidas; no incluye IVA soportado (compras). Verifícalo con tu gestoría.
        </Text>
      </Page>
    </Document>
  );
}
