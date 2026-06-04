import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale } from "./locales";

/**
 * Per-request i18n config (next-intl, App Router, no routing). Resolves the
 * locale from the `locale` cookie — clamped to a known locale so an arbitrary
 * cookie value can never drive the dynamic message import — and loads that
 * locale's message catalog.
 */
export default getRequestConfig(async () => {
  const store = await cookies();
  const cookieLocale = store.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(cookieLocale) ? cookieLocale : DEFAULT_LOCALE;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
