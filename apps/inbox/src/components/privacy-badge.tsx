import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Lock, X } from "lucide-react";

export function PrivacyBadge() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border border-border bg-background/80 hover:bg-accent transition-colors text-[11px] text-muted-foreground"
        aria-label={t("privacy.label")}
      >
        <Lock className="size-3 text-emerald-500" />
        <span className="hidden sm:inline">{t("privacy.short")}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 rounded-xl border border-border bg-card shadow-soft p-4 z-50">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 shrink-0 size-7 rounded-full bg-emerald-100 dark:bg-emerald-900/30 grid place-items-center">
              <Lock className="size-3.5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-medium text-foreground">
                {t("privacy.title")}
              </h4>
              <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
                {t("privacy.body")}
              </p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="shrink-0 -mr-1 -mt-1 size-6 rounded-full grid place-items-center hover:bg-accent transition-colors"
              aria-label={t("privacy.close")}
            >
              <X className="size-3 text-muted-foreground" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
