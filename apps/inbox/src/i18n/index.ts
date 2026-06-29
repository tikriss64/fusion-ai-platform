import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import es from "./locales/es.json";
import fr from "./locales/fr.json";

export const SUPPORTED_LANGS = ["es", "fr"] as const;
export type Lang = (typeof SUPPORTED_LANGS)[number];

if (!i18n.isInitialized) {
  i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources: {
        es: { translation: es },
        fr: { translation: fr },
      },
      fallbackLng: "es",
      supportedLngs: SUPPORTED_LANGS as unknown as string[],
      interpolation: { escapeValue: false },
      detection: {
        order: ["localStorage", "navigator"],
        lookupLocalStorage: "lang",
        caches: ["localStorage"],
      },
      returnNull: false,
    });
}

export default i18n;

export function formatDate(d: Date, lang: string) {
  const locale = lang === "fr" ? "fr-FR" : "es-ES";
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(d);
}
