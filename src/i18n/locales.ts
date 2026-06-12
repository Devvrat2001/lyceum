/**
 * i18n locale registry. Single source of truth for which locales exist, the
 * default, and the cookie the locale is stored under. next-intl runs in
 * "without i18n routing" mode — the active locale comes from this cookie
 * (resolved in i18n/request.ts), so no [locale] route segment is needed and
 * the existing route tree is untouched.
 */
export const LOCALES = ["en", "hi", "es"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "locale";

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  hi: "हिन्दी",
  es: "Español",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}
