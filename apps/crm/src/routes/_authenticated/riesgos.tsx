import { apiFetch } from "@/components/inbox/api-client";
import { EmailDetail } from "@/components/inbox/email-detail";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PageHeader } from "@/components/inbox/page-header";
import { supabase } from "@/integrations/supabase/client";
import { NewMailComposer } from "@/components/inbox/new-mail-composer";
import { useEffect, useState } from "react";
import { useTranslation, Trans } from "react-i18next";
import {
  AlertTriangle,
  TrendingUp,
  Radio,
  ChevronRight,
  Users,
  Receipt,
  FileClock,
  Handshake,
  Timer,
  Send,
} from "lucide-react";

type RiskStatus = "danger" | "warn" | "ok";
type Category = "riesgo" | "oportunidad" | "silencio";
type IconKey = "Users" | "Receipt" | "FileClock" | "Handshake" | "TrendingUp" | "Timer";

interface RadarItem {
  id: string;
  category: Category;
  title: string;
  description: string;
  detail: string;
  status: RiskStatus;
  icon: IconKey;
  value?: string;
}

const iconMap: Record<IconKey, typeof AlertTriangle> = {
  Users,
  Receipt,
  FileClock,
  Handshake,
  TrendingUp,
  Timer,
};

const statusConfig = {
  danger: {
    badge: "bg-danger/12 text-danger border-danger/20",
    dot: "bg-danger",
    iconBg: "bg-danger-soft",
    iconColor: "text-danger",
  },
  warn: {
    badge: "bg-warn/12 text-warn border-warn/20",
    dot: "bg-warn",
    iconBg: "bg-warn-soft",
    iconColor: "text-warn",
  },
  ok: {
    badge: "bg-ok/12 text-ok border-ok/20",
    dot: "bg-ok",
    iconBg: "bg-ok-soft",
    iconColor: "text-ok",
  },
} as const;

const headerColors: Record<Category, { icon: typeof AlertTriangle; color: string }> = {
  riesgo: { icon: AlertTriangle, color: "text-danger" },
  oportunidad: { icon: TrendingUp, color: "text-ok" },
  silencio: { icon: Radio, color: "text-warn" },
};

function EmptyMini({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/40 px-5 py-8 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function RadarCard({ item }: { item: RadarItem }) {
  const { t } = useTranslation();
  const cfg = statusConfig[item.status];
  const Icon = iconMap[item.icon];
  return (
    <button className="w-full text-left rounded-2xl border border-border bg-card p-5 shadow-soft hover:bg-accent/40 transition-colors flex items-start gap-4 group border-l-[3px] hover:-translate-y-px">
      <div className={`shrink-0 size-10 rounded-xl grid place-items-center ${cfg.iconBg} ${cfg.iconColor}`}>
        <Icon className="size-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <span className="text-sm font-semibold truncate">{item.title}</span>
          <span className={["inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border shrink-0", cfg.badge].join(" ")}>
            <span className={["size-1.5 rounded-full", cfg.dot].join(" ")} />
            {t(`riesgos.status.${item.status}`)}
          </span>
        </div>
        <p className="text-sm text-muted-foreground truncate">{item.description}</p>
        <p className="text-xs text-muted-foreground/70 mt-1">{item.detail}</p>
        {item.value && (
          <div className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary bg-primary/8 px-2 py-0.5 rounded-md">
            <TrendingUp className="size-3" />
            {item.value}
          </div>
        )}
      </div>
      <ChevronRight className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-2" />
    </button>
  );
}

function SectionHeader({ category, count }: { category: Category; count: number }) {
  const { t } = useTranslation();
  const meta = headerColors[category];
  const Icon = meta.icon;
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className={`size-9 rounded-lg grid place-items-center bg-card border border-border shadow-soft ${meta.color}`}>
        <Icon className="size-5" />
      </div>
      <div>
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold">{t(`riesgos.categories.${category}.label`)}</h3>
          <span className="inline-flex items-center justify-center size-5 rounded-full bg-muted text-muted-foreground text-[11px] font-semibold">
            {count}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">{t(`riesgos.categories.${category}.subtitle`)}</p>
      </div>
    </div>
  );
}

interface RiskDTO { id: string; sender: string; subject: string; summary: string | null; tone_warning?: string | null; type?: string | null; received_at: number; }

interface FacturaRiesgo {
  id: string;
  cliente: string;
  email: string | null;
  numero: string;
  total: number;
  vencimiento: string | null;
  dias: number;
  vencida: boolean;
  status: RiskStatus;
}

function RiesgosPage() {
  const { t, i18n } = useTranslation();
  const fr = i18n.language === "fr";
  const [riesgos, setRiesgos] = useState<RadarItem[]>([]);
  const [oportunidades, setOportunidades] = useState<RadarItem[]>([]);
  const [silencios, setSilencios] = useState<RadarItem[]>([]);
  const [facturasRiesgo, setFacturasRiesgo] = useState<FacturaRiesgo[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [recordatorio, setRecordatorio] = useState<{ to: string; subject: string; body: string } | null>(null);
  const navigate = useNavigate();

  // Facturas pendientes/vencidas de cobro = el riesgo económico real del negocio.
  useEffect(() => {
    (async () => {
      const { data: invs } = await supabase
        .from("invoices")
        .select("id, numero, serie, total, estado, vencimiento, fecha_emision, client_id")
        .in("estado", ["pendiente", "parcial", "vencida"])
        .order("vencimiento", { ascending: true });
      if (!invs?.length) { setFacturasRiesgo([]); return; }
      const ids = [...new Set(invs.map((i) => i.client_id).filter(Boolean))] as string[];
      const { data: cls } = ids.length
        ? await supabase.from("clients").select("id, nombre, email").in("id", ids)
        : { data: [] };
      const cm: Record<string, { nombre: string; email: string | null }> = Object.fromEntries(
        (cls ?? []).map((c: any) => [c.id, { nombre: c.nombre, email: c.email }]),
      );
      const today = new Date().toISOString().slice(0, 10);
      setFacturasRiesgo(invs.map((i) => {
        const vencida = !!(i.estado === "vencida" || (i.vencimiento && i.vencimiento < today));
        const dias = i.vencimiento ? Math.floor((Date.now() - new Date(i.vencimiento).getTime()) / 86400000) : 0;
        const c = cm[i.client_id ?? ""];
        return {
          id: i.id,
          cliente: c?.nombre ?? (fr ? "Sans client" : "Sin cliente"),
          email: c?.email ?? null,
          numero: `${i.serie ?? ""}${i.numero ?? ""}`,
          total: Number(i.total) || 0,
          vencimiento: i.vencimiento ?? null,
          dias,
          vencida,
          status: vencida ? "danger" : "warn",
        };
      }));
    })().catch(() => {});
  }, [fr]);

  // Construye el recordatorio de pago con los datos reales de la factura.
  const enviarRecordatorio = (f: FacturaRiesgo) => {
    if (!f.email) { navigate({ to: "/invoices" as any }); return; }
    const nombre = f.cliente.split(" ")[0];
    const body = `Estimado/a ${nombre},\n\nNos ponemos en contacto con usted para recordarle que tiene pendiente el pago de la siguiente factura:\n\nFactura n.º: ${f.numero}\nImporte: ${f.total.toFixed(2)} EUR\n${f.vencimiento ? `Vencimiento: ${f.vencimiento}\n` : ""}${f.vencida ? `(Vencida hace ${f.dias} días)\n` : ""}\nPuede realizar el pago mediante transferencia bancaria o Bizum al 688 30 41 43.\n\nSi ya ha realizado el pago, por favor ignore este mensaje.\n\nAtentamente,\nMartín`;
    setRecordatorio({ to: f.email, subject: `Recordatorio de pago — Factura ${f.numero}`, body });
  };

  useEffect(() => {
    const ago = (ms: number | string) => {
      const days = Math.floor((Date.now() - Number(ms)) / 86400000);
      return days <= 0 ? (fr ? "aujourd'hui" : "hoy") : fr ? `il y a ${days} j` : `hace ${days} d`;
    };
    apiFetch("/api/risks")
      .then((r) => r.json())
      .then((d: { risks: RiskDTO[]; opportunities: RiskDTO[]; silences: RiskDTO[] }) => {
        setRiesgos((d.risks || []).map((r) => ({
          id: r.id, category: "riesgo", title: r.sender, description: r.summary || r.subject,
          detail: r.tone_warning || (r.type === "Reclamación" ? (fr ? "Réclamation" : "Reclamación") : ""),
          status: "danger", icon: "Users",
        })));
        setOportunidades((d.opportunities || []).map((r) => ({
          id: r.id, category: "oportunidad", title: r.sender, description: r.summary || r.subject,
          detail: ago(r.received_at), status: "ok", icon: "TrendingUp",
        })));
        setSilencios((d.silences || []).map((r) => ({
          id: r.id, category: "silencio", title: r.sender, description: r.summary || r.subject,
          detail: fr ? `Reçu ${ago(r.received_at)}` : `Recibido ${ago(r.received_at)}`, status: "warn", icon: "Timer",
        })));
      })
      .catch(() => {});
  }, [fr]);

  const dangerCount = riesgos.filter((i) => i.status === "danger").length
    + facturasRiesgo.filter((i) => i.status === "danger").length;

  return (
    <>
      <div className="max-w-5xl mx-auto space-y-10">
        <div>
          <PageHeader icon={Radio} title={t("riesgos.title")} subtitle={t("riesgos.subtitle")} />
          {dangerCount > 0 && (
            <div className="-mt-4 mb-2 inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-danger/8 border border-danger/15 text-sm text-danger">
              <AlertTriangle className="size-4" />
              <span>
                <Trans
                  i18nKey="riesgos.criticalAlerts"
                  values={{ count: dangerCount }}
                  components={[<strong key="0" />]}
                />
              </span>
            </div>
          )}
        </div>

        {/* Facturas pendientes/vencidas de cobro — riesgo económico real */}
        <section>
          <div className="flex items-center gap-3 mb-4">
            <div className="size-9 rounded-lg grid place-items-center bg-card border border-border shadow-soft text-danger">
              <Receipt className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold">{fr ? "Factures à encaisser" : "Facturas por cobrar"}</h3>
                <span className="inline-flex items-center justify-center size-5 rounded-full bg-muted text-muted-foreground text-[11px] font-semibold">
                  {facturasRiesgo.length}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {(() => {
                  const total = facturasRiesgo.reduce((s, f) => s + f.total, 0);
                  return fr ? `${total.toFixed(2)} € en attente d'encaissement` : `${total.toFixed(2)} € pendientes de cobro`;
                })()}
              </p>
            </div>
          </div>
          {facturasRiesgo.length === 0 ? (
            <EmptyMini text={fr ? "Aucune facture en attente. Tout encaissé." : "Ninguna factura pendiente. Todo cobrado."} />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {facturasRiesgo.map((f) => {
                const cfg = f.status === "danger" ? statusConfig.danger : statusConfig.warn;
                return (
                  <div key={f.id} className={`rounded-2xl border border-border bg-card p-5 shadow-soft border-l-[3px] ${f.vencida ? "border-l-danger" : "border-l-warn"}`}>
                    <div className="flex items-start gap-4">
                      <div className={`shrink-0 size-10 rounded-xl grid place-items-center ${cfg.iconBg} ${cfg.iconColor}`}>
                        <Receipt className="size-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <span className="text-sm font-semibold truncate">{f.cliente}</span>
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border shrink-0 ${cfg.badge}`}>
                            <span className={`size-1.5 rounded-full ${cfg.dot}`} />
                            {f.vencida ? (fr ? `En retard ${f.dias} j` : `Vencida ${f.dias} d`) : (fr ? "En attente" : "Pendiente")}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground truncate">{fr ? "Facture" : "Factura"} {f.numero}</p>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary bg-primary/8 px-2 py-0.5 rounded-md">
                            {f.total.toFixed(2)} €
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => navigate({ to: "/invoices" as any })}
                              className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1"
                            >
                              {fr ? "Voir" : "Ver"}
                            </button>
                            <button
                              type="button"
                              onClick={() => enviarRecordatorio(f)}
                              disabled={!f.email}
                              title={f.email ? "" : (fr ? "Ce client n'a pas d'e-mail" : "Este cliente no tiene email")}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors"
                            >
                              <Send className="size-3.5" />
                              {fr ? "Rappel" : "Recordatorio"}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section>
          <SectionHeader category="riesgo" count={riesgos.length} />
          {riesgos.length === 0 ? (
            <EmptyMini text={fr ? "Aucun risque détecté dans les e-mails." : "Ningún riesgo detectado en los correos."} />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {riesgos.map((item) => (
                <div key={item.id} onClick={() => setOpenId(item.id)} className="cursor-pointer"><RadarCard item={item} /></div>
              ))}
            </div>
          )}
        </section>

        <section>
          <SectionHeader category="oportunidad" count={oportunidades.length} />
          {oportunidades.length === 0 ? (
            <EmptyMini text={fr ? "Aucune opportunité détectée pour l'instant." : "Ninguna oportunidad detectada por ahora."} />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {oportunidades.map((item) => (
                <div key={item.id} onClick={() => setOpenId(item.id)} className="cursor-pointer"><RadarCard item={item} /></div>
              ))}
            </div>
          )}
        </section>

        <section>
          <SectionHeader category="silencio" count={silencios.length} />
          {silencios.length === 0 ? (
            <EmptyMini text={fr ? "Aucun silence prolongé avec tes contacts." : "Ningún silencio prolongado con tus contactos."} />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {silencios.map((item) => (
                <div key={item.id} onClick={() => setOpenId(item.id)} className="cursor-pointer"><RadarCard item={item} /></div>
              ))}
            </div>
          )}
        </section>
      </div>
      <EmailDetail emailId={openId} onClose={() => setOpenId(null)} />
      {recordatorio && (
        <NewMailComposer
          onClose={() => setRecordatorio(null)}
          defaultTo={recordatorio.to}
          defaultSubject={recordatorio.subject}
          defaultBody={recordatorio.body}
        />
      )}
    </>
  );
}

export const Route = createFileRoute("/_authenticated/riesgos")({
  head: () => ({ meta: [{ title: "Riesgos · AI Inbox Assistant" }] }),
  component: RiesgosPage,
});
