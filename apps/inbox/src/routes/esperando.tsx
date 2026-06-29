import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  UserCheck,
  Users,
  Clock,
  ChevronRight,
  Radar,
  Mail,
  Send,
  X,
  Copy,
  Check,
} from "lucide-react";

type Tab = "me" | "others" | "followups";
type Status = "ok" | "warn" | "danger";

interface Commitment {
  id: string;
  person: string;
  initials: string;
  what: string;
  when: string;
  status: Status;
}

interface Followup {
  id: string;
  person: string;
  initials: string;
  email: string;
  subject: string;
  sentAgo: string; // ya traducido
  days: number;
  status: Status;
  context: string;
}

function CommitmentCard({ item }: { item: Commitment }) {
  const { t } = useTranslation();
  const statusConfig = {
    ok: { badge: "bg-ok/15 text-ok border-ok/20", dot: "bg-ok" },
    warn: { badge: "bg-warn/15 text-warn border-warn/20", dot: "bg-warn" },
    danger: { badge: "bg-danger/15 text-danger border-danger/20", dot: "bg-danger" },
  } as const;
  const cfg = statusConfig[item.status];
  return (
    <div className="group rounded-xl border border-border bg-card p-4 transition-all hover:shadow-soft hover:-translate-y-px">
      <div className="flex items-start gap-3">
        <div className="size-9 rounded-full bg-gradient-to-br from-primary/80 to-accent text-primary-foreground grid place-items-center text-xs font-semibold shrink-0">
          {item.initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <span className="text-sm font-semibold truncate">{item.person}</span>
            <span
              className={[
                "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border shrink-0",
                cfg.badge,
              ].join(" ")}
            >
              <span className={["size-1.5 rounded-full", cfg.dot].join(" ")} />
              {t(`esperando.status.${item.status}`)}
            </span>
          </div>
          <p className="text-sm text-muted-foreground truncate">{item.what}</p>
          <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground">
            <Clock className="size-3.5" />
            <span>{item.when}</span>
          </div>
        </div>
        <ChevronRight className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-1" />
      </div>
    </div>
  );
}

function FollowupCard({ item, onRemind }: { item: Followup; onRemind: (f: Followup) => void }) {
  const { t } = useTranslation();
  const statusConfig = {
    ok: { badge: "bg-ok/15 text-ok border-ok/20", dot: "bg-ok", border: "border-l-ok" },
    warn: { badge: "bg-warn/20 text-warn-foreground border-warn/30", dot: "bg-warn", border: "border-l-warn" },
    danger: { badge: "bg-danger/15 text-danger border-danger/25", dot: "bg-danger", border: "border-l-danger" },
  } as const;
  const cfg = statusConfig[item.status];
  return (
    <div
      className={[
        "group rounded-xl border border-border border-l-4 bg-card p-4 transition-all hover:shadow-soft",
        cfg.border,
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        <div className="size-9 rounded-full bg-gradient-to-br from-primary/80 to-accent text-primary-foreground grid place-items-center text-xs font-semibold shrink-0">
          {item.initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate">{item.person}</div>
              <div className="text-xs text-muted-foreground truncate">{item.email}</div>
            </div>
            <span
              className={[
                "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border shrink-0",
                cfg.badge,
              ].join(" ")}
            >
              <span className={["size-1.5 rounded-full", cfg.dot].join(" ")} />
              {t(`esperando.followupStatus.${item.status}`)}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-2 text-sm">
            <Mail className="size-3.5 text-muted-foreground shrink-0" />
            <span className="truncate">{item.subject}</span>
          </div>
          <div className="flex items-center gap-1.5 mt-1.5 text-xs text-muted-foreground">
            <Clock className="size-3.5" />
            <span>{item.sentAgo}</span>
          </div>
          <div className="mt-3 flex justify-end">
            <button
              onClick={() => onRemind(item)}
              className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition shadow-soft"
            >
              <Send className="size-3.5" />
              {t("esperando.sendReminder")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReminderModal({
  followup,
  onClose,
}: {
  followup: Followup;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [sent, setSent] = useState(false);

  const body = t("esperando.reminderTemplate", {
    person: followup.person.split(" ")[0],
    subject: followup.subject,
    days: followup.days,
    context: followup.context,
  });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(body);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl bg-card border border-border shadow-soft p-5"
      >
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              {t("esperando.reminderTitle")}
            </div>
            <h3 className="text-base font-semibold mt-0.5">
              {t("esperando.reminderTo", { person: followup.person })}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="size-7 rounded-lg hover:bg-accent grid place-items-center"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="text-xs text-muted-foreground mb-2">
          <span className="font-medium text-foreground">{t("esperando.subjectLabel")}: </span>
          {t("esperando.reminderSubject", { subject: followup.subject })}
        </div>

        <textarea
          readOnly
          value={body}
          className="w-full h-56 p-3 rounded-xl border border-border bg-background/60 text-sm leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-ring"
        />

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            onClick={copy}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border text-sm hover:bg-accent transition"
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copied ? t("esperando.copied") : t("esperando.copy")}
          </button>
          <button
            onClick={() => {
              setSent(true);
              setTimeout(onClose, 900);
            }}
            disabled={sent}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition shadow-soft disabled:opacity-70"
          >
            {sent ? <Check className="size-3.5" /> : <Send className="size-3.5" />}
            {sent ? t("esperando.sent") : t("esperando.send")}
          </button>
        </div>
      </div>
    </div>
  );
}

interface WaitingDTO { id: string; person: string; email: string; what: string; type?: string | null; received_at: number; }

function EsperandoPage() {
  const { t, i18n } = useTranslation();
  const fr = i18n.language === "fr";
  const [tab, setTab] = useState<"others" | "me">("others");
  const [fromOthers, setFromOthers] = useState<Commitment[]>([]);
  const [fromMe, setFromMe] = useState<Commitment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initials = (name: string) =>
      name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
    const ago = (ms: number) => {
      const days = Math.floor((Date.now() - ms) / 86400000);
      const label = days <= 0 ? (fr ? "aujourd'hui" : "hoy") : fr ? `il y a ${days} j` : `hace ${days} d`;
      return { days, label };
    };
    fetch("/api/waiting")
      .then((r) => r.json())
      .then((d: { fromOthers: WaitingDTO[]; fromMe: WaitingDTO[] }) => {
        setFromOthers((d.fromOthers || []).map((it) => {
          const a = ago(it.received_at);
          const status: Status = a.days > 7 ? "danger" : a.days > 3 ? "warn" : "ok";
          return { id: it.id, person: it.person, initials: initials(it.person), what: it.what, when: a.label, status };
        }));
        setFromMe((d.fromMe || []).map((it) => {
          const a = ago(it.received_at);
          const status: Status = it.type === "Reclamación" ? "danger" : it.type === "Urgente" ? "warn" : "ok";
          return { id: it.id, person: it.person, initials: initials(it.person), what: it.what, when: a.label, status };
        }));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [fr]);

  const meCount = fromMe.filter((i) => i.status !== "ok").length;
  const othersCount = fromOthers.filter((i) => i.status !== "ok").length;
  const list = tab === "me" ? fromMe : fromOthers;

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto">
        <PageHeader icon={Clock} title={t("esperando.title")} subtitle={t("esperando.subtitle")} />

        <div className="flex gap-2 mb-6 flex-wrap">
          <button
            onClick={() => setTab("others")}
            className={[
              "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all",
              tab === "others"
                ? "bg-primary text-primary-foreground shadow-soft"
                : "bg-card border border-border text-muted-foreground hover:text-foreground hover:border-muted",
            ].join(" ")}
          >
            <Users className="size-4" />
            <span>{t("esperando.tabOthers")}</span>
            {othersCount > 0 && (
              <span className="ml-1 inline-flex items-center justify-center size-5 rounded-full bg-warn text-warn-foreground text-[11px] font-bold">
                {othersCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setTab("me")}
            className={[
              "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all",
              tab === "me"
                ? "bg-primary text-primary-foreground shadow-soft"
                : "bg-card border border-border text-muted-foreground hover:text-foreground hover:border-muted",
            ].join(" ")}
          >
            <UserCheck className="size-4" />
            <span>{t("esperando.tabMe")}</span>
            {meCount > 0 && (
              <span className="ml-1 inline-flex items-center justify-center size-5 rounded-full bg-danger text-danger-foreground text-[11px] font-bold">
                {meCount}
              </span>
            )}
          </button>
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
                <div className="size-9 rounded-full bg-muted animate-pulse shrink-0" />
                <div className="flex-1">
                  <div className="h-4 w-1/3 rounded bg-muted animate-pulse mb-2" />
                  <div className="h-3 w-2/3 rounded bg-muted/70 animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ) : list.length === 0 ? (
          <div className="py-16 flex flex-col items-center text-center gap-2 text-muted-foreground">
            <UserCheck className="size-8 opacity-50" />
            <p className="text-sm max-w-xs">
              {tab === "others"
                ? fr ? "Personne ne t'a fait de promesse détectée pour l'instant." : "Nadie te ha hecho una promesa detectada por ahora."
                : fr ? "Aucun e-mail important en attente de ta réponse." : "Ningún correo importante esperando tu respuesta."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {list.map((item) => (
              <CommitmentCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

export const Route = createFileRoute("/esperando")({
  head: () => ({ meta: [{ title: "Esperando · AI Inbox Assistant" }] }),
  component: EsperandoPage,
});
