import { apiFetch } from "@/components/inbox/api-client";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Sparkles,
  Zap,
  Mail,
  ExternalLink,
  Loader2,
  CheckCircle2,
  CircleDashed,
  AlertTriangle,
  Plus,
  BrainCircuit,
  RefreshCw,
} from "lucide-react";

type MailState = { provider: "gmail" | "outlook"; email: string } | null;

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span className="relative inline-grid place-items-center size-4" aria-hidden>
      <span
        className={`rounded-full size-2.5 ${
          ok
            ? "bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.22)]"
            : "bg-muted-foreground/40"
        }`}
      />
    </span>
  );
}

function GmailLogo({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path fill="#4285F4" d="M22 6.5v11A2.5 2.5 0 0 1 19.5 20H18V9.3l-6 4.5-6-4.5V20H4.5A2.5 2.5 0 0 1 2 17.5v-11l2 1.5 8 6 8-6 2-1.5Z" />
      <path fill="#EA4335" d="M2 6.5 4 5h2v4.3L2 6.5Z" />
      <path fill="#34A853" d="M18 9.3V5h2l2 1.5-4 2.8Z" />
      <path fill="#FBBC04" d="M6 5h12v4.3l-6 4.5-6-4.5V5Z" />
    </svg>
  );
}
function OutlookLogo({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <rect x="2" y="5" width="13" height="14" rx="1.5" fill="#0078D4" />
      <text x="8.5" y="15.5" textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif" fontWeight="700" fontSize="9" fill="#ffffff">O</text>
      <path fill="#50D9FF" d="M15 8.5 22 7v10l-7-1.5v-7Z" />
      <path fill="#28A8EA" d="M15 8.5 22 7v1.2l-7 2.3v-2Z" />
    </svg>
  );
}

// Fila de proveedor de IA: muestra el estado REAL (clave configurada en el servidor),
// no un input en el navegador. Las claves se ponen como Workers Secrets en el servidor.
function ProviderStatusRow({
  name,
  description,
  icon: Icon,
  accentClass,
  helpUrl,
  helpLabel,
  configured,
  loading,
}: {
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  accentClass: string;
  helpUrl: string;
  helpLabel: string;
  configured: boolean;
  loading: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="rounded-xl border border-border bg-card/60 p-4 flex items-center gap-3">
      <div className={`size-9 rounded-lg grid place-items-center shrink-0 ${accentClass}`}>
        <Icon className="size-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold truncate">{name}</h3>
          {loading ? (
            <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
          ) : (
            <StatusDot ok={configured} />
          )}
          <span className={`text-[11px] font-medium ${configured ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
            {loading ? "…" : configured ? t("conexiones.status.ok") : t("conexiones.status.idle")}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        <a
          href={helpUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline mt-1"
        >
          {helpLabel}
          <ExternalLink className="size-3" />
        </a>
      </div>
    </div>
  );
}

function MailRow() {
  const { t, i18n } = useTranslation();
  const fr = i18n.language === "fr";
  const [mail, setMail] = useState<MailState>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    apiFetch("/api/gmail/status")
      .then((r) => r.json())
      .then((d: { connected: boolean; provider?: string; email?: string }) => {
        setMail(d.connected ? { provider: (d.provider as "gmail" | "outlook") ?? "gmail", email: d.email ?? "" } : null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const connectGmail = () => { window.location.href = "/api/gmail/start"; };
  const disconnect = async () => {
    try { await apiFetch("/api/gmail/disconnect", { method: "POST" }); } catch {}
    setMail(null);
    window.dispatchEvent(new CustomEvent("lovable:connections-change"));
  };

  const soon = fr ? "bientôt" : "próximamente";

  // Botones para añadir cuenta (Gmail activo; Outlook/Yahoo preparados para multicuenta)
  const addButtons = (
    <div className="flex flex-col sm:flex-row gap-2">
      <button
        onClick={connectGmail}
        className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl border border-border bg-background hover:bg-accent text-sm font-medium transition"
      >
        <GmailLogo /> Gmail
      </button>
      <button disabled title={soon} className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl border border-border bg-background text-sm font-medium opacity-50 cursor-not-allowed">
        <OutlookLogo /> Outlook · {soon}
      </button>
      <button disabled title={soon} className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl border border-border bg-background text-sm font-medium opacity-50 cursor-not-allowed">
        <span className="grid place-items-center size-5 rounded bg-[#6001D2] text-white text-[10px] font-bold">Y</span>
        Yahoo · {soon}
      </button>
    </div>
  );

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card/60 p-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> …
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Cuentas conectadas (multicuenta: por ahora una) */}
      {mail && (
        <div className="rounded-xl border border-border bg-card/60 p-4">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-full bg-gradient-to-br from-primary to-accent grid place-items-center text-primary-foreground shadow-soft shrink-0">
              {mail.provider === "gmail" ? <GmailLogo className="size-5" /> : <OutlookLogo className="size-5" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium truncate">{mail.email}</span>
                <StatusDot ok />
              </div>
              <div className="text-[11px] text-muted-foreground">
                {t("conexiones.mail.connectedVia", { provider: mail.provider === "gmail" ? "Gmail" : "Outlook" })}
              </div>
            </div>
            <button onClick={disconnect} className="h-9 px-3 rounded-lg border border-border hover:bg-accent text-xs font-medium transition">
              {t("conexiones.mail.disconnect")}
            </button>
          </div>
        </div>
      )}

      {/* Sin cuentas: prompt de bienvenida */}
      {!mail && (
        <div className="rounded-xl border border-dashed border-border bg-card/40 p-5 text-center space-y-3">
          <div>
            <h3 className="text-sm font-semibold">{t("conexiones.mail.bigTitle")}</h3>
            <p className="text-xs text-muted-foreground mt-1">{t("conexiones.mail.bigDesc")}</p>
          </div>
          {addButtons}
          <p className="text-[11px] text-muted-foreground">{t("conexiones.mail.note")}</p>
        </div>
      )}

      {/* Añadir otra cuenta (multicuenta) */}
      {mail && (
        <div>
          {adding ? (
            <div className="rounded-xl border border-border bg-card/40 p-4 space-y-3">
              {addButtons}
              <p className="text-[11px] text-muted-foreground">
                {fr ? "La gestion de plusieurs comptes arrive bientôt." : "La gestión de varias cuentas llegará pronto."}
              </p>
            </div>
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
            >
              <Plus className="size-3.5" />
              {fr ? "Ajouter un autre compte" : "Añadir otra cuenta"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Panel del "cerebro de memoria": muestra cuántos correos están indexados en la
// memoria semántica (Vectorize) y permite indexar el histórico pendiente a mano.
function MemoryRow() {
  const { i18n } = useTranslation();
  const fr = i18n.language === "fr";
  const [stats, setStats] = useState<{ total: number; embedded: number; enabled: boolean } | null>(null);
  const [working, setWorking] = useState(false);

  const load = () => {
    apiFetch("/api/memory/stats")
      .then((r) => r.json())
      .then((d: { total: number; embedded: number; enabled: boolean }) => setStats(d))
      .catch(() => setStats({ total: 0, embedded: 0, enabled: false }));
  };
  useEffect(load, []);

  const backfill = async () => {
    setWorking(true);
    try {
      await apiFetch("/api/memory/backfill", { method: "POST" });
    } catch {}
    load();
    setWorking(false);
  };

  const loading = stats === null;
  const enabled = !!stats?.enabled;
  const pending = stats ? Math.max(0, stats.total - stats.embedded) : 0;

  return (
    <div className="rounded-xl border border-border bg-card/60 p-4">
      <div className="flex items-center gap-3">
        <div className="size-9 rounded-lg grid place-items-center shrink-0 bg-violet-500/15 text-violet-600 dark:text-violet-400">
          <BrainCircuit className="size-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold truncate">
              {fr ? "Cerveau de mémoire" : "Cerebro de memoria"}
            </h3>
            {loading ? (
              <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
            ) : (
              <StatusDot ok={enabled} />
            )}
            <span className={`text-[11px] font-medium ${enabled ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
              {loading ? "…" : enabled ? (fr ? "actif" : "activo") : (fr ? "indisponible" : "no disponible")}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {fr
              ? "L'IA se souvient de l'historique avec chaque contact pour rédiger des réponses cohérentes."
              : "La IA recuerda el historial con cada contacto para redactar respuestas coherentes."}
          </p>
          {!loading && enabled && (
            <p className="text-[11px] text-muted-foreground mt-1">
              {fr
                ? `${stats!.embedded} e-mails en mémoire${pending > 0 ? ` · ${pending} à indexer` : ""}`
                : `${stats!.embedded} correos en memoria${pending > 0 ? ` · ${pending} por indexar` : ""}`}
            </p>
          )}
        </div>
        {enabled && (
          <button
            onClick={backfill}
            disabled={working}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border hover:bg-accent text-xs font-medium transition disabled:opacity-60 shrink-0"
          >
            <RefreshCw className={`size-3.5 ${working ? "animate-spin" : ""}`} />
            {working ? (fr ? "Indexation…" : "Indexando…") : (fr ? "Indexer" : "Indexar")}
          </button>
        )}
      </div>
    </div>
  );
}

export function ConnectionsSection() {
  const { t, i18n } = useTranslation();
  const [status, setStatus] = useState<{ gemini: boolean; groq: boolean } | null>(null);

  useEffect(() => {
    apiFetch("/api/ai/status")
      .then((r) => r.json())
      .then((d: { gemini: boolean; groq: boolean }) => setStatus(d))
      .catch(() => setStatus({ gemini: false, groq: false }));
  }, []);

  const loading = status === null;
  const allOk = !!status?.gemini; // Gemini es el motor principal
  const summaryTone = loading ? "warn" : allOk ? "ok" : "warn";

  return (
    <div className="space-y-5">
      {/* Estado general */}
      <div
        className={[
          "flex items-center gap-3 rounded-xl border px-4 py-3",
          summaryTone === "ok" ? "border-emerald-500/30 bg-emerald-500/10" : "border-warn/30 bg-warn-soft/60",
        ].join(" ")}
      >
        {summaryTone === "ok" ? (
          <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
        ) : (
          <CircleDashed className="size-5 text-warn shrink-0" />
        )}
        <span className="text-sm font-medium">
          {loading
            ? "…"
            : allOk
              ? (i18n.language === "fr" ? "IA configurée et prête" : "IA configurada y lista")
              : (i18n.language === "fr" ? "Configure tes clés IA sur le serveur" : "Configura tus claves de IA en el servidor")}
        </span>
      </div>

      {/* IA */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="size-3.5 text-muted-foreground" />
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("conexiones.ai.title")}</h3>
        </div>
        <ProviderStatusRow
          name={t("conexiones.ai.gemini.name")}
          description={t("conexiones.ai.gemini.desc")}
          icon={Sparkles}
          accentClass="bg-primary/10 text-primary"
          helpUrl="https://aistudio.google.com/app/apikey"
          helpLabel={t("conexiones.ai.gemini.help")}
          configured={!!status?.gemini}
          loading={loading}
        />
        <ProviderStatusRow
          name={t("conexiones.ai.groq.name")}
          description={t("conexiones.ai.groq.desc")}
          icon={Zap}
          accentClass="bg-amber-500/15 text-amber-600 dark:text-amber-400"
          helpUrl="https://console.groq.com/keys"
          helpLabel={t("conexiones.ai.groq.help")}
          configured={!!status?.groq}
          loading={loading}
        />
        <MemoryRow />
      </div>

      {/* Correo */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Mail className="size-3.5 text-muted-foreground" />
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("conexiones.mail.title")}</h3>
        </div>
        <MailRow />
      </div>

      <div className="flex items-start gap-2 text-[11px] text-muted-foreground">
        <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
        <span>
          {i18n.language === "fr"
            ? "Les clés IA sont configurées comme secrets sur le serveur Cloudflare (jamais dans le navigateur)."
            : "Las claves de IA se configuran como secretos en el servidor de Cloudflare (nunca en el navegador)."}
        </span>
      </div>
    </div>
  );
}
