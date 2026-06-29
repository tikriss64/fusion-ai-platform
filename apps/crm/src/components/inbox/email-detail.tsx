import { apiFetch } from "@/components/inbox/api-client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { X, Loader2, User, Calendar, Mail, ExternalLink, Archive, Trash2, ShieldAlert, Reply, Paperclip, FileText, Image, File, Wand2, Copy, Check, Phone, MapPin, Receipt, CalendarClock, Star, ChevronDown, MoreHorizontal } from "lucide-react";

interface CrmData {
  client: { id: string; nombre: string; email: string; telefono: string; direccion: string; poblacion: string; num_trabajos: number; valoracion: number | null; recurrente: boolean } | null;
  quotes: { id: string; numero: string; estado: string; total: number }[];
  invoices: { id: string; numero: string; estado: string; total: number; vencimiento: string | null }[];
  jobs: { id: string; fecha: string; tipo_servicio: string; estado: string }[];
}

interface Attachment {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
}

interface EmailDetail {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  fromEmail: string;
  to: string;
  date: string;
  bodyHtml: string | null;
  bodyText: string | null;
  snippet: string;
  attachments: Attachment[];
}

function AttachIcon({ mime }: { mime: string }) {
  if (mime.startsWith("image/")) return <Image className="size-4 shrink-0" />;
  if (mime === "application/pdf" || mime.includes("document") || mime.includes("text")) return <FileText className="size-4 shrink-0" />;
  return <File className="size-4 shrink-0" />;
}

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface ReplyInfo {
  id: string;
  threadId: string;
  to: string;
  sender: string;
  subject: string;
  isHot: boolean;
}

interface Props {
  emailId: string | null;
  onClose: () => void;
  onAction?: (id: string, action: "archive" | "trash" | "spam") => void;
  onReply?: (info: ReplyInfo) => void;
  onCreateFromEmail?: (type: "cliente" | "lead" | "presupuesto", detail: EmailDetail) => void;
}

export function EmailDetail({ emailId, onClose, onAction, onReply, onCreateFromEmail }: Props) {
  const { i18n } = useTranslation();
  const fr = i18n.language === "fr";
  const [detail, setDetail] = useState<EmailDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [acting, setActing] = useState(false);
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiAnswer, setAiAnswer] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [crmContext, setCrmContext] = useState("");
  const [crmData, setCrmData] = useState<CrmData | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const doAction = async (action: "archive" | "trash" | "spam") => {
    if (!emailId) return;
    setActing(true);
    try { await apiFetch(`/api/email/${emailId}/${action}`, { method: "POST" }); } catch {}
    onAction?.(emailId, action);
    setActing(false);
    onClose();
  };

  const askAI = async (question: string) => {
    if (!detail) return;
    setAiLoading(true);
    setAiAnswer("");
    const emailCtx = `Email de: ${detail.from} <${detail.fromEmail}>\nAsunto: ${detail.subject}\nFecha: ${detail.date}\nContenido:\n${detail.bodyText || detail.snippet || ""}`;
    const fullContext = crmContext && !crmContext.includes("No se encontró")
      ? `${emailCtx}\n\n${crmContext}`
      : emailCtx;
    try {
      const r = await apiFetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            { role: "system", content: "Eres el asistente de VaciadoDePisos.cat (empresa de vaciado de pisos en Barcelona, ZAFIRO LANCER S.L.). Tienes acceso al historial completo del cliente en el CRM. Responde de forma profesional y concisa en español, usando los datos reales del CRM cuando sea relevante. No incluyas firma." },
            { role: "user", content: `${fullContext}\n\nPregunta: ${question}` },
          ],
          tools: [],
        }),
      });
      const d = await r.json() as { choices?: { message: { content: string } }[] };
      setAiAnswer(d.choices?.[0]?.message?.content?.trim() || "No se pudo obtener respuesta.");
    } catch {
      setAiAnswer("Error al contactar con la IA.");
    }
    setAiLoading(false);
  };

  const QUICK_ACTIONS = [
    "Redacta una respuesta profesional",
    "¿Qué me están pidiendo exactamente?",
    "Resume en 3 puntos clave",
    "¿Hay algo urgente o un plazo?",
    "Redacta un presupuesto basado en lo que piden",
    "Detecta si el tono es negativo o hay queja",
  ];

  const doReply = () => {
    if (!detail || !onReply) return;
    onReply({
      id: detail.id,
      threadId: detail.threadId,
      to: detail.fromEmail,
      sender: detail.from,
      subject: detail.subject,
      isHot: false,
    });
    onClose();
  };

  useEffect(() => {
    if (!emailId) { setDetail(null); return; }
    setLoading(true);
    setError(false);
    apiFetch(`/api/email/${emailId}`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d: EmailDetail) => {
        setDetail(d);
        // Ahora que tenemos el email, buscamos el cliente en el CRM
        apiFetch("/api/inbox/crm-context", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ senderEmail: d.fromEmail, senderName: d.from }),
        }).then((r) => r.json()).then((res: { context: string; raw: CrmData }) => {
          setCrmContext(res.context);
          setCrmData(res.raw?.client ? res.raw : null);
        }).catch(() => {});
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
    apiFetch(`/api/email/${emailId}/read`, { method: "POST" }).catch(() => {});
    setCrmContext("");
    setCrmData(null);
  }, [emailId]);


  if (!emailId) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <>
      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-[1px] z-[60] animate-fade-in"
        onClick={onClose}
      />
      <div className="fixed inset-y-0 right-0 z-[61] flex pointer-events-none">
      <div className="pointer-events-auto h-full w-screen sm:w-[80vw] sm:min-w-[720px] sm:max-w-[1500px] flex flex-col bg-background shadow-2xl border-l border-border overflow-hidden animate-in slide-in-from-right duration-200">
        {/* Cabecera */}
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-border bg-background/95 backdrop-blur shrink-0">
          <div className="min-w-0 flex-1">
            {loading ? (
              <div className="h-6 w-48 rounded-lg bg-muted animate-pulse" />
            ) : (
              <h2 className="text-base font-semibold text-foreground leading-snug">
                {detail?.subject ?? (fr ? "Chargement…" : "Cargando…")}
              </h2>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={fr ? "Fermer" : "Cerrar"}
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

        {/* Panel de contexto del cliente (si el remitente está en el CRM) */}
        {crmData?.client && (
          <div className="px-6 py-3 border-b border-border bg-primary/[0.03] shrink-0">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Link to="/clientes/$id" params={{ id: crmData.client.id }} className="text-sm font-semibold text-primary hover:underline truncate">
                    {crmData.client.nombre}
                  </Link>
                  {crmData.client.recurrente && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-600 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-full px-1.5 py-0.5">
                      <Star className="size-2.5 fill-amber-500 text-amber-500" /> Recurrente
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                  {crmData.client.telefono && (
                    <a href={`tel:${crmData.client.telefono}`} className="inline-flex items-center gap-1 hover:text-foreground">
                      <Phone className="size-3" /> {crmData.client.telefono}
                    </a>
                  )}
                  {(crmData.client.direccion || crmData.client.poblacion) && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="size-3" /> {[crmData.client.direccion, crmData.client.poblacion].filter(Boolean).join(", ")}
                    </span>
                  )}
                </div>
              </div>
            </div>
            {/* Presupuestos / facturas / citas con enlaces directos */}
            <div className="flex flex-wrap gap-1.5">
              {crmData.quotes.slice(0, 3).map((q) => (
                <Link key={q.id} to="/quotes" className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px] hover:border-primary hover:text-primary transition-colors">
                  <FileText className="size-3 text-blue-600" /> {q.numero || "Pres."} · {q.total.toFixed(0)}€ <span className="text-muted-foreground">{q.estado}</span>
                </Link>
              ))}
              {crmData.invoices.slice(0, 3).map((inv) => {
                const impago = ["pendiente", "parcial", "vencida"].includes(inv.estado);
                return (
                  <Link key={inv.id} to="/invoices/$id" params={{ id: inv.id }} className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition-colors ${impago ? "border-red-300 text-red-600 hover:bg-red-50" : "border-border bg-card hover:border-primary"}`}>
                    <Receipt className="size-3" /> {inv.numero || "Fact."} · {inv.total.toFixed(0)}€ <span className="text-muted-foreground">{inv.estado}</span>
                  </Link>
                );
              })}
              {crmData.jobs.slice(0, 2).map((j) => (
                <Link key={j.id} to="/agenda" className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px] hover:border-primary hover:text-primary transition-colors">
                  <CalendarClock className="size-3 text-emerald-600" /> {j.fecha || "Trabajo"} <span className="text-muted-foreground">{j.estado}</span>
                </Link>
              ))}
              {crmData.quotes.length === 0 && crmData.invoices.length === 0 && crmData.jobs.length === 0 && (
                <span className="text-[11px] text-muted-foreground italic">Cliente sin presupuestos, facturas ni trabajos todavía.</span>
              )}
            </div>
          </div>
        )}

        {/* Cuerpo */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
          {loading && (
            <div className="flex items-center justify-center py-16 gap-3 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
              <span className="text-sm">{fr ? "Chargement du message…" : "Cargando mensaje…"}</span>
            </div>
          )}
          {error && !loading && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
              <p className="text-sm">{fr ? "Impossible de charger ce message. Reconnecte ton compte Gmail dans Réglages." : "No se pudo cargar este mensaje. Reconecta tu cuenta Gmail en Ajustes."}</p>
            </div>
          )}
          {detail && !loading && (
            detail.bodyHtml ? (
              <iframe
                srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="only light"><style>
                  html,body{background:#ffffff;color:#1a1a1a;}
                  body{font-family:system-ui,sans-serif;font-size:15px;line-height:1.6;margin:0;padding:0;word-break:break-word;color-scheme:light;-webkit-text-size-adjust:100%;}
                  a{color:#6366f1;}img{max-width:100%;height:auto;}
                  table{max-width:100%;}
                </style></head><body>${detail.bodyHtml}</body></html>`}
                className="w-full border-0 rounded-xl bg-white"
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
                {fr ? "Pas de contenu lisible dans ce message." : "Este mensaje no tiene contenido legible."}
              </p>
            )
          )}
        </div>

        {/* Panel IA (plegable para no robar espacio al cuerpo) */}
        {detail && !loading && (
          <div className="px-6 py-3 border-t border-border bg-muted/20 shrink-0">
            <button
              type="button"
              onClick={() => setAiOpen((o) => !o)}
              className="flex w-full items-center justify-between gap-2"
            >
              <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Wand2 className="size-3.5" />
                Asistente IA
                {crmContext && !crmContext.includes("No se encontró") && (
                  <span className="text-[10px] text-emerald-600 font-medium bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                    Cliente en CRM
                  </span>
                )}
              </span>
              <ChevronDown className={`size-4 text-muted-foreground transition-transform ${aiOpen ? "rotate-180" : ""}`} />
            </button>
            {aiOpen && (
            <div className="space-y-3 mt-3">
            {/* Acciones rápidas */}
            <div className="flex flex-wrap gap-1.5">
              {QUICK_ACTIONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => { setAiQuestion(q); askAI(q); }}
                  className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
            {/* Pregunta libre */}
            <div className="flex gap-2">
              <input
                type="text"
                value={aiQuestion}
                onChange={(e) => setAiQuestion(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && aiQuestion.trim()) askAI(aiQuestion); }}
                placeholder="O escribe tu pregunta…"
                className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                type="button"
                onClick={() => aiQuestion.trim() && askAI(aiQuestion)}
                disabled={aiLoading || !aiQuestion.trim()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 text-primary px-3 py-2 text-xs font-medium hover:bg-primary/20 disabled:opacity-50 transition-colors"
              >
                {aiLoading ? <Loader2 className="size-3.5 animate-spin" /> : <Wand2 className="size-3.5" />}
                Preguntar
              </button>
            </div>
            {/* Respuesta IA */}
            {(aiLoading || aiAnswer) && (
              <div className="rounded-xl border border-border bg-background p-4 text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                {aiLoading ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    Analizando…
                  </div>
                ) : (
                  <>
                    <p>{aiAnswer}</p>
                    <div className="flex gap-2 mt-3">
                      <button
                        type="button"
                        onClick={() => { navigator.clipboard.writeText(aiAnswer); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent transition-colors"
                      >
                        {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
                        {copied ? "Copiado" : "Copiar"}
                      </button>
                      {onReply && (
                        <button
                          type="button"
                          onClick={() => { onReply({ id: detail.id, threadId: detail.threadId, to: detail.fromEmail, sender: detail.from, subject: detail.subject, isHot: false }); }}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 transition-colors"
                        >
                          <Reply className="size-3.5" />
                          Usar como respuesta
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
            </div>
            )}
          </div>
        )}

        {/* Adjuntos */}
        {detail && detail.attachments.length > 0 && (
          <div className="px-6 py-3 border-t border-border bg-card/50 shrink-0">
            <div className="flex items-center gap-1.5 mb-2 text-xs font-medium text-muted-foreground">
              <Paperclip className="size-3.5" />
              {detail.attachments.length} {fr ? "pièce(s) jointe(s)" : "adjunto(s)"}
            </div>
            <div className="flex flex-wrap gap-2">
              {detail.attachments.map((att) => (
                <a
                  key={att.attachmentId}
                  href={`/api/email/${detail.id}/attachment/${att.attachmentId}?filename=${encodeURIComponent(att.filename)}&mime=${encodeURIComponent(att.mimeType)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs hover:bg-accent transition-colors"
                >
                  <AttachIcon mime={att.mimeType} />
                  <span className="max-w-[180px] truncate font-medium">{att.filename}</span>
                  <span className="text-muted-foreground shrink-0">{fmtSize(att.size)}</span>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Pie: acciones */}
        {detail && (
          <div className="px-6 py-3 border-t border-border bg-card/50 shrink-0 flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 flex-wrap">
              {onReply && (
                <button
                  onClick={doReply}
                  disabled={acting}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-medium transition disabled:opacity-50"
                >
                  <Reply className="size-3.5" /> {fr ? "Répondre" : "Responder"}
                </button>
              )}
              {/* PC: acciones visibles */}
              <button
                onClick={() => doAction("archive")}
                disabled={acting}
                className="hidden sm:inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border hover:bg-accent text-xs font-medium transition disabled:opacity-50"
              >
                <Archive className="size-3.5" /> {fr ? "Archiver" : "Archivar"}
              </button>
              <button
                onClick={() => doAction("spam")}
                disabled={acting}
                className="hidden sm:inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border hover:bg-warn/15 hover:text-warn text-xs font-medium transition disabled:opacity-50"
              >
                <ShieldAlert className="size-3.5" /> Spam
              </button>
              <button
                onClick={() => doAction("trash")}
                disabled={acting}
                className="hidden sm:inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border hover:bg-danger/15 hover:text-danger text-xs font-medium transition disabled:opacity-50"
              >
                <Trash2 className="size-3.5" /> {fr ? "Corbeille" : "Papelera"}
              </button>

              {/* Móvil: desplegable "Más" con el resto de acciones */}
              <div className="relative sm:hidden">
                <button
                  type="button"
                  onClick={() => setMenuOpen((o) => !o)}
                  disabled={acting}
                  className="inline-flex items-center gap-1 h-8 px-3 rounded-lg border border-border hover:bg-accent text-xs font-medium transition disabled:opacity-50"
                >
                  <MoreHorizontal className="size-4" /> {fr ? "Plus" : "Más"}
                </button>
                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-[62]" onClick={() => setMenuOpen(false)} />
                    <div className="absolute bottom-full left-0 mb-2 z-[63] min-w-[190px] rounded-xl border border-border bg-background shadow-xl py-1">
                      <button onClick={() => { setMenuOpen(false); doAction("archive"); }} disabled={acting} className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-accent text-left disabled:opacity-50">
                        <Archive className="size-3.5" /> {fr ? "Archiver" : "Archivar"}
                      </button>
                      <button onClick={() => { setMenuOpen(false); doAction("spam"); }} disabled={acting} className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-warn/15 hover:text-warn text-left disabled:opacity-50">
                        <ShieldAlert className="size-3.5" /> Spam
                      </button>
                      <button onClick={() => { setMenuOpen(false); doAction("trash"); }} disabled={acting} className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-danger/15 hover:text-danger text-left disabled:opacity-50">
                        <Trash2 className="size-3.5" /> {fr ? "Corbeille" : "Papelera"}
                      </button>
                      {onCreateFromEmail && (
                        <>
                          <div className="my-1 border-t border-border" />
                          <button onClick={() => { setMenuOpen(false); onCreateFromEmail("cliente", detail); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-accent text-left">+ Cliente</button>
                          <button onClick={() => { setMenuOpen(false); onCreateFromEmail("lead", detail); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-accent text-left">+ Lead</button>
                          <button onClick={() => { setMenuOpen(false); onCreateFromEmail("presupuesto", detail); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-accent text-left">+ Presupuesto</button>
                        </>
                      )}
                      <div className="my-1 border-t border-border" />
                      <a href={`https://mail.google.com/mail/u/0/#inbox/${detail.id}`} target="_blank" rel="noreferrer" onClick={() => setMenuOpen(false)} className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-accent text-left">
                        <ExternalLink className="size-3" /> Gmail
                      </a>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* PC: lado derecho con crear registros + enlace a Gmail */}
            <div className="hidden sm:flex items-center gap-1.5 flex-wrap">
              {onCreateFromEmail && (
                <>
                  <button onClick={() => onCreateFromEmail("cliente", detail)} className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-border text-[11px] text-muted-foreground hover:bg-accent transition-colors">+ Cliente</button>
                  <button onClick={() => onCreateFromEmail("lead", detail)} className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-border text-[11px] text-muted-foreground hover:bg-accent transition-colors">+ Lead</button>
                  <button onClick={() => onCreateFromEmail("presupuesto", detail)} className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-border text-[11px] text-muted-foreground hover:bg-accent transition-colors">+ Presupuesto</button>
                </>
              )}
              <a href={`https://mail.google.com/mail/u/0/#inbox/${detail.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors">
                <ExternalLink className="size-3" />
                Gmail
              </a>
            </div>
          </div>
        )}
      </div>
      </div>
    </>,
    document.body,
  );
}
