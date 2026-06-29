import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Sun,
  Moon,
  Sparkles,
  Sunrise,
  Inbox,
  Send,
  Clock,
  FileText,
  ShieldAlert,
  CalendarDays,
} from "lucide-react";
import { PrivacyBadge } from "./privacy-badge";
import { ContextPanel } from "./context-panel";
import { LanguageToggle } from "./language-toggle";
import { AskBar } from "./ask-bar";
import { FocusToggle } from "./focus-toggle";
import { SettingsMenu } from "./settings-menu";
import { SidebarNotes } from "./sidebar-notes";

const navItems = [
  { to: "/", labelKey: "nav.hoy", icon: Sunrise },
  { to: "/bandeja", labelKey: "nav.bandeja", icon: Inbox },
  { to: "/enviados", labelKey: "nav.enviados", icon: Send },
  { to: "/agenda", labelKey: "nav.agenda", icon: CalendarDays },
  { to: "/esperando", labelKey: "nav.esperando", icon: Clock },
  { to: "/documentos", labelKey: "nav.documentos", icon: FileText },
  { to: "/riesgos", labelKey: "nav.riesgos", icon: ShieldAlert },
] as const;

function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const stored = (typeof localStorage !== "undefined" && localStorage.getItem("theme")) as
      | "light"
      | "dark"
      | null;
    // Dark-first: el modo oscuro es el protagonista (estilo Superhuman/Linear).
    // Solo se usa claro si el usuario lo eligió explícitamente antes.
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

export function AppShell({ children }: { children: ReactNode }) {
  const { theme, toggle } = useTheme();
  const { t } = useTranslation();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="min-h-screen flex w-full bg-background text-foreground">
      <aside className="w-60 shrink-0 border-r border-sidebar-border bg-sidebar flex flex-col">
        <div className="h-16 flex items-center gap-2 px-5 border-b border-sidebar-border">
          <div className="size-8 rounded-xl bg-primary text-primary-foreground grid place-items-center shadow-soft">
            <Sparkles className="size-4" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">{t("shell.appName")}</div>
            <div className="text-[11px] text-muted-foreground">{t("shell.appSub")}</div>
          </div>
        </div>

        <nav className="pt-6 px-3 space-y-1.5">
          {navItems.map(({ to, labelKey, icon: Icon }) => {
            const active = pathname === to;
            return (
              <Link
                key={to}
                to={to}
                className={[
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground font-medium",
                ].join(" ")}
              >
                <Icon className="size-4" />
                <span>{t(labelKey)}</span>
              </Link>
            );
          })}
        </nav>

        <div className="flex-1 min-h-6" />

        <div className="border-t border-sidebar-border pt-3">
          <SidebarNotes />
        </div>

        <div className="p-3 text-[11px] text-muted-foreground border-t border-sidebar-border">
          {t("shell.version")}
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-border flex items-center justify-between px-6 bg-background/80 backdrop-blur">
          <div>
            <h1 className="text-base font-semibold">{t("shell.appTitle")}</h1>
            <p className="text-xs text-muted-foreground">{t("shell.appTagline")}</p>
          </div>
          <div className="flex items-center gap-2">
            <FocusToggle />
            <PrivacyBadge />
            <AskBar />
            <LanguageToggle />
            <SettingsMenu />
            <button
              onClick={toggle}
              aria-label={t("shell.themeToggle")}
              className="size-9 rounded-full border border-border hover:bg-accent grid place-items-center transition-colors"
            >
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </button>
            <Link
              to="/settings"
              aria-label={t("settings.openFull")}
              title={t("settings.openFull")}
              className="size-9 rounded-full bg-gradient-to-br from-primary to-accent grid place-items-center text-primary-foreground text-sm font-medium shadow-soft hover:opacity-90 transition"
            >
              JL
            </Link>
          </div>
        </header>

        <div className="flex-1 flex min-h-0">
          <main className="flex-1 overflow-auto p-8 min-w-0 bg-[color-mix(in_oklab,var(--primary)_2.5%,var(--background))]">{children}</main>

          <aside className="w-80 shrink-0 border-l border-border bg-card/40 p-6 hidden lg:block overflow-auto">
            <ContextPanel />
          </aside>
        </div>
      </div>
    </div>
  );
}
