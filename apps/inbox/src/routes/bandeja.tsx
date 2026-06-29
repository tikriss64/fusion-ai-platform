import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { EmailDetail } from "@/components/email-detail";
import { Inbox, Reply, CheckCircle, Archive, Clock, Frown, Sparkles, MoonStar, Undo2, ChevronDown, ChevronUp, Zap, Pencil, Brain, Focus, X, RefreshCw, Loader2, Wand2, LayoutGrid, List, Trash2, ShieldAlert, Square, CheckSquare } from "lucide-react";
import { useContextStore, type ContactContext } from "@/components/context-store";
import { ToneComposer } from "@/components/tone-composer";
import { SnoozeMenu } from "@/components/snooze-menu";
import { useSnooze, isSnoozed } from "@/hooks/use-snooze";
import { useFocusMode } from "@/hooks/use-focus-mode";

type EmailType = "Cliente" | "Proveedor" | "Reclamación" | "Comercial" | "Urgente" | "Info";
type ActionType = "Responder" | "Crear tarea" | "Archivar";
type EffortType = "quick" | "medium" | "long";

interface EmailCard {
  id: string;
  threadId: string;
  senderEmail: string;
  type: EmailType | null;
  sender: string;
  subject: string;
  summary: string;
  promise?: string;
  toneWarning?: string;
  action: ActionType;
  effort?: EffortType;
  time: string;
  contact: ContactContext;
}

const ALL_TYPES: EmailType[] = ["Cliente", "Proveedor", "Reclamación", "Comercial", "Urgente", "Info"];

// Chip de tipo clicable que permite corregir la clasificación.
function TypeChip({
  email,
  onSetType,
}: {
  email: EmailCard;
  onSetType: (id: string, type: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const typeKey = email.type;
  const chipStyle = typeKey ? chipStyles[typeKey] : "bg-muted text-muted-foreground";
  const typeLabel = typeKey ? t(`bandeja.types.${typeKey}`) : i18n.language === "fr" ? "Nouveau" : "Nuevo";

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        title={i18n.language === "fr" ? "Cliquer pour corriger la catégorie" : "Pulsa para corregir la categoría"}
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${chipStyle} hover:ring-2 hover:ring-foreground/20`}
      >
        {typeLabel}
        <ChevronDown className="size-3 opacity-70" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setOpen(false); }} />
          <div className="absolute top-full left-0 mt-1 z-50 rounded-xl border border-border bg-popover shadow-lg py-1 min-w-36">
            {ALL_TYPES.map((tp) => (
              <button
                key={tp}
                type="button"
                onClick={(e) => { e.stopPropagation(); onSetType(email.id, tp); setOpen(false); }}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-accent ${tp === typeKey ? "font-semibold" : ""}`}
              >
                <span className={`size-2 rounded-full ${chipStyles[tp].split(" ")[0]}`} />
                {t(`bandeja.types.${tp}`)}
              </button>
            ))}
          </div>
        </>
      )}
    </span>
  );
}

// Forma de los correos tal como llegan de /api/inbox/list (D1).
interface StoredEmailDTO {
  id: string;
  thread_id: string;
  sender: string;
  sender_email: string;
  subject: string;
  snippet: string;
  received_at: number;
  type: string | null;
  summary: string | null;
  promise: string | null;
  tone_warning: string | null;
  effort: string | null;
  analyzed_at: number | null;
}

const chipStyles: Record<EmailType, string> = {
  Cliente: "bg-primary text-primary-foreground",
  Proveedor: "bg-secondary text-secondary-foreground",
  Reclamación: "bg-danger text-danger-foreground",
  Comercial: "bg-ok text-ok-foreground",
  Urgente: "bg-warn text-warn-foreground",
  Info: "bg-muted text-muted-foreground",
};

const cardTintStyles: Record<EmailType, string> = {
  Reclamación: "bg-[color-mix(in_oklab,var(--danger)_7%,var(--card))] border-l-4 border-l-danger",
  Urgente: "bg-[color-mix(in_oklab,var(--warn)_8%,var(--card))] border-l-4 border-l-warn",
  Comercial: "bg-[color-mix(in_oklab,var(--ok)_8%,var(--card))] border-l-4 border-l-ok",
  Cliente: "bg-card border-l-4 border-l-primary/40",
  Proveedor: "bg-card border-l-4 border-l-border",
  Info: "bg-card border-l-4 border-l-muted-foreground/30",
};

const actionIcons: Record<ActionType, React.ReactNode> = {
  Responder: <Reply className="size-3.5" />,
  "Crear tarea": <CheckCircle className="size-3.5" />,
  Archivar: <Archive className="size-3.5" />,
};

const effortStyles: Record<EffortType, string> = {
  quick: "bg-ok/15 text-ok",
  medium: "bg-warn/15 text-warn",
  long: "bg-danger/15 text-danger",
};

const effortIcons: Record<EffortType, React.ReactNode> = {
  quick: <Zap className="size-3" />,
  medium: <Pencil className="size-3" />,
  long: <Brain className="size-3" />,
};

const effortTooltip: Record<EffortType, string> = {
  quick: "Respuesta rápida (< 2 min)",
  medium: "Requiere redacción (2-10 min)",
  long: "Necesita reflexión (> 10 min)",
};

function EmailCardComponent({
  email,
  onReply,
  onSnooze,
  onOpen,
  onAction,
  onCheck,
  isChecked,
  onSetType,
}: {
  email: EmailCard;
  onReply: (email: EmailCard) => void;
  onSnooze: (id: string, until: Date) => void;
  onOpen: (id: string) => void;
  onAction: (id: string, action: string) => void;
  onCheck: (id: string, e: React.MouseEvent) => void;
  isChecked: boolean;
  onSetType: (id: string, type: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const { selected, setSelected } = useContextStore();
  const isActive = selected?.id === email.contact.id;

  const typeKey = email.type;
  const tintStyle = typeKey ? cardTintStyles[typeKey] : "bg-card border-l-4 border-l-border/60";

  const handleAction = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelected(email.contact);
    if (email.action === "Responder") onReply(email);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => { setSelected(email.contact); onOpen(email.id); }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") { setSelected(email.contact); onOpen(email.id); }
      }}
      className={`group flex flex-col text-left rounded-2xl border p-5 shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-lg cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${tintStyle} ${
        isActive ? "ring-2 ring-primary/30 border-primary" : "border-border"
      }`}
    >
      <div className="flex items-center justify-between mb-3 gap-2">
        <div className="flex items-center gap-2">
          <TypeChip email={email} onSetType={onSetType} />
          {email.effort && (
            <span title={effortTooltip[email.effort]} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${effortStyles[email.effort]}`}>
              {effortIcons[email.effort]}
              {t(`bandeja.effort.${email.effort}`)}
            </span>
          )}
        </div>
        <span className="text-xs text-muted-foreground">{email.time}</span>
      </div>

      <div className="mb-2">
        <div className="text-sm font-semibold text-foreground">{email.sender}</div>
        <div className="text-sm text-muted-foreground leading-snug">{email.subject}</div>
      </div>

      <div className="mb-3 rounded-xl bg-accent/60 px-3 py-2.5">
        <p className="text-[13px] leading-relaxed text-accent-foreground">{email.summary}</p>
      </div>

      {(email.promise || email.toneWarning) && (
        <div
          className={`mb-3 space-y-1.5 rounded-lg px-3 py-2 ${
            email.toneWarning
              ? "bg-[color-mix(in_oklab,var(--danger)_10%,var(--card))] border border-danger/20"
              : "bg-warn-soft border border-warn/20"
          }`}
        >
          {email.promise && (
            <div className="flex items-center gap-2">
              {email.toneWarning ? (
                <Clock className="size-4 shrink-0 text-danger/80" />
              ) : (
                <Sparkles className="size-4 shrink-0 text-warn-foreground/80" />
              )}
              <p className={`text-[13px] leading-snug ${email.toneWarning ? "text-danger" : "text-warn-foreground"}`}>
                {email.promise}
              </p>
            </div>
          )}
          {email.toneWarning && (
            <div className="flex items-center gap-2">
              <Frown className="size-4 shrink-0 text-danger/80" />
              <p className="text-[13px] leading-snug text-danger">{email.toneWarning}</p>
            </div>
          )}
        </div>
      )}

      <div className="mt-auto flex items-center gap-1 min-w-0">
        {/* Checkbox selección */}
        <button
          type="button"
          onClick={(e) => onCheck(email.id, e)}
          title={i18n.language === "fr" ? "Sélectionner" : "Seleccionar"}
          className={`shrink-0 size-8 rounded-lg grid place-items-center transition-colors ${isChecked ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"}`}
        >
          {isChecked ? <CheckSquare className="size-4" /> : <Square className="size-4" />}
        </button>
        {/* Responder */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setSelected(email.contact); onReply(email); }}
          className="inline-flex flex-1 min-w-0 items-center justify-center gap-1.5 rounded-lg bg-primary px-2 py-2 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Reply className="size-3.5 shrink-0" />
          <span className="truncate">{t("bandeja.actions.Responder")}</span>
        </button>
        {/* Archivar */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onAction(email.id, "archive"); }}
          title={i18n.language === "fr" ? "Archiver" : "Archivar"}
          className="shrink-0 size-8 rounded-lg grid place-items-center text-muted-foreground hover:bg-accent transition-colors"
        >
          <Archive className="size-4" />
        </button>
        {/* Papelera */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onAction(email.id, "trash"); }}
          title={i18n.language === "fr" ? "Corbeille" : "Papelera"}
          className="shrink-0 size-8 rounded-lg grid place-items-center text-muted-foreground hover:bg-danger/20 hover:text-danger transition-colors"
        >
          <Trash2 className="size-4" />
        </button>
        <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
          <SnoozeMenu onSnooze={(until) => onSnooze(email.id, until)} />
        </div>
      </div>
    </div>
  );
}

function EmailRowComponent({
  email,
  onReply,
  onSnooze,
  onOpen,
  onAction,
  onCheck,
  isChecked,
  onSetType,
}: {
  email: EmailCard;
  onReply: (email: EmailCard) => void;
  onSnooze: (id: string, until: Date) => void;
  onOpen: (id: string) => void;
  onAction: (id: string, action: string) => void;
  onCheck: (id: string, e: React.MouseEvent) => void;
  isChecked: boolean;
  onSetType: (id: string, type: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const { selected, setSelected } = useContextStore();
  const isActive = selected?.id === email.contact.id;

  const typeKey = email.type;
  const tintStyle = typeKey ? cardTintStyles[typeKey] : "bg-card border-l-4 border-l-border/60";
  const typeLabel = typeKey
    ? t(`bandeja.types.${typeKey}`)
    : i18n.language === "fr" ? "Nouveau" : "Nuevo";

  const handleAction = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelected(email.contact);
    if (email.action === "Responder") onReply(email);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => { setSelected(email.contact); onOpen(email.id); }}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { setSelected(email.contact); onOpen(email.id); } }}
      className={`group flex items-center gap-4 text-left rounded-xl border px-5 py-4 shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-lg cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${tintStyle} ${isActive ? "ring-2 ring-primary/30 border-primary" : "border-border"}`}
    >
      {/* Chip tipo (clicable para corregir) */}
      <span className="shrink-0">
        <TypeChip email={email} onSetType={onSetType} />
      </span>

      {/* Remitente */}
      <div className="w-36 shrink-0 min-w-0">
        <div className="truncate text-sm font-semibold text-foreground">{email.sender}</div>
      </div>

      {/* Asunto + resumen */}
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium text-foreground truncate block">{email.subject}</span>
        {email.summary && (
          <span className="text-xs text-muted-foreground truncate block">{email.summary}</span>
        )}
      </div>

      {/* Avisos */}
      <div className="shrink-0 flex items-center gap-2">
        {email.toneWarning && (
          <span title={email.toneWarning}>
            <Frown className="size-4 text-danger" />
          </span>
        )}
        {email.promise && (
          <span title={email.promise}>
            <Clock className="size-4 text-warn" />
          </span>
        )}
        {email.effort && (
          <span title={effortTooltip[email.effort]} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${effortStyles[email.effort]}`}>
            {effortIcons[email.effort]}
          </span>
        )}
      </div>

      {/* Hora */}
      <div className="shrink-0 text-xs text-muted-foreground w-20 text-right">{email.time}</div>

      {/* Checkbox + acciones */}
      <div className="shrink-0 flex items-center gap-1">
        <button
          type="button"
          onClick={(e) => onCheck(email.id, e)}
          className={`size-7 rounded-lg grid place-items-center transition-colors ${isChecked ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent opacity-0 group-hover:opacity-100"}`}
        >
          {isChecked ? <CheckSquare className="size-3.5" /> : <Square className="size-3.5" />}
        </button>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setSelected(email.contact); onReply(email); }}
            title={t("bandeja.actions.Responder")}
            className="size-8 rounded-lg grid place-items-center text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors"
          >
            <Reply className="size-4" />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onAction(email.id, "archive"); }}
            title={i18n.language === "fr" ? "Archiver" : "Archivar"}
            className="size-8 rounded-lg grid place-items-center text-muted-foreground hover:bg-accent transition-colors"
          >
            <Archive className="size-4" />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onAction(email.id, "trash"); }}
            title={i18n.language === "fr" ? "Corbeille" : "Papelera"}
            className="size-8 rounded-lg grid place-items-center text-muted-foreground hover:bg-danger/20 hover:text-danger transition-colors"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function BandejaPage() {
  const { t, i18n } = useTranslation();
  const [replyTo, setReplyTo] = useState<EmailCard | null>(null);
  const [openEmailId, setOpenEmailId] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/gmail/status")
      .then((r) => r.json())
      .then((d: { connected: boolean }) => setConnected(!!d.connected))
      .catch(() => setConnected(null));
  }, []);

  const toggleCheck = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const clearChecked = useCallback(() => setCheckedIds(new Set()), []);

  const [showSnoozed, setShowSnoozed] = useState(false);
  const [filterMode, setFilterMode] = useState<"all" | "quick">("all");
  const { map, hydrated, snooze, unsnooze } = useSnooze();

  const [allEmails, setAllEmails] = useState<EmailCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">(() => {
    try { return (localStorage.getItem("bandeja.view") as "grid" | "list") ?? "grid"; }
    catch { return "grid"; }
  });
  const toggleView = useCallback(() => {
    setViewMode((v) => {
      const next = v === "grid" ? "list" : "grid";
      try { localStorage.setItem("bandeja.view", next); } catch {}
      return next;
    });
  }, []);
  const [analyzeProgress, setAnalyzeProgress] = useState<{ done: number; total: number } | null>(null);
  const [analyzeResult, setAnalyzeResult] = useState<{ analyzed: number; engines: string[] } | null>(null);

  const formatTime = useCallback(
    (ms: number) =>
      new Intl.DateTimeFormat(i18n.language === "fr" ? "fr-FR" : "es-ES", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(ms)),
    [i18n.language],
  );

  const mapEmail = useCallback(
    (e: StoredEmailDTO): EmailCard => ({
      id: e.id,
      threadId: e.thread_id,
      senderEmail: e.sender_email,
      type: (e.type as EmailType | null) ?? null,
      sender: e.sender || e.sender_email || "—",
      subject: e.subject || "(sin asunto)",
      summary: e.summary || e.snippet || "",
      promise: e.promise || undefined,
      toneWarning: e.tone_warning || undefined,
      action: "Responder",
      effort: (e.effort as EffortType | null) || undefined,
      time: formatTime(e.received_at),
      contact: {
        id: e.sender_email || e.id,
        name: e.sender || e.sender_email || "—",
        initials: (e.sender || e.sender_email || "?").trim().slice(0, 2).toUpperCase(),
        role: e.sender_email || "",
        since: "",
        emails: 0,
        calls: 0,
        lastInteraction: formatTime(e.received_at),
        tone: "",
      },
    }),
    [formatTime],
  );

  const loadEmails = useCallback(() => {
    setLoading(true);
    fetch("/api/inbox/list")
      .then((r) => r.json())
      .then((d: { emails?: StoredEmailDTO[] }) => setAllEmails((d.emails ?? []).map(mapEmail)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [mapEmail]);

  useEffect(() => {
    loadEmails();
  }, [loadEmails]);

  const doAction = useCallback(async (ids: string[], action: string) => {
    setBulkLoading(true);
    await fetch("/api/email/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, action }),
    });
    setCheckedIds(new Set());
    await loadEmails();
    setBulkLoading(false);
  }, [loadEmails]);

  const doSingleAction = useCallback(async (id: string, action: string) => {
    await fetch(`/api/email/${id}/${action}`, { method: "POST" });
    await loadEmails();
  }, [loadEmails]);

  const doSetType = useCallback(async (id: string, type: string) => {
    await fetch(`/api/email/${id}/type`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type }),
    });
    await loadEmails();
  }, [loadEmails]);

  const sync = useCallback(() => {
    setSyncing(true);
    fetch("/api/gmail/sync", { method: "POST" })
      .then((r) => r.json())
      .then(() => loadEmails())
      .catch(() => {})
      .finally(() => setSyncing(false));
  }, [loadEmails]);

  const analyze = useCallback(() => {
    setAnalyzing(true);
    setAnalyzeProgress(null);
    setAnalyzeResult(null);
    let totalDone = 0;
    const engines = new Set<string>();

    const runBatch = (): Promise<void> =>
      fetch("/api/inbox/analyze", { method: "POST" })
        .then((r) => r.json())
        .then((d: { analyzed: number; pending: number; engines?: string[] }) => {
          totalDone += d.analyzed;
          (d.engines ?? []).forEach((e) => engines.add(e));
          setAnalyzeProgress({ done: totalDone, total: totalDone + (d.pending - d.analyzed) });
          if (d.analyzed > 0 && d.pending > d.analyzed) return runBatch();
        })
        .catch(() => {});

    runBatch()
      .then(() => loadEmails())
      .finally(() => {
        setAnalyzing(false);
        setAnalyzeProgress(null);
        setAnalyzeResult({ analyzed: totalDone, engines: [...engines] });
        setTimeout(() => setAnalyzeResult(null), 8000);
      });
  }, [loadEmails]);

  const reanalyze = useCallback(async () => {
    const msg = i18n.language === "fr"
      ? "Ré-analyser TOUS les e-mails ? Cela consomme du quota IA (Gemini : 20/jour)."
      : "¿Re-analizar TODOS los correos? Consume cuota de IA (Gemini: 20/día).";
    if (!window.confirm(msg)) return;
    await fetch("/api/inbox/reset-analysis", { method: "POST" });
    analyze();
  }, [analyze, i18n.language]);

  const { activeEmails, snoozedEmails } = useMemo(() => {
    if (!hydrated) return { activeEmails: allEmails, snoozedEmails: [] as EmailCard[] };
    const active: EmailCard[] = [];
    const snoozed: EmailCard[] = [];
    for (const e of allEmails) {
      if (isSnoozed(map, e.id)) snoozed.push(e);
      else active.push(e);
    }
    return { activeEmails: active, snoozedEmails: snoozed };
  }, [allEmails, map, hydrated]);

  const { focus, hydrated: focusHydrated } = useFocusMode();

  const focusEmails = useMemo(
    () => activeEmails.filter((e) => e.type === "Urgente" || e.type === "Cliente"),
    [activeEmails]
  );

  const [digest, setDigest] = useState<{ hiddenCount: number; notable: EmailCard[] } | null>(null);
  const prevFocusRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (!focusHydrated) return;
    const prev = prevFocusRef.current;
    if (prev === true && focus === false) {
      const focusIds = new Set(focusEmails.map((e) => e.id));
      const hidden = activeEmails.filter((e) => !focusIds.has(e.id));
      const notable = hidden
        .filter((e) => e.promise || e.toneWarning || e.type === "Reclamación")
        .slice(0, 2);
      setDigest({ hiddenCount: hidden.length, notable });
    }
    prevFocusRef.current = focus;
  }, [focus, focusHydrated, activeEmails, focusEmails]);

  const filteredEmails = useMemo(() => {
    let base = activeEmails;
    if (focusHydrated && focus) base = focusEmails;
    if (filterMode === "quick") base = base.filter((e) => e.effort === "quick");
    return base;
  }, [activeEmails, focusEmails, focus, focusHydrated, filterMode]);

  const dateFmt = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language === "fr" ? "fr-FR" : "es-ES", {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }),
    [i18n.language]
  );

  return (
    <>
    <AppShell>
      <div className="max-w-6xl mx-auto">
        <PageHeader
          icon={Inbox}
          title={t("bandeja.title")}
          subtitle={t("bandeja.count", { count: activeEmails.length })}
        />

        {analyzing && (
          <div className="mb-6 flex items-center gap-4 rounded-2xl border border-amber-400/40 bg-amber-50 dark:bg-amber-950/30 px-5 py-4">
            <Loader2 className="size-5 text-amber-600 animate-spin shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                {i18n.language === "fr" ? "Analyse IA en cours…" : "Analizando con IA…"}
              </div>
              {analyzeProgress && (
                <>
                  <div className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                    {analyzeProgress.done} / {analyzeProgress.total} {i18n.language === "fr" ? "e-mails analysés" : "correos analizados"}
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-amber-200 dark:bg-amber-900 overflow-hidden">
                    <div
                      className="h-full bg-amber-500 rounded-full transition-all duration-500"
                      style={{ width: `${Math.round((analyzeProgress.done / Math.max(analyzeProgress.total, 1)) * 100)}%` }}
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {analyzeResult && !analyzing && (
          <div className="mb-6 flex items-center gap-3 rounded-2xl border border-ok/40 bg-ok-soft/50 px-5 py-4">
            <Sparkles className="size-5 text-ok shrink-0" />
            <div className="text-sm text-foreground">
              {analyzeResult.analyzed > 0 ? (
                <>
                  <span className="font-semibold">{analyzeResult.analyzed}</span>{" "}
                  {i18n.language === "fr" ? "e-mails analysés avec" : "correos analizados con"}{" "}
                  <span className="font-semibold">
                    {analyzeResult.engines.map((e) => (e.startsWith("gemini") ? "Gemini" : e === "groq" ? "Groq" : e)).join(" + ") || "—"}
                  </span>
                </>
              ) : (
                i18n.language === "fr"
                  ? "Aucun e-mail analysé (les deux IA ont échoué, réessaie dans un moment)"
                  : "Ningún correo analizado (ambas IA fallaron, reinténtalo en un momento)"
              )}
            </div>
          </div>
        )}

        {focusHydrated && focus && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-primary/30 bg-primary/10 px-5 py-4">
            <div className="grid place-items-center size-9 shrink-0 rounded-xl bg-primary text-primary-foreground">
              <Focus className="size-4" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground">{t("focus.bannerTitle")}</div>
              <div className="text-xs text-muted-foreground">{t("focus.bannerSub")}</div>
            </div>
          </div>
        )}

        {digest && !focus && (
          <div className="mb-6 rounded-2xl border border-border bg-card shadow-soft">
            <div className="flex items-start gap-3 px-5 py-4">
              <div className="grid place-items-center size-9 shrink-0 rounded-xl bg-accent text-accent-foreground">
                <Sparkles className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-foreground">
                  {t("focus.digestTitle", { count: digest.hiddenCount })}
                </div>
                <div className="text-xs text-muted-foreground">
                  {digest.notable.length > 0
                    ? t("focus.digestSub", { count: digest.notable.length })
                    : t("focus.digestNone")}
                </div>
                {digest.notable.length > 0 && (
                  <ul className="mt-3 space-y-1.5">
                    {digest.notable.map((e) => (
                      <li key={e.id} className="flex items-center gap-2 text-[13px]">
                        <span className="inline-block size-1.5 rounded-full bg-primary" />
                        <span className="font-medium text-foreground truncate">{e.sender}</span>
                        <span className="text-muted-foreground truncate">— {e.subject}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <button
                type="button"
                onClick={() => setDigest(null)}
                aria-label={t("focus.dismiss")}
                className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>
        )}


        <div className="mb-6 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setFilterMode("all")}
            className={`inline-flex items-center rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors ${
              filterMode === "all"
                ? "bg-primary text-primary-foreground"
                : "bg-accent text-accent-foreground hover:bg-accent/80"
            }`}
          >
            {t("bandeja.showAll")}
          </button>
          <button
            type="button"
            onClick={() => setFilterMode("quick")}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors ${
              filterMode === "quick"
                ? "bg-ok text-ok-foreground"
                : "bg-ok/15 text-ok hover:bg-ok/25"
            }`}
          >
            <Zap className="size-3.5" />
            {t("bandeja.filterFiveMinutes")}
          </button>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={toggleView}
              title={viewMode === "grid" ? "Vista lista" : "Vista tarjetas"}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium bg-accent text-accent-foreground hover:bg-accent/80 transition-colors"
            >
              {viewMode === "grid" ? <List className="size-3.5" /> : <LayoutGrid className="size-3.5" />}
              {viewMode === "grid"
                ? i18n.language === "fr" ? "Liste" : "Lista"
                : i18n.language === "fr" ? "Cartes" : "Tarjetas"}
            </button>
            <button
              type="button"
              onClick={analyze}
              disabled={analyzing || syncing}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-60 transition-colors"
            >
              {analyzing ? <Loader2 className="size-3.5 animate-spin" /> : <Wand2 className="size-3.5" />}
              {analyzing
                ? i18n.language === "fr" ? "Analyse IA…" : "Analizando IA…"
                : i18n.language === "fr" ? "Analyser avec IA" : "Analizar con IA"}
            </button>
            <button
              type="button"
              onClick={reanalyze}
              disabled={analyzing || syncing}
              title={i18n.language === "fr" ? "Ré-analyser tous les e-mails" : "Re-analizar todos los correos"}
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[12px] font-medium bg-amber-500/15 text-amber-700 dark:text-amber-400 hover:bg-amber-500/25 disabled:opacity-60 transition-colors"
            >
              <RefreshCw className="size-3.5" />
              {i18n.language === "fr" ? "Tout" : "Todos"}
            </button>
            <button
              type="button"
              onClick={sync}
              disabled={syncing || analyzing}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
            >
              {syncing ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
              {syncing
                ? i18n.language === "fr" ? "Synchronisation…" : "Sincronizando…"
                : i18n.language === "fr" ? "Synchroniser" : "Sincronizar"}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-border bg-card p-5 shadow-soft">
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-5 w-20 rounded-full bg-muted animate-pulse" />
                  <div className="h-5 w-14 rounded-full bg-muted animate-pulse" />
                </div>
                <div className="h-4 w-32 rounded bg-muted animate-pulse mb-2" />
                <div className="h-3 w-full rounded bg-muted/70 animate-pulse mb-1.5" />
                <div className="h-3 w-3/4 rounded bg-muted/70 animate-pulse mb-4" />
                <div className="h-9 w-full rounded-lg bg-muted animate-pulse" />
              </div>
            ))}
          </div>
        ) : allEmails.length === 0 ? (
          <div className="py-16 flex flex-col items-center text-center gap-3">
            <div className="grid place-items-center size-12 rounded-2xl bg-primary/10 text-primary">
              <Inbox className="size-6" />
            </div>
            {connected === false ? (
              <>
                <p className="text-sm text-muted-foreground max-w-xs">
                  {i18n.language === "fr"
                    ? "Connecte d'abord ta boîte mail pour voir tes e-mails ici."
                    : "Conecta primero tu correo para ver tus mensajes aquí."}
                </p>
                <Link
                  to="/ajustes"
                  className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  {i18n.language === "fr" ? "Connecter mon e-mail" : "Conectar mi correo"}
                </Link>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground max-w-xs">
                  {i18n.language === "fr"
                    ? "Aucun e-mail pour l'instant. Appuie sur Synchroniser pour récupérer ta boîte de réception."
                    : "Aún no hay correos. Pulsa Sincronizar para traer tu bandeja de entrada."}
                </p>
                <button
                  type="button"
                  onClick={sync}
                  disabled={syncing}
                  className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
                >
                  {syncing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                  {i18n.language === "fr" ? "Synchroniser" : "Sincronizar"}
                </button>
              </>
            )}
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredEmails.map((email) => (
              <EmailCardComponent key={email.id} email={email} onReply={setReplyTo} onSnooze={snooze} onOpen={setOpenEmailId} onAction={doSingleAction} onCheck={toggleCheck} isChecked={checkedIds.has(email.id)} onSetType={doSetType} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filteredEmails.map((email) => (
              <EmailRowComponent key={email.id} email={email} onReply={setReplyTo} onSnooze={snooze} onOpen={setOpenEmailId} onAction={doSingleAction} onCheck={toggleCheck} isChecked={checkedIds.has(email.id)} onSetType={doSetType} />
            ))}
          </div>
        )}

        {hydrated && snoozedEmails.length > 0 && (
          <div className="mt-8 rounded-2xl border border-border bg-card shadow-soft">
            <button
              type="button"
              onClick={() => setShowSnoozed((v) => !v)}
              className="flex w-full items-center justify-between gap-3 rounded-2xl px-5 py-4 text-left transition-colors hover:bg-accent/40"
            >
              <div className="flex items-center gap-3">
                <div className="grid place-items-center size-9 rounded-xl bg-accent text-accent-foreground">
                  <MoonStar className="size-4" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-foreground">
                    {t("snooze.snoozedTitle")}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t("snooze.snoozedCount", { count: snoozedEmails.length })}
                  </div>
                </div>
              </div>
              {showSnoozed ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
            </button>
            {showSnoozed && (
              <ul className="divide-y divide-border border-t border-border">
                {snoozedEmails.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-foreground">{e.sender}</div>
                      <div className="truncate text-xs text-muted-foreground">{e.subject}</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-xs text-muted-foreground">
                        {t("snooze.until", { date: dateFmt.format(new Date(map[e.id])) })}
                      </span>
                      <button
                        type="button"
                        onClick={() => unsnooze(e.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
                      >
                        <Undo2 className="size-3.5" />
                        {t("snooze.restore")}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Barra flotante de acciones en lote */}
        {checkedIds.size > 0 && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-2xl border border-border bg-background/95 backdrop-blur shadow-2xl px-4 py-3 animate-fade-in">
            <span className="text-sm font-medium text-foreground mr-2">
              {checkedIds.size} {i18n.language === "fr" ? "sélectionné(s)" : "seleccionado(s)"}
            </span>
            <button
              onClick={() => doAction([...checkedIds], "archive")}
              disabled={bulkLoading}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium bg-accent hover:bg-accent/80 transition-colors disabled:opacity-50"
            >
              <Archive className="size-3.5" />
              {i18n.language === "fr" ? "Archiver" : "Archivar"}
            </button>
            <button
              onClick={() => doAction([...checkedIds], "trash")}
              disabled={bulkLoading}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium bg-danger/10 text-danger hover:bg-danger/20 transition-colors disabled:opacity-50"
            >
              <Trash2 className="size-3.5" />
              {i18n.language === "fr" ? "Corbeille" : "Papelera"}
            </button>
            <button
              onClick={() => doAction([...checkedIds], "spam")}
              disabled={bulkLoading}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium bg-warn/10 text-warn hover:bg-warn/20 transition-colors disabled:opacity-50"
            >
              <ShieldAlert className="size-3.5" />
              Spam
            </button>
            <button onClick={clearChecked} className="ml-1 size-7 rounded-lg grid place-items-center text-muted-foreground hover:bg-accent">
              <X className="size-3.5" />
            </button>
          </div>
        )}

        {replyTo && (
          <ToneComposer
            email={{
              id: replyTo.id,
              threadId: replyTo.threadId,
              to: replyTo.senderEmail,
              sender: replyTo.sender,
              subject: replyTo.subject,
              isHot: replyTo.type === "Reclamación" || !!replyTo.toneWarning,
            }}
            onClose={() => setReplyTo(null)}
          />
        )}
      </div>
    </AppShell>

    {/* Drawer de lectura de correo */}
    <EmailDetail emailId={openEmailId} onClose={() => setOpenEmailId(null)} onAction={() => loadEmails()} />
    </>
  );
}

export const Route = createFileRoute("/bandeja")({
  head: () => ({ meta: [{ title: "Bandeja · AI Inbox Assistant" }] }),
  component: BandejaPage,
});
