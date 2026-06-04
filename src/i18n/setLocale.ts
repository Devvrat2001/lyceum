"use server";
import { cookies } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale } from "./locales";

/**
 * Persist the chosen locale to the cookie that i18n/request.ts reads. Server
 * action (not a client `document.cookie` write) so the value is validated
 * server-side and there's no client-state mutation. The caller refreshes after
 * to re-render in the new locale.
 */
export async function setLocale(locale: string): Promise<void> {
  const value = isLocale(locale) ? locale : DEFAULT_LOCALE;
  const store = await cookies();
  store.set(LOCALE_COOKIE, value, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}
