import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { Settings, Check, Timer, SlidersHorizontal } from "lucide-react";
import {
  LOCK_TIMEOUT_OPTIONS,
  readLockTimeout,
  writeLockTimeout,
  type LockTimeoutMinutes,
} from "./lock-screen";

export function SettingsMenu() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [timeout, setTimeoutValue] = useState<LockTimeoutMinutes>(15);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTimeoutValue(readLockTimeout());
  }, []);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const select = (val: LockTimeoutMinutes) => {
    setTimeoutValue(val);
    writeLockTimeout(val);
  };

  const labelFor = (m: LockTimeoutMinutes) => {
    if (m === 0) return t("settings.lock.never");
    if (m < 60) return t("settings.lock.minutes", { count: m });
    return t("settings.lock.hours", { count: m / 60 });
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={t("settings.label")}
        aria-haspopup="menu"
        aria-expanded={open}
        className="size-9 rounded-full border border-border hover:bg-accent grid place-items-center transition-colors"
      >
        <Settings className="size-4" />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-72 rounded-2xl border border-border bg-popover text-popover-foreground shadow-soft p-4 z-50 animate-fade-in"
        >
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
            <Timer className="size-3.5" />
            <span>{t("settings.lock.title")}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
            {t("settings.lock.desc")}
          </p>

          <div className="mt-3 space-y-1">
            {LOCK_TIMEOUT_OPTIONS.map((opt) => {
              const active = opt === timeout;
              return (
                <button
                  key={opt}
                  onClick={() => select(opt)}
                  role="menuitemradio"
                  aria-checked={active}
                  className={[
                    "w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors",
                    active
                      ? "bg-primary/10 text-foreground font-medium"
                      : "hover:bg-accent text-muted-foreground hover:text-foreground",
                  ].join(" ")}
                >
                  <span>{labelFor(opt)}</span>
                  {active ? <Check className="size-4 text-primary" /> : null}
                </button>
              );
            })}
          </div>

          <div className="mt-3 pt-3 border-t border-border">
            <Link
              to="/ajustes"
              onClick={() => setOpen(false)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm hover:bg-accent text-foreground transition-colors"
            >
              <span className="flex items-center gap-2">
                <SlidersHorizontal className="size-3.5 text-muted-foreground" />
                {t("settings.openFull")}
              </span>
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
