import { apiFetch } from "@/components/inbox/api-client";
import { EmailDetail } from "@/components/inbox/email-detail";
import { ToneComposer } from "@/components/inbox/tone-composer";
import { PageHeader } from "@/components/inbox/page-header";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Send, Clock, Trash2, Forward } from "lucide-react";

interface SentEmail {
  id: string;
  thread_id: string;
  sender: string;
  sender_email: string;
  subject: string;
  snippet: string;
  received_at: number;
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
}

function SentRow({
  item,
  fr,
  onOpen,
  onTrash,
  onForward,
}: {
  item: SentEmail;
  fr: boolean;
  onOpen: (id: string) => void;
  onTrash: (id: string) => void;
  onForward: (item: SentEmail) => void;
}) {
  const when = new Date(Number(item.received_at)).toLocaleDateString(fr ? "fr-FR" : "es-ES", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
  const to = item.sender || item.sender_email || "—";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(item.id)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onOpen(item.id); }}
      className="group flex items-center gap-4 rounded-xl border border-border bg-card px-5 py-4 cursor-pointer hover:bg-accent/30 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <div className="size-9 rounded-full bg-muted text-muted-foreground grid place-items-center text-xs font-semibold shrink-0">
        {initials(to)}
      </div>

      <div className="w-40 shrink-0 min-w-0">
        <div className="text-sm font-medium truncate text-foreground">{to}</div>
        <div className="text-xs text-muted-foreground truncate">{item.sender_email}</div>
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-foreground truncate">{item.subject || "(sin asunto)"}</div>
        {item.snippet && <div className="text-xs text-muted-foreground truncate">{item.snippet}</div>}
      </div>

      <div className="shrink-0 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Clock className="size-3.5" />
        <span>{when}</span>
      </div>

      <div className="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={() => onForward(item)}
          title={fr ? "Transférer" : "Reenviar"}
          className="size-8 rounded-lg grid place-items-center text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors"
        >
          <Forward className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => onTrash(item.id)}
          title={fr ? "Supprimer" : "Eliminar"}
          className="size-8 rounded-lg grid place-items-center text-muted-foreground hover:bg-red-50 hover:text-red-500 transition-colors"
        >
          <Trash2 className="size-4" />
        </button>
      </div>
    </div>
  );
}

function EnviadosPage() {
  const { t, i18n } = useTranslation();
  const fr = i18n.language === "fr";
  const [emails, setEmails] = useState<SentEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [forwardItem, setForwardItem] = useState<SentEmail | null>(null);

  const load = useCallback(() => {
    apiFetch("/api/inbox/sent")
      .then((r) => r.json())
      .then((d: { emails: SentEmail[] }) => setEmails(d.emails || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleTrash = useCallback(async (id: string) => {
    await apiFetch(`/api/email/${id}/trash`, { method: "POST" }).catch(() => {});
    setEmails((prev) => prev.filter((e) => e.id !== id));
  }, []);

  return (
    <>
      <div className="max-w-5xl mx-auto">
        <PageHeader
          icon={Send}
          title={t("enviados.title")}
          subtitle={loading ? t("enviados.loading") : t("enviados.count", { count: emails.length })}
        />

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
                <div className="size-9 rounded-full bg-muted animate-pulse shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-1/3 rounded bg-muted animate-pulse" />
                  <div className="h-3 w-2/3 rounded bg-muted/70 animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ) : emails.length === 0 ? (
          <div className="py-16 flex flex-col items-center text-center gap-2 text-muted-foreground">
            <Send className="size-8 opacity-40" />
            <p className="text-sm">{t("enviados.empty")}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {emails.map((item) => (
              <SentRow
                key={item.id}
                item={item}
                fr={fr}
                onOpen={setOpenId}
                onTrash={handleTrash}
                onForward={setForwardItem}
              />
            ))}
          </div>
        )}
      </div>

      <EmailDetail
        emailId={openId}
        onClose={() => setOpenId(null)}
        onAction={(id, action) => {
          if (action === "trash") setEmails((prev) => prev.filter((e) => e.id !== id));
        }}
        onReply={(info) => {
          setOpenId(null);
          setForwardItem({ id: info.id, thread_id: info.threadId, sender: info.sender, sender_email: info.to, subject: info.subject, snippet: "", received_at: 0 });
        }}
      />

      {forwardItem && (
        <ToneComposer
          email={{
            id: forwardItem.id,
            threadId: forwardItem.thread_id,
            to: forwardItem.sender_email,
            sender: forwardItem.sender,
            subject: forwardItem.subject,
            isHot: false,
          }}
          onClose={() => setForwardItem(null)}
        />
      )}
    </>
  );
}

export const Route = createFileRoute("/_authenticated/enviados")({
  head: () => ({ meta: [{ title: "Enviados · AI Inbox Assistant" }] }),
  component: EnviadosPage,
});
