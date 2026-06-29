import { apiFetch } from "@/components/inbox/api-client";
import { EmailDetail } from "@/components/inbox/email-detail";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PageHeader } from "@/components/inbox/page-header";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  UserCheck,
  Users,
  Clock,
  ChevronRight,
  FileText,
} from "lucide-react";

interface QuoteWaiting {
  id: string;
  cliente: string;
  numero: string;
  total: number;
  dias: number;
  label: string;
  status: "ok" | "warn" | "danger";
}

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

interface WaitingDTO { id: string; person: string; email: string; what: string; type?: string | null; received_at: number; }

function EsperandoPage() {
  const { t, i18n } = useTranslation();
  const fr = i18n.language === "fr";
  const [tab, setTab] = useState<"others" | "me" | "quotes">("others");
  const [fromOthers, setFromOthers] = useState<Commitment[]>([]);
  const [fromMe, setFromMe] = useState<Commitment[]>([]);
  const [presupuestos, setPresupuestos] = useState<QuoteWaiting[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const navigate = useNavigate();

  // Presupuestos enviados sin respuesta = lo que de verdad esperas del cliente.
  useEffect(() => {
    (async () => {
      const { data: qs } = await supabase
        .from("quotes")
        .select("id, numero, total, fecha, client_id, estado, is_template")
        .eq("estado", "enviado")
        .eq("is_template", false)
        .order("fecha", { ascending: true });
      if (!qs?.length) { setPresupuestos([]); return; }
      const ids = [...new Set(qs.map((q) => q.client_id).filter(Boolean))] as string[];
      const { data: cls } = ids.length
        ? await supabase.from("clients").select("id, nombre").in("id", ids)
        : { data: [] };
      const cm: Record<string, string> = Object.fromEntries((cls ?? []).map((c) => [c.id, c.nombre]));
      setPresupuestos(qs.map((q) => {
        const dias = q.fecha ? Math.floor((Date.now() - new Date(q.fecha).getTime()) / 86400000) : 0;
        const status: "ok" | "warn" | "danger" = dias > 10 ? "danger" : dias > 4 ? "warn" : "ok";
        const label = dias <= 0 ? (fr ? "envoyé aujourd'hui" : "enviado hoy") : fr ? `envoyé il y a ${dias} j` : `enviado hace ${dias} d`;
        return { id: q.id, cliente: cm[q.client_id ?? ""] ?? (fr ? "Sans client" : "Sin cliente"), numero: q.numero ?? "—", total: Number(q.total), dias, label, status };
      }));
    })().catch(() => {});
  }, [fr]);

  useEffect(() => {
    const initials = (name: string) =>
      name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
    const ago = (ms: number | string) => {
      const days = Math.floor((Date.now() - Number(ms)) / 86400000);
      const label = days <= 0 ? (fr ? "aujourd'hui" : "hoy") : fr ? `il y a ${days} j` : `hace ${days} d`;
      return { days, label };
    };
    apiFetch("/api/waiting")
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
  const quotesCount = presupuestos.filter((i) => i.status !== "ok").length;
  const list = tab === "me" ? fromMe : fromOthers;

  return (
    <>
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

          <button
            onClick={() => setTab("quotes")}
            className={[
              "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all",
              tab === "quotes"
                ? "bg-primary text-primary-foreground shadow-soft"
                : "bg-card border border-border text-muted-foreground hover:text-foreground hover:border-muted",
            ].join(" ")}
          >
            <FileText className="size-4" />
            <span>{fr ? "Devis envoyés" : "Presupuestos enviados"}</span>
            {quotesCount > 0 && (
              <span className="ml-1 inline-flex items-center justify-center size-5 rounded-full bg-warn text-warn-foreground text-[11px] font-bold">
                {quotesCount}
              </span>
            )}
          </button>
        </div>

        {tab === "quotes" ? (
          presupuestos.length === 0 ? (
            <div className="py-16 flex flex-col items-center text-center gap-2 text-muted-foreground">
              <FileText className="size-8 opacity-50" />
              <p className="text-sm max-w-xs">{fr ? "Aucun devis en attente de réponse." : "Ningún presupuesto esperando respuesta."}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {presupuestos.map((q) => {
                const cfg = q.status === "danger" ? "bg-danger/15 text-danger border-danger/20" : q.status === "warn" ? "bg-warn/15 text-warn border-warn/20" : "bg-ok/15 text-ok border-ok/20";
                return (
                  <div key={q.id} onClick={() => navigate({ to: "/quotes" as any })}
                    className="group rounded-xl border border-border bg-card p-4 cursor-pointer transition-all hover:shadow-soft hover:-translate-y-px">
                    <div className="flex items-start gap-3">
                      <div className="size-9 rounded-lg bg-muted text-muted-foreground grid place-items-center shrink-0">
                        <FileText className="size-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <span className="text-sm font-semibold truncate">{q.cliente}</span>
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border shrink-0 ${cfg}`}>
                            {q.dias > 10 ? (fr ? "Sans réponse" : "Sin respuesta") : q.label}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground truncate">{fr ? "Devis" : "Presupuesto"} {q.numero} · {q.total.toFixed(2)} €</p>
                        <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground">
                          <Clock className="size-3.5" />
                          <span>{q.label}</span>
                        </div>
                      </div>
                      <ChevronRight className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-1" />
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : loading ? (
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
              <div key={item.id} onClick={() => setOpenId(item.id)} className="cursor-pointer">
                <CommitmentCard item={item} />
              </div>
            ))}
          </div>
        )}
      </div>
      <EmailDetail emailId={openId} onClose={() => setOpenId(null)} />
    </>
  );
}

export const Route = createFileRoute("/_authenticated/esperando")({
  head: () => ({ meta: [{ title: "Esperando · AI Inbox Assistant" }] }),
  component: EsperandoPage,
});
