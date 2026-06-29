import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useContextStore } from "./context-store";
import {
  Mail,
  CalendarClock,
  AlertCircle,
  Smile,
  Frown,
  Inbox as InboxIcon,
  Loader2,
} from "lucide-react";

interface ContactData {
  email: string;
  total: number;
  firstAt: number | null;
  lastAt: number | null;
  recent: { subject: string; summary: string; promise: string | null; tone_warning: string | null; type: string; received_at: number }[];
  promises: string[];
  negative: boolean;
}

export function ContextPanel() {
  const { selected } = useContextStore();
  const { t, i18n } = useTranslation();
  const [data, setData] = useState<ContactData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selected?.id) { setData(null); return; }
    setLoading(true);
    fetch(`/api/contact?email=${encodeURIComponent(selected.id)}`)
      .then((r) => r.json())
      .then((d: ContactData) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [selected?.id]);

  const fmtDate = (ms: number | null) =>
    ms ? new Intl.DateTimeFormat(i18n.language === "fr" ? "fr-FR" : "es-ES", { day: "numeric", month: "short", year: "numeric" }).format(new Date(ms)) : "—";

  if (!selected) {
    return (
      <div>
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
          {t("context.label")}
        </div>
        <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground text-center">
          <InboxIcon className="mx-auto mb-3 size-6 opacity-60" />
          {t("context.empty")}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
        {t("context.label")}
      </div>

      <div className="rounded-2xl border border-border bg-card shadow-soft overflow-hidden">
        <div className="flex items-center gap-3 p-4 border-b border-border">
          <div className="size-12 rounded-full bg-gradient-to-br from-primary to-accent grid place-items-center text-primary-foreground font-semibold shadow-soft">
            {selected.initials}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">{selected.name}</div>
            <div className="text-xs text-muted-foreground truncate">{selected.id}</div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground text-sm">
            <Loader2 className="size-4 animate-spin" />
            {i18n.language === "fr" ? "Chargement…" : "Cargando…"}
          </div>
        ) : (
          <>
            {/* Relación: nº correos reales */}
            <div className="px-4 py-3 border-b border-border">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
                {t("context.relation")}
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Mail className="size-3.5" />
                  {data?.total ?? 0} {i18n.language === "fr" ? "e-mails" : "correos"}
                </span>
                {data?.negative && (
                  <span className="inline-flex items-center gap-1.5 text-danger">
                    <Frown className="size-3.5" /> {i18n.language === "fr" ? "ton négatif" : "tono negativo"}
                  </span>
                )}
              </div>
            </div>

            {/* Última interacción */}
            <div className="px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
                <CalendarClock className="size-3.5" /> {t("context.lastInteraction")}
              </div>
              <p className="text-[13px] text-foreground leading-snug">{fmtDate(data?.lastAt ?? null)}</p>
            </div>

            {/* Promesas detectadas */}
            {data && data.promises.length > 0 && (
              <div className="px-4 py-3 border-b border-border">
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
                  <AlertCircle className="size-3.5 text-warn" /> {t("context.promises")}
                </div>
                <ul className="space-y-1.5 text-[13px] leading-snug">
                  {data.promises.map((p, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-muted-foreground">→</span>
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Correos recientes de este contacto */}
            {data && data.recent.length > 0 && (
              <div className="px-4 py-3">
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
                  <Smile className="size-3.5" /> {i18n.language === "fr" ? "Récents" : "Recientes"}
                </div>
                <ul className="space-y-2">
                  {data.recent.map((r, i) => (
                    <li key={i} className="text-[13px] leading-snug">
                      <div className="font-medium text-foreground truncate">{r.subject}</div>
                      {r.summary && <div className="text-xs text-muted-foreground truncate">{r.summary}</div>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
