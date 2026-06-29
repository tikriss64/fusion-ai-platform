// i18n configuration for the booking SaaS.
// Supported locales: Spanish (default), French, English.
// Integrate with next-intl-equivalent loading on the TanStack side
// (messages are plain JSON dictionaries kept in ./messages).

export const locales = ["es", "fr", "en"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "es";

export const localeNames: Record<Locale, string> = {
  es: "Español",
  fr: "Français",
  en: "English",
};

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}
