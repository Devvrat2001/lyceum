"use client";
import { useTransition } from "react";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { LOCALES, type Locale } from "@/i18n/locales";
import { setLocale } from "@/i18n/setLocale";

const SHORT: Record<Locale, string> = { en: "EN", es: "ES" };

/**
 * Cookie-based language switcher. Calls a server action to persist the `locale`
 * cookie, then refreshes so the server re-renders in the new locale (next-intl
 * reads the cookie in i18n/request.ts). No route change — works on any page.
 */
export function LocaleToggle() {
  const active = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function choose(locale: Locale) {
    if (locale === active) return;
    startTransition(async () => {
      await setLocale(locale);
      router.refresh();
    });
  }

  return (
    <div
      role="group"
      aria-label="Language"
      style={{ display: "inline-flex", gap: 4 }}
    >
      {LOCALES.map((locale) => (
        <button
          key={locale}
          type="button"
          onClick={() => choose(locale)}
          disabled={pending}
          aria-pressed={active === locale}
          className="wf-btn wf-btn--sm"
          style={{ opacity: active === locale ? 1 : 0.55 }}
        >
          {SHORT[locale]}
        </button>
      ))}
    </div>
  );
}
