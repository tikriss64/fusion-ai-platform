import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { X, Loader2, User, Calendar, Mail, ExternalLink, Archive, Trash2, ShieldAlert } from "lucide-react";

interface EmailDetail {
  id: string;
  subject: string;
  from: string;
  fromEmail: string;
  to: string;
  date: string;
  bodyHtml: string | null;
  bodyText: string | null;
  snippet: string;
}

interface Props {
  emailId: string | null;
  onClose: () => void;
  onAction?: (id: string, action: "archive" | "trash" | "spam") => void;
}

export function EmailDetail({ emailId, onClose, onAction }: Props) {
  const { i18n } = useTranslation();
  const fr = i18n.language === "fr";
  const [detail, setDetail] = useState<EmailDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [acting, setActing] = useState(false);

  const doAction = async (action: "archive" | "trash" | "spam") => {
    if (!emailId) return;
    setActing(true);
    try { await fetch(`/api/email/${emailId}/${action}`, { method: "POST" }); } catch {}
    onAction?.(emailId, action);
    setActing(false);
    onClose();
  };

  useEffect(() => {
    if (!emailId) { setDetail(null); return; }
    setLoading(true);
    setError(false);
    fetch(`/api/email/${emailId}`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d: EmailDetail) => setDetail(d))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
    // Marcar como leído en Gmail al abrir (fire-and-forget)
    fetch(`/api/email/${emailId}/read`, { method: "POST" }).catch(() => {});
  }, [emailId]);

  if (!emailId) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-[60] animate-fade-in"
        onClick={onClose}
      />
      {/* Modal centrado (por encima de cualquier otro modal) */}
      <div className="fixed inset-0 z-[61] flex items-center justify-center p-4 pointer-events-none">
      <div className="pointer-events-auto w-full max-w-2xl max-h-[80vh] flex flex-col bg-background shadow-2xl border border-border rounded-2xl overflow-hidden animate-scale-in">
        {/* Cabecera */}
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-border bg-background/95 backdrop-blur shrink-0">
          <div className="min-w-0 flex-1">
            {loading ? (
              <div className="h-6 w-48 rounded-lg bg-muted animate-pulse" />
            ) : (
              <h2 className="text-base font-semibold text-foreground leading-snug">
                {detail?.subject ?? (i18n.language === "fr" ? "Chargement…" : "Cargando…")}
              </h2>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={i18n.language === "fr" ? "Fermer" : "Cerrar"}
            className="shrink-0 size-8 rounded-lg grid place-items-center text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Metadatos */}
        {detail && !loading && (
          <div className="px-6 py-3 border-b border-border bg-card/50 shrink-0 space-y-1.5">
            <div className="flex items-center gap-2 text-sm">
              <User className="size-3.5 text-muted-foreground shrink-0" />
              <span className="font-medium text-foreground">{detail.from}</span>
              {detail.fromEmail && detail.fromEmail !== detail.from && (
                <span className="text-muted-foreground text-xs">{"<"}{detail.fromEmail}{">"}</span>
              )}
            </div>
            {detail.to && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Mail className="size-3.5 shrink-0" />
                <span className="truncate">{detail.to}</span>
              </div>
            )}
            {detail.date && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Calendar className="size-3.5 shrink-0" />
                <span>{detail.date}</span>
              </div>
            )}
          </div>
        )}

        {/* Cuerpo */}
        <div className="flex-1 overflow-auto px-6 py-5">
          {loading && (
            <div className="flex items-center justify-center py-16 gap-3 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
              <span className="text-sm">{i18n.language === "fr" ? "Chargement du message…" : "Cargando mensaje…"}</span>
            </div>
          )}
          {error && !loading && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
              <p className="text-sm">{i18n.language === "fr" ? "Impossible de charger ce message. Reconnecte ton compte Gmail dans Réglages." : "No se pudo cargar este mensaje. Reconecta tu cuenta Gmail en Ajustes."}</p>
            </div>
          )}
          {detail && !loading && (
            detail.bodyHtml ? (
              // Render HTML en un iframe aislado para evitar estilos que rompan la app
              <iframe
                srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><style>
                  body{font-family:system-ui,sans-serif;font-size:14px;line-height:1.6;color:#1a1a1a;margin:0;padding:0;word-break:break-word;}
                  a{color:#6366f1;}img{max-width:100%;height:auto;}
                  table{max-width:100%;border-collapse:collapse;}
                  @media(prefers-color-scheme:dark){body{color:#e5e5e5;background:#1a1a1a;}a{color:#a5b4fc;}}
                </style></head><body>${detail.bodyHtml}</body></html>`}
                className="w-full border-0 rounded-xl"
                style={{ minHeight: "400px" }}
                onLoad={(e) => {
                  const iframe = e.currentTarget;
                  const height = iframe.contentDocument?.body?.scrollHeight;
                  if (height) iframe.style.height = `${height + 32}px`;
                }}
                sandbox="allow-same-origin"
                title={detail.subject}
              />
            ) : detail.bodyText ? (
              <pre className="text-sm text-foreground whitespace-pre-wrap font-sans leading-relaxed">
                {detail.bodyText}
              </pre>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                {i18n.language === "fr" ? "Pas de contenu lisible dans ce message." : "Este mensaje no tiene contenido legible."}
              </p>
            )
          )}
        </div>

        {/* Pie: acciones + enlace a Gmail */}
        {detail && (
          <div className="px-6 py-3 border-t border-border bg-card/50 shrink-0 flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => doAction("archive")}
                disabled={acting}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border hover:bg-accent text-xs font-medium transition disabled:opacity-50"
              >
                <Archive className="size-3.5" /> {fr ? "Archiver" : "Archivar"}
              </button>
              <button
                onClick={() => doAction("spam")}
                disabled={acting}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border hover:bg-warn/15 hover:text-warn text-xs font-medium transition disabled:opacity-50"
              >
                <ShieldAlert className="size-3.5" /> Spam
              </button>
              <button
                onClick={() => doAction("trash")}
                disabled={acting}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border hover:bg-danger/15 hover:text-danger text-xs font-medium transition disabled:opacity-50"
              >
                <Trash2 className="size-3.5" /> {fr ? "Corbeille" : "Papelera"}
              </button>
            </div>
            <a
              href={`https://mail.google.com/mail/u/0/#inbox/${detail.id}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline shrink-0"
            >
              <ExternalLink className="size-3" />
              {fr ? "Ouvrir dans Gmail" : "Abrir en Gmail"}
            </a>
          </div>
        )}
      </div>
      </div>
    </>,
    document.body,
  );
}
