import { useTranslation } from "react-i18next";
import { Focus } from "lucide-react";
import { useFocusMode } from "@/components/inbox/hooks/use-focus-mode";

export function FocusToggle() {
  const { t } = useTranslation();
  const { focus, hydrated, toggle } = useFocusMode();
  const active = hydrated && focus;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={active}
      title={t("focus.toggle")}
      className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
      }`}
    >
      <Focus className="size-3.5" />
      <span className="hidden sm:inline">{active ? t("focus.on") : t("focus.off")}</span>
    </button>
  );
}
