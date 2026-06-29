import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
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

function RiesgosPage() {
  const { t, i18n } = useTranslation();
  const fr = i18n.language === "fr";
  const [riesgos, setRiesgos] = useState<RadarItem[]>([]);
  const [oportunidades, setOportunidades] = useState<RadarItem[]>([]);
  const [silencios, setSilencios] = useState<RadarItem[]>([]);

  useEffect(() => {
    const ago = (ms: number) => {
      const days = Math.floor((Date.now() - ms) / 86400000);
      return days <= 0 ? (fr ? "aujourd'hui" : "hoy") : fr ? `il y a ${days} j` : `hace ${days} d`;
    };
    fetch("/api/risks")
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

  const dangerCount = riesgos.filter((i) => i.status === "danger").length;

  return (
    <AppShell>
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

        <section>
          <SectionHeader category="riesgo" count={riesgos.length} />
          {riesgos.length === 0 ? (
            <EmptyMini text={fr ? "Aucun risque détecté. Tout est sous contrôle." : "Ningún riesgo detectado. Todo bajo control."} />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {riesgos.map((item) => (
                <RadarCard key={item.id} item={item} />
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
                <RadarCard key={item.id} item={item} />
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
                <RadarCard key={item.id} item={item} />
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}

export const Route = createFileRoute("/riesgos")({
  head: () => ({ meta: [{ title: "Riesgos · AI Inbox Assistant" }] }),
  component: RiesgosPage,
});
