import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Shield,
  KeyRound,
  RefreshCw,
  Timer,
  AlertTriangle,
  Palette,
  Globe,
  Sun,
  Moon,
  Monitor,
  Lock,
  Mail,
  Check,
  Copy,
  Eye,
  EyeOff,
  Plug,
} from "lucide-react";
import {
  LOCK_TIMEOUT_OPTIONS,
  readLockTimeout,
  writeLockTimeout,
  type LockTimeoutMinutes,
} from "@/components/lock-screen";
import { ConnectionsSection } from "@/components/connections-section";

export const Route = createFileRoute("/ajustes")({
  head: () => ({
    meta: [
      { title: "Ajustes · AI Inbox Assistant" },
      { name: "description", content: "Configuración de seguridad, apariencia y privacidad." },
    ],
  }),
  component: AjustesPage,
});

const PIN_KEY = "lovable.lockscreen.pin.v1";
const RECOVERY_KEY = "lovable.lockscreen.recovery.v1";
const THEME_MODE_KEY = "lovable.theme.mode.v1"; // 'light' | 'dark' | 'auto'

type ThemeMode = "light" | "dark" | "auto";

function genRecoveryCode() {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const groups = 4;
  const len = 4;
  const out: string[] = [];
  const buf = new Uint32Array(groups * len);
  crypto.getRandomValues(buf);
  for (let g = 0; g < groups; g++) {
    let s = "";
    for (let i = 0; i < len; i++) s += alphabet[buf[g * len + i] % alphabet.length];
    out.push(s);
  }
  return out.join("-");
}

function Section({
  icon: Icon,
  title,
  desc,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card shadow-soft">
      <header className="flex items-start gap-3 px-6 py-5 border-b border-border">
        <div className="size-9 rounded-xl bg-primary/10 text-primary grid place-items-center shrink-0">
          <Icon className="size-4" />
        </div>
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {desc ? <p className="text-xs text-muted-foreground mt-0.5">{desc}</p> : null}
        </div>
      </header>
      <div className="p-6 space-y-5">{children}</div>
    </section>
  );
}

function Row({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 sm:pr-6">
        <div className="text-sm font-medium">{title}</div>
        {desc ? <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{desc}</p> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function AjustesPage() {
  const { t, i18n } = useTranslation();
  const currentLang = (i18n.resolvedLanguage || i18n.language || "es").slice(0, 2);

  // ---------- Seguridad: PIN ----------
  const [pinOld, setPinOld] = useState("");
  const [pinNew, setPinNew] = useState("");
  const [pinNew2, setPinNew2] = useState("");
  const [pinMsg, setPinMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [hasPin, setHasPin] = useState(false);

  useEffect(() => {
    fetch("/api/auth/has-password")
      .then((r) => r.json())
      .then((d: { hasCustom: boolean }) => setHasPin(!!d.hasCustom))
      .catch(() => {});
  }, []);

  const savePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinMsg(null);
    if (pinNew.length < 4) {
      setPinMsg({ kind: "err", text: t("ajustes.security.pin.errShort") });
      return;
    }
    if (pinNew !== pinNew2) {
      setPinMsg({ kind: "err", text: t("ajustes.security.pin.errMatch") });
      return;
    }
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldPassword: pinOld, newPassword: pinNew }),
      });
      const d = (await res.json()) as { ok: boolean; error?: string };
      if (d.ok) {
        setHasPin(true);
        setPinOld("");
        setPinNew("");
        setPinNew2("");
        setPinMsg({ kind: "ok", text: t("ajustes.security.pin.ok") });
      } else if (d.error === "wrong_old") {
        setPinMsg({ kind: "err", text: t("ajustes.security.pin.errOld") });
      } else if (d.error === "too_short") {
        setPinMsg({ kind: "err", text: t("ajustes.security.pin.errShort") });
      } else {
        setPinMsg({ kind: "err", text: t("ajustes.security.pin.errGeneric") });
      }
    } catch {
      setPinMsg({ kind: "err", text: t("ajustes.security.pin.errGeneric") });
    }
  };

  // ---------- Seguridad: código de recuperación ----------
  const [recovery, setRecovery] = useState<string>("");
  const [recoveryVisible, setRecoveryVisible] = useState(false);
  const [recoveryCopied, setRecoveryCopied] = useState(false);

  const regenRecovery = async () => {
    try {
      const res = await fetch("/api/auth/recovery", { method: "POST" });
      const d = (await res.json()) as { code?: string };
      if (d.code) {
        setRecovery(d.code);
        setRecoveryVisible(true);
        setRecoveryCopied(false);
      }
    } catch {}
  };

  const copyRecovery = async () => {
    try {
      await navigator.clipboard.writeText(recovery);
      setRecoveryCopied(true);
      setTimeout(() => setRecoveryCopied(false), 1800);
    } catch {}
  };

  // ---------- Seguridad: tiempo bloqueo ----------
  const [lockTimeout, setLockTimeout] = useState<LockTimeoutMinutes>(15);
  useEffect(() => setLockTimeout(readLockTimeout()), []);
  const onLockTimeoutChange = (v: LockTimeoutMinutes) => {
    setLockTimeout(v);
    writeLockTimeout(v);
  };
  const lockLabel = (m: LockTimeoutMinutes) => {
    if (m === 0) return t("settings.lock.never");
    if (m < 60) return t("settings.lock.minutes", { count: m });
    return t("settings.lock.hours", { count: m / 60 });
  };

  // ---------- Seguridad: reset app ----------
  const [resetConfirming, setResetConfirming] = useState(false);
  const [resetDone, setResetDone] = useState(false);

  const doReset = () => {
    try {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("lovable.")) keys.push(k);
      }
      keys.forEach((k) => localStorage.removeItem(k));
      try {
        sessionStorage.clear();
      } catch {}
    } catch {}
    setResetDone(true);
    setResetConfirming(false);
    setTimeout(() => {
      if (typeof window !== "undefined") window.location.reload();
    }, 900);
  };

  // ---------- Apariencia: idioma ----------
  const changeLang = (next: "es" | "fr") => {
    i18n.changeLanguage(next);
    try {
      localStorage.setItem("lang", next);
    } catch {}
  };

  // ---------- Apariencia: tema ----------
  const [themeMode, setThemeMode] = useState<ThemeMode>("dark");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(THEME_MODE_KEY) as ThemeMode | null;
      if (stored === "light" || stored === "dark" || stored === "auto") {
        setThemeMode(stored);
        return;
      }
      // Dark-first: si no hay preferencia explícita de "claro", se considera oscuro.
      const t = localStorage.getItem("theme");
      setThemeMode(t === "light" ? "light" : "dark");
    } catch {}
  }, []);

  const applyThemeMode = (mode: ThemeMode) => {
    setThemeMode(mode);
    try {
      localStorage.setItem(THEME_MODE_KEY, mode);
    } catch {}
    const isDark =
      mode === "dark" ||
      (mode === "auto" &&
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", isDark);
    try {
      localStorage.setItem("theme", isDark ? "dark" : "light");
    } catch {}
  };

  const themeOptions = useMemo(
    () =>
      [
        { id: "light" as const, icon: Sun, label: t("ajustes.appearance.theme.light") },
        { id: "dark" as const, icon: Moon, label: t("ajustes.appearance.theme.dark") },
        { id: "auto" as const, icon: Monitor, label: t("ajustes.appearance.theme.auto") },
      ],
    [t],
  );

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto space-y-8">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">{t("ajustes.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("ajustes.subtitle")}</p>
        </header>

        {/* CONEXIONES */}
        <Section
          icon={Plug}
          title={t("conexiones.title")}
          desc={t("conexiones.desc")}
        >
          <ConnectionsSection />
        </Section>

        {/* SEGURIDAD */}
        <Section
          icon={Shield}
          title={t("ajustes.security.title")}
          desc={t("ajustes.security.desc")}
        >
          {/* Cambiar PIN */}
          <Row title={t("ajustes.security.pin.title")} desc={t("ajustes.security.pin.desc")}>
            <span className="text-xs text-muted-foreground">
              {hasPin ? t("ajustes.security.pin.statusSet") : t("ajustes.security.pin.statusUnset")}
            </span>
          </Row>
          <form onSubmit={savePin} className="grid sm:grid-cols-3 gap-3">
            <input
              type="password"
              placeholder={t("ajustes.security.pin.oldPlaceholder")}
              value={pinOld}
              onChange={(e) => setPinOld(e.target.value)}
              className="h-10 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <input
              type="password"
              inputMode="numeric"
              placeholder={t("ajustes.security.pin.newPlaceholder")}
              value={pinNew}
              onChange={(e) => setPinNew(e.target.value)}
              className="h-10 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <input
              type="password"
              inputMode="numeric"
              placeholder={t("ajustes.security.pin.confirmPlaceholder")}
              value={pinNew2}
              onChange={(e) => setPinNew2(e.target.value)}
              className="h-10 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <div className="sm:col-span-3 flex items-center justify-between gap-3">
              <div className="text-xs">
                {pinMsg ? (
                  <span
                    className={
                      pinMsg.kind === "ok" ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
                    }
                  >
                    {pinMsg.text}
                  </span>
                ) : null}
              </div>
              <button
                type="submit"
                className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition"
              >
                <KeyRound className="size-4" />
                {t("ajustes.security.pin.save")}
              </button>
            </div>
          </form>

          <p className="flex items-start gap-2 text-[11px] text-muted-foreground">
            <Lock className="size-3.5 shrink-0 mt-0.5" />
            {i18n.language === "fr"
              ? "Ton mot de passe d'origine (celui du serveur) reste toujours valable comme secours : impossible de te retrouver bloqué dehors."
              : "Tu contraseña original (la del servidor) sigue siendo válida siempre como respaldo: es imposible quedarte fuera."}
          </p>

          <div className="h-px bg-border" />

          {/* Código recuperación */}
          <Row
            title={t("ajustes.security.recovery.title")}
            desc={t("ajustes.security.recovery.desc")}
          >
            <button
              onClick={regenRecovery}
              className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-border hover:bg-accent text-xs font-medium transition"
            >
              <RefreshCw className="size-3.5" />
              {t("ajustes.security.recovery.regen")}
            </button>
          </Row>
          {recovery ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
                <Lock className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <code className="flex-1 font-mono text-sm tracking-widest select-all">
                  {recoveryVisible ? recovery : "••••-••••-••••-••••"}
                </code>
                <button
                  onClick={() => setRecoveryVisible((v) => !v)}
                  className="size-8 rounded-md hover:bg-accent grid place-items-center transition"
                  aria-label={recoveryVisible ? t("ajustes.security.recovery.hide") : t("ajustes.security.recovery.show")}
                >
                  {recoveryVisible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
                <button
                  onClick={copyRecovery}
                  className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md hover:bg-accent text-xs font-medium transition"
                >
                  {recoveryCopied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                  {recoveryCopied ? t("ajustes.security.recovery.copied") : t("ajustes.security.recovery.copy")}
                </button>
              </div>
              <p className="text-[11px] text-amber-600 dark:text-amber-400">
                {i18n.language === "fr"
                  ? "⚠️ Note ce code maintenant : pour ta sécurité, il ne sera plus affiché ensuite."
                  : "⚠️ Apunta este código ahora: por seguridad, no se volverá a mostrar después."}
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-xl border border-dashed border-border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
              <Lock className="size-4 shrink-0" />
              {i18n.language === "fr"
                ? "Aucun code généré. Appuie sur « Générer » pour en créer un et le sauvegarder."
                : "No hay código generado. Pulsa «Generar» para crear uno y guardarlo."}
            </div>
          )}

          <div className="h-px bg-border" />

          {/* Bloqueo automático */}
          <Row title={t("settings.lock.title")} desc={t("settings.lock.desc")}>
            <div className="flex flex-wrap gap-1.5">
              {LOCK_TIMEOUT_OPTIONS.map((opt) => {
                const active = opt === lockTimeout;
                return (
                  <button
                    key={opt}
                    onClick={() => onLockTimeoutChange(opt)}
                    className={[
                      "inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border text-xs font-medium transition",
                      active
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border hover:bg-accent text-muted-foreground hover:text-foreground",
                    ].join(" ")}
                  >
                    {active ? <Check className="size-3.5 text-primary" /> : <Timer className="size-3.5" />}
                    {lockLabel(opt)}
                  </button>
                );
              })}
            </div>
          </Row>

          <div className="h-px bg-border" />

          {/* Reset */}
          <Row title={t("ajustes.security.reset.title")} desc={t("ajustes.security.reset.desc")}>
            {!resetConfirming && !resetDone ? (
              <button
                onClick={() => setResetConfirming(true)}
                className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-destructive/40 text-destructive hover:bg-destructive/10 text-xs font-medium transition"
              >
                <AlertTriangle className="size-3.5" />
                {t("ajustes.security.reset.action")}
              </button>
            ) : null}
            {resetDone ? (
              <span className="text-xs text-emerald-600 dark:text-emerald-400">
                {t("ajustes.security.reset.done")}
              </span>
            ) : null}
          </Row>
          {resetConfirming ? (
            <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 space-y-3">
              <div className="flex items-start gap-3">
                <AlertTriangle className="size-4 text-destructive shrink-0 mt-0.5" />
                <p className="text-xs text-foreground leading-relaxed">
                  {t("ajustes.security.reset.confirmText")}
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setResetConfirming(false)}
                  className="h-9 px-3 rounded-lg border border-border hover:bg-accent text-xs font-medium transition"
                >
                  {t("ajustes.security.reset.cancel")}
                </button>
                <button
                  onClick={doReset}
                  className="h-9 px-3 rounded-lg bg-destructive text-destructive-foreground hover:opacity-90 text-xs font-medium transition"
                >
                  {t("ajustes.security.reset.confirm")}
                </button>
              </div>
            </div>
          ) : null}
        </Section>

        {/* APARIENCIA */}
        <Section
          icon={Palette}
          title={t("ajustes.appearance.title")}
          desc={t("ajustes.appearance.desc")}
        >
          <Row title={t("ajustes.appearance.lang.title")} desc={t("ajustes.appearance.lang.desc")}>
            <div className="flex gap-1.5">
              {(["es", "fr"] as const).map((l) => {
                const active = currentLang === l;
                return (
                  <button
                    key={l}
                    onClick={() => changeLang(l)}
                    className={[
                      "inline-flex items-center gap-2 h-9 px-3 rounded-lg border text-xs font-semibold transition",
                      active
                        ? "border-primary bg-primary/10"
                        : "border-border hover:bg-accent text-muted-foreground hover:text-foreground",
                    ].join(" ")}
                  >
                    <span aria-hidden>{l === "es" ? "🇪🇸" : "🇫🇷"}</span>
                    <span className="uppercase">{l}</span>
                    {active ? <Check className="size-3.5 text-primary" /> : null}
                  </button>
                );
              })}
            </div>
          </Row>

          <div className="h-px bg-border" />

          <Row title={t("ajustes.appearance.theme.title")} desc={t("ajustes.appearance.theme.desc")}>
            <div className="flex gap-1.5">
              {themeOptions.map(({ id, icon: Icon, label }) => {
                const active = themeMode === id;
                return (
                  <button
                    key={id}
                    onClick={() => applyThemeMode(id)}
                    className={[
                      "inline-flex items-center gap-2 h-9 px-3 rounded-lg border text-xs font-medium transition",
                      active
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border hover:bg-accent text-muted-foreground hover:text-foreground",
                    ].join(" ")}
                  >
                    <Icon className="size-3.5" />
                    {label}
                  </button>
                );
              })}
            </div>
          </Row>

          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Globe className="size-3.5" />
            {t("ajustes.appearance.note")}
          </div>
        </Section>

        {/* PRIVACIDAD */}
        <Section
          icon={Lock}
          title={t("ajustes.privacy.title")}
          desc={t("ajustes.privacy.desc")}
        >
          <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm leading-relaxed text-foreground">
            {t("ajustes.privacy.body")}
          </div>
          <ul className="text-xs text-muted-foreground space-y-1.5 list-disc pl-5">
            <li>{t("ajustes.privacy.bullet1")}</li>
            <li>{t("ajustes.privacy.bullet2")}</li>
            <li>{t("ajustes.privacy.bullet3")}</li>
          </ul>
        </Section>

      </div>
    </AppShell>
  );
}
