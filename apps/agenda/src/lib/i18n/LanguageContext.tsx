// i18n context — wraps public-facing pages so all children share the same locale.
// Locale is persisted in localStorage and falls back to browser language, then "es".
import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { defaultLocale, type Locale, isLocale } from "./config";
import esMessages from "./messages/es.json";
import frMessages from "./messages/fr.json";
import enMessages from "./messages/en.json";

const allMessages = { es: esMessages, fr: frMessages, en: enMessages } as const;

function detectLocale(): Locale {
  if (typeof window === "undefined") return defaultLocale;
  try {
    const stored = localStorage.getItem("locale");
    if (stored && isLocale(stored)) return stored as Locale;
    const browser = navigator.language.split("-")[0];
    if (isLocale(browser)) return browser as Locale;
  } catch {}
  return defaultLocale;
}

function resolve(obj: Record<string, unknown>, path: string): string {
  const keys = path.split(".");
  let cur: unknown = obj;
  for (const k of keys) {
    if (cur == null || typeof cur !== "object") return path;
    cur = (cur as Record<string, unknown>)[k];
  }
  return typeof cur === "string" ? cur : path;
}

interface I18nContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(detectLocale);

  const setLocale = useCallback((l: Locale) => {
    try {
      localStorage.setItem("locale", l);
    } catch {}
    setLocaleState(l);
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>): string => {
      const messages = allMessages[locale] as Record<string, unknown>;
      let text = resolve(messages, key);
      // Fall back to Spanish if key not found in selected locale
      if (text === key) {
        text = resolve(allMessages.es as Record<string, unknown>, key);
      }
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          text = text.replace(`{${k}}`, String(v));
        }
      }
      return text;
    },
    [locale],
  );

  return <I18nContext.Provider value={{ locale, setLocale, t }}>{children}</I18nContext.Provider>;
}

export function useTranslation() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useTranslation must be used within LanguageProvider");
  return ctx;
}
