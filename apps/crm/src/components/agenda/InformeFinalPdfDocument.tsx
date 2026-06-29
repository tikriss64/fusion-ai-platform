import {
  Document,
  Page,
  View,
  Text,
  Image,
  Link,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import type { TrabajoRow } from "@/lib/trabajos-schema";
import type { ClientRow } from "@/lib/clients-schema";
import type { CompanySettings } from "@/lib/company-settings-type";
import { SERVICE_TYPE_LABELS } from "@/lib/quotes-schema";

Font.register({
  family: "Helvetica",
  fonts: [],
});

const C = {
  gray50: "#f9fafb",
  gray100: "#f3f4f6",
  gray200: "#e5e7eb",
  gray400: "#9ca3af",
  gray600: "#4b5563",
  gray700: "#374151",
  gray900: "#111827",
  green50: "#f0fdf4",
  green700: "#15803d",
  green800: "#166534",
  blue600: "#2563eb",
  amber50: "#fffbeb",
  amber800: "#92400e",
};

const s = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 10, color: C.gray700, paddingHorizontal: 40, paddingVertical: 36, backgroundColor: "#fff" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, paddingBottom: 14, borderBottomWidth: 1.5, borderBottomColor: C.gray200 },
  companyLogo: { width: 72, height: 72, objectFit: "contain" },
  companyName: { fontSize: 16, fontFamily: "Helvetica-Bold", color: C.gray900 },
  companyMeta: { fontSize: 8.5, color: C.gray400, marginTop: 2, lineHeight: 1.6 },
  titleBlock: { alignItems: "flex-end" },
  docTitle: { fontSize: 18, fontFamily: "Helvetica-Bold", color: C.gray900, letterSpacing: -0.3 },
  docSub: { fontSize: 9, color: C.gray400, marginTop: 3 },
  infoRow: { flexDirection: "row", gap: 12, marginBottom: 16 },
  infoBox: { flex: 1, backgroundColor: C.gray50, borderRadius: 4, padding: "10 12", borderWidth: 1, borderColor: C.gray200 },
  infoLabel: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: C.gray400, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 5 },
  infoLine: { fontSize: 9.5, color: C.gray700, lineHeight: 1.7 },
  infoLineBold: { fontSize: 10, fontFamily: "Helvetica-Bold", color: C.gray900 },
  sectionTitle: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: C.gray400, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: C.gray200 },
  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginBottom: 16 },
  photo: { width: "32%", height: 130, objectFit: "cover", borderRadius: 3 },
  photoEmpty: { padding: "12 0", color: C.gray400, fontSize: 9, fontStyle: "italic" },
  thankBox: { backgroundColor: C.green50, borderRadius: 6, padding: "16 18", marginTop: 4, marginBottom: 16, borderWidth: 1, borderColor: "#bbf7d0" },
  thankTitle: { fontSize: 13, fontFamily: "Helvetica-Bold", color: C.green800, marginBottom: 6 },
  thankText: { fontSize: 10, color: C.green700, lineHeight: 1.65 },
  reviewBox: { backgroundColor: C.amber50, borderRadius: 6, padding: "12 16", marginBottom: 20, borderWidth: 1, borderColor: "#fcd34d" },
  reviewLabel: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: C.amber800, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 },
  reviewText: { fontSize: 9.5, color: C.amber800, lineHeight: 1.5 },
  reviewLink: { color: C.blue600, fontSize: 9, marginTop: 5, textDecoration: "underline" },
  footer: { position: "absolute", bottom: 24, left: 40, right: 40, borderTopWidth: 1, borderTopColor: C.gray200, paddingTop: 8, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  footerText: { fontSize: 8, color: C.gray400 },
});

type Props = {
  trabajo: TrabajoRow;
  fotosAntesUrls: string[];
  fotosDespuesUrls: string[];
  client: ClientRow | null;
  company: CompanySettings | null;
};

export function InformeFinalPdfDocument({ trabajo: t, fotosAntesUrls, fotosDespuesUrls, client, company }: Props) {
  const clientName = client?.nombre ?? "—";
  const companyFooter = [company?.trade_name, company?.phone, company?.email].filter(Boolean).join("  ·  ");

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* Header empresa + título */}
        <View style={s.header}>
          <View>
            {company?.logo_url ? (
              <Image src={company.logo_url} style={s.companyLogo} />
            ) : (
              <Text style={s.companyName}>{company?.trade_name ?? ""}</Text>
            )}
            <Text style={s.companyMeta}>
              {[company?.tax_id, company?.phone, company?.email].filter(Boolean).join("  ·  ")}
            </Text>
          </View>
          <View style={s.titleBlock}>
            <Text style={s.docTitle}>INFORME DE TRABAJO</Text>
            <Text style={s.docSub}>Trabajo completado · {t.fecha ?? "Sin fecha"}</Text>
          </View>
        </View>

        {/* Datos del cliente y del trabajo */}
        <View style={s.infoRow}>
          <View style={s.infoBox}>
            <Text style={s.infoLabel}>Cliente</Text>
            <Text style={s.infoLineBold}>{clientName}</Text>
            {client?.telefono ? <Text style={s.infoLine}>Tel: {client.telefono}</Text> : null}
            {client?.email ? <Text style={s.infoLine}>{client.email}</Text> : null}
          </View>
          <View style={s.infoBox}>
            <Text style={s.infoLabel}>Detalles del trabajo</Text>
            {t.tipo_servicio ? <Text style={s.infoLineBold}>{SERVICE_TYPE_LABELS[t.tipo_servicio]}</Text> : null}
            {t.direccion ? <Text style={s.infoLine}>{t.direccion}</Text> : null}
            {t.hora ? <Text style={s.infoLine}>Hora: {t.hora.slice(0, 5)}h</Text> : null}
          </View>
        </View>

        {/* Fotos antes */}
        <Text style={s.sectionTitle}>Estado inicial — antes del trabajo</Text>
        {fotosAntesUrls.length > 0 ? (
          <View style={s.photoGrid}>
            {fotosAntesUrls.map((url, i) => (
              <Image key={i} src={url} style={s.photo} />
            ))}
          </View>
        ) : (
          <Text style={s.photoEmpty}>Sin fotos del estado inicial.</Text>
        )}

        {/* Fotos después */}
        <Text style={s.sectionTitle}>Resultado final — después del trabajo</Text>
        {fotosDespuesUrls.length > 0 ? (
          <View style={s.photoGrid}>
            {fotosDespuesUrls.map((url, i) => (
              <Image key={i} src={url} style={s.photo} />
            ))}
          </View>
        ) : (
          <Text style={s.photoEmpty}>Sin fotos del resultado.</Text>
        )}

        {/* Mensaje de agradecimiento */}
        <View style={s.thankBox}>
          <Text style={s.thankTitle}>¡Gracias por confiar en nosotros!</Text>
          <Text style={s.thankText}>
            Ha sido un placer realizar este trabajo para usted. Esperamos haber cumplido con
            sus expectativas y poder atenderle de nuevo en el futuro.{"\n"}
            No dude en contactarnos para cualquier consulta.
          </Text>
        </View>

        {/* Reseña Google */}
        {company?.google_reviews_url ? (
          <View style={s.reviewBox}>
            <Text style={s.reviewLabel}>¿Está satisfecho con el resultado?</Text>
            <Text style={s.reviewText}>
              Su opinión nos ayuda a crecer y a llegar a más familias que nos necesitan.
              Si tiene un momento, le agradeceríamos que nos dejara una reseña en Google:
            </Text>
            <Link src={company.google_reviews_url} style={s.reviewLink}>
              {company.google_reviews_url}
            </Link>
          </View>
        ) : null}

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>{companyFooter}</Text>
          <Text style={s.footerText} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>

      </Page>
    </Document>
  );
}
