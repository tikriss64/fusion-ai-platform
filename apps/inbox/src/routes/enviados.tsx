import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Send, Mail, Clock } from "lucide-react";

interface SentEmail {
  id: string;
  thread_id: string;
  sender: string; // destinatario (To)
  sender_email: string;
  subject: string;
  snippet: string;
  received_at: number;
}

function initials(name: string) {
  return (
    name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?"
  );
}

function SentCard({ item, fr }: { item: SentEmail; fr: boolean }) {
  const { t } = useTranslation();
  const date = new Date(item.received_at);
  const when = date.toLocaleDateString(fr ? "fr-FR" : "es-ES", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const to = item.sender || item.sender_email || "—";
  return (
    <div className="group rounded-xl border border-border bg-card p-4 transition-all hover:shadow-soft hover:-translate-y-px">
      <div className="flex items-start gap-3">
        <div className="size-9 rounded-full bg-gradient-to-br from-primary/70 to-accent text-primary-foreground grid place-items-center text-xs font-semibold shrink-0">
          {initials(to)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate">
                <span className="text-muted-foreground font-normal">{t("enviados.to")} </span>
                {to}
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
              <Clock className="size-3.5" />
              <span>{when}</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 mt-1.5 text-sm">
            <Mail className="size-3.5 text-muted-foreground shrink-0" />
            <span className="truncate font-medium">{item.subject || "(sin asunto)"}</span>
          </div>
          {item.snippet && (
            <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{item.snippet}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function EnviadosPage() {
  const { t, i18n } = useTranslation();
  const fr = i18n.language === "fr";
  const [emails, setEmails] = useState<SentEmail[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/inbox/sent")
      .then((r) => r.json())
      .then((d: { emails: SentEmail[] }) => setEmails(d.emails || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto">
        <PageHeader
          icon={Send}
          title={t("enviados.title")}
          subtitle={
            loading
              ? t("enviados.loading")
              : t("enviados.count", { count: emails.length })
          }
        />

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
        ) : emails.length === 0 ? (
          <div className="py-16 flex flex-col items-center text-center gap-2 text-muted-foreground">
            <Send className="size-8 opacity-50" />
            <p className="text-sm max-w-xs">{t("enviados.empty")}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {emails.map((item) => (
              <SentCard key={item.id} item={item} fr={fr} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

export const Route = createFileRoute("/enviados")({
  head: () => ({ meta: [{ title: "Enviados · AI Inbox Assistant" }] }),
  component: EnviadosPage,
});
