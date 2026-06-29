import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatDate } from "@/i18n";
import {
  AlertOctagon,
  Timer,
  Users,
  TrendingUp,
  Receipt,
  ChevronRight,
  Check,
  Sparkles,
  Plug,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Hoy · AI Inbox Assistant" },
      { name: "description", content: "Tu resumen del día en el correo." },
    ],
  }),
  component: HoyPage,
});

type Tone = "ok" | "warn" | "danger" | "primary";

const itemConfig: Array<{
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: Tone;
}> = [
  { id: "b1", icon: AlertOctagon, tone: "danger" },
  { id: "b2", icon: Timer, tone: "warn" },
  { id: "b3", icon: Users, tone: "warn" },
  { id: "b4", icon: TrendingUp, tone: "ok" },
  { id: "b5", icon: Receipt, tone: "primary" },
];

interface BriefingItem {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  text: string;
  hint: string;
  tone: Tone;
}

interface TodayData {
  total: number;
  angry: number;
  angryWho: string | null;
  complaints: number;
  promises: number;
  opportunities: number;
  urgent: number;
}

function HoyPage() {
  const { t, i18n } = useTranslation();
  const fr = i18n.language === "fr";
  const [today, setToday] = useState<TodayData | null>(null);

  useEffect(() => {
    fetch("/api/today")
      .then((r) => r.json())
      .then((d: TodayData) => setToday(d))
      .catch(() => {});
  }, []);

  // Construye el briefing desde datos REALES
  const initialItems: BriefingItem[] = [];
  if (today) {
    if (today.angry > 0)
      initialItems.push({ id: "angry", icon: AlertOctagon, tone: "danger", text: fr ? `${today.angry} client(s) semble(nt) mécontent(s)` : `${today.angry} cliente(s) parece(n) enfadado(s)`, hint: today.angryWho ?? "" });
    if (today.promises > 0)
      initialItems.push({ id: "promises", icon: Timer, tone: "warn", text: fr ? `${today.promises} promesse(s) en attente` : `${today.promises} promesa(s) pendiente(s)`, hint: fr ? "à tenir" : "por cumplir" });
    if (today.urgent > 0)
      initialItems.push({ id: "urgent", icon: Users, tone: "warn", text: fr ? `${today.urgent} e-mail(s) urgent(s)` : `${today.urgent} correo(s) urgente(s)`, hint: fr ? "requièrent une action" : "requieren acción" });
    if (today.opportunities > 0)
      initialItems.push({ id: "opps", icon: TrendingUp, tone: "ok", text: fr ? `${today.opportunities} opportunité(s) commerciale(s)` : `${today.opportunities} oportunidad(es) comercial(es)`, hint: fr ? "à explorer" : "a explorar" });
    if (today.complaints > 0)
      initialItems.push({ id: "complaints", icon: Receipt, tone: "danger", text: fr ? `${today.complaints} réclamation(s)` : `${today.complaints} reclamación(es)`, hint: fr ? "à traiter" : "a atender" });
  }

  const [dismissed, setDismissed] = useState<string[]>([]);
  const items = initialItems.filter((i) => !dismissed.includes(i.id));
  const total = initialItems.length;
  const remaining = items.length;
  const done = total - remaining;
  const progress = total === 0 ? 1 : done / total;

  const pressing = useMemo(
    () => items.filter((i) => i.tone === "danger" || i.tone === "warn").length,
    [items],
  );
  const debt = Math.min(1, pressing / 4);
  const ringTone: "danger" | "warn" | "ok" =
    debt > 0.6 ? "danger" : debt > 0.25 ? "warn" : "ok";
  const ringPct = Math.round((1 - debt) * 100);
  const ringLabel =
    ringTone === "danger"
      ? t("hoy.debtMuch")
      : ringTone === "warn"
        ? t("hoy.debtMid")
        : t("hoy.debtLow");

  const dismiss = (id: string) => setDismissed((prev) => [...prev, id]);

  const now = new Date();
  const dateText = formatDate(now, i18n.resolvedLanguage || i18n.language || "es");
  const dateCapitalized = dateText.charAt(0).toUpperCase() + dateText.slice(1);

  return (
    <AppShell>
      <div className="max-w-3xl space-y-8 animate-fade-in">
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="text-sm text-muted-foreground">{dateCapitalized}</p>
            <h2 className="text-3xl font-semibold tracking-tight mt-1">
              {t("hoy.greeting")}
            </h2>
          </div>
          {today !== null && today.total > 0 && <DebtMeter pct={ringPct} tone={ringTone} label={ringLabel} />}
        </div>

        {today === null ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-border bg-card p-5 shadow-soft flex items-center gap-4">
                <div className="size-10 rounded-xl bg-muted animate-pulse shrink-0" />
                <div className="flex-1">
                  <div className="h-4 w-2/3 rounded bg-muted animate-pulse mb-2" />
                  <div className="h-3 w-1/3 rounded bg-muted/70 animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ) : today.total === 0 ? (
          <GettingStarted />
        ) : remaining > 0 ? (
          <>
            <ProgressBar done={done} total={total} progress={progress} />
            <div className="space-y-3">
              {items.map((item) => (
                <BriefingCard
                  key={item.id}
                  item={item}
                  onDone={() => dismiss(item.id)}
                />
              ))}
            </div>
          </>
        ) : (
          <Celebration />
        )}
      </div>
    </AppShell>
  );
}

function DebtMeter({
  pct,
  tone,
  label,
}: {
  pct: number;
  tone: "danger" | "warn" | "ok";
  label: string;
}) {
  const { t } = useTranslation();
  const r = 26;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  const colorVar =
    tone === "danger" ? "var(--danger)" : tone === "warn" ? "var(--warn)" : "var(--ok)";

  return (
    <div className="hidden sm:flex items-center gap-3 rounded-2xl border border-border bg-card p-3 pr-4 shadow-soft">
      <div className="relative size-16 grid place-items-center">
        <svg viewBox="0 0 64 64" className="size-16 -rotate-90">
          <circle cx="32" cy="32" r={r} fill="none" stroke="var(--muted)" strokeWidth="6" />
          <circle
            cx="32"
            cy="32"
            r={r}
            fill="none"
            stroke={colorVar}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${c}`}
            style={{ transition: "stroke-dasharray 600ms ease, stroke 400ms ease" }}
          />
        </svg>
        <span className="absolute text-xs font-semibold tabular-nums">{pct}%</span>
      </div>
      <div className="leading-tight">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {t("hoy.debtLabel")}
        </div>
        <div className="text-sm font-medium">{label}</div>
      </div>
    </div>
  );
}

function ProgressBar({
  done,
  total,
  progress,
}: {
  done: number;
  total: number;
  progress: number;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full bg-ok rounded-full transition-all duration-500 ease-out"
          style={{ width: `${progress * 100}%` }}
        />
      </div>
      <span className="tabular-nums shrink-0">{t("hoy.doneOf", { done, total })}</span>
    </div>
  );
}

function BriefingCard({ item, onDone }: { item: BriefingItem; onDone: () => void }) {
  const { t } = useTranslation();
  const Icon = item.icon;
  const toneMap = {
    ok: { iconBg: "bg-ok-soft", iconColor: "text-ok" },
    warn: { iconBg: "bg-warn-soft", iconColor: "text-warn" },
    danger: { iconBg: "bg-danger-soft", iconColor: "text-danger" },
    primary: { iconBg: "bg-secondary", iconColor: "text-primary" },
  } as const;
  const tt = toneMap[item.tone];
  const [leaving, setLeaving] = useState(false);

  const handleDone = (e: React.MouseEvent) => {
    e.stopPropagation();
    setLeaving(true);
    setTimeout(onDone, 220);
  };

  return (
    <div
      className={[
        "w-full text-left rounded-2xl border border-border bg-card p-5 shadow-soft hover:bg-accent/40 transition-all flex items-start gap-4 group cursor-pointer active:scale-[0.99]",
        leaving ? "animate-fade-out opacity-0" : "animate-fade-in",
      ].join(" ")}
    >
      <div
        className={`shrink-0 size-10 rounded-xl grid place-items-center ${tt.iconBg} ${tt.iconColor} transition-transform group-hover:scale-105`}
      >
        <Icon className="size-5" />
      </div>
      <div className="flex-1 min-w-0">
        <span className="block text-sm font-medium leading-snug">{item.text}</span>
        <span className="block text-xs text-muted-foreground mt-1 italic">{item.hint}</span>
      </div>
      <button
        onClick={handleDone}
        aria-label={t("hoy.markDone")}
        className="shrink-0 size-8 rounded-lg grid place-items-center text-muted-foreground hover:text-ok hover:bg-ok-soft transition-colors opacity-60 group-hover:opacity-100"
      >
        <Check className="size-4" />
      </button>
      <ChevronRight className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity mt-2" />
    </div>
  );
}

function GettingStarted() {
  const { i18n } = useTranslation();
  const fr = i18n.language === "fr";
  return (
    <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-soft animate-fade-in">
      <div className="mx-auto size-12 rounded-2xl bg-primary/10 text-primary grid place-items-center">
        <Sparkles className="size-6" />
      </div>
      <h3 className="mt-4 text-lg font-semibold">
        {fr ? "Bienvenue ! Connecte ta boîte mail" : "¡Bienvenido! Conecta tu correo"}
      </h3>
      <p className="mt-1.5 text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
        {fr
          ? "Connecte ton compte Gmail dans Réglages, puis synchronise ta boîte depuis l'onglet Boîte. L'IA analysera tes e-mails automatiquement."
          : "Conecta tu cuenta de Gmail en Ajustes y luego sincroniza desde la pestaña Bandeja. La IA analizará tus correos automáticamente."}
      </p>
      <div className="mt-5 flex items-center justify-center gap-2 flex-wrap">
        <Link
          to="/ajustes"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plug className="size-4" />
          {fr ? "Connecter mon e-mail" : "Conectar mi correo"}
        </Link>
        <Link
          to="/bandeja"
          className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
        >
          {fr ? "Aller à la boîte" : "Ir a la bandeja"}
        </Link>
      </div>
    </div>
  );
}

function Celebration() {
  const { t } = useTranslation();
  return (
    <div className="relative rounded-2xl border border-ok/30 bg-ok-soft/40 p-10 text-center overflow-hidden animate-scale-in">
      <div className="pointer-events-none absolute inset-0">
        {[...Array(12)].map((_, i) => (
          <span
            key={i}
            className="absolute size-1.5 rounded-full bg-ok animate-fade-in"
            style={{
              left: `${(i * 83) % 100}%`,
              top: `${(i * 47) % 80 + 5}%`,
              opacity: 0.6,
              animationDelay: `${i * 60}ms`,
            }}
          />
        ))}
      </div>
      <div className="relative">
        <div className="mx-auto size-14 rounded-2xl bg-ok text-ok-foreground grid place-items-center shadow-soft animate-scale-in">
          <Sparkles className="size-7" />
        </div>
        <h3 className="mt-4 text-xl font-semibold">{t("hoy.celebTitle")}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t("hoy.celebSub")}</p>
      </div>
    </div>
  );
}
