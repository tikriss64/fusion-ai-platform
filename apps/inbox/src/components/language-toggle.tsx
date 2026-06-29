import { useTranslation } from "react-i18next";

export function LanguageToggle() {
  const { i18n, t } = useTranslation();
  const current = (i18n.resolvedLanguage || i18n.language || "es").slice(0, 2);
  const next = current === "es" ? "fr" : "es";

  const change = () => {
    i18n.changeLanguage(next);
    try {
      localStorage.setItem("lang", next);
    } catch {}
  };

  return (
    <button
      onClick={change}
      aria-label={t("shell.langToggle")}
      title={t("shell.langToggle")}
      className="h-9 px-2.5 rounded-full border border-border hover:bg-accent grid place-items-center transition-colors text-xs font-semibold tabular-nums"
    >
      <span className="flex items-center gap-1">
        <span aria-hidden>{current === "es" ? "🇪🇸" : "🇫🇷"}</span>
        <span className="uppercase">{current}</span>
      </span>
    </button>
  );
}
