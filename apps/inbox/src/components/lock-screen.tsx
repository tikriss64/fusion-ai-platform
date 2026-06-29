import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Sparkles, Lock, ArrowRight, Sun, Moon, ShieldAlert } from "lucide-react";

const SESSION_KEY = "lovable.lockscreen.unlocked.v1";
const TIMEOUT_KEY = "lovable.lockscreen.timeoutMin.v1";

// Allowed values in minutes. 0 = never.
export const LOCK_TIMEOUT_OPTIONS = [5, 15, 30, 60, 0] as const;
export type LockTimeoutMinutes = (typeof LOCK_TIMEOUT_OPTIONS)[number];
export const DEFAULT_LOCK_TIMEOUT: LockTimeoutMinutes = 15;
const WARNING_SECONDS = 30;

export function readLockTimeout(): LockTimeoutMinutes {
  try {
    const raw = localStorage.getItem(TIMEOUT_KEY);
    const n = raw == null ? NaN : Number(raw);
    if ((LOCK_TIMEOUT_OPTIONS as readonly number[]).includes(n)) {
      return n as LockTimeoutMinutes;
    }
  } catch {}
  return DEFAULT_LOCK_TIMEOUT;
}

export function writeLockTimeout(minutes: LockTimeoutMinutes) {
  try {
    localStorage.setItem(TIMEOUT_KEY, String(minutes));
  } catch {}
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("lovable:lock-timeout-change"));
  }
}

function useLockTheme() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    const stored = (typeof localStorage !== "undefined" && localStorage.getItem("theme")) as
      | "light"
      | "dark"
      | null;
    const initial = stored ?? "dark";
    setTheme(initial);
    document.documentElement.classList.toggle("dark", initial === "dark");
  }, []);
  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    try {
      localStorage.setItem("theme", next);
    } catch {}
  };
  return { theme, toggle };
}

export function LockScreenGate({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    try {
      setUnlocked(sessionStorage.getItem(SESSION_KEY) === "1");
    } catch {}
    setHydrated(true);
  }, []);

  const lock = () => {
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {}
    setUnlocked(false);
  };

  if (!hydrated) {
    return <>{children}</>;
  }

  if (unlocked) {
    return (
      <>
        <InactivityWatcher onLock={lock} />
        {children}
      </>
    );
  }

  return (
    <LockScreen
      onUnlock={() => {
        try {
          sessionStorage.setItem(SESSION_KEY, "1");
        } catch {}
        setUnlocked(true);
      }}
    />
  );
}

function InactivityWatcher({ onLock }: { onLock: () => void }) {
  const { t } = useTranslation();
  const [timeoutMin, setTimeoutMin] = useState<LockTimeoutMinutes>(DEFAULT_LOCK_TIMEOUT);
  const [warningLeft, setWarningLeft] = useState<number | null>(null);
  const lastActivity = useRef<number>(Date.now());
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setTimeoutMin(readLockTimeout());
    const onChange = () => setTimeoutMin(readLockTimeout());
    window.addEventListener("lovable:lock-timeout-change", onChange);
    return () => window.removeEventListener("lovable:lock-timeout-change", onChange);
  }, []);

  useEffect(() => {
    if (timeoutMin === 0) {
      setWarningLeft(null);
      return;
    }

    const reset = () => {
      lastActivity.current = Date.now();
      setWarningLeft((prev) => (prev !== null ? null : prev));
    };
    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "wheel"];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));

    const totalMs = timeoutMin * 60 * 1000;
    const warnMs = WARNING_SECONDS * 1000;

    tickRef.current = setInterval(() => {
      const elapsed = Date.now() - lastActivity.current;
      if (elapsed >= totalMs) {
        setWarningLeft(null);
        onLock();
        return;
      }
      const remaining = totalMs - elapsed;
      if (remaining <= warnMs) {
        setWarningLeft(Math.max(1, Math.ceil(remaining / 1000)));
      } else {
        setWarningLeft((prev) => (prev !== null ? null : prev));
      }
    }, 1000);

    return () => {
      events.forEach((e) => window.removeEventListener(e, reset));
      if (tickRef.current) clearInterval(tickRef.current);
      tickRef.current = null;
    };
  }, [timeoutMin, onLock]);

  if (warningLeft === null) return null;

  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 animate-fade-in">
      <div className="flex items-center gap-3 rounded-full border border-warn/40 bg-warn-soft/90 backdrop-blur px-4 py-2 shadow-soft text-sm text-foreground">
        <ShieldAlert className="size-4 text-warn shrink-0" />
        <span>{t("lock.inactivityWarning", { seconds: warningLeft })}</span>
      </div>
    </div>
  );
}

function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const { t } = useTranslation();
  const { theme, toggle } = useLockTheme();
  const [pin, setPin] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.trim().length === 0) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pin }),
      });
      if (res.ok) {
        onUnlock();
      } else {
        const data = await res.json() as { error?: string };
        setError(data.error ?? t("lock.errorWrong"));
        setPin("");
      }
    } catch {
      setError(t("lock.errorNetwork"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-background text-foreground relative overflow-hidden grid place-items-center px-4">
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 0%, color-mix(in oklab, var(--primary) 18%, transparent), transparent 60%), radial-gradient(40% 40% at 100% 100%, color-mix(in oklab, var(--accent) 14%, transparent), transparent 60%)",
        }}
      />

      <button
        onClick={toggle}
        aria-label={t("shell.themeToggle")}
        className="absolute top-5 right-5 size-9 rounded-full border border-border bg-card/60 hover:bg-accent grid place-items-center transition-colors"
      >
        {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </button>

      <div className="relative w-full max-w-sm animate-fade-in">
        <div className="rounded-3xl border border-border bg-card/80 backdrop-blur-xl shadow-soft p-8">
          <div className="flex flex-col items-center text-center">
            <div className="size-14 rounded-2xl bg-primary text-primary-foreground grid place-items-center shadow-soft">
              <Sparkles className="size-7" />
            </div>
            <h1 className="mt-5 text-2xl font-semibold tracking-tight">
              {t("lock.appName")}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              {t("lock.welcome")}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="mt-7 space-y-3">
            <label className="block">
              <span className="sr-only">{t("lock.pinLabel")}</span>
              <div className="relative">
                <Lock className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="password"
                  inputMode="numeric"
                  autoFocus
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder={t("lock.placeholder")}
                  className="w-full h-12 rounded-xl border border-border bg-background pl-10 pr-12 text-base tracking-widest focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition"
                />
                <button
                  type="submit"
                  disabled={pin.trim().length === 0 || submitting}
                  aria-label={t("lock.unlock")}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 size-9 rounded-lg bg-primary text-primary-foreground grid place-items-center disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition"
                >
                  <ArrowRight className="size-4" />
                </button>
              </div>
            </label>
            {error && (
              <p className="text-[11px] text-destructive text-center">{error}</p>
            )}
            <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
              {t("lock.hint")}
            </p>
          </form>
        </div>

        <p className="mt-5 text-center text-[11px] text-muted-foreground">
          {t("lock.footer")}
        </p>
      </div>
    </div>
  );
}
